// orchestration **function privilege** 정정 검증.
// 정정 대상 결함: 미래에 생성되는 함수가 PUBLIC EXECUTE 를 그대로 보유.
//   근본 원인 = `ALTER DEFAULT PRIVILEGES ... IN SCHEMA <s> REVOKE ... FROM PUBLIC` 는 빈 ACL 에서 시작하는 no-op(행 미생성).
//   정정 = 스키마 한정 없는 **전역 형식** + 정확한 signature 명시 REVOKE + fail-closed function fingerprint(9 hard stop).
//
// ⚠️ 엔진 구분(중요):
//   - 이 파일은 **PGlite** 로 실행된다. PGlite 는 PostgreSQL **18.x** 계열이며 운영(Neon PG 17.x)과 **버전이 다르다**.
//   - 따라서 여기 결과는 **정본(authoritative) 이 아니다**. PG 17.10 정본 증거는 embedded-postgres 실행으로 확보하며
//     `docs/orchestration-db-hardening.md` 의 "function privilege 정정" 절에 실측표로 기록한다.
//   - 두 엔진이 일치한 항목/불일치한 항목은 문서에 명시적으로 구분해 남긴다.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  verifyFunctionFingerprint, probeFunctions, aclGrantees, FUNCTION_HARD_STOPS,
  runHardening, findHardening, type HardeningClient, type FunctionFingerprint,
} from "../../server/migrations/hardening/hardeningRunner";
import { fileSha256Normalized } from "../../server/migrations/checksum";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");
const HARDEN_PATH = path.join(root, "migrations", "hardening", "0001_orchestration_immutability_roles.sql");
const SQL_0002 = readFileSync(path.join(root, "migrations", "0002_create_persistent_job_queue.sql"), "utf-8");
const SQL_0004 = readFileSync(path.join(root, "migrations", "0004_cross_agent_orchestration.sql"), "utf-8");
const SQL_HARDEN = readFileSync(HARDEN_PATH, "utf-8");
const DEF = findHardening("0001_orchestration_immutability_roles")!;
const FP = DEF.functionFingerprint;

async function setup(): Promise<HardeningClient & { engine: string }> {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  await db.exec(SQL_0002); await db.exec(SQL_0004); await db.exec(SQL_HARDEN);
  const engine = (await db.query<{ server_version: string }>("SHOW server_version")).rows[0].server_version;
  return {
    engine,
    query: (sql, params) => db.query(sql, params as any[]) as any,
    exec: (sql) => db.exec(sql).then(() => undefined),
  };
}

describe("function privilege — 정정 후 실제 상태(PGlite · 비정본)", () => {
  test("엔진 버전을 명시 기록(운영 PG17 과 다름 → 정본 아님)", async () => {
    const c = await setup();
    assert.ok(/^\d+/.test(c.engine), `engine=${c.engine}`);
    console.log(`[engine] PGlite server_version=${c.engine} · authoritative=false (정본은 embedded PG 17.x)`);
  });

  test("4함수: owner/PUBLIC/ACL/보안모드/search_path/shape/signature 전부 기대치 → 위반 0", async () => {
    const c = await setup();
    const rows = await probeFunctions(c, FP.names);
    assert.equal(rows.length, 4);
    for (const r of rows) {
      assert.equal(r.owner, "orchestration_owner");
      assert.equal(r.pub, false, `${r.proname} 이 PUBLIC EXECUTE 보유`);
      assert.deepEqual(aclGrantees(r.acl), ["orchestration_owner"]);
      assert.equal(r.secdef, false, "SECURITY INVOKER 유지");
      assert.equal(r.cfg, null, "proconfig(search_path) 미설정");
      assert.equal(r.ret, "trigger"); assert.equal(r.lang, "plpgsql"); assert.equal(r.args, "");
    }
    assert.deepEqual(await verifyFunctionFingerprint(c, FP), []);
  });

  test("reader/writer 는 EXECUTE 0 · deployer/admin 은 owner membership 으로 상속(의도된 예외)", async () => {
    const c = await setup();
    const has = async (role: string) => (await c.query(
      `SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
        WHERE ns.nspname='public' AND p.proname LIKE 'orch\\_%' AND has_function_privilege($1,p.oid,'EXECUTE')`, [role])).rows[0].n;
    assert.equal(await has("orchestration_reader"), 0);
    assert.equal(await has("orchestration_writer"), 0);
    assert.equal(await has("orchestration_deployer"), 4, "deployer→admin→owner 상속은 설계상 break-glass 경로");
    assert.equal(await has("orchestration_admin"), 4);
  });

  test("★ 미래 함수: 전역 default ACL 3 role 행 존재 & PUBLIC 미포함", async () => {
    const c = await setup();
    const rows = (await c.query(
      `SELECT pg_get_userbyid(defaclrole) role, defaclnamespace::int ns, defaclacl::text acl
         FROM pg_default_acl WHERE defaclobjtype='f' ORDER BY 1`)).rows as { role: string; ns: number; acl: string }[];
    assert.deepEqual(rows.map((r) => r.role), FP.defaultAclRoles);
    for (const r of rows) {
      assert.equal(r.ns, 0, "스키마 한정(ns≠0)이면 no-op — 반드시 전역(ns=0)");
      assert.ok(!aclGrantees(r.acl).includes("PUBLIC"), `default ACL 에 PUBLIC 잔존: ${r.acl}`);
    }
  });

  test("★ 회귀(결함 재현 방지): 스키마 한정 REVOKE 는 행을 만들지 않는 no-op 이다", async () => {
    const c = await setup();
    const before = (await c.query(`SELECT count(*)::int n FROM pg_default_acl WHERE defaclobjtype='f' AND defaclnamespace<>0`)).rows[0].n;
    await c.exec(`CREATE ROLE fnprobe_role NOLOGIN`);
    await c.exec(`ALTER DEFAULT PRIVILEGES FOR ROLE fnprobe_role IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC`);
    const after = (await c.query(`SELECT count(*)::int n FROM pg_default_acl WHERE defaclobjtype='f' AND defaclnamespace<>0`)).rows[0].n;
    assert.equal(after, before, "IN SCHEMA 형식이 행을 만들었다면 엔진 동작이 바뀐 것 — 정정 근거를 재검토해야 한다");
    // 전역 형식은 반대로 행을 만든다
    await c.exec(`ALTER DEFAULT PRIVILEGES FOR ROLE fnprobe_role REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`);
    const global = (await c.query(
      `SELECT defaclacl::text acl FROM pg_default_acl WHERE defaclobjtype='f' AND defaclnamespace=0
         AND pg_get_userbyid(defaclrole)='fnprobe_role'`)).rows;
    assert.equal(global.length, 1, "전역 형식은 반드시 행을 만들어야 한다(정정의 근거)");
  });

  test("trigger 발화는 EXECUTE 회수의 영향을 받지 않는다(OA001)", async () => {
    const c = await setup();
    await c.exec(`INSERT INTO orchestration_audit_log (event_type,actor_kind) VALUES ('job-created','system')`);
    await assert.rejects(() => c.query(`UPDATE orchestration_audit_log SET event_type='x'`), (e: any) => e.code === "OA001");
  });
});

describe("function fingerprint — 9 hard stop 실패 주입", () => {
  const inject = async (sql: string) => { const c = await setup(); await c.exec(sql); return verifyFunctionFingerprint(c, FP); };

  test("hard stop 목록은 9개이며 중복이 없다", () => {
    assert.equal(FUNCTION_HARD_STOPS.length, 9);
    assert.equal(new Set(FUNCTION_HARD_STOPS).size, 9);
  });

  test("1. fn-count — 미승인 orch_* 함수 추가", async () => {
    const v = await inject(`CREATE FUNCTION orch_rogue() RETURNS trigger LANGUAGE plpgsql AS $x$BEGIN RETURN NULL; END;$x$`);
    assert.ok(v.includes("fn-count"), v.join(","));
  });
  test("3. fn-owner — 소유자 변경", async () => {
    const v = await inject(`CREATE ROLE rogue_owner NOLOGIN; ALTER FUNCTION orch_deny_write() OWNER TO rogue_owner`);
    assert.ok(v.includes("fn-owner"), v.join(","));
  });
  test("5. fn-secdef — SECURITY DEFINER 무단 도입", async () => {
    const v = await inject(`ALTER FUNCTION orch_deny_write() SECURITY DEFINER`);
    assert.ok(v.includes("fn-secdef"), v.join(","));
  });
  test("6. fn-searchpath — proconfig 무단 설정", async () => {
    const v = await inject(`ALTER FUNCTION orch_deny_write() SET search_path = public`);
    assert.ok(v.includes("fn-searchpath"), v.join(","));
  });
  test("7. fn-public-execute — PUBLIC 재부여", async () => {
    const v = await inject(`GRANT EXECUTE ON FUNCTION orch_deny_write() TO PUBLIC`);
    assert.ok(v.includes("fn-public-execute"), v.join(","));
  });
  test("8. fn-role-execute — writer 직접 부여", async () => {
    const v = await inject(`GRANT EXECUTE ON FUNCTION orch_deny_write() TO orchestration_writer`);
    assert.ok(v.includes("fn-role-execute"), v.join(","));
  });
  test("9. fn-default-acl — 미래 함수 보호 해제(PUBLIC 재부여)", async () => {
    const v = await inject(`ALTER DEFAULT PRIVILEGES FOR ROLE orchestration_owner GRANT EXECUTE ON FUNCTIONS TO PUBLIC`);
    assert.ok(v.includes("fn-default-acl"), v.join(","));
  });

  // 2·4 는 실제 DB 에서 재현하려면 trigger 를 모두 끊고 재정의해야 하므로 mock 카탈로그로 주입한다(판정 로직 자체를 검증).
  const mock = (over: Partial<Record<string, unknown>>): HardeningClient => ({
    async query(sql: string) {
      if (sql.includes("pg_get_function_identity_arguments")) return { rows: FP.names.map((nm) => ({
        proname: nm, args: "", owner: FP.owner, ret: FP.returnType, lang: FP.language,
        secdef: false, cfg: null, acl: "{orchestration_owner=X/orchestration_owner}", pub: false, ...over })) };
      if (sql.includes("pg_default_acl")) return { rows: FP.defaultAclRoles.map((r) => ({ role: r, ns: 0, acl: `{${r}=X/${r}}` })) };
      return { rows: [] }; // roleExecutes
    },
    async exec() {},
  });
  test("2. fn-signature — identity arguments 변경", async () => {
    assert.ok((await verifyFunctionFingerprint(mock({ args: "integer" }), FP)).includes("fn-signature"));
  });
  test("4. fn-shape — 반환형/언어 변경", async () => {
    assert.ok((await verifyFunctionFingerprint(mock({ ret: "void" }), FP)).includes("fn-shape"));
    assert.ok((await verifyFunctionFingerprint(mock({ lang: "sql" }), FP)).includes("fn-shape"));
  });
  test("정상 mock 은 위반 0(주입 로직 자체의 위양성 없음)", async () => {
    assert.deepEqual(await verifyFunctionFingerprint(mock({}), FP), []);
  });
});

describe("runner 통합 — fingerprint 위반은 already-applied 를 통과시키지 않는다", () => {
  test("PUBLIC 재부여 상태 → aborted-function-fingerprint 또는 aborted-function-public", async () => {
    const c = await setup();
    await c.exec(`GRANT EXECUTE ON FUNCTION orch_deny_write() TO PUBLIC`);
    const sha = await fileSha256Normalized(HARDEN_PATH);
    const r = await runHardening(c, DEF, { sqlText: SQL_HARDEN, actualSha256: sha, apply: false });
    assert.ok(["aborted-function-public", "aborted-function-fingerprint"].includes(r.outcome), r.outcome + " / " + r.detail);
    assert.equal(r.committed, false);
  });

  test("정상 상태 → already-applied(위반 0)", async () => {
    const c = await setup();
    const sha = await fileSha256Normalized(HARDEN_PATH);
    const r = await runHardening(c, DEF, { sqlText: SQL_HARDEN, actualSha256: sha, apply: false });
    assert.equal(r.outcome, "already-applied", r.detail);
  });

  test("checksum 은 실제 SQL 파일과 일치하도록 재고정돼 있다", async () => {
    assert.equal(await fileSha256Normalized(HARDEN_PATH), DEF.expectedSha256);
  });

  test("fingerprint 기대값이 SQL 의 REVOKE 대상과 정합한다", () => {
    assert.ok(SQL_HARDEN.includes("REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC"), "전역 형식 REVOKE 가 SQL 에 있어야 한다");
    assert.ok(!/IN SCHEMA public REVOKE ALL ON FUNCTIONS/.test(SQL_HARDEN), "무력한 스키마 한정 형식이 남아 있으면 안 된다");
    for (const r of FP.deniedExecuteRoles) assert.ok(SQL_HARDEN.includes(r), `${r} 가 SQL 에 명시돼야 한다`);
  });
});
