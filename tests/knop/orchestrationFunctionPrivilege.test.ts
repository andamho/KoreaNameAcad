// orchestration **function security assertion** 검증 + Neon capability 정본 45 불변 확인.
//
// ⚠️ 세 catalog 를 섞지 않는다:
//   - Neon capability(45)      : scripts/neonCheck/capabilities.ts  — disposable Neon 실측 대상. **개수·ID·순서 불변**
//   - hardening security assertion : server/migrations/hardening/functionSecurityAssertions.ts — actual Neon 실행 **전** 관문
//   - preflight assertion      : scripts/neonCheck/guards.ts — production-like DB·host·run-id 안전 검문
//
// ⚠️ 엔진: 이 파일은 **PGlite(PostgreSQL 18.x)** 로 실행되며 **정본이 아니다**.
//    정본 evidence = embedded PostgreSQL 17.x(운영 Neon 과 동일 메이저). 실측표는 docs/orchestration-db-hardening.md.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  HARDENING_SECURITY_ASSERTIONS, ASSERTION_IDS, FUNCTION_SPECS, FUNCTION_SECURITY_POLICY, TOTAL_TRIGGER_CONNECTIONS,
} from "../../server/migrations/hardening/functionSecurityAssertions";
import {
  evaluateFunctionSecurityAssertions, probeFunctions, aclGrantees, schemaCreatePrivileges,
  type AssertionClient,
} from "../../server/migrations/hardening/functionSecurityCheck";
import { runHardening, findHardening } from "../../server/migrations/hardening/hardeningRunner";
import { fileSha256Normalized } from "../../server/migrations/checksum";
import { CAPABILITIES, CAPABILITY_IDS, countFor } from "../../scripts/neonCheck/capabilities";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");
const HARDEN_PATH = path.join(root, "migrations", "hardening", "0001_orchestration_immutability_roles.sql");
const SQL_0002 = readFileSync(path.join(root, "migrations", "0002_create_persistent_job_queue.sql"), "utf-8");
const SQL_0004 = readFileSync(path.join(root, "migrations", "0004_cross_agent_orchestration.sql"), "utf-8");
const SQL_HARDEN = readFileSync(HARDEN_PATH, "utf-8");
const DEF = findHardening("0001_orchestration_immutability_roles")!;

type Db = AssertionClient & { exec(sql: string): Promise<void>; engine: string };
async function setup(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  await db.exec(SQL_0002); await db.exec(SQL_0004); await db.exec(SQL_HARDEN);
  const engine = (await db.query<{ server_version: string }>("SHOW server_version")).rows[0].server_version;
  return { engine, query: (sql, params) => db.query(sql, params as any[]) as any, exec: (sql) => db.exec(sql).then(() => undefined) };
}
const tryExec = async (db: Db, sql: string) => {
  try { await db.exec(sql); return { ok: true, code: "" }; }
  catch (e: any) { return { ok: false, code: e?.code ?? "ERR" }; }
};

describe("catalog 경계 — Neon capability 45 불변 · assertion 분리", () => {
  test("Neon capability total = 45", () => {
    assert.equal(CAPABILITIES.length, 45);
    assert.equal(countFor("actual-neon-direct"), 40);
    assert.equal(countFor("actual-neon-pooled"), 5);
    assert.equal(countFor("pglite"), 22);
    assert.equal(countFor("embedded-direct"), 40);
    assert.equal(countFor("pooled-mock"), 5);
  });

  test("기존 45 ID·순서 동일(order hash 고정)", () => {
    // 이 해시가 바뀌면 ID 추가/삭제/이름변경/순서변경이 일어난 것 — 정본 계약 위반.
    const orderHash = createHash("sha256").update(CAPABILITY_IDS.join("|")).digest("hex");
    assert.equal(orderHash, "cadf7bd4c4f8c1e2e368a37734d40119fec7082d731353cb9010f365f91ded53",
      "Neon capability 정본 45의 ID/순서가 변경됨");
  });

  test("neon-full total = 45 (roll-up 대상)", () => {
    const requiredForNeonFull = CAPABILITIES.filter((c) => c.requiredForNeonFull);
    assert.equal(requiredForNeonFull.length, 45);
    assert.equal(countFor("actual-neon-direct") + countFor("actual-neon-pooled"), 45);
  });

  test("security assertion 은 별도 catalog 이며 capability 와 ID 충돌 0", () => {
    assert.ok(ASSERTION_IDS.length >= 9, `assertions=${ASSERTION_IDS.length}`);
    assert.equal(new Set(ASSERTION_IDS).size, ASSERTION_IDS.length, "assertion ID 중복");
    for (const id of ASSERTION_IDS) assert.ok(id.startsWith("fnsec-"), `${id} 는 fnsec- prefix 필요`);
    const capIds = new Set(CAPABILITY_IDS);
    for (const id of ASSERTION_IDS) assert.ok(!capIds.has(id), `ID 충돌: ${id}`);
    for (const id of CAPABILITY_IDS) assert.ok(!id.startsWith("fnsec-"), `capability 에 assertion ID 혼입: ${id}`);
  });

  test("이전 46번째 항목은 capability 가 아니라 assertion 으로 재분류됐다", () => {
    assert.ok(!CAPABILITY_IDS.includes("schema-qualified-default-privileges-noop" as any), "capability 로 남아 있으면 안 됨");
    assert.ok(CAPABILITY_IDS.includes("default-privileges-secure" as any), "기존 45 중 하나는 그대로 유지");
    assert.ok(ASSERTION_IDS.includes("fnsec-default-acl-policy"), "default ACL 정책은 assertion 으로 이동");
  });

  test("assertion manifest 필드가 전부 채워져 있다", () => {
    for (const a of HARDENING_SECURITY_ASSERTIONS) {
      assert.ok(a.expectedFunctionSignature);
      assert.equal(a.expectedOwnerClass, "orchestration-owner");
      assert.equal(a.securityMode, "invoker");
      assert.equal(a.searchPathPolicy, "unset-no-schema-qualified-refs");
      assert.equal(a.publicExecuteExpected, false);
      assert.equal(a.appExecuteExpected, false);
      assert.equal(a.writerExecuteExpected, false);
      assert.equal(a.readerExecuteExpected, false);
      assert.equal(a.expectedTriggerConnectionCount, TOTAL_TRIGGER_CONNECTIONS);
      assert.equal(a.authoritativeEvidenceProfile, "embedded-direct");
    }
    assert.equal(TOTAL_TRIGGER_CONNECTIONS, 15);
    assert.deepEqual(FUNCTION_SPECS.map((f) => f.triggerConnectionCount), [3, 6, 3, 3]);
  });
});

describe("function security assertion — 정상 상태(PGlite · 비정본)", () => {
  test("엔진 버전 기록(운영 PG17 과 다름)", async () => {
    const db = await setup();
    console.log(`[engine] PGlite server_version=${db.engine} · authoritative=false`);
    assert.ok(/^\d+/.test(db.engine));
  });

  test("전체 assertion 통과 → gateOpen", async () => {
    const db = await setup();
    const r = await evaluateFunctionSecurityAssertions(db);
    assert.equal(r.failed, 0, r.failedIds.join(",") + " :: " + r.results.filter((x) => !x.ok).map((x) => x.detail).join(" | "));
    assert.equal(r.gateOpen, true);
    assert.equal(r.total, ASSERTION_IDS.length);
  });

  test("현재 4함수 explicit REVOKE — PUBLIC/reader/writer EXECUTE 0, ACL grantee = owner", async () => {
    const db = await setup();
    const rows = await probeFunctions(db);
    assert.equal(rows.length, 4);
    for (const r of rows) {
      assert.equal(r.pub, false, `${r.proname} PUBLIC EXECUTE`);
      assert.deepEqual(aclGrantees(r.acl), ["orchestration_owner"]);
      assert.equal(r.owner, FUNCTION_SECURITY_POLICY.expectedOwner);
      assert.equal(r.secdef, false);
      assert.equal(r.cfg, null);
    }
    const leak = await db.query(
      `SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
        WHERE ns.nspname='public' AND p.proname LIKE 'orch\\_%'
          AND (has_function_privilege('orchestration_reader',p.oid,'EXECUTE') OR has_function_privilege('orchestration_writer',p.oid,'EXECUTE'))`);
    assert.equal(leak.rows[0].n, 0);
  });

  test("trigger 연결 수 = 함수별 명세(합계 15)", async () => {
    const db = await setup();
    const rows = await probeFunctions(db);
    for (const s of FUNCTION_SPECS) assert.equal(rows.find((r) => r.proname === s.name)!.trg, s.triggerConnectionCount, s.name);
    assert.equal(rows.reduce((n, r) => n + r.trg, 0), TOTAL_TRIGGER_CONNECTIONS);
  });

  test("정상 상태에서 orchestration_* public CREATE 권한 0", async () => {
    const db = await setup();
    const rows = await schemaCreatePrivileges(db, "public");
    assert.equal(rows.length, 5);
    assert.deepEqual(rows.filter((r) => r.can).map((r) => r.role), []);
  });
});

describe("함수 생성 역할 정책", () => {
  test("app/writer/reader 는 CREATE FUNCTION 불가", async () => {
    const db = await setup();
    await db.exec(`CREATE ROLE app_sim NOLOGIN`);
    for (const role of ["app_sim", "orchestration_writer", "orchestration_reader"]) {
      const r = await tryExec(db, `SET ROLE ${role}; CREATE FUNCTION public.orch_nope() RETURNS trigger LANGUAGE plpgsql AS $x$BEGIN RETURN NULL; END;$x$;`);
      await db.exec(`RESET ROLE`).catch(() => {});
      assert.equal(r.ok, false, `${role} 이 함수를 만들 수 있으면 안 됨`);
      assert.equal(r.code, "42501", `${role} → ${r.code}`);
    }
  });

  test("deployer/admin 도 기본 상태에서 CREATE 불가 · 최종 owner 가 되지 않는다", async () => {
    const db = await setup();
    const priv = await schemaCreatePrivileges(db, "public");
    for (const role of ["orchestration_admin", "orchestration_deployer"]) {
      assert.equal(priv.find((p) => p.role === role)!.can, false, `${role} public CREATE`);
    }
    const owners = await db.query(
      `SELECT DISTINCT pg_get_userbyid(proowner) o FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
        WHERE ns.nspname='public' AND p.proname LIKE 'orch\\_%'`);
    assert.deepEqual(owners.rows.map((r: any) => r.o), ["orchestration_owner"]);
  });

  test("정상 경로: owner 역할로 생성 → exact REVOKE → assertion 통과", async () => {
    const db = await setup();
    // 전략 A: 단일 transaction 안 임시 CREATE GRANT → 생성 → exact REVOKE → CREATE 즉시 회수
    await db.exec(`GRANT CREATE ON SCHEMA public TO orchestration_owner`);
    await db.exec(`SET ROLE orchestration_owner`);
    await db.exec(`CREATE FUNCTION public.orch_new_guard() RETURNS trigger LANGUAGE plpgsql AS $x$BEGIN RETURN NULL; END;$x$`);
    await db.exec(`RESET ROLE`);
    await db.exec(`REVOKE ALL ON FUNCTION public.orch_new_guard() FROM PUBLIC, orchestration_reader, orchestration_writer`);
    await db.exec(`REVOKE CREATE ON SCHEMA public FROM orchestration_owner`);

    const rows = await probeFunctions(db);
    const created = rows.find((r) => r.proname === "orch_new_guard")!;
    assert.equal(created.owner, "orchestration_owner");
    assert.equal(created.pub, false, "미래 owner-created function 은 PUBLIC EXECUTE 0");
    assert.deepEqual((await schemaCreatePrivileges(db, "public")).filter((r) => r.can), [], "임시 CREATE 잔여 0");
    // manifest 를 갱신하지 않았으므로 fn-count 로 fail-closed 되어야 한다(의도된 동작)
    const r = await evaluateFunctionSecurityAssertions(db);
    assert.ok(r.failedIds.includes("fnsec-function-count"), "manifest 미갱신 신규 함수는 fail-closed 되어야 함");
  });

  test("FOR ROLE 목록 밖 role 이 만든 함수는 assertion 에서 fail", async () => {
    const db = await setup();
    await db.exec(`CREATE ROLE outsider NOLOGIN; GRANT CREATE ON SCHEMA public TO outsider`);
    await db.exec(`SET ROLE outsider; CREATE FUNCTION public.orch_outsider() RETURNS trigger LANGUAGE plpgsql AS $x$BEGIN RETURN NULL; END;$x$; RESET ROLE`);
    const created = (await probeFunctions(db)).find((r) => r.proname === "orch_outsider")!;
    assert.equal(created.pub, true, "default ACL 은 FOR ROLE 목록 밖 role 에 적용되지 않는다(실측 사실)");
    const r = await evaluateFunctionSecurityAssertions(db);
    assert.equal(r.gateOpen, false);
    for (const id of ["fnsec-function-count", "fnsec-owner", "fnsec-public-execute-zero"]) assert.ok(r.failedIds.includes(id), id);
  });
});

describe("public schema CREATE — 전략 A 의 임시 권한 회수", () => {
  test("임시 grant 후 즉시 revoke → CREATE privilege 0", async () => {
    const db = await setup();
    await db.exec(`GRANT CREATE ON SCHEMA public TO orchestration_owner`);
    assert.equal((await schemaCreatePrivileges(db, "public")).find((r) => r.role === "orchestration_owner")!.can, true);
    await db.exec(`REVOKE CREATE ON SCHEMA public FROM orchestration_owner`);
    assert.deepEqual((await schemaCreatePrivileges(db, "public")).filter((r) => r.can), []);
    assert.equal((await evaluateFunctionSecurityAssertions(db)).gateOpen, true);
  });

  test("회수하지 않으면 assertion 이 잡는다(fail-closed)", async () => {
    const db = await setup();
    await db.exec(`GRANT CREATE ON SCHEMA public TO orchestration_owner`);
    const r = await evaluateFunctionSecurityAssertions(db);
    assert.ok(r.failedIds.includes("fnsec-schema-create-privilege-zero"), r.failedIds.join(","));
    assert.equal(r.gateOpen, false);
  });

  test("실패 주입 후 rollback → CREATE privilege 0 · 잔여 함수 0", async () => {
    const db = await setup();
    await db.exec(`BEGIN`);
    await db.exec(`GRANT CREATE ON SCHEMA public TO orchestration_owner`);
    await tryExec(db, `SET ROLE orchestration_owner; CREATE FUNCTION public.orch_bad() RETURNS trigger LANGUAGE plpgsql AS $x$BEGIN broken syntax; END;$x$; CREATE TRIGGER t BEFORE INSERT ON no_such_table FOR EACH ROW EXECUTE FUNCTION public.orch_bad();`);
    await db.exec(`ROLLBACK`);
    assert.deepEqual((await schemaCreatePrivileges(db, "public")).filter((r) => r.can), [], "rollback 후 CREATE 잔여");
    assert.equal((await probeFunctions(db)).filter((r) => r.proname === "orch_bad").length, 0);
    assert.equal((await evaluateFunctionSecurityAssertions(db)).gateOpen, true);
  });
});

describe("assertion 실패 주입 — 각 mismatch 가 fail 로 드러난다", () => {
  const inject = async (sql: string) => { const db = await setup(); await db.exec(sql); return evaluateFunctionSecurityAssertions(db); };

  test("function count — 미승인 orch_* 추가", async () => {
    assert.ok((await inject(`CREATE FUNCTION orch_rogue() RETURNS trigger LANGUAGE plpgsql AS $x$BEGIN RETURN NULL; END;$x$`))
      .failedIds.includes("fnsec-function-count"));
  });
  test("owner — 소유자 변경", async () => {
    assert.ok((await inject(`CREATE ROLE rogue_owner NOLOGIN; ALTER FUNCTION orch_deny_write() OWNER TO rogue_owner`))
      .failedIds.includes("fnsec-owner"));
  });
  test("security mode — SECURITY DEFINER", async () => {
    assert.ok((await inject(`ALTER FUNCTION orch_deny_write() SECURITY DEFINER`)).failedIds.includes("fnsec-security-mode"));
  });
  test("search_path — proconfig 설정", async () => {
    assert.ok((await inject(`ALTER FUNCTION orch_deny_write() SET search_path = public`)).failedIds.includes("fnsec-search-path"));
  });
  test("PUBLIC execute — 재부여", async () => {
    assert.ok((await inject(`GRANT EXECUTE ON FUNCTION orch_deny_write() TO PUBLIC`)).failedIds.includes("fnsec-public-execute-zero"));
  });
  test("runtime role execute — writer 직접 부여", async () => {
    assert.ok((await inject(`GRANT EXECUTE ON FUNCTION orch_deny_write() TO orchestration_writer`))
      .failedIds.includes("fnsec-runtime-role-execute-zero"));
  });
  test("default ACL — PUBLIC 재부여", async () => {
    assert.ok((await inject(`ALTER DEFAULT PRIVILEGES FOR ROLE orchestration_owner GRANT EXECUTE ON FUNCTIONS TO PUBLIC`))
      .failedIds.includes("fnsec-default-acl-policy"));
  });
  test("trigger connection count — trigger 제거", async () => {
    assert.ok((await inject(`DROP TRIGGER job_artifacts_immutable ON job_artifacts`))
      .failedIds.includes("fnsec-trigger-connection-count"));
  });
  test("app EXECUTE — 기존 app role 에 부여", async () => {
    const db = await setup();
    await db.exec(`CREATE ROLE app_sim NOLOGIN; GRANT EXECUTE ON FUNCTION orch_deny_write() TO app_sim`);
    const r = await evaluateFunctionSecurityAssertions(db, { appRole: "app_sim" });
    assert.ok(r.failedIds.includes("fnsec-runtime-role-execute-zero"), r.failedIds.join(","));
  });

  // signature 는 trigger 를 모두 끊어야 실제 재현되므로 mock 카탈로그로 판정 로직을 검증한다.
  const mock = (over: Record<string, unknown>): AssertionClient => ({
    async query(sql: string) {
      if (sql.includes("pg_get_function_identity_arguments")) return { rows: FUNCTION_SPECS.map((s) => ({
        proname: s.name, args: s.identityArguments, owner: FUNCTION_SECURITY_POLICY.expectedOwner,
        ret: s.returnType, lang: s.language, secdef: false, cfg: null,
        acl: "{orchestration_owner=X/orchestration_owner}", pub: false, trg: s.triggerConnectionCount, ...over })) };
      if (sql.includes("pg_default_acl")) return { rows: [FUNCTION_SECURITY_POLICY.defaultAclAuthoritativeRole, ...FUNCTION_SECURITY_POLICY.defaultAclDefenseInDepthRoles].map((r) => ({ role: r, acl: `{${r}=X/${r}}` })) };
      if (sql.includes("has_schema_privilege")) return { rows: [] };
      return { rows: [] };
    },
  });
  test("signature — identity arguments/반환형 변경", async () => {
    assert.ok((await evaluateFunctionSecurityAssertions(mock({ args: "integer" }))).failedIds.includes("fnsec-signatures"));
    assert.ok((await evaluateFunctionSecurityAssertions(mock({ ret: "void" }))).failedIds.includes("fnsec-signatures"));
  });
  test("정상 mock 은 위반 0(주입 로직 위양성 없음)", async () => {
    const r = await evaluateFunctionSecurityAssertions(mock({}));
    assert.deepEqual(r.failedIds, []);
  });
});

describe("게이트 연동 — assertion 실패는 actual Neon execute 를 중단한다", () => {
  test("정상 워킹트리 → gate open", async () => {
    const { runSecurityGate } = await import("../../scripts/neonCheck/securityGate");
    const g = await runSecurityGate();
    assert.equal(g.gateOpen, true, g.report?.failedIds.join(",") ?? g.error);
    assert.equal(g.report!.failed, 0);
  });

  test("gate 결과 출력에 URL·secret 이 없다 · Neon capability 결과와 분리 표기", async () => {
    const { runSecurityGate, formatSecurityGate } = await import("../../scripts/neonCheck/securityGate");
    const lines = formatSecurityGate(await runSecurityGate());
    assert.ok(lines.every((l) => l.startsWith("[hardening-assertions]")), "capability 줄과 prefix 가 달라야 한다");
    assert.ok(lines.every((l) => !/postgres(ql)?:\/\//.test(l)));
  });

  test("runner: assertion 실패 상태는 already-applied 를 통과시키지 않는다", async () => {
    const db = await setup();
    await db.exec(`GRANT EXECUTE ON FUNCTION orch_deny_write() TO PUBLIC`);
    const sha = await fileSha256Normalized(HARDEN_PATH);
    const r = await runHardening(db as any, DEF, { sqlText: SQL_HARDEN, actualSha256: sha, apply: false });
    assert.ok(["aborted-function-public", "aborted-function-fingerprint"].includes(r.outcome), r.outcome + " / " + r.detail);
    assert.equal(r.committed, false);
  });

  test("runner: 정상 상태 → already-applied · checksum 일치", async () => {
    const db = await setup();
    const sha = await fileSha256Normalized(HARDEN_PATH);
    assert.equal(sha, DEF.expectedSha256, "checksum 재고정 누락");
    const r = await runHardening(db as any, DEF, { sqlText: SQL_HARDEN, actualSha256: sha, apply: false });
    assert.equal(r.outcome, "already-applied", r.detail);
  });

  test("SQL 이 정정 형식을 유지한다(무력한 IN SCHEMA 형식 부재)", () => {
    assert.ok(SQL_HARDEN.includes("REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC"));
    assert.ok(!/IN SCHEMA public REVOKE ALL ON FUNCTIONS/.test(SQL_HARDEN));
    for (const r of FUNCTION_SECURITY_POLICY.runtimeRolesDeniedExecute) assert.ok(SQL_HARDEN.includes(r));
  });
});
