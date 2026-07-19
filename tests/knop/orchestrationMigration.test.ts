// 0004 cross-agent orchestration migration 검증 (PGlite = 기존 의존성, 운영 DB 미접촉).
// 계약: additive 6테이블, 내부 FK RESTRICT, CHECK/부분유일 무결성, DROP/DML 0, backfill 0.
// (실제 PG17 검증은 scratchpad e2e 로 별도 수행 — 여기서는 결정적 CI 커버리지.)
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runMigration, inspectMigration, scanSql, type RunnerClient } from "../../server/migrations/runner";
import { findMigration, MIGRATIONS } from "../../server/migrations/registry";
import { computeCatalogFingerprint, fingerprintMatches } from "../../server/migrations/catalogFingerprint";
import { fileSha256Normalized } from "../../server/migrations/checksum";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");
const readSql = (f: string) => readFileSync(path.join(root, "migrations", f), "utf-8");
const readFixture = (f: string) => JSON.parse(readFileSync(path.join(root, f), "utf-8"));

const DEF = {
  "0001": findMigration("0001_add_report_matches")!,
  "0002": findMigration("0002_create_persistent_job_queue")!,
  "0003": findMigration("0003_create_job_shadow_previews")!,
  "0004": findMigration("0004_cross_agent_orchestration")!,
};
const SQL = Object.fromEntries(Object.entries(DEF).map(([k, d]) => [k, readSql(d.sqlFile)])) as Record<string, string>;
const FP_0004 = readFixture(DEF["0004"].fingerprintFixture!);
const SIX = DEF["0004"].expectedNewTables;

async function freshPg() {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  const client: RunnerClient = {
    query: (sql, params) => db.query(sql, params as any[]) as any,
    exec: (sql) => db.exec(sql).then(() => undefined),
  };
  return { db, client };
}
const listTables = async (db: any): Promise<string[]> =>
  (await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`)).rows.map((r: any) => r.tablename);

// 0001 FK 대상.
async function seed0001(db: any) {
  await db.exec(`CREATE TABLE customers (id varchar PRIMARY KEY); CREATE TABLE consultations (id varchar PRIMARY KEY);`);
}
// 0002 만 적용(jobs/job_executions) — orchestration constraint 테스트의 최소 선행.
async function baseQueue(db: any) {
  await db.exec(SQL["0002"]);
}
// 유효 job 1개 삽입 → id.
async function insJob(db: any): Promise<string> {
  const r = await db.query(
    `INSERT INTO jobs (owner_scope, job_type, input_identity, request_version_snapshot, execution_options_hash, payload_hash, idempotency_key)
     VALUES ('kop','internal-report','{}'::jsonb,'{}'::jsonb,$1,$1,$2) RETURNING id`,
    ["a".repeat(64), Math.random().toString(36).slice(2) + Date.now()],
  );
  return r.rows[0].id;
}
// 유효 execution 1개 삽입 → id.
async function insExec(db: any, jobId: string, attempt = 1): Promise<string> {
  const r = await db.query(`INSERT INTO job_executions (job_id, attempt_number) VALUES ($1,$2) RETURNING id`, [jobId, attempt]);
  return r.rows[0].id;
}
const H = "a".repeat(64); // 유효 sha256 hex
// 유효 artifact 1개 삽입 → id.
async function insArtifact(db: any, jobId: string, execId: string, over: Record<string, string> = {}): Promise<string> {
  const kind = over.kind ?? "error-analysis";
  const content = over.content ?? H;
  const sens = over.sens ?? "internal";
  const r = await db.query(
    `INSERT INTO job_artifacts (producer_job_id, producer_execution_id, artifact_kind, schema_version, content_hash, manifest_hash, sensitivity_class, redaction_status)
     VALUES ($1,$2,$3,1,$4,$5,$6,'not-required') RETURNING id`,
    [jobId, execId, kind, content, H, sens],
  );
  return r.rows[0].id;
}
async function rejects(fn: () => Promise<unknown>, needle?: RegExp): Promise<void> {
  try { await fn(); assert.fail("거부되어야 하는데 통과함"); }
  catch (e: any) { if (needle) assert.match(String(e?.message ?? e), needle); }
}

describe("0004 cross-agent orchestration migration", () => {
  // 1
  test("빈 DB에 0001→0004 순차 적용 → 6 테이블 생성", async () => {
    const { db, client } = await freshPg();
    try {
      await seed0001(db);
      for (const k of ["0001", "0002", "0003", "0004"] as const) {
        const r = await runMigration(client, DEF[k], { sqlText: SQL[k], fixture: readFixture(DEF[k].fingerprintFixture!), apply: true });
        assert.equal(r.outcome, "applied", `${k} applied`);
      }
      const tables = await listTables(db);
      for (const t of SIX) assert.ok(tables.includes(t), `${t} 존재`);
    } finally { await db.close(); }
  });

  // 2
  test("0001→0003 적용 DB에 0004 적용", async () => {
    const { db, client } = await freshPg();
    try {
      await seed0001(db);
      await db.exec(SQL["0001"]); await db.exec(SQL["0002"]); await db.exec(SQL["0003"]);
      const r = await runMigration(client, DEF["0004"], { sqlText: SQL["0004"], fixture: FP_0004, apply: true });
      assert.equal(r.outcome, "applied");
      assert.deepEqual(r.createdTables.sort(), [...SIX].sort());
    } finally { await db.close(); }
  });

  // 3
  test("0004 dry-run → 검증 통과·미적용(ROLLBACK)", async () => {
    const { db, client } = await freshPg();
    try {
      await baseQueue(db);
      const r = await runMigration(client, DEF["0004"], { sqlText: SQL["0004"], fixture: FP_0004, apply: false });
      assert.equal(r.outcome, "dry-run-verified");
      const tables = await listTables(db);
      for (const t of SIX) assert.ok(!tables.includes(t), `${t} dry-run 후 없어야`);
    } finally { await db.close(); }
  });

  // 4
  test("0004 실제 commit → 6 테이블 존속", async () => {
    const { db, client } = await freshPg();
    try {
      await baseQueue(db);
      const r = await runMigration(client, DEF["0004"], { sqlText: SQL["0004"], fixture: FP_0004, apply: true });
      assert.equal(r.outcome, "applied");
      const tables = await listTables(db);
      for (const t of SIX) assert.ok(tables.includes(t), `${t} 존속`);
    } finally { await db.close(); }
  });

  // 5
  test("재실행 → already-applied(구조 fingerprint 일치)", async () => {
    const { db, client } = await freshPg();
    try {
      await baseQueue(db);
      await db.exec(SQL["0004"]);
      const r = await runMigration(client, DEF["0004"], { sqlText: SQL["0004"], fixture: FP_0004, apply: true });
      assert.equal(r.outcome, "already-applied");
      const insp = await inspectMigration(client, DEF["0004"], { sqlText: SQL["0004"], fixture: FP_0004 });
      assert.equal(insp.state, "already-applied");
    } finally { await db.close(); }
  });

  // 5b: fingerprint fixture 실측 일치
  test("적용 후 구조가 fixture 와 정확 일치", async () => {
    const { db, client } = await freshPg();
    try {
      await baseQueue(db); await db.exec(SQL["0004"]);
      const fp = await computeCatalogFingerprint(client, SIX);
      assert.ok(fingerprintMatches(fp, FP_0004), "fingerprint 일치");
      assert.equal(fp.columnCount, 77, "총 컬럼 77");
      assert.equal(fp.constraints.filter((c: any) => c.contype === "f").length, 12, "FK 12");
      assert.equal(fp.constraints.filter((c: any) => c.contype === "c").length, 21, "CHECK 21");
      assert.equal(fp.constraints.filter((c: any) => c.contype === "p").length, 6, "PK 6");
      assert.equal(fp.indexes.length, 18, "인덱스 18");
    } finally { await db.close(); }
  });

  // 6
  test("jobs/job_executions 0행에서 FK 생성 성공 + FK 실제 강제", async () => {
    const { db } = await freshPg();
    try {
      await baseQueue(db);           // jobs/exec 0행
      await db.exec(SQL["0004"]);    // 0행 상태에서 FK 포함 테이블 생성 성공
      const j = await insJob(db), e = await insExec(db, j);
      const aid = await insArtifact(db, j, e); // 실존 job/exec 참조 → 성공
      assert.ok(aid);
      // 존재하지 않는 producer_job_id → FK 위반 거부
      await rejects(() => db.query(
        `INSERT INTO job_artifacts (producer_job_id, producer_execution_id, artifact_kind, schema_version, content_hash, manifest_hash, sensitivity_class, redaction_status)
         VALUES ('no-such-job',$1,'error-analysis',1,$2,$2,'internal','not-required')`, [e, H]), /foreign key|violates/i);
    } finally { await db.close(); }
  });

  // 7
  test("self dependency 거부 (job_id = depends_on_job_id)", async () => {
    const { db } = await freshPg();
    try {
      await baseQueue(db); await db.exec(SQL["0004"]);
      const j = await insJob(db);
      await rejects(() => db.query(
        `INSERT INTO job_dependencies (job_id, depends_on_job_id, dependency_type) VALUES ($1,$1,'requires-success')`, [j]),
        /job_dependencies_no_self|check/i);
    } finally { await db.close(); }
  });

  // 8
  test("duplicate dependency 거부 (job,predecessor,type 유일)", async () => {
    const { db } = await freshPg();
    try {
      await baseQueue(db); await db.exec(SQL["0004"]);
      const a = await insJob(db), b = await insJob(db);
      await db.query(`INSERT INTO job_dependencies (job_id, depends_on_job_id, dependency_type) VALUES ($1,$2,'requires-success')`, [a, b]);
      await rejects(() => db.query(
        `INSERT INTO job_dependencies (job_id, depends_on_job_id, dependency_type) VALUES ($1,$2,'requires-success')`, [a, b]),
        /duplicate|unique|job_dependencies_edge_uq/i);
      // 다른 type 은 허용
      await db.query(`INSERT INTO job_dependencies (job_id, depends_on_job_id, dependency_type) VALUES ($1,$2,'supersedes')`, [a, b]);
    } finally { await db.close(); }
  });

  // 9
  test("invalid dependency type/status 거부", async () => {
    const { db } = await freshPg();
    try {
      await baseQueue(db); await db.exec(SQL["0004"]);
      const a = await insJob(db), b = await insJob(db);
      await rejects(() => db.query(`INSERT INTO job_dependencies (job_id, depends_on_job_id, dependency_type) VALUES ($1,$2,'bogus-type')`, [a, b]), /check|type_ck/i);
      await rejects(() => db.query(`INSERT INTO job_dependencies (job_id, depends_on_job_id, dependency_type, resolution_status) VALUES ($1,$2,'requires-success','bogus')`, [a, b]), /check|status_ck/i);
    } finally { await db.close(); }
  });

  // 10
  test("invalid artifact sensitivity 거부", async () => {
    const { db } = await freshPg();
    try {
      await baseQueue(db); await db.exec(SQL["0004"]);
      const j = await insJob(db), e = await insExec(db, j);
      await rejects(() => insArtifact(db, j, e, { sens: "top-secret" }), /check|sensitivity_ck/i);
    } finally { await db.close(); }
  });

  // 11
  test("immutable=false 거부 (CHECK immutable=true)", async () => {
    const { db } = await freshPg();
    try {
      await baseQueue(db); await db.exec(SQL["0004"]);
      const j = await insJob(db), e = await insExec(db, j);
      await rejects(() => db.query(
        `INSERT INTO job_artifacts (producer_job_id, producer_execution_id, artifact_kind, schema_version, content_hash, manifest_hash, sensitivity_class, redaction_status, immutable)
         VALUES ($1,$2,'error-analysis',1,$3,$3,'internal','not-required',false)`, [j, e, H]),
        /check|immutable_ck/i);
    } finally { await db.close(); }
  });

  // 11b: customer-sensitive 는 protected_content_ref 필수 / secret 은 content_location 금지
  test("민감도 계약 CHECK (customer-sensitive→ref 필수, secret→plaintext 금지)", async () => {
    const { db } = await freshPg();
    try {
      await baseQueue(db); await db.exec(SQL["0004"]);
      const j = await insJob(db), e = await insExec(db, j);
      await rejects(() => insArtifact(db, j, e, { sens: "customer-sensitive" }), /customer_needs_ref|check/i);
      await rejects(() => db.query(
        `INSERT INTO job_artifacts (producer_job_id, producer_execution_id, artifact_kind, schema_version, content_hash, manifest_hash, content_location, sensitivity_class, redaction_status)
         VALUES ($1,$2,'error-analysis',1,$3,$3,'/x','secret','not-required')`, [j, e, H]),
        /no_secret_plain|check/i);
    } finally { await db.close(); }
  });

  // 12
  test("duplicate artifact 거부 (execution,kind,content 유일)", async () => {
    const { db } = await freshPg();
    try {
      await baseQueue(db); await db.exec(SQL["0004"]);
      const j = await insJob(db), e = await insExec(db, j);
      await insArtifact(db, j, e, { kind: "error-analysis", content: H });
      await rejects(() => insArtifact(db, j, e, { kind: "error-analysis", content: H }), /duplicate|unique|dedup_uq/i);
      // 같은 execution·kind 라도 content 가 다르면 허용(합법적 복수)
      await insArtifact(db, j, e, { kind: "error-analysis", content: "b".repeat(64) });
    } finally { await db.close(); }
  });

  // 13
  test("invalid review decision 거부", async () => {
    const { db } = await freshPg();
    try {
      await baseQueue(db); await db.exec(SQL["0004"]);
      const j = await insJob(db), e = await insExec(db, j);
      await rejects(() => db.query(
        `INSERT INTO automated_reviews (reviewed_job_id, reviewed_execution_id, reviewer_kind, reviewer_version, decision, severity)
         VALUES ($1,$2,'gpt','v1','maybe','info')`, [j, e]), /decision_ck|check/i);
      // 유효 review 는 성공
      await db.query(`INSERT INTO automated_reviews (reviewed_job_id, reviewed_execution_id, reviewer_kind, reviewer_version, decision, severity)
         VALUES ($1,$2,'gpt','v1','approve','info')`, [j, e]);
      // 같은 execution+reviewer 중복 거부
      await rejects(() => db.query(`INSERT INTO automated_reviews (reviewed_job_id, reviewed_execution_id, reviewer_kind, reviewer_version, decision, severity)
         VALUES ($1,$2,'gpt','v1','revise','low')`, [j, e]), /reviewer_uq|duplicate|unique/i);
    } finally { await db.close(); }
  });

  // 14
  test("활성 approval 중복 거부 (partial unique)", async () => {
    const { db } = await freshPg();
    try {
      await baseQueue(db); await db.exec(SQL["0004"]);
      const j = await insJob(db);
      await db.query(`INSERT INTO human_approvals (job_id) VALUES ($1)`, [j]); // awaiting-approval
      await rejects(() => db.query(`INSERT INTO human_approvals (job_id) VALUES ($1)`, [j]), /active_uq|duplicate|unique/i);
      // 기존 것을 approved 로 바꾸면 새 awaiting 삽입 가능
      await db.query(`UPDATE human_approvals SET approval_status='approved' WHERE job_id=$1`, [j]);
      await db.query(`INSERT INTO human_approvals (job_id) VALUES ($1)`, [j]);
    } finally { await db.close(); }
  });

  // 15
  test("invalid emergency scope 거부", async () => {
    const { db } = await freshPg();
    try {
      await baseQueue(db); await db.exec(SQL["0004"]);
      await rejects(() => db.query(`INSERT INTO emergency_stops (scope_type, reason_code) VALUES ('galaxy','x')`), /scope_ck|check/i);
    } finally { await db.close(); }
  });

  // 16
  test("동일 활성 stop 중복 거부 + 해제 후 재활성 허용", async () => {
    const { db } = await freshPg();
    try {
      await baseQueue(db); await db.exec(SQL["0004"]);
      await db.query(`INSERT INTO emergency_stops (scope_type, reason_code) VALUES ('global','ops')`);
      await rejects(() => db.query(`INSERT INTO emergency_stops (scope_type, reason_code) VALUES ('global','ops2')`), /active_scope_uq|duplicate|unique/i);
      // 해제(active=false) 후 새 활성 global 허용
      await db.query(`UPDATE emergency_stops SET active=false, released_at=now() WHERE scope_type='global'`);
      await db.query(`INSERT INTO emergency_stops (scope_type, reason_code) VALUES ('global','ops3')`);
      // 다른 scope_key 는 동시 활성 허용
      await db.query(`INSERT INTO emergency_stops (scope_type, scope_key, reason_code) VALUES ('adapter','gpt','x')`);
      await db.query(`INSERT INTO emergency_stops (scope_type, scope_key, reason_code) VALUES ('adapter','claude','x')`);
    } finally { await db.close(); }
  });

  // 17
  test("destructive statement 0 (정적 스캔 통과·DROP/TRUNCATE/권한 없음)", () => {
    const scan = scanSql(SQL["0004"], SIX);
    assert.deepEqual(scan, { safe: true });
    // 실행 SQL(주석 제거) 에 파괴적 구문 없음. (헤더 주석은 계약 설명상 DROP/ALTER 단어를 포함하므로 제외)
    const body = SQL["0004"].replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
    assert.ok(!/\bDROP\b|\bTRUNCATE\b|\bGRANT\b|\bREVOKE\b|\bALTER\s+TYPE\b/i.test(body), "파괴적 구문 없음");
    // CREATE TABLE 대상은 정확히 6개 신규 테이블뿐
    const created = [...body.matchAll(/CREATE\s+TABLE\s+"([a-z_]+)"/gi)].map((m) => m[1]).sort();
    assert.deepEqual(created, [...SIX].sort());
  });

  // 18
  test("backfill/data mutation 0 (INSERT/UPDATE/DELETE 없음)", () => {
    // 주석 제거 후 DML 스캔.
    const body = SQL["0004"].replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
    assert.ok(!/\bINSERT\s+INTO\b/i.test(body), "INSERT 없음");
    assert.ok(!/\bUPDATE\s+"?[a-z]/i.test(body), "UPDATE 없음");
    assert.ok(!/\bDELETE\s+FROM\b/i.test(body), "DELETE 없음");
    assert.ok(!/\bCOPY\b/i.test(body), "COPY 없음");
  });

  // 레지스트리 무결성: 등록 순서·체크섬.
  test("registry: 0004 등록·순서·체크섬 일치", () => {
    assert.equal(MIGRATIONS.length, 4, "MIGRATIONS 4");
    assert.equal(MIGRATIONS[3].id, "0004_cross_agent_orchestration", "마지막이 0004");
    assert.equal(fileSha256Normalized(path.join(root, "migrations", DEF["0004"].sqlFile)), DEF["0004"].expectedSqlSha256, "SQL sha256 일치");
    assert.equal(fileSha256Normalized(path.join(root, DEF["0004"].fingerprintFixture!)), DEF["0004"].expectedFixtureSha256, "fixture sha256 일치");
  });
});
