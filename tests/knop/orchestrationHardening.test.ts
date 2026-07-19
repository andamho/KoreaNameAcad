// orchestration DB immutability/append-only hardening 검증 (PGlite, 운영 DB 미접촉).
// 계약: owner 이전(orchestration_owner) + 비-owner 최소권한 role(reader/writer) + admin + trigger 2차.
//   job_artifacts 불변 · audit/reviews append-only · business-state 제한 UPDATE · DELETE/TRUNCATE 금지 ·
//   긴급 우회는 replica(superuser 전용, 런타임 불가)가 아니라 owner 의 DISABLE TRIGGER.
// DRAFT SQL: migrations/hardening/0001_orchestration_immutability_roles.sql (일반 registry 아님·운영 미적용).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runHardening, findHardening, HARDENINGS, type HardeningClient } from "../../server/migrations/hardening/hardeningRunner";
import { SIX_TABLES } from "../../server/migrations/hardening/tables";
import { fileSha256Normalized } from "../../server/migrations/checksum";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");
const SQL_0002 = readFileSync(path.join(root, "migrations", "0002_create_persistent_job_queue.sql"), "utf-8");
const SQL_0004 = readFileSync(path.join(root, "migrations", "0004_cross_agent_orchestration.sql"), "utf-8");
const SQL_HARDEN = readFileSync(path.join(root, "migrations", "hardening", "0001_orchestration_immutability_roles.sql"), "utf-8");
const H = "a".repeat(64);

// seed(as bootstrap superuser) → 그 다음 hardening(소유권 이전+trigger). enforcement 테스트용.
async function setup() {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  await db.exec(SQL_0002); await db.exec(SQL_0004);
  const j = (await db.query(`INSERT INTO jobs (owner_scope,job_type,input_identity,request_version_snapshot,execution_options_hash,payload_hash,idempotency_key) VALUES ('kop','x','{}','{}',$1,$1,'k1') RETURNING id`, [H])).rows[0].id;
  const e = (await db.query(`INSERT INTO job_executions (job_id,attempt_number) VALUES ($1,1) RETURNING id`, [j])).rows[0].id;
  await db.query(`INSERT INTO job_artifacts (producer_job_id,producer_execution_id,artifact_kind,schema_version,content_hash,manifest_hash,sensitivity_class,redaction_status) VALUES ($1,$2,'error-analysis',1,$3,$3,'internal','not-required')`, [j, e, H]);
  await db.query(`INSERT INTO automated_reviews (reviewed_job_id,reviewed_execution_id,reviewer_kind,reviewer_version,decision,severity) VALUES ($1,$2,'gpt','v1','approve','info')`, [j, e]);
  await db.query(`INSERT INTO orchestration_audit_log (event_type,actor_kind) VALUES ('job-created','system')`);
  await db.query(`INSERT INTO human_approvals (job_id) VALUES ($1)`, [j]);
  await db.query(`INSERT INTO emergency_stops (scope_type,reason_code) VALUES ('global','ops')`);
  const j2 = (await db.query(`INSERT INTO jobs (owner_scope,job_type,input_identity,request_version_snapshot,execution_options_hash,payload_hash,idempotency_key) VALUES ('kop','x','{}','{}',$1,$1,'k2') RETURNING id`, [H])).rows[0].id;
  await db.query(`INSERT INTO job_dependencies (job_id,depends_on_job_id,dependency_type) VALUES ($1,$2,'requires-success')`, [j2, j]);
  await db.exec(SQL_HARDEN);
  await db.exec(`CREATE ROLE app_sim NOLOGIN`); // 기존 app-role 시뮬(비-owner·무 grant)
  return { db, j, j2, e };
}
async function asRole(db: any, role: string, sql: string): Promise<{ ok: boolean; msg: string; code?: string }> {
  try { await db.exec(`SET ROLE ${role}`); await db.query(sql); return { ok: true, msg: "" }; }
  catch (e: any) { return { ok: false, msg: String(e?.message ?? e), code: e?.code }; }
  finally { await db.exec(`RESET ROLE`).catch(() => {}); }
}
async function ownerTry(db: any, sql: string): Promise<{ ok: boolean; msg: string; code?: string }> {
  try { await db.query(sql); return { ok: true, msg: "" }; } catch (e: any) { return { ok: false, msg: String(e?.message ?? e), code: e?.code }; }
}

describe("orchestration DB hardening (owner + role + trigger)", () => {
  test("role 4개 + 6테이블 소유자=orchestration_owner + PUBLIC 권한 0", async () => {
    const { db } = await setup();
    try {
      const roles = (await db.query(`SELECT rolname FROM pg_roles WHERE rolname LIKE 'orchestration_%' ORDER BY 1`)).rows.map((r: any) => r.rolname);
      assert.deepEqual(roles, ["orchestration_admin", "orchestration_owner", "orchestration_reader", "orchestration_writer"]);
      const owned = (await db.query(`SELECT count(*)::int n FROM pg_class r JOIN pg_namespace ns ON ns.oid=r.relnamespace WHERE ns.nspname='public' AND r.relname=ANY($1) AND pg_get_userbyid(r.relowner)='orchestration_owner'`, [SIX_TABLES])).rows[0].n;
      assert.equal(owned, 6, "6테이블 모두 orchestration_owner 소유");
      const pub = (await db.query(`SELECT count(*)::int n FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name=ANY($1) AND grantee='PUBLIC'`, [SIX_TABLES])).rows[0].n;
      assert.equal(pub, 0, "PUBLIC 권한 0");
      const fns = (await db.query(`SELECT count(*)::int n FROM pg_proc WHERE proname LIKE 'orch_%'`)).rows[0].n;
      assert.ok(fns >= 4, "trigger function ≥4");
    } finally { await db.close(); }
  });

  test("reader: SELECT ok · INSERT/UPDATE/DELETE 거부", async () => {
    const { db } = await setup();
    try {
      assert.ok((await asRole(db, "orchestration_reader", `SELECT * FROM job_artifacts`)).ok);
      assert.ok(!(await asRole(db, "orchestration_reader", `INSERT INTO orchestration_audit_log (event_type,actor_kind) VALUES ('x','system')`)).ok);
      assert.ok(!(await asRole(db, "orchestration_reader", `UPDATE human_approvals SET approval_status='approved'`)).ok);
    } finally { await db.close(); }
  });

  test("writer: append-only INSERT ok · UPDATE/DELETE/TRUNCATE 거부 · business 상태전이 ok", async () => {
    const { db } = await setup();
    try {
      assert.ok((await asRole(db, "orchestration_writer", `INSERT INTO orchestration_audit_log (event_type,actor_kind) VALUES ('e','system')`)).ok, "writer audit INSERT");
      assert.ok(!(await asRole(db, "orchestration_writer", `UPDATE job_artifacts SET schema_version=2`)).ok, "writer artifact UPDATE 거부");
      assert.ok(!(await asRole(db, "orchestration_writer", `DELETE FROM automated_reviews`)).ok, "writer DELETE 거부");
      assert.ok(!(await asRole(db, "orchestration_writer", `TRUNCATE orchestration_audit_log`)).ok, "writer TRUNCATE 거부");
      assert.ok((await asRole(db, "orchestration_writer", `UPDATE human_approvals SET approval_status='approved', updated_at=now()`)).ok, "writer 승인 상태전이 ok");
    } finally { await db.close(); }
  });

  test("writer ↔ business table 격리: writer 는 jobs 접근 불가", async () => {
    const { db } = await setup();
    try {
      assert.ok(!(await asRole(db, "orchestration_writer", `SELECT * FROM jobs`)).ok, "writer jobs SELECT 거부(무 grant)");
      assert.ok(!(await asRole(db, "orchestration_reader", `SELECT * FROM jobs`)).ok, "reader jobs SELECT 거부");
    } finally { await db.close(); }
  });

  test("기존 app-role 시뮬(비-owner·무 grant): orchestration write 실패", async () => {
    const { db } = await setup();
    try {
      assert.ok(!(await asRole(db, "app_sim", `INSERT INTO orchestration_audit_log (event_type,actor_kind) VALUES ('x','system')`)).ok, "app_sim INSERT 거부");
      assert.ok(!(await asRole(db, "app_sim", `UPDATE job_artifacts SET schema_version=2`)).ok, "app_sim UPDATE 거부");
      assert.ok(!(await asRole(db, "app_sim", `DELETE FROM job_artifacts`)).ok, "app_sim DELETE 거부");
    } finally { await db.close(); }
  });

  test("trigger 2차: 소유자/특권 연결도 immutable UPDATE/DELETE 불가(OA001)", async () => {
    const { db } = await setup();
    try {
      assert.equal((await ownerTry(db, `UPDATE job_artifacts SET schema_version=2`)).code, "OA001");
      assert.equal((await ownerTry(db, `DELETE FROM job_artifacts`)).code, "OA001");
      assert.equal((await ownerTry(db, `UPDATE orchestration_audit_log SET event_type='z'`)).code, "OA001");
      assert.equal((await ownerTry(db, `UPDATE automated_reviews SET decision='reject'`)).code, "OA001");
    } finally { await db.close(); }
  });

  test("business-state: DELETE=OA002 · 식별변경=OA003", async () => {
    const { db } = await setup();
    try {
      assert.equal((await ownerTry(db, `DELETE FROM human_approvals`)).code, "OA002");
      assert.equal((await ownerTry(db, `DELETE FROM emergency_stops`)).code, "OA002");
      assert.equal((await ownerTry(db, `DELETE FROM job_dependencies`)).code, "OA002");
      assert.equal((await ownerTry(db, `UPDATE human_approvals SET created_at=now()`)).code, "OA003");
      assert.equal((await ownerTry(db, `UPDATE emergency_stops SET id='x'`)).code, "OA003");
    } finally { await db.close(); }
  });

  test("TRUNCATE 전면 거부", async () => {
    // PGlite 는 TRUNCATE statement-trigger 미지원(0A000) → '거부됨'만. OA004 는 PG17 e2e 에서.
    const { db } = await setup();
    try {
      for (const t of SIX_TABLES) assert.ok(!(await ownerTry(db, `TRUNCATE ${t}`)).ok, `${t} TRUNCATE 거부`);
    } finally { await db.close(); }
  });

  test("session_replication_role 제한: writer 는 설정 불가(런타임 우회 0)", async () => {
    const { db } = await setup();
    try {
      const r = await asRole(db, "orchestration_writer", `SET session_replication_role=replica`);
      assert.ok(!r.ok, "writer 는 session_replication_role 설정 거부");
    } finally { await db.close(); }
  });

  test("긴급 우회 = owner 의 DISABLE TRIGGER(비-owner 는 불가)", async () => {
    const { db } = await setup();
    try {
      // 비-owner writer 는 trigger disable 불가
      assert.ok(!(await asRole(db, "orchestration_writer", `ALTER TABLE job_artifacts DISABLE TRIGGER job_artifacts_immutable`)).ok, "writer DISABLE TRIGGER 거부");
      // owner 는 가능(이중승인·감사 하에서만 — 여기선 능력 검증)
      assert.ok((await asRole(db, "orchestration_owner", `ALTER TABLE job_artifacts DISABLE TRIGGER job_artifacts_immutable`)).ok, "owner DISABLE TRIGGER 가능");
      const upd = await ownerTry(db, `UPDATE job_artifacts SET schema_version=2`);
      await db.exec(`ALTER TABLE job_artifacts ENABLE TRIGGER job_artifacts_immutable`);
      assert.ok(upd.ok, "disable 상태에서 긴급 정정 가능");
      assert.equal((await ownerTry(db, `UPDATE job_artifacts SET schema_version=3`)).code, "OA001", "enable 후 trigger 재작동");
    } finally { await db.close(); }
  });

  test("tx rollback: 거부된 UPDATE → tx abort", async () => {
    const { db } = await setup();
    try {
      await db.exec(`BEGIN`);
      let aborted = false; try { await db.query(`UPDATE job_artifacts SET schema_version=2`); } catch { aborted = true; }
      let follow = false; try { await db.query(`SELECT 1`); } catch { follow = true; }
      await db.exec(`ROLLBACK`);
      assert.ok(aborted && follow, "거부 후 tx abort");
    } finally { await db.close(); }
  });

  test("append-only seq 단조·유일", async () => {
    const { db } = await setup();
    try {
      for (let i = 0; i < 5; i++) await db.query(`INSERT INTO orchestration_audit_log (event_type,actor_kind) VALUES ('e${i}','system')`);
      const seqs = (await db.query(`SELECT seq FROM orchestration_audit_log ORDER BY seq`)).rows.map((r: any) => Number(r.seq));
      assert.equal(new Set(seqs).size, seqs.length);
      for (let i = 1; i < seqs.length; i++) assert.ok(seqs[i] > seqs[i - 1]);
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
      const j = (await db.query(`INSERT INTO jobs (owner_scope,job_type,input_identity,request_version_snapshot,execution_options_hash,payload_hash,idempotency_key) VALUES ('kop','x','{}','{}',$1,$1,'k') RETURNING id`, [H])).rows[0].id;
      const e = (await db.query(`INSERT INTO job_executions (job_id,attempt_number) VALUES ($1,1) RETURNING id`, [j])).rows[0].id;
      await db.query(`INSERT INTO job_artifacts (producer_job_id,producer_execution_id,artifact_kind,schema_version,content_hash,manifest_hash,sensitivity_class,redaction_status) VALUES ($1,$2,'error-analysis',1,$3,$3,'internal','not-required')`, [j, e, H]);
    }
    const client: HardeningClient = { query: (s, p) => db.query(s, p as any[]) as any, exec: (s) => db.exec(s).then(() => undefined) };
    return { db, client };
  }
  const roleN = async (db: any) => (await db.query(`SELECT count(*)::int n FROM pg_roles WHERE rolname LIKE 'orchestration_%'`)).rows[0].n;

  test("등록·checksum 일치(4 role owner 반영)", () => {
    assert.equal(HARDENINGS.length, 1);
    assert.equal(SHA, DEF.expectedSha256);
    assert.equal(DEF.expectedRoles.length, 4);
    assert.equal(DEF.expectedTableOwner, "orchestration_owner");
  });

  test("sha 불일치 → 거부", async () => {
    const { db, client } = await freshBase();
    try {
      const r = await runHardening(client, DEF, { sqlText: SQL_HARDEN, actualSha256: "0".repeat(64), apply: true });
      assert.equal(r.outcome, "aborted-sha-mismatch");
      assert.equal(await roleN(db), 0);
    } finally { await db.close(); }
  });

  test("신규 6테이블 행수≠0 → fail-closed(적용 안 함)", async () => {
    const { db, client } = await freshBase(true); // artifact 1행 seed
    try {
      const r = await runHardening(client, DEF, { sqlText: SQL_HARDEN, actualSha256: SHA, apply: true });
      assert.equal(r.outcome, "aborted-rows-present");
      assert.equal(await roleN(db), 0, "role 미생성");
    } finally { await db.close(); }
  });

  test("dry-run → 검증 통과·미적용", async () => {
    const { db, client } = await freshBase();
    try {
      const r = await runHardening(client, DEF, { sqlText: SQL_HARDEN, actualSha256: SHA, apply: false });
      assert.equal(r.outcome, "dry-run-verified");
      assert.equal(await roleN(db), 0, "dry-run 후 role 없음");
    } finally { await db.close(); }
  });

  test("apply → 적용(owner/PUBLIC/trigger post-verify) · 재실행 already-applied", async () => {
    const { db, client } = await freshBase();
    try {
      const r1 = await runHardening(client, DEF, { sqlText: SQL_HARDEN, actualSha256: SHA, apply: true });
      assert.equal(r1.outcome, "applied");
      assert.equal(await roleN(db), 4);
      const owned = (await db.query(`SELECT count(*)::int n FROM pg_class r JOIN pg_namespace ns ON ns.oid=r.relnamespace WHERE ns.nspname='public' AND r.relname=ANY($1) AND pg_get_userbyid(r.relowner)='orchestration_owner'`, [SIX_TABLES])).rows[0].n;
      assert.equal(owned, 6);
      const r2 = await runHardening(client, DEF, { sqlText: SQL_HARDEN, actualSha256: SHA, apply: true });
      assert.equal(r2.outcome, "already-applied");
      assert.equal(r2.committed, false);
    } finally { await db.close(); }
  });

  test("owner-mismatch fail-closed(적용 후 소유권이 owner 가 아니면 거부)", async () => {
    const { db, client } = await freshBase();
    try {
      // owner 이전 문(ALTER ... OWNER TO orchestration_owner)을 제거한 변형 SQL → post-verify 소유권 불일치
      const noOwnerXfer = SQL_HARDEN.replace(/ALTER TABLE .*OWNER TO orchestration_owner;/g, "-- removed").replace(/ALTER FUNCTION .*OWNER TO orchestration_owner;/g, "-- removed");
      // 주의: 이 변형은 sha 가 달라지므로 러너는 sha 단계에서 먼저 거부됨 → 대신 verify 만 직접 호출로 검증 대체
      // 여기서는 러너의 owner-mismatch 경로를 직접 확인: 정상 SQL 적용 후 소유권을 강제로 되돌린 뒤 already-applied 검증이 owner-mismatch 로 떨어지는지
      await db.exec(SQL_HARDEN);
      await db.exec(`ALTER TABLE job_artifacts OWNER TO postgres`); // 소유권 훼손
      const r = await runHardening(client, DEF, { sqlText: SQL_HARDEN, actualSha256: SHA, apply: true });
      assert.equal(r.outcome, "aborted-owner-mismatch");
      void noOwnerXfer;
    } finally { await db.close(); }
  });
});
