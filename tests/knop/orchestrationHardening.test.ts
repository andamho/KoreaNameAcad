// orchestration DB immutability/append-only hardening 검증 (PGlite, 운영 DB 미접촉).
// 계약: role 분리(reader/writer/admin) 1차 + trigger 2차. job_artifacts 불변 · audit/reviews append-only ·
//   business-state(dependencies/approvals/stops) 제한 UPDATE · DELETE/TRUNCATE 전면 금지 · 긴급 bypass(admin+replica).
// DRAFT SQL: migrations/hardening/0001_orchestration_immutability_roles.sql (일반 registry 아님·운영 미적용).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runHardening, findHardening, HARDENINGS, type HardeningClient } from "../../server/migrations/hardening/hardeningRunner";
import { fileSha256Normalized } from "../../server/migrations/checksum";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");
const SQL_0002 = readFileSync(path.join(root, "migrations", "0002_create_persistent_job_queue.sql"), "utf-8");
const SQL_0004 = readFileSync(path.join(root, "migrations", "0004_cross_agent_orchestration.sql"), "utf-8");
const SQL_HARDEN = readFileSync(path.join(root, "migrations", "hardening", "0001_orchestration_immutability_roles.sql"), "utf-8");
const H = "a".repeat(64);

async function setup() {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  await db.exec(SQL_0002);
  await db.exec(SQL_0004);
  await db.exec(SQL_HARDEN);
  // owner(부트스트랩)로 seed
  const j = (await db.query(`INSERT INTO jobs (owner_scope,job_type,input_identity,request_version_snapshot,execution_options_hash,payload_hash,idempotency_key) VALUES ('kop','x','{}','{}',$1,$1,'k1') RETURNING id`, [H])).rows[0].id;
  const e = (await db.query(`INSERT INTO job_executions (job_id,attempt_number) VALUES ($1,1) RETURNING id`, [j])).rows[0].id;
  const a = (await db.query(`INSERT INTO job_artifacts (producer_job_id,producer_execution_id,artifact_kind,schema_version,content_hash,manifest_hash,sensitivity_class,redaction_status) VALUES ($1,$2,'error-analysis',1,$3,$3,'internal','not-required') RETURNING id`, [j, e, H])).rows[0].id;
  await db.query(`INSERT INTO automated_reviews (reviewed_job_id,reviewed_execution_id,reviewer_kind,reviewer_version,decision,severity) VALUES ($1,$2,'gpt','v1','approve','info')`, [j, e]);
  await db.query(`INSERT INTO orchestration_audit_log (event_type,actor_kind) VALUES ('job-created','system')`);
  await db.query(`INSERT INTO human_approvals (job_id) VALUES ($1)`, [j]);
  await db.query(`INSERT INTO emergency_stops (scope_type,reason_code) VALUES ('global','ops')`);
  const j2 = (await db.query(`INSERT INTO jobs (owner_scope,job_type,input_identity,request_version_snapshot,execution_options_hash,payload_hash,idempotency_key) VALUES ('kop','x','{}','{}',$1,$1,'k2') RETURNING id`, [H])).rows[0].id;
  await db.query(`INSERT INTO job_dependencies (job_id,depends_on_job_id,dependency_type) VALUES ($1,$2,'requires-success')`, [j2, j]);
  return { db, j, j2, e, a };
}
// role 전환 실행. 실패 시 에러 메시지/코드 캡처. 항상 RESET ROLE 로 복귀.
async function asRole(db: any, role: string, sql: string): Promise<{ ok: boolean; msg: string; code?: string }> {
  try { await db.exec(`SET ROLE ${role}`); await db.query(sql); return { ok: true, msg: "" }; }
  catch (e: any) { return { ok: false, msg: String(e?.message ?? e), code: e?.code }; }
  finally { await db.exec(`RESET ROLE`).catch(() => {}); }
}
async function ownerTry(db: any, sql: string): Promise<{ ok: boolean; msg: string; code?: string }> {
  try { await db.query(sql); return { ok: true, msg: "" }; } catch (e: any) { return { ok: false, msg: String(e?.message ?? e), code: e?.code }; }
}

describe("orchestration DB hardening (role + trigger)", () => {
  test("role 존재 확인", async () => {
    const { db } = await setup();
    try {
      const roles = (await db.query(`SELECT rolname FROM pg_roles WHERE rolname LIKE 'orchestration_%' ORDER BY 1`)).rows.map((r: any) => r.rolname);
      assert.deepEqual(roles, ["orchestration_admin", "orchestration_reader", "orchestration_writer"]);
    } finally { await db.close(); }
  });

  test("reader: SELECT 성공 · INSERT/UPDATE/DELETE 실패(권한)", async () => {
    const { db } = await setup();
    try {
      assert.ok((await asRole(db, "orchestration_reader", `SELECT * FROM job_artifacts`)).ok, "reader SELECT ok");
      assert.ok(!(await asRole(db, "orchestration_reader", `INSERT INTO orchestration_audit_log (event_type,actor_kind) VALUES ('x','system')`)).ok, "reader INSERT 거부");
      assert.ok(!(await asRole(db, "orchestration_reader", `UPDATE human_approvals SET approval_status='approved'`)).ok, "reader UPDATE 거부");
      assert.ok(!(await asRole(db, "orchestration_reader", `DELETE FROM emergency_stops`)).ok, "reader DELETE 거부");
    } finally { await db.close(); }
  });

  test("writer: append-only INSERT 성공 · UPDATE/DELETE/TRUNCATE 실패", async () => {
    const { db } = await setup();
    try {
      assert.ok((await asRole(db, "orchestration_writer", `INSERT INTO orchestration_audit_log (event_type,actor_kind) VALUES ('e','system')`)).ok, "writer audit INSERT ok");
      assert.ok((await asRole(db, "orchestration_writer", `INSERT INTO job_artifacts (producer_job_id,producer_execution_id,artifact_kind,schema_version,content_hash,manifest_hash,sensitivity_class,redaction_status) SELECT producer_job_id,producer_execution_id,'code-test-result',1,'b'||repeat('c',63),manifest_hash,'internal','not-required' FROM job_artifacts LIMIT 1`)).ok, "writer artifact INSERT ok");
      // 권한 없음(UPDATE grant 없는 테이블) → 거부
      assert.ok(!(await asRole(db, "orchestration_writer", `UPDATE job_artifacts SET schema_version=2`)).ok, "writer job_artifacts UPDATE 거부");
      assert.ok(!(await asRole(db, "orchestration_writer", `DELETE FROM automated_reviews`)).ok, "writer DELETE 거부");
      assert.ok(!(await asRole(db, "orchestration_writer", `TRUNCATE orchestration_audit_log`)).ok, "writer TRUNCATE 거부");
    } finally { await db.close(); }
  });

  test("job_artifacts immutable=false insert 거부(0004 CHECK)", async () => {
    const { db, j, e } = await setup();
    try {
      const r = await ownerTry(db, `INSERT INTO job_artifacts (producer_job_id,producer_execution_id,artifact_kind,schema_version,content_hash,manifest_hash,sensitivity_class,redaction_status,immutable) VALUES ('${j}','${e}','error-analysis',1,'${"d".repeat(64)}','${H}','internal','not-required',false)`);
      assert.ok(!r.ok && /immutable_ck|check/i.test(r.msg));
    } finally { await db.close(); }
  });

  test("trigger 2차 방어: OWNER 도 job_artifacts UPDATE/DELETE 불가(OA001)", async () => {
    const { db } = await setup();
    try {
      const u = await ownerTry(db, `UPDATE job_artifacts SET schema_version=2`);
      const d = await ownerTry(db, `DELETE FROM job_artifacts`);
      assert.ok(!u.ok && /immutable|forbidden/i.test(u.msg), "owner UPDATE 거부");
      assert.ok(!d.ok && /immutable|forbidden/i.test(d.msg), "owner DELETE 거부");
      assert.equal(u.code, "OA001"); assert.equal(d.code, "OA001");
    } finally { await db.close(); }
  });

  test("append-only: OWNER 도 audit/reviews UPDATE/DELETE 불가(OA001)", async () => {
    const { db } = await setup();
    try {
      assert.equal((await ownerTry(db, `UPDATE orchestration_audit_log SET event_type='z'`)).code, "OA001");
      assert.equal((await ownerTry(db, `DELETE FROM orchestration_audit_log`)).code, "OA001");
      assert.equal((await ownerTry(db, `UPDATE automated_reviews SET decision='reject'`)).code, "OA001");
      assert.equal((await ownerTry(db, `DELETE FROM automated_reviews`)).code, "OA001");
    } finally { await db.close(); }
  });

  test("business-state: 상태 UPDATE 허용 · DELETE 거부 · 식별 변경 거부", async () => {
    const { db, j } = await setup();
    try {
      // writer 가 approval_status 전이 → 허용
      assert.ok((await asRole(db, "orchestration_writer", `UPDATE human_approvals SET approval_status='approved', updated_at=now()`)).ok, "writer approval 상태전이 ok");
      // writer emergency active 전이 → 허용
      assert.ok((await asRole(db, "orchestration_writer", `UPDATE emergency_stops SET active=false, released_at=now()`)).ok, "writer emergency release ok");
      // DELETE 는 owner 도 거부(OA002)
      assert.equal((await ownerTry(db, `DELETE FROM human_approvals`)).code, "OA002");
      assert.equal((await ownerTry(db, `DELETE FROM emergency_stops`)).code, "OA002");
      assert.equal((await ownerTry(db, `DELETE FROM job_dependencies`)).code, "OA002");
      // 식별/created_at 변경 거부(OA003)
      assert.equal((await ownerTry(db, `UPDATE human_approvals SET created_at=now()`)).code, "OA003");
      assert.equal((await ownerTry(db, `UPDATE emergency_stops SET id='x'`)).code, "OA003");
    } finally { await db.close(); }
  });

  test("TRUNCATE 전면 금지(거부)", async () => {
    // 주의: PGlite 는 TRUNCATE statement-trigger 미지원(0A000) → 여기선 '거부됨'만 검증.
    //   OA004 trigger SQLSTATE 는 실제 PG17 e2e(scratchpad)에서 확인.
    const { db } = await setup();
    try {
      for (const t of ["job_artifacts", "orchestration_audit_log", "automated_reviews", "human_approvals", "emergency_stops", "job_dependencies"]) {
        assert.ok(!(await ownerTry(db, `TRUNCATE ${t}`)).ok, `${t} TRUNCATE 거부`);
      }
    } finally { await db.close(); }
  });

  test("admin 긴급 절차: trigger 거부 → session_replication_role=replica 로만 우회", async () => {
    const { db } = await setup();
    try {
      // admin(ALL grant) 도 trigger 로 UPDATE 거부
      const blocked = await asRole(db, "orchestration_admin", `UPDATE job_artifacts SET schema_version=2`);
      assert.ok(!blocked.ok, "admin UPDATE trigger 로 거부");
      // 긴급: 트리거 비활성 후에만 정정 가능(문서화된 감사 절차 하)
      await db.exec(`SET session_replication_role=replica`);
      const bypass = await ownerTry(db, `UPDATE job_artifacts SET schema_version=2`);
      await db.exec(`SET session_replication_role=DEFAULT`);
      assert.ok(bypass.ok, "replica 모드에서 긴급 정정 가능");
    } finally { await db.close(); }
  });

  test("transaction rollback: 거부된 UPDATE 는 tx abort → 이후 ROLLBACK 필요", async () => {
    const { db } = await setup();
    try {
      await db.exec(`BEGIN`);
      let aborted = false;
      try { await db.query(`UPDATE job_artifacts SET schema_version=2`); } catch { aborted = true; }
      assert.ok(aborted, "UPDATE 거부");
      // aborted tx 에서 후속 쿼리는 실패
      let followFails = false;
      try { await db.query(`SELECT 1`); } catch { followFails = true; }
      await db.exec(`ROLLBACK`);
      assert.ok(followFails, "aborted tx 후속 쿼리 실패(원자성)");
      // ROLLBACK 후 정상
      assert.ok((await db.query(`SELECT count(*)::int n FROM job_artifacts`)).rows[0].n >= 1);
    } finally { await db.close(); }
  });

  test("append-only INSERT 는 monotonic seq(식별) 유지 · 체인 경쟁 없음", async () => {
    const { db } = await setup();
    try {
      for (let i = 0; i < 5; i++) await db.query(`INSERT INTO orchestration_audit_log (event_type,actor_kind) VALUES ('e${i}','system')`);
      const seqs = (await db.query(`SELECT seq FROM orchestration_audit_log ORDER BY seq`)).rows.map((r: any) => Number(r.seq));
      assert.equal(new Set(seqs).size, seqs.length, "seq 유일");
      for (let i = 1; i < seqs.length; i++) assert.ok(seqs[i] > seqs[i - 1], "seq 단조 증가");
    } finally { await db.close(); }
  });

  test("teardown = 인스턴스 폐기(테이블별 DELETE 불필요·불가)", async () => {
    const { db } = await setup();
    // DELETE cleanup 은 trigger 로 막혀 있으므로 사용하지 않음 — close() 로 전체 폐기.
    await db.close();
    assert.ok(true);
  });
});

describe("hardening 전용 러너(checksum allowlist)", () => {
  const DEF = findHardening("0001_orchestration_immutability_roles")!;
  const SHA = fileSha256Normalized(path.join(root, "migrations", "hardening", DEF.sqlFile));
  async function freshBase() {
    const { PGlite } = await import("@electric-sql/pglite");
    const db = new PGlite();
    await db.exec(SQL_0002); await db.exec(SQL_0004); // 6테이블만, hardening 미적용
    const client: HardeningClient = { query: (s, p) => db.query(s, p as any[]) as any, exec: (s) => db.exec(s).then(() => undefined) };
    return { db, client };
  }

  test("등록·checksum 일치", () => {
    assert.equal(HARDENINGS.length, 1);
    assert.equal(SHA, DEF.expectedSha256, "hardening SQL sha == registry");
  });

  test("sha 불일치 → 거부(적용 안 함)", async () => {
    const { db, client } = await freshBase();
    try {
      const r = await runHardening(client, DEF, { sqlText: SQL_HARDEN, actualSha256: "0".repeat(64), apply: true });
      assert.equal(r.outcome, "aborted-sha-mismatch");
      assert.equal((await db.query(`SELECT count(*)::int n FROM pg_roles WHERE rolname LIKE 'orchestration_%'`)).rows[0].n, 0, "role 미생성");
    } finally { await db.close(); }
  });

  test("dry-run → 검증 통과·미적용(ROLLBACK)", async () => {
    const { db, client } = await freshBase();
    try {
      const r = await runHardening(client, DEF, { sqlText: SQL_HARDEN, actualSha256: SHA, apply: false });
      assert.equal(r.outcome, "dry-run-verified");
      assert.equal((await db.query(`SELECT count(*)::int n FROM pg_roles WHERE rolname LIKE 'orchestration_%'`)).rows[0].n, 0, "dry-run 후 role 없음");
    } finally { await db.close(); }
  });

  test("apply → 적용 · 재실행 already-applied(재실행 0)", async () => {
    const { db, client } = await freshBase();
    try {
      const r1 = await runHardening(client, DEF, { sqlText: SQL_HARDEN, actualSha256: SHA, apply: true });
      assert.equal(r1.outcome, "applied");
      assert.equal(r1.committed, true);
      assert.equal((await db.query(`SELECT count(*)::int n FROM pg_roles WHERE rolname LIKE 'orchestration_%'`)).rows[0].n, 3, "role 3개");
      const r2 = await runHardening(client, DEF, { sqlText: SQL_HARDEN, actualSha256: SHA, apply: true });
      assert.equal(r2.outcome, "already-applied", "재실행 already-applied");
      assert.equal(r2.committed, false, "재실행 COMMIT 0");
    } finally { await db.close(); }
  });
});
