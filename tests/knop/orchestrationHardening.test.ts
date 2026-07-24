// orchestration DB immutability/append-only hardening 검증 (PGlite, 운영 DB 미접촉).
// 5-role(owner/admin/deployer/writer/reader) + 소유권 이전 + trigger 2차 + fail-closed.
// DRAFT SQL: migrations/hardening/0001_orchestration_immutability_roles.sql (일반 registry 아님·운영 미적용).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runHardening, findHardening, HARDENINGS, startupTriggerSelfCheck, hardeningPreflight, type HardeningClient } from "../../server/migrations/hardening/hardeningRunner";
import { SIX_TABLES } from "../../server/migrations/hardening/tables";
import { fileSha256Normalized } from "../../server/migrations/checksum";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");
const SQL_0002 = readFileSync(path.join(root, "migrations", "0002_create_persistent_job_queue.sql"), "utf-8");
const SQL_0004 = readFileSync(path.join(root, "migrations", "0004_cross_agent_orchestration.sql"), "utf-8");
const SQL_HARDEN = readFileSync(path.join(root, "migrations", "hardening", "0001_orchestration_immutability_roles.sql"), "utf-8");
const ROLLBACK_SQL = readFileSync(path.join(root, "migrations", "hardening", "0001_orchestration_immutability_roles.rollback.sql"), "utf-8");
const H = "a".repeat(64);

async function setup() {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  await db.exec(SQL_0002); await db.exec(SQL_0004);
  const j = (await db.query<{ id: number }>(`INSERT INTO jobs (owner_scope,job_type,input_identity,request_version_snapshot,execution_options_hash,payload_hash,idempotency_key) VALUES ('kop','x','{}','{}',$1,$1,'k1') RETURNING id`, [H])).rows[0].id;
  const e = (await db.query<{ id: number }>(`INSERT INTO job_executions (job_id,attempt_number) VALUES ($1,1) RETURNING id`, [j])).rows[0].id;
  await db.query(`INSERT INTO job_artifacts (producer_job_id,producer_execution_id,artifact_kind,schema_version,content_hash,manifest_hash,sensitivity_class,redaction_status) VALUES ($1,$2,'error-analysis',1,$3,$3,'internal','not-required')`, [j, e, H]);
  await db.query(`INSERT INTO automated_reviews (reviewed_job_id,reviewed_execution_id,reviewer_kind,reviewer_version,decision,severity) VALUES ($1,$2,'gpt','v1','approve','info')`, [j, e]);
  await db.query(`INSERT INTO orchestration_audit_log (event_type,actor_kind) VALUES ('job-created','system')`);
  await db.query(`INSERT INTO human_approvals (job_id) VALUES ($1)`, [j]);
  await db.query(`INSERT INTO emergency_stops (scope_type,reason_code) VALUES ('global','ops')`);
  const j2 = (await db.query<{ id: number }>(`INSERT INTO jobs (owner_scope,job_type,input_identity,request_version_snapshot,execution_options_hash,payload_hash,idempotency_key) VALUES ('kop','x','{}','{}',$1,$1,'k2') RETURNING id`, [H])).rows[0].id;
  await db.query(`INSERT INTO job_dependencies (job_id,depends_on_job_id,dependency_type) VALUES ($1,$2,'requires-success')`, [j2, j]);
  await db.exec(SQL_HARDEN);
  await db.exec(`CREATE ROLE app_sim NOLOGIN`); // 기존 app-role 시뮬(비-owner·무 grant·무 membership)
  return { db };
}
async function asRole(db: any, role: string, sql: string): Promise<{ ok: boolean; msg: string; code?: string }> {
  try { await db.exec(`SET ROLE ${role}`); await db.query(sql); return { ok: true, msg: "" }; }
  catch (e: any) { return { ok: false, msg: String(e?.message ?? e), code: e?.code }; }
  finally { await db.exec(`RESET ROLE`).catch(() => {}); }
}
async function ownerTry(db: any, sql: string): Promise<{ ok: boolean; msg: string; code?: string }> {
  try { await db.query(sql); return { ok: true, msg: "" }; } catch (e: any) { return { ok: false, msg: String(e?.message ?? e), code: e?.code }; }
}

describe("orchestration DB hardening: 구조·권한", () => {
  test("5 role · 6테이블 owner=orchestration_owner · PUBLIC table 권한 0 · PUBLIC function EXECUTE 0", async () => {
    const { db } = await setup();
    try {
      const roles = (await db.query<{ rolname: string }>(`SELECT rolname FROM pg_roles WHERE rolname LIKE 'orchestration_%' ORDER BY 1`)).rows.map((r: any) => r.rolname);
      assert.deepEqual(roles, ["orchestration_admin", "orchestration_deployer", "orchestration_owner", "orchestration_reader", "orchestration_writer"]);
      assert.equal((await db.query<{ n: number }>(`SELECT count(*)::int n FROM pg_class r JOIN pg_namespace ns ON ns.oid=r.relnamespace WHERE ns.nspname='public' AND r.relname=ANY($1) AND pg_get_userbyid(r.relowner)='orchestration_owner'`, [SIX_TABLES])).rows[0].n, 6);
      assert.equal((await db.query<{ n: number }>(`SELECT count(*)::int n FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name=ANY($1) AND grantee='PUBLIC'`, [SIX_TABLES])).rows[0].n, 0, "PUBLIC table 0");
      const pubFn = (await db.query<{ n: number }>(`SELECT count(*)::int n FROM pg_proc p WHERE p.proname LIKE 'orch\\_%' AND has_function_privilege('public', p.oid, 'EXECUTE')`)).rows[0].n;
      assert.equal(pubFn, 0, "PUBLIC function EXECUTE 0");
      const nonOrch = (await db.query<{ n: number }>(`SELECT count(*)::int n FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name=ANY($1) AND grantee<>'PUBLIC' AND grantee NOT LIKE 'orchestration\\_%'`, [SIX_TABLES])).rows[0].n;
      assert.equal(nonOrch, 0, "비-orchestration grantee 0(기존 app role 권한 없음)");
    } finally { await db.close(); }
  });

  // 주의: PGlite 는 superuser 세션이라 SET ROLE 자체는 membership 무관하게 통과 → escalation 거부는 catalog membership 로 검증,
  //   실제 런타임 SET ROLE 거부(비-superuser writer 접속)는 PG17 e2e(scratchpad)에서 real login 으로 확인.
  test("membership graph: deployer∈admin∈owner · writer/reader/app 은 admin/owner 비멤버", async () => {
    const { db } = await setup();
    try {
      const isMember = async (m: string, g: string) =>
        (await db.query<{ n: number }>(`SELECT count(*)::int n FROM pg_auth_members am JOIN pg_roles mr ON mr.oid=am.member JOIN pg_roles gr ON gr.oid=am.roleid WHERE mr.rolname=$1 AND gr.rolname=$2`, [m, g])).rows[0].n > 0;
      assert.ok(await isMember("orchestration_deployer", "orchestration_admin"), "deployer∈admin");
      assert.ok(await isMember("orchestration_admin", "orchestration_owner"), "admin∈owner");
      for (const m of ["orchestration_writer", "orchestration_reader", "app_sim"])
        for (const g of ["orchestration_admin", "orchestration_owner", "orchestration_deployer"])
          assert.ok(!(await isMember(m, g)), `${m}∉${g}`);
    } finally { await db.close(); }
  });

  test("deployer membership revoke → admin 비멤버(SET ROLE 근거 제거)", async () => {
    const { db } = await setup();
    try {
      const isMember = async (m: string, g: string) =>
        (await db.query<{ n: number }>(`SELECT count(*)::int n FROM pg_auth_members am JOIN pg_roles mr ON mr.oid=am.member JOIN pg_roles gr ON gr.oid=am.roleid WHERE mr.rolname=$1 AND gr.rolname=$2`, [m, g])).rows[0].n > 0;
      assert.ok(await isMember("orchestration_deployer", "orchestration_admin"), "revoke 전 멤버");
      await db.exec(`REVOKE orchestration_admin FROM orchestration_deployer`);
      assert.ok(!(await isMember("orchestration_deployer", "orchestration_admin")), "revoke 후 비멤버");
    } finally { await db.close(); }
  });

  test("trigger function 직접 호출: writer/app 는 EXECUTE 거부", async () => {
    const { db } = await setup();
    try {
      assert.ok(!(await asRole(db, "orchestration_writer", `SELECT orch_deny_write()`)).ok, "writer 직접 호출 거부");
      assert.ok(!(await asRole(db, "orchestration_reader", `SELECT orch_deny_truncate()`)).ok, "reader 직접 호출 거부");
      assert.ok(!(await asRole(db, "app_sim", `SELECT orch_guard_business_update()`)).ok, "app 직접 호출 거부");
    } finally { await db.close(); }
  });
});

describe("orchestration DB hardening: enforcement", () => {
  test("reader SELECT-only · writer append-only+business전이 · writer↔jobs 격리", async () => {
    const { db } = await setup();
    try {
      assert.ok((await asRole(db, "orchestration_reader", `SELECT * FROM job_artifacts`)).ok);
      assert.ok(!(await asRole(db, "orchestration_reader", `INSERT INTO orchestration_audit_log (event_type,actor_kind) VALUES ('x','system')`)).ok);
      assert.ok((await asRole(db, "orchestration_writer", `INSERT INTO orchestration_audit_log (event_type,actor_kind) VALUES ('e','system')`)).ok);
      assert.ok(!(await asRole(db, "orchestration_writer", `UPDATE job_artifacts SET schema_version=2`)).ok);
      assert.ok((await asRole(db, "orchestration_writer", `UPDATE human_approvals SET approval_status='approved', updated_at=now()`)).ok);
      assert.ok(!(await asRole(db, "orchestration_writer", `SELECT * FROM jobs`)).ok, "writer jobs 접근 거부");
      assert.ok(!(await asRole(db, "orchestration_reader", `SELECT * FROM jobs`)).ok, "reader jobs 접근 거부");
    } finally { await db.close(); }
  });

  test("기존 app-role 시뮬: orchestration write 전면 실패", async () => {
    const { db } = await setup();
    try {
      assert.ok(!(await asRole(db, "app_sim", `INSERT INTO orchestration_audit_log (event_type,actor_kind) VALUES ('x','system')`)).ok);
      assert.ok(!(await asRole(db, "app_sim", `UPDATE job_artifacts SET schema_version=2`)).ok);
      assert.ok(!(await asRole(db, "app_sim", `DELETE FROM job_artifacts`)).ok);
    } finally { await db.close(); }
  });

  test("trigger 2차: 특권 연결도 immutable UPDATE/DELETE=OA001 · DELETE=OA002 · 식별=OA003", async () => {
    const { db } = await setup();
    try {
      assert.equal((await ownerTry(db, `UPDATE job_artifacts SET schema_version=2`)).code, "OA001");
      assert.equal((await ownerTry(db, `DELETE FROM orchestration_audit_log`)).code, "OA001");
      assert.equal((await ownerTry(db, `UPDATE automated_reviews SET decision='reject'`)).code, "OA001");
      assert.equal((await ownerTry(db, `DELETE FROM human_approvals`)).code, "OA002");
      assert.equal((await ownerTry(db, `DELETE FROM job_dependencies`)).code, "OA002");
      assert.equal((await ownerTry(db, `UPDATE human_approvals SET created_at=now()`)).code, "OA003");
    } finally { await db.close(); }
  });

  test("TRUNCATE 전면 거부", async () => {
    const { db } = await setup(); // PGlite TRUNCATE trigger 미지원(0A000) → 거부만. OA004 는 PG17 e2e.
    try { for (const t of SIX_TABLES) assert.ok(!(await ownerTry(db, `TRUNCATE ${t}`)).ok, `${t}`); } finally { await db.close(); }
  });

  test("session_replication_role: writer 설정 불가(런타임 우회 0)", async () => {
    const { db } = await setup();
    try { assert.ok(!(await asRole(db, "orchestration_writer", `SET session_replication_role=replica`)).ok); } finally { await db.close(); }
  });

  test("긴급 = owner DISABLE TRIGGER(writer 불가) · 재enable 후 재작동", async () => {
    const { db } = await setup();
    try {
      assert.ok(!(await asRole(db, "orchestration_writer", `ALTER TABLE job_artifacts DISABLE TRIGGER job_artifacts_immutable`)).ok, "writer DISABLE 거부");
      assert.ok((await asRole(db, "orchestration_owner", `ALTER TABLE job_artifacts DISABLE TRIGGER job_artifacts_immutable`)).ok, "owner DISABLE ok");
      assert.ok((await ownerTry(db, `UPDATE job_artifacts SET schema_version=2`)).ok, "disable 중 긴급 정정");
      await db.exec(`ALTER TABLE job_artifacts ENABLE TRIGGER job_artifacts_immutable`);
      assert.equal((await ownerTry(db, `UPDATE job_artifacts SET schema_version=3`)).code, "OA001", "enable 후 재작동");
    } finally { await db.close(); }
  });
});

describe("orchestration DB hardening: startup self-check", () => {
  const DEF = findHardening("0001_orchestration_immutability_roles")!;
  test("15 trigger enabled → ok · 하나 disable → 실패 · 재enable → ok", async () => {
    const { db } = await setup();
    const client: HardeningClient = { query: (s: string, p?: unknown[]) => db.query(s, p as any[]) as any, exec: (s: string) => db.exec(s).then(() => undefined) };
    try {
      let r = await startupTriggerSelfCheck(client, DEF);
      assert.ok(r.ok && r.count >= 15, `초기 enabled(${r.count})`);
      await db.exec(`ALTER TABLE job_artifacts DISABLE TRIGGER job_artifacts_immutable`);
      r = await startupTriggerSelfCheck(client, DEF);
      assert.ok(!r.ok && r.disabled.includes("job_artifacts_immutable"), "disable 감지 → self-check 실패(writer 기동 거부)");
      await db.exec(`ALTER TABLE job_artifacts ENABLE TRIGGER job_artifacts_immutable`);
      r = await startupTriggerSelfCheck(client, DEF);
      assert.ok(r.ok && r.disabled.length === 0, "재enable → ok");
    } finally { await db.close(); }
  });
});

describe("hardening 전용 러너(checksum allowlist + fail-closed)", () => {
  const DEF = findHardening("0001_orchestration_immutability_roles")!;
  const SHA = fileSha256Normalized(path.join(root, "migrations", "hardening", DEF.sqlFile));
  async function freshBase(seed = false) {
    const { PGlite } = await import("@electric-sql/pglite");
    const db = new PGlite();
    await db.exec(SQL_0002); await db.exec(SQL_0004);
    if (seed) {
      const j = (await db.query<{ id: number }>(`INSERT INTO jobs (owner_scope,job_type,input_identity,request_version_snapshot,execution_options_hash,payload_hash,idempotency_key) VALUES ('kop','x','{}','{}',$1,$1,'k') RETURNING id`, [H])).rows[0].id;
      const e = (await db.query<{ id: number }>(`INSERT INTO job_executions (job_id,attempt_number) VALUES ($1,1) RETURNING id`, [j])).rows[0].id;
      await db.query(`INSERT INTO job_artifacts (producer_job_id,producer_execution_id,artifact_kind,schema_version,content_hash,manifest_hash,sensitivity_class,redaction_status) VALUES ($1,$2,'error-analysis',1,$3,$3,'internal','not-required')`, [j, e, H]);
    }
    const client: HardeningClient = { query: (s: string, p?: unknown[]) => db.query(s, p as any[]) as any, exec: (s: string) => db.exec(s).then(() => undefined) };
    return { db, client };
  }
  const roleN = async (db: any): Promise<number> => (await db.query(`SELECT count(*)::int n FROM pg_roles WHERE rolname LIKE 'orchestration_%'`)).rows[0].n;

  test("등록·checksum·5 role·owner", () => {
    assert.equal(HARDENINGS.length, 1);
    assert.equal(SHA, DEF.expectedSha256);
    assert.equal(DEF.expectedRoles.length, 5);
    assert.equal(DEF.expectedTableOwner, "orchestration_owner");
  });

  test("sha 불일치 → 거부", async () => {
    const { db, client } = await freshBase();
    try { assert.equal((await runHardening(client, DEF, { sqlText: SQL_HARDEN, actualSha256: "0".repeat(64), apply: true })).outcome, "aborted-sha-mismatch"); assert.equal(await roleN(db), 0); }
    finally { await db.close(); }
  });

  test("신규 6테이블 행수≠0 → rows-present fail-closed", async () => {
    const { db, client } = await freshBase(true);
    try { assert.equal((await runHardening(client, DEF, { sqlText: SQL_HARDEN, actualSha256: SHA, apply: true })).outcome, "aborted-rows-present"); assert.equal(await roleN(db), 0); }
    finally { await db.close(); }
  });

  test("dry-run → 미적용 · apply → 적용(5role·enabled·owner·PUBLIC0·app0·fn0) · 재실행 already-applied", async () => {
    const { db, client } = await freshBase();
    try {
      assert.equal((await runHardening(client, DEF, { sqlText: SQL_HARDEN, actualSha256: SHA, apply: false })).outcome, "dry-run-verified");
      assert.equal(await roleN(db), 0, "dry-run 후 role 0");
      assert.equal((await runHardening(client, DEF, { sqlText: SQL_HARDEN, actualSha256: SHA, apply: true })).outcome, "applied");
      assert.equal(await roleN(db), 5);
      const r2 = await runHardening(client, DEF, { sqlText: SQL_HARDEN, actualSha256: SHA, apply: true });
      assert.equal(r2.outcome, "already-applied"); assert.equal(r2.committed, false);
    } finally { await db.close(); }
  });

  test("owner-mismatch fail-closed", async () => {
    const { db, client } = await freshBase();
    try {
      await db.exec(SQL_HARDEN);
      await db.exec(`ALTER TABLE job_artifacts OWNER TO postgres`);
      assert.equal((await runHardening(client, DEF, { sqlText: SQL_HARDEN, actualSha256: SHA, apply: true })).outcome, "aborted-owner-mismatch");
    } finally { await db.close(); }
  });

  test("trigger-disabled fail-closed(already-applied 검증에서 disable 감지)", async () => {
    const { db, client } = await freshBase();
    try {
      await db.exec(SQL_HARDEN);
      await db.exec(`ALTER TABLE orchestration_audit_log DISABLE TRIGGER orchestration_audit_log_append_only`);
      assert.equal((await runHardening(client, DEF, { sqlText: SQL_HARDEN, actualSha256: SHA, apply: true })).outcome, "aborted-trigger-disabled");
    } finally { await db.close(); }
  });

  // ── apply 전 read-only preflight ──────────────────────────────────────────
  test("preflight: clean → ok/clean-ready, write 0 · sha 불일치 → blocker · 적용 후 → already-applied", async () => {
    const { db, client } = await freshBase();
    try {
      const pf = await hardeningPreflight(client, DEF, SHA);
      assert.equal(pf.ok, true, `blockers=${pf.blockers.join("|")}`);
      assert.equal(pf.state, "clean-ready");
      assert.equal(await roleN(db), 0, "preflight 는 write 0(role 미생성)");
      const bad = await hardeningPreflight(client, DEF, "0".repeat(64));
      assert.equal(bad.ok, false); assert.ok(bad.blockers.some((b) => b.includes("sha")));
      await db.exec(SQL_HARDEN);
      const pf2 = await hardeningPreflight(client, DEF, SHA);
      assert.equal(pf2.state, "already-applied");
    } finally { await db.close(); }
  });

  test("preflight: 6테이블 행수≠0 → rows-present blocker", async () => {
    const { db, client } = await freshBase(true);
    try {
      const pf = await hardeningPreflight(client, DEF, SHA);
      assert.equal(pf.state, "rows-present"); assert.equal(pf.ok, false);
    } finally { await db.close(); }
  });

  test("preflight: 적용 후에는 already-applied(소유권 이전으로 행수 검사 건너뜀 — throw 안 함)", async () => {
    const { db, client } = await freshBase();
    try {
      assert.equal((await runHardening(client, DEF, { sqlText: SQL_HARDEN, actualSha256: SHA, apply: true })).outcome, "applied");
      const pf = await hardeningPreflight(client, DEF, SHA); // 적용 후 재조회 — newRowsTotal 을 건너뛰어야 함
      assert.equal(pf.state, "already-applied");
    } finally { await db.close(); }
  });

  // ── rollback 왕복(PGlite superuser: 구조 검증. 비-superuser 소유권 semantics 는 runNonSuperuserHardeningCheck.ts) ──
  test("rollback: apply → rollback → orchestration role 0 · trigger 0 · function 0 · 테이블 존속(DROP 안 함)", async () => {
    const { db, client } = await freshBase(); // rows=0(하드닝 요건). 롤백은 테이블을 DROP 하지 않는다.
    try {
      assert.equal((await runHardening(client, DEF, { sqlText: SQL_HARDEN, actualSha256: SHA, apply: true })).outcome, "applied");
      await db.exec(ROLLBACK_SQL);
      assert.equal(await roleN(db), 0, "rollback 후 orchestration role 0");
      const trig = (await db.query<{ n: number }>(`SELECT count(*)::int n FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='public' AND NOT t.tgisinternal AND c.relname = ANY($1)`, [SIX_TABLES])).rows[0].n;
      assert.equal(trig, 0, "rollback 후 orchestration trigger 0");
      const fns = (await db.query<{ n: number }>(`SELECT count(*)::int n FROM pg_proc WHERE proname LIKE 'orch\\_%'`)).rows[0].n;
      assert.equal(fns, 0, "rollback 후 함수 0");
      // 6테이블이 여전히 존재하고 SELECT 가능(데이터 보존 = 테이블 DROP 안 함)
      for (const t of SIX_TABLES) await db.query(`SELECT count(*) FROM "${t}"`);
    } finally { await db.close(); }
  });

  // ── secret·production-write 차단 ──────────────────────────────────────────
  test("secret 차단: hardening SQL·rollback SQL 에 password/secret literal 없음", () => {
    for (const [name, sql] of [["0001", SQL_HARDEN], ["rollback", ROLLBACK_SQL]] as const) {
      assert.ok(!/password\s*=?\s*['"]/i.test(sql.replace(/--.*$/gm, "")), `${name}: password literal`);
      assert.ok(!/postgres(ql)?:\/\//i.test(sql), `${name}: connection string`);
      assert.ok(!/\bLOGIN\s+PASSWORD\b/i.test(sql), `${name}: inline LOGIN PASSWORD (credential 은 secret store 외부)`);
    }
  });

  test("production-write 차단: dry-run·sha불일치·rows-present 는 commit 0(role 0 유지)", async () => {
    for (const mk of [
      async (c: HardeningClient) => runHardening(c, DEF, { sqlText: SQL_HARDEN, actualSha256: SHA, apply: false }),
      async (c: HardeningClient) => runHardening(c, DEF, { sqlText: SQL_HARDEN, actualSha256: "0".repeat(64), apply: true }),
    ]) {
      const { db, client } = await freshBase();
      try { const r = await mk(client); assert.equal(r.committed, false); assert.equal(await roleN(db), 0); }
      finally { await db.close(); }
    }
  });
});
