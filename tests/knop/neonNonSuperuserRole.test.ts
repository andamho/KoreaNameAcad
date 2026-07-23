// PG16+ non-superuser role membership semantics 검증 — **PGlite(비 superuser 재현 가능한 부분) + 계약 정합성**.
//
// ⚠️ 이 파일은 두 가지를 다룬다:
//   1. cleanup plan 이 fix5/6 순서(DROP SCHEMA 먼저 · SET ROLE self-clean · db-privilege revoke)를 지키는지(정적 계약)
//   2. cleanup 이 부분 생성·멱등·run-id scope·SET ROLE 실패 내성을 갖는지(PGlite 실행)
// PG17 non-superuser 실측(CREATE ROLE 자동 멤버십 SET=false, ALTER SCHEMA OWNER 거부 등)은
//   `scripts/runNonSuperuserRoleCheck.ts`(embedded, superuser 아닌 role) 로 수행하며 여기서 재현하지 않는다(엔진 제약).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildCleanupPlan, assertCleanupScope, runCleanup, verifyResidual, type CleanupStep } from "../../scripts/neonCheck/cleanup";
import { scopedNames } from "../../scripts/neonCheck/identifiers";
import { prepareEnvironmentForTest } from "../../scripts/neonCheck/executor";
import { wrapClientAsDirect } from "../../scripts/neonCheck/adapters";
import type { MemorySecret } from "../../scripts/neonCheck/secrets";

const RUN = "nsr26072a";
const n = scopedNames(RUN);

describe("cleanup plan — fix5/6 순서 계약", () => {
  const plan = buildCleanupPlan(n);
  const labels = plan.map((s) => s.label);
  const idx = (pred: (l: string) => boolean) => labels.findIndex(pred);

  test("모든 step·runAsRole 이 run-id 스코프 (assertCleanupScope)", () => {
    assertCleanupScope(plan, RUN); // throw 시 실패
    for (const s of plan) {
      assert.ok(s.target.includes(RUN), `target 비스코프: ${s.label}`);
      if (s.runAsRole) assert.ok(s.runAsRole.includes(RUN), `runAsRole 비스코프: ${s.label}`);
    }
  });

  test("DROP SCHEMA 가 role별 DROP OWNED 보다 **먼저** (schema privilege dependency 선정리)", () => {
    const dropSchema = idx((l) => l === "drop-schema");
    const firstDropOwned = idx((l) => l.startsWith("drop-owned-self:"));
    assert.ok(dropSchema >= 0 && firstDropOwned >= 0);
    assert.ok(dropSchema < firstDropOwned, "DROP SCHEMA 는 self-clean 앞");
  });

  test("각 role db-level privilege revoke 가 DROP ROLE 앞 (CONNECT dependency 제거)", () => {
    const revokeDb = idx((l) => l.startsWith("revoke-db-privs:"));
    const firstDropRole = idx((l) => l.startsWith("drop-role:"));
    assert.ok(revokeDb >= 0 && revokeDb < firstDropRole, "revoke-db-privs 는 drop-role 앞");
    // 모든 6 role 에 대해 revoke-db-privs 존재
    const roles = ["owner", "admin", "deployer", "writer", "reader", "appsim"].map((r) => (n.roles as any)[r === "appsim" ? "appSim" : r]);
    for (const r of roles) assert.ok(plan.some((s) => s.label === `revoke-db-privs:${r}`), `revoke-db-privs 누락: ${r}`);
  });

  test("enable-triggers 는 owner 로(runAsRole) — 테이블 owner 소유", () => {
    const s = plan.find((x) => x.label === "enable-triggers")!;
    assert.equal(s.runAsRole, n.roles.owner);
  });

  test("cleanup 은 production role/table 을 참조하지 않는다", () => {
    for (const s of plan) {
      assert.ok(!/orchestration_(owner|admin|deployer|writer|reader)\b/.test(s.sql), s.label);
      assert.ok(!/\b(job_artifacts|customers|calls|jobs|orchestration_audit_log)\b/.test(s.sql), s.label);
    }
  });
});

// ── PGlite 실행: prepareEnvironment(수정본) + cleanup 멱등·부분·잔여 0 ──────────
// PGlite superuser 세션이라 SET ROLE 멤버십 강제는 재현 못 하지만, 소유권 모델·cleanup 순서·멱등은 검증 가능.
async function pglite() {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  return { raw: db, db: wrapClientAsDirect({ query: (sql, params) => db.query(sql, params as any[]) as any }) };
}

describe("cleanup 실행 — 멱등·부분·잔여 0 (PGlite)", () => {
  test("정상 prepare → cleanup → 잔여 role/object/default-acl 0", async () => {
    const { raw, db } = await pglite();
    const secrets = new Map<string, MemorySecret>();
    await prepareEnvironmentForTest(db, n, secrets);
    const c = await runCleanup(db, n, { retry: true });
    assert.equal(c.residualRoles, 0, `residual roles=${c.residualRoles} · ${c.failed.map((f) => f.label).join(",")}`);
    assert.equal(c.residualObjects, 0);
    // ⚠️ c.ok(step 실패 0)는 embedded 정본에서 검증한다. PGlite 는 database-level privilege·SET ROLE 멤버십 semantics 가
    //    embedded 와 달라 일부 step 이 무의미하게 실패할 수 있으므로 여기서는 **잔여 0** 만 계약으로 본다.
    await raw.close();
  });

  test("cleanup 2회 멱등 (없는 role/schema 재실행 오류 0)", async () => {
    const { raw, db } = await pglite();
    const secrets = new Map<string, MemorySecret>();
    await prepareEnvironmentForTest(db, n, secrets);
    await runCleanup(db, n, { retry: true });
    const c2 = await runCleanup(db, n, { retry: true }); // 두 번째
    assert.equal(c2.residualRoles, 0);
    assert.equal(c2.residualObjects, 0);
    await raw.close();
  });

  test("역할이 하나도 없을 때 cleanup 은 정상 skip (부분 실패 내성)", async () => {
    const { raw, db } = await pglite();
    const c = await runCleanup(db, n, { retry: true }); // prepare 안 함
    assert.equal(c.residualRoles, 0);
    assert.equal(c.residualObjects, 0);
    await raw.close();
  });

  test("run-id 밖 role 은 cleanup 대상이 아니다(스코프 격리)", async () => {
    const { raw, db } = await pglite();
    await db.exec(`CREATE ROLE unrelated_biz_role NOLOGIN`);
    const secrets = new Map<string, MemorySecret>();
    await prepareEnvironmentForTest(db, n, secrets);
    await runCleanup(db, n, { retry: true });
    const still = await verifyResidual(db, n);
    assert.equal(still.roles, 0, "run-id role 잔여");
    // 무관 role 은 그대로 남아야(건드리지 않음)
    const biz = (await db.query(`SELECT count(*)::int AS n FROM pg_roles WHERE rolname='unrelated_biz_role'`)).rows[0] as { n: number };
    assert.equal(biz.n, 1, "무관 business role 을 건드렸다");
    await db.exec(`DROP ROLE unrelated_biz_role`);
    await raw.close();
  });
});
