// 이름분석표 enqueue 배선 E2E — 실제 흐름을 임시 reports 폴더에서 검증.
//   REAL: enqueueDetectedReports(=createJob)·resolveNameReportInput(로컬 파일 해석·locator 계약)·processFile(매칭·원자적 첨부·dedup)·db(PGlite)·hashFile(sha256).
//   TEST DOUBLE(명시): render(로컬 Python)·upload(R2). 실제 DB 처리·매칭·중복 방지는 실제 함수 사용.
//   ⚠️ 격리 검증(운영 Neon/Railway 아님). 큐 job 은 비-PII(fileContentHash·locator)만.
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createJob } from "../../server/jobQueue/createJob";
import { processNextJob } from "../../server/jobQueue/worker";
import { requestCancel } from "../../server/jobQueue/cancel";
import { makeNameReportAdapter, NAME_REPORT_JOB_TYPE, type NameReportDeps } from "../../server/jobQueue/adapters/nameReport";
import {
  enqueueDetectedReports, resolveNameReportInput, buildNameReportJobInput,
  buildLocator, parseLocator, LOCATOR_PREFIX, nameReportQueueEnabled,
} from "../../server/knop/nameReportLocal";
import type { QueueClient } from "../../server/jobQueue/types";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIG_0001 = readFileSync(path.join(root, "migrations", "0001_add_report_matches.sql"), "utf-8");
const MIG_0002 = readFileSync(path.join(root, "migrations", "0002_create_persistent_job_queue.sql"), "utf-8");
const MIG_0005 = readFileSync(path.join(root, "migrations", "0005_job_cancel_request.sql"), "utf-8");
const T = new Date("2026-07-01T00:00:00Z");

// gatherCandidates 가 요구하는 최소 스키마.
const STUB = `
  CREATE TABLE customers (id varchar PRIMARY KEY, name text, created_at timestamptz, source_consultation_id varchar, deleted_at timestamptz);
  CREATE TABLE consultations (id varchar PRIMARY KEY, people_data text, num_people int, created_at timestamptz);
  CREATE TABLE crm_files (id varchar PRIMARY KEY DEFAULT gen_random_uuid(), customer_id varchar, file_name text, file_type text, file_url text, memo text, created_at timestamptz DEFAULT now());
`;

async function freshDb() {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  await db.exec(STUB); await db.exec(MIG_0001); await db.exec(MIG_0002); await db.exec(MIG_0005);
  // auto_matched 성립 조건: consultation 출처 + applicationDate=firstSeenAt(±3일) + 단일 후보.
  await db.query(`INSERT INTO consultations (id, people_data, num_people, created_at) VALUES ('cons-1','홍길동',1,$1)`, [T.toISOString()]);
  await db.query(`INSERT INTO customers (id, name, created_at, source_consultation_id) VALUES ('cust-1','홍길동',$1,'cons-1')`, [T.toISOString()]);
  const c: QueueClient = { query: (sql, params) => db.query(sql, params as any[]) as any };
  return { db, c };
}

// 임시 reports 폴더 + 파일. reportsDir() 은 env 를 매 호출 읽으므로 주입 가능.
function makeReportsDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kop-reports-"));
  process.env.KOP_REPORTS_DIR = dir;
  return dir;
}
function writeReport(dir: string, fileName: string, content: string): string {
  const abs = path.join(dir, fileName); fs.writeFileSync(abs, content); return abs;
}
const realHash = (abs: string) => crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex");

function makeDeps(c: QueueClient, opts: { renderFail?: boolean } = {}): NameReportDeps {
  return {
    db: c as any,
    render: async () => { if (opts.renderFail) throw new Error("render(Python) 실패(test double)"); return Buffer.from("PNG-double"); }, // TEST DOUBLE
    upload: async (key) => `/objects/${key}`,                                                                                       // TEST DOUBLE
    hashFile: realHash,                                                                                                             // REAL
    now: () => T, uuid: () => crypto.randomUUID(),
    resolveInput: (ref) => resolveNameReportInput({ db: c as any, hashFile: realHash }, ref),                                       // REAL(로컬 해석)
  };
}

const jobsCount = async (c: QueueClient) => Number((await c.query(`SELECT count(*)::int n FROM jobs`)).rows[0].n);
const jobStatus = async (c: QueueClient, id: string) => (await c.query(`SELECT status FROM jobs WHERE id=$1`, [id])).rows[0]?.status;
const crmCount = async (c: QueueClient) => Number((await c.query(`SELECT count(*)::int n FROM crm_files`)).rows[0].n);
const rmStatus = async (c: QueueClient, h: string) => (await c.query(`SELECT status FROM report_matches WHERE file_hash=$1`, [h])).rows[0]?.status;
const firstJobId = async (c: QueueClient) => (await c.query(`SELECT id FROM jobs LIMIT 1`)).rows[0]?.id;

afterEach(() => { delete process.env.KOP_REPORTS_DIR; delete process.env.FEATURE_NAME_REPORT_QUEUE; });

describe("이름분석표 enqueue 배선 E2E", () => {
  test("locator 계약: build/parse · traversal 거부", () => {
    const h = "a".repeat(64);
    assert.equal(buildLocator(h), LOCATOR_PREFIX + h);
    assert.equal(parseLocator(buildLocator(h)), h);
    assert.equal(parseLocator("reports-sha256:../../etc/passwd"), null, "traversal/비-sha256 거부");
    assert.equal(parseLocator("/abs/path/홍길동.pdf"), null, "절대경로 locator 거부");
  });

  test("flag false → 큐 비활성(기존 직접 처리 경로 유지)", () => {
    assert.equal(nameReportQueueEnabled(), false);
    process.env.FEATURE_NAME_REPORT_QUEUE = "true"; assert.equal(nameReportQueueEnabled(), true);
    process.env.FEATURE_NAME_REPORT_QUEUE = "false"; assert.equal(nameReportQueueEnabled(), false);
  });

  test("감지→job 1개 생성(직접 처리 아님)→claim→processFile→artifact→succeeded + 재감지 중복 없음", async () => {
    const { db, c } = await freshDb();
    const dir = makeReportsDir();
    try {
      const abs = writeReport(dir, "홍길동님 이름분석.pdf", "pdf-content-A");
      const hash = realHash(abs);
      const adapters = new Map([[NAME_REPORT_JOB_TYPE, makeNameReportAdapter(makeDeps(c))]]);

      // 1) 감지 → job 생성(비-PII 확인)
      const enq = await enqueueDetectedReports(c, { hashFile: realHash });
      assert.deepEqual(enq, { queued: 1, deduped: 0, failed: 0 });
      assert.equal(await jobsCount(c), 1);
      const ident = (await c.query(`SELECT input_identity FROM jobs LIMIT 1`)).rows[0].input_identity;
      const identStr = JSON.stringify(ident);
      assert.ok(!identStr.includes("홍길동") && !identStr.includes(".pdf"), "job identity 에 PII(이름/파일명) 없음");
      assert.equal(ident.locator, buildLocator(hash));

      // 2) 처리 → 실제 processFile → 첨부 → succeeded
      const jobId = await firstJobId(c);
      const r = await processNextJob(c, "w1", adapters, { heartbeat: true, heartbeatIntervalSec: 1 });
      assert.equal(r.outcome, "succeeded", `detail=${r.detail}`);
      assert.equal(await jobStatus(c, jobId), "succeeded");
      assert.equal(await rmStatus(c, hash), "auto_matched");
      assert.equal(await crmCount(c), 1);
      const ex = (await c.query(`SELECT artifact_snapshot FROM job_executions WHERE job_id=$1`, [jobId])).rows[0];
      assert.ok(ex.artifact_snapshot?.resultArtifactHash, "결과 아티팩트 해시");

      // 3) 같은 파일 재감지 → dedup(새 job 없음)
      const enq2 = await enqueueDetectedReports(c, { hashFile: realHash });
      assert.deepEqual(enq2, { queued: 0, deduped: 1, failed: 0 });
      assert.equal(await jobsCount(c), 1, "중복 job 없음");

      // 4) 재큐 후 재실행(크래시 시뮬)해도 첨부 중복 0
      await c.query(`UPDATE jobs SET status='queued', available_at=now(), completed_at=NULL WHERE id=$1`, [jobId]);
      const r2 = await processNextJob(c, "w2", adapters);
      assert.equal(r2.outcome, "succeeded", `detail=${r2.detail}`);
      assert.equal(await crmCount(c), 1, "재실행해도 crm_files 중복 0");
    } finally { await db.close(); }
  });

  test("파일 이동·삭제 → permanent failure(자동 재시도 없음)", async () => {
    const { db, c } = await freshDb();
    const dir = makeReportsDir();
    try {
      const abs = writeReport(dir, "홍길동님 이름분석.pdf", "pdf-content-B");
      const hash = realHash(abs);
      const adapters = new Map([[NAME_REPORT_JOB_TYPE, makeNameReportAdapter(makeDeps(c))]]);
      await createJob(c, buildNameReportJobInput(hash, "individual"));
      fs.unlinkSync(abs); // 파일 삭제(이동 시나리오와 동일: 해시 매칭 파일 없음)
      const jobId = await firstJobId(c);
      const r = await processNextJob(c, "w1", adapters);
      assert.equal(r.outcome, "failed", `detail=${r.detail}`);
      assert.equal(await jobStatus(c, jobId), "failed", "permanent → failed");
      assert.equal(await crmCount(c), 0);
    } finally { await db.close(); }
  });

  test("reports 루트 밖 파일 → 미처리(permanent) — path 봉쇄", async () => {
    const { db, c } = await freshDb();
    const dir = makeReportsDir();
    try {
      // 루트 밖에 파일 생성 후, 그 해시로 job 을 넣어도 루트 열거에서 못 찾음 → permanent.
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), "kop-outside-"));
      const outAbs = writeReport(outside, "홍길동님 이름분석.pdf", "pdf-outside");
      const outHash = realHash(outAbs);
      const adapters = new Map([[NAME_REPORT_JOB_TYPE, makeNameReportAdapter(makeDeps(c))]]);
      await createJob(c, buildNameReportJobInput(outHash, "individual"));
      const jobId = await firstJobId(c);
      const r = await processNextJob(c, "w1", adapters);
      assert.equal(r.outcome, "failed", `detail=${r.detail}`);
      assert.equal(await jobStatus(c, jobId), "failed", "루트 밖 파일 미처리");
      assert.equal(await crmCount(c), 0);
      fs.rmSync(outside, { recursive: true, force: true });
    } finally { await db.close(); }
  });

  test("실행 중 취소 → cancelled(부작용 전 중단)", async () => {
    const { db, c } = await freshDb();
    const dir = makeReportsDir();
    try {
      const abs = writeReport(dir, "홍길동님 이름분석.pdf", "pdf-content-C");
      const hash = realHash(abs);
      const adapters = new Map([[NAME_REPORT_JOB_TYPE, makeNameReportAdapter(makeDeps(c))]]);
      const { job } = await createJob(c, buildNameReportJobInput(hash, "individual"));
      await requestCancel(c, job.id, "admin#x");
      const r = await processNextJob(c, "w1", adapters, { heartbeat: true, heartbeatIntervalSec: 1 });
      assert.equal(r.outcome, "cancelled", `detail=${r.detail}`);
      assert.equal(await crmCount(c), 0);
    } finally { await db.close(); }
  });

  test("일시 실패(렌더 실패) → transient 재시도(재큐)", async () => {
    const { db, c } = await freshDb();
    const dir = makeReportsDir();
    try {
      const abs = writeReport(dir, "홍길동님 이름분석.pdf", "pdf-content-D");
      const hash = realHash(abs);
      const adapters = new Map([[NAME_REPORT_JOB_TYPE, makeNameReportAdapter(makeDeps(c, { renderFail: true }))]]);
      const { job } = await createJob(c, buildNameReportJobInput(hash, "individual"));
      const r = await processNextJob(c, "w1", adapters);
      assert.equal(r.outcome, "failed", `detail=${r.detail}`);
      assert.equal(await jobStatus(c, job.id), "queued", "attachment_failed → transient → 재큐");
    } finally { await db.close(); }
  });
});
