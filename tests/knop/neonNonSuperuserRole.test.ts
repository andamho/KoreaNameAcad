// PG16+ non-superuser role membership semantics 검증 — **PGlite(비 superuser 재현 가능한 부분) + 계약 정합성**.
//
// ⚠️ 이 파일은 두 가지를 다룬다:
//   1. cleanup plan 이 fix5/6 순서(DROP SCHEMA 먼저 · SET ROLE self-clean · db-privilege revoke)를 지키는지(정적 계약)
//   2. cleanup 이 부분 생성·멱등·run-id scope·SET ROLE 실패 내성을 갖는지(PGlite 실행)
// PG17 non-superuser 실측(CREATE ROLE 자동 멤버십 SET=false, ALTER SCHEMA OWNER 거부 등)은
//   `scripts/runNonSuperuserRoleCheck.ts`(embedded, superuser 아닌 role) 로 수행하며 여기서 재현하지 않는다(엔진 제약).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildCleanupPlan, assertCleanupScope, runCleanup, verifyResidual, type CleanupStep } from "../../scripts/neonCheck/cleanup";
import { scopedNames } from "../../scripts/neonCheck/identifiers";
import { prepareEnvironmentForTest } from "../../scripts/neonCheck/executor";
import { DIRECT_HANDLERS, type HandlerCtx } from "../../scripts/neonCheck/handlers";
import { wrapClientAsDirect, type DbAdapter } from "../../scripts/neonCheck/adapters";
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

// ── 소유권 이전 capability 실검증 + membership 격리 (PGlite) ──────────────────
// setup 재배치: 테이블은 capability 전 executor 소유 → capability 가 실제로 owner 이전을 한 번 수행·검증.
// membership lifecycle 은 전용 parent/subject 쌍에서만 GRANT/REVOKE → 하네스 핵심(executor↔owner) 멤버십 불변.
const num = async (db: DbAdapter, sql: string, p?: unknown[]) => Number((await db.query(sql, p)).rows[0]?.n ?? 0);
const ownerOf = async (db: DbAdapter, table: string) =>
  String((await db.query(`SELECT pg_get_userbyid(c.relowner) AS o FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname=$1 AND c.relname=$2`, [n.schema, table])).rows[0]?.o ?? "");
const curUser = async (db: DbAdapter) => String((await db.query(`SELECT current_user AS u`)).rows[0]?.u ?? "");
const membershipRows = (db: DbAdapter, member: string, group: string) =>
  num(db, `SELECT count(*)::int AS n FROM pg_auth_members am JOIN pg_roles m ON m.oid=am.member JOIN pg_roles g ON g.oid=am.roleid WHERE m.rolname=$1 AND g.rolname=$2`, [member, group]);
const ctxOf = (db: DbAdapter): HandlerCtx => ({ db, names: n, login: null, secrets: new Map<string, MemorySecret>(), hook: async () => {} });
const runCap = (db: DbAdapter, id: string) => DIRECT_HANDLERS[id](ctxOf(db));

describe("소유권 이전 capability 실검증 (PGlite)", () => {
  test("capability 전 4개 테이블은 executor 소유 (setup 이 미리 owner 로 넘기지 않는다)", async () => {
    const { raw, db } = await pglite();
    await prepareEnvironmentForTest(db, n, new Map());
    const exec = await curUser(db);
    for (const [label, t] of [["artifact", n.tables.artifact], ["audit", n.tables.audit], ["approval", n.tables.approval], ["business", n.tables.business]] as const) {
      assert.equal(await ownerOf(db, t), exec, `${label} 는 capability 전 executor 소유여야`);
      assert.notEqual(await ownerOf(db, t), n.roles.owner, `${label} 가 이미 owner 소유면 검증 의미 상실`);
    }
    await raw.close();
  });

  test("transfer-table-owner 후 artifact 는 owner 소유", async () => {
    const { raw, db } = await pglite();
    await prepareEnvironmentForTest(db, n, new Map());
    const r = await runCap(db, "transfer-table-owner");
    assert.equal(r.outcome, "pass", `detail=${r.detailCode}`);
    assert.equal(await ownerOf(db, n.tables.artifact), n.roles.owner);
    await raw.close();
  });

  test("bootstrap-a-ownership-transfer 후 audit·approval·business 는 owner 소유", async () => {
    const { raw, db } = await pglite();
    await prepareEnvironmentForTest(db, n, new Map());
    const r = await runCap(db, "bootstrap-a-ownership-transfer");
    assert.equal(r.outcome, "pass", `detail=${r.detailCode}`);
    for (const t of [n.tables.audit, n.tables.approval, n.tables.business]) assert.equal(await ownerOf(db, t), n.roles.owner);
    await raw.close();
  });

  test("이미 owner 소유면 transfer capability 는 fail (중복 이전 통과 금지)", async () => {
    const { raw, db } = await pglite();
    await prepareEnvironmentForTest(db, n, new Map());
    await runCap(db, "transfer-table-owner"); // 1차 이전
    const again = await runCap(db, "transfer-table-owner"); // 2차 — 이미 owner 소유
    assert.equal(again.outcome, "fail", "이미 이전된 테이블에 다시 통과시키면 안 된다");
    assert.match(String(again.detailCode), /not-executor-owned/);
    await raw.close();
  });

  test("handler 소스에 중복 GRANT(TO/FROM CURRENT_USER) 가 없다", () => {
    const raw = readFileSync(fileURLToPath(new URL("../../scripts/neonCheck/handlers.ts", import.meta.url)), "utf8");
    // 주석(설명용)은 제외하고 **실행 SQL**만 본다: 주석으로 시작하는 줄을 통째로 뺀다.
    const code = raw.split("\n").filter((l) => { const t = l.trim(); return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); }).join("\n");
    assert.ok(!/\bTO\s+CURRENT_USER\b/.test(code), "handler 실행 SQL 에 GRANT ... TO CURRENT_USER 잔존");
    assert.ok(!/\bFROM\s+CURRENT_USER\b/.test(code), "handler 실행 SQL 에 REVOKE ... FROM CURRENT_USER 잔존");
  });
});

describe("membership lifecycle 격리 (PGlite)", () => {
  test("전용 subject↔parent 로만 grant/revoke, 잔여 0 · executor↔owner 불변", async () => {
    const { raw, db } = await pglite();
    await prepareEnvironmentForTest(db, n, new Map());
    const exec = await curUser(db);
    const execOwnerBefore = await membershipRows(db, exec, n.roles.owner);
    assert.equal(execOwnerBefore, 1, "executor↔owner 멤버십은 정확히 1행");

    const t = await runCap(db, "bootstrap-a-temporary-membership");
    assert.equal(t.outcome, "pass", `temp detail=${t.detailCode}`);
    assert.equal(await membershipRows(db, n.mlRoles.subject, n.mlRoles.parent), 1, "subject↔parent 부여됨");

    const rev = await runCap(db, "bootstrap-a-membership-revoked");
    assert.equal(rev.outcome, "pass");
    const zero = await runCap(db, "bootstrap-a-residual-membership-zero");
    assert.equal(zero.outcome, "pass", "revoke 후 잔여 0");
    assert.equal(await membershipRows(db, n.mlRoles.subject, n.mlRoles.parent), 0);

    // 하네스 핵심 멤버십은 capability 가 건드리지 않는다
    assert.equal(await membershipRows(db, exec, n.roles.owner), 1, "executor↔owner 멤버십이 변형됨");
    await raw.close();
  });

  test("membership capability 가 중간 실패해도(부여만·회수 전) cleanup 후 임시 membership 잔여 0", async () => {
    const { raw, db } = await pglite();
    await prepareEnvironmentForTest(db, n, new Map());
    await runCap(db, "bootstrap-a-temporary-membership"); // 부여만 하고 회수(다음 capability)는 생략 → 실패 모사
    assert.equal(await membershipRows(db, n.mlRoles.subject, n.mlRoles.parent), 1, "회수 전이라 1행 남아 있음");
    await runCleanup(db, n, { retry: true });
    const residual = await verifyResidual(db, n);
    assert.equal(residual.roles, 0, "전용 role 포함 잔여 role 0");
    // 전용 role 이 drop 됐으므로 subject↔parent 멤버십 행도 사라진다
    assert.equal(await membershipRows(db, n.mlRoles.subject, n.mlRoles.parent), 0, "임시 membership 잔여");
    await raw.close();
  });

  test("cleanup 후 run-id default ACL 0", async () => {
    const { raw, db } = await pglite();
    await prepareEnvironmentForTest(db, n, new Map());
    await runCleanup(db, n, { retry: true });
    const dacl = await num(db, `SELECT count(*)::int AS n FROM pg_default_acl d WHERE pg_get_userbyid(d.defaclrole) LIKE $1`, [`%\\_${RUN}`]);
    assert.equal(dacl, 0, `default ACL 잔여=${dacl}`);
    await raw.close();
  });
});
