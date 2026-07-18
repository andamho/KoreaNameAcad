// 영속 작업 큐 migration 격리 검증 (PGlite = 기존 의존성, embedded 무단추가 없음). 운영 DB 미접촉.
// migrations/0002 를 fresh PGlite 에 적용 → 구조·불변식·Drizzle↔SQL parity 확인.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getTableColumns } from "drizzle-orm";
import { jobs, jobExecutions } from "../../shared/schema";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIG = readFileSync(path.join(here, "..", "..", "migrations", "0002_create_persistent_job_queue.sql"), "utf-8");

async function freshPg() {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  const q = (sql: string, params?: unknown[]) => db.query(sql, params as any[]);
  return { db, q };
}

describe("persistent job queue migration (PGlite 격리)", () => {
  test("sentinel 불변 + 신규 2테이블 생성 + 기존 무변경", async () => {
    const { db, q } = await freshPg();
    try {
      // sentinel(기존 테이블 모사): 데이터·인덱스·FK
      await db.exec(`CREATE TABLE sentinel_a (id varchar PRIMARY KEY DEFAULT gen_random_uuid(), name text);
        CREATE TABLE sentinel_b (id varchar PRIMARY KEY, a_id varchar, CONSTRAINT sb_fk FOREIGN KEY (a_id) REFERENCES sentinel_a(id) ON DELETE SET NULL);
        CREATE INDEX sa_name ON sentinel_a(name); INSERT INTO sentinel_a(name) VALUES ('x'),('y');`);
      const beforeT = (await q(`SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`)).rows[0].n as number;
      const beforeFk = (await q(`SELECT count(*)::int n FROM pg_constraint WHERE contype='f'`)).rows[0].n as number;
      const beforeSent = (await q(`SELECT count(*)::int n FROM sentinel_a`)).rows[0].n as number;

      await db.exec(MIG);

      const afterT = (await q(`SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`)).rows[0].n as number;
      const afterFk = (await q(`SELECT count(*)::int n FROM pg_constraint WHERE contype='f'`)).rows[0].n as number;
      const afterSent = (await q(`SELECT count(*)::int n FROM sentinel_a`)).rows[0].n as number;
      assert.equal(afterT, beforeT + 2, "BASE TABLE +2");
      assert.equal(afterFk, beforeFk + 2, "FK +2");
      assert.equal(afterSent, beforeSent, "sentinel 데이터 불변");
    } finally { await db.close(); }
  });

  test("구조: 컬럼수·FK RESTRICT·run_revision 부재·project_id 무FK·hash varchar(64)·timestamptz·jsonb", async () => {
    const { db, q } = await freshPg();
    try {
      await db.exec(MIG);
      const jc = (await q(`SELECT count(*)::int n FROM information_schema.columns WHERE table_name='jobs'`)).rows[0].n;
      const ec = (await q(`SELECT count(*)::int n FROM information_schema.columns WHERE table_name='job_executions'`)).rows[0].n;
      assert.equal(jc, 19, "jobs 19컬럼");
      assert.equal(ec, 21, "job_executions 21컬럼");
      assert.equal((await q(`SELECT count(*)::int n FROM information_schema.columns WHERE table_name='jobs' AND column_name='run_revision'`)).rows[0].n, 0, "run_revision 없음");
      const fks = (await q(`SELECT pg_get_constraintdef(oid) def FROM pg_constraint WHERE contype='f' AND conrelid IN ('jobs'::regclass,'job_executions'::regclass)`)).rows.map((r: any) => r.def);
      assert.equal(fks.length, 2, "FK 2개(parent·job_id)");
      assert.ok(fks.every((d: string) => /ON DELETE RESTRICT/.test(d)), "FK 전부 RESTRICT");
      assert.ok(!fks.some((d: string) => /project_id/i.test(d)), "project_id FK 없음");
      const idem = (await q(`SELECT data_type, character_maximum_length FROM information_schema.columns WHERE table_name='jobs' AND column_name='idempotency_key'`)).rows[0];
      assert.equal(idem.data_type, "character varying"); assert.equal(idem.character_maximum_length, 64);
      assert.equal((await q(`SELECT data_type FROM information_schema.columns WHERE table_name='jobs' AND column_name='available_at'`)).rows[0].data_type, "timestamp with time zone");
      assert.equal((await q(`SELECT data_type FROM information_schema.columns WHERE table_name='jobs' AND column_name='input_identity'`)).rows[0].data_type, "jsonb");
    } finally { await db.close(); }
  });

  test("인덱스: 전역 UNIQUE·job+attempt UNIQUE·active 부분유일·claim/reaper 부분 predicate", async () => {
    const { db, q } = await freshPg();
    try {
      await db.exec(MIG);
      const idx = Object.fromEntries((await q(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN ('jobs','job_executions')`)).rows.map((r: any) => [r.indexname, r.indexdef]));
      assert.ok(/UNIQUE INDEX/.test(idx.jobs_idempotency_key_key) && !/WHERE/.test(idx.jobs_idempotency_key_key), "전역 UNIQUE 인덱스");
      assert.ok(/UNIQUE INDEX/.test(idx.job_executions_job_attempt_key), "job+attempt UNIQUE");
      assert.ok(/UNIQUE INDEX/.test(idx.job_executions_active_uq) && /claimed.*running/.test(idx.job_executions_active_uq), "active 부분유일(claimed,running)");
      assert.ok(/priority.*available_at.*created_at.*id/.test(idx.jobs_claim_idx) && /queued/.test(idx.jobs_claim_idx), "claim_idx 부분+컬럼순서");
      assert.ok(/lease_expires_at/.test(idx.job_executions_reaper_idx) && /claimed.*running/.test(idx.job_executions_reaper_idx), "reaper_idx 부분");
    } finally { await db.close(); }
  });

  test("불변식 동작: 전역 idempotency 중복거부·active exec 중복차단·terminal 후 retry·attempt UNIQUE", async () => {
    const { db, q } = await freshPg();
    try {
      await db.exec(MIG);
      const ins = `INSERT INTO jobs(owner_scope,job_type,input_identity,request_version_snapshot,execution_options_hash,payload_hash,idempotency_key) VALUES ('o','call','{}','{}',repeat('a',64),repeat('b',64),$1)`;
      await q(ins, [ "c".repeat(64) ]);
      let dup = false; try { await q(ins, [ "c".repeat(64) ]); } catch { dup = true; }
      assert.ok(dup, "동일 idempotency_key 두번째 거부");
      const jid = (await q(`SELECT id FROM jobs LIMIT 1`)).rows[0].id;
      await q(`INSERT INTO job_executions(job_id,attempt_number,status) VALUES ($1,1,'claimed')`, [jid]);
      let dupExec = false; try { await q(`INSERT INTO job_executions(job_id,attempt_number,status) VALUES ($1,2,'running')`, [jid]); } catch { dupExec = true; }
      assert.ok(dupExec, "active execution 2개 차단");
      await q(`UPDATE job_executions SET status='failed' WHERE job_id=$1 AND attempt_number=1`, [jid]);
      await q(`INSERT INTO job_executions(job_id,attempt_number,status) VALUES ($1,2,'claimed')`, [jid]); // terminal 후 새 attempt 허용
      let dupAttempt = false; try { await q(`INSERT INTO job_executions(job_id,attempt_number,status) VALUES ($1,2,'succeeded')`, [jid]); } catch { dupAttempt = true; }
      assert.ok(dupAttempt, "UNIQUE(job_id,attempt_number)");
    } finally { await db.close(); }
  });

  test("fingerprint 고정: 적용 구조 == fixtures/jobQueueFingerprint.json", async () => {
    const { db, q } = await freshPg();
    try {
      await db.exec(MIG);
      const fp = JSON.parse(readFileSync(path.join(here, "fixtures", "jobQueueFingerprint.json"), "utf-8"));
      const cols = (await q(`SELECT table_name,column_name,data_type,character_maximum_length,is_nullable,column_default FROM information_schema.columns WHERE table_name IN ('jobs','job_executions') ORDER BY table_name,ordinal_position`)).rows;
      const cons = (await q(`SELECT rel.relname tbl,con.conname,con.contype,pg_get_constraintdef(con.oid) def FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid JOIN pg_namespace n ON n.oid=rel.relnamespace WHERE n.nspname='public' AND rel.relname IN ('jobs','job_executions') AND con.contype IN ('p','u','f','c') ORDER BY rel.relname,con.contype,con.conname`)).rows;
      const idx = (await q(`SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN ('jobs','job_executions') ORDER BY tablename,indexname`)).rows;
      assert.deepEqual(cols, fp.columns, "컬럼 fingerprint 불일치");
      assert.deepEqual(cons, fp.constraints, "제약 fingerprint 불일치");
      assert.deepEqual(idx, fp.indexes, "인덱스 fingerprint 불일치");
    } finally { await db.close(); }
  });

  test("Drizzle↔SQL 컬럼 parity: schema.ts 정의 == migration 적용 컬럼", async () => {
    const { db, q } = await freshPg();
    try {
      await db.exec(MIG);
      for (const [tbl, def] of [["jobs", jobs], ["job_executions", jobExecutions]] as const) {
        const drizzleCols = Object.values(getTableColumns(def)).map((c: any) => c.name).sort();
        const dbCols = (await q(`SELECT column_name FROM information_schema.columns WHERE table_name='${tbl}'`)).rows.map((r: any) => r.column_name).sort();
        assert.deepEqual(dbCols, drizzleCols, `${tbl} 컬럼 드리프트: Drizzle=${JSON.stringify(drizzleCols)} vs SQL=${JSON.stringify(dbCols)}`);
      }
    } finally { await db.close(); }
  });
});
