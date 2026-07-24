// 실제 업무 adapter(name-report-attach) E2E — 큐 경로에서 **실제 processFile()** 실행.
//   REAL: processFile 로직(content-hash dedup·terminal skip·후보매칭·원자적 첨부·report_matches/crm_files DB write) + db(PGlite) + hashFile(실 sha256).
//   TEST DOUBLE(명시): render(PDF→PNG, 로컬 Python) · upload(R2) · resolveInput(로컬 파일→이름/후보). 가짜 성공 아님 — 실제 분기·DB write 모두 실행.
import { test, describe } from "node:test";
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
import type { ProcessInput } from "../../server/knop/reportProcessor";
import type { QueueClient } from "../../server/jobQueue/types";
import type { RequestVersionSnapshot } from "../../shared/jobQueueContract";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIG_0002 = readFileSync(path.join(root, "migrations", "0002_create_persistent_job_queue.sql"), "utf-8");
const MIG_0005 = readFileSync(path.join(root, "migrations", "0005_job_cancel_request.sql"), "utf-8");
const MIG_0001 = readFileSync(path.join(root, "migrations", "0001_add_report_matches.sql"), "utf-8");

// 최소 기존 테이블(customers/consultations/crm_files) — report_matches FK + 첨부 대상.
const STUB = `
  CREATE TABLE IF NOT EXISTS customers (id varchar PRIMARY KEY DEFAULT gen_random_uuid(), name text);
  CREATE TABLE IF NOT EXISTS consultations (id varchar PRIMARY KEY DEFAULT gen_random_uuid());
  CREATE TABLE IF NOT EXISTS crm_files (id varchar PRIMARY KEY DEFAULT gen_random_uuid(), customer_id varchar, file_name text, file_type text, file_url text, memo text, created_at timestamptz DEFAULT now());
`;

async function freshQ() {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  await db.exec(STUB);       // customers/consultations/crm_files
  await db.exec(MIG_0001);   // report_matches (+ FK to customers/consultations)
  await db.exec(MIG_0002); await db.exec(MIG_0005); // 큐 테이블 + cancel 컬럼
  await db.query(`INSERT INTO customers (id, name) VALUES ('cust-1','홍길동')`);
  await db.query(`INSERT INTO consultations (id) VALUES ('cons-1')`);
  const c: QueueClient = { query: (sql, params) => db.query(sql, params as any[]) as any };
  return { db, c };
}

const snap: RequestVersionSnapshot = {
  schemaVersion: 1, pipelineVersion: "nr-p1", transcriptionEngineVersion: null, transcriptionEngineHash: null,
  dictionaryVersion: null, normalizationVersion: null, correctionEngineVersion: null, correctionEngineHash: null, executorRequirement: null,
};

// 실제 파일(hashFile 이 실 sha256 계산) — 내용은 합성 상수.
function makeTempPdf(content: string): { absPath: string; hash: string } {
  const abs = path.join(os.tmpdir(), `nr-${crypto.randomBytes(4).toString("hex")}.pdf`);
  fs.writeFileSync(abs, content);
  return { absPath: abs, hash: crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex") };
}

// TEST DOUBLE deps + resolveInput. render/upload 는 가짜지만 processFile 의 실제 분기·DB write 는 모두 실행된다.
function makeDeps(db: QueueClient, opts: { absPath: string; candidatesFailed?: boolean; auto?: boolean; renderFail?: boolean }): NameReportDeps {
  const T = new Date("2026-07-01T00:00:00Z");
  const autoCandidate = {
    customerId: "cust-1", customerName: "홍길동", consultationId: "cons-1",
    applicationDate: T, applicationDateSource: "consultation" as const,
    numPeople: 1, consultStatus: "완료", alreadyLinkedSameType: false,
  };
  return {
    db: db as any,
    render: async () => { if (opts.renderFail) throw new Error("render(Python) 실패(test double)"); return Buffer.from("PNG-double"); }, // TEST DOUBLE
    upload: async (key) => `/objects/${key}`,                                                                                       // TEST DOUBLE
    hashFile: (abs) => crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex"),                                      // REAL sha256
    now: () => T,
    uuid: () => crypto.randomUUID(),
    resolveInput: async (): Promise<ProcessInput> => ({                                                                            // TEST DOUBLE(로컬 파일 해석 대체)
      file: "홍길동님 이름분석.pdf", absPath: opts.absPath, extractedName: "홍길동", reportType: "individual", label: "홍길동",
      candidates: opts.candidatesFailed ? [] : [autoCandidate], candidatesFailed: opts.candidatesFailed,
    }),
  };
}

function jobInput(hash: string, over: any = {}) {
  return {
    ownerScope: "korea-name-acad", projectId: null, jobType: NAME_REPORT_JOB_TYPE,
    // 비-PII(해시·불투명 참조만). inputAssetHash 가 큐 idempotency 키에 반영된다(같은 콘텐츠 = 같은 job).
    inputIdentity: { inputAssetHash: hash, fileContentHash: hash, locator: `local:${hash}` },
    requestVersionSnapshot: snap, executionOptions: null, payloadHash: crypto.createHash("sha256").update("nr-payload").digest("hex"),
    ...over,
  };
}
const jobStatus = async (c: QueueClient, id: string) => (await c.query(`SELECT status FROM jobs WHERE id=$1`, [id])).rows[0]?.status;
const rmStatus = async (c: QueueClient, hash: string) => (await c.query(`SELECT status FROM report_matches WHERE file_hash=$1`, [hash])).rows[0]?.status;
const crmCount = async (c: QueueClient) => Number((await c.query(`SELECT count(*)::int n FROM crm_files`)).rows[0].n);

describe("실제 업무 adapter — name-report-attach (processFile 호출)", () => {
  test("queued→claimed→running→heartbeat→artifact→succeeded + report_matches auto_matched + crm_files 첨부", async () => {
    const { db, c } = await freshQ();
    try {
      const { absPath, hash } = makeTempPdf("pdf-content-A");
      const adapters = new Map([[NAME_REPORT_JOB_TYPE, makeNameReportAdapter(makeDeps(c, { absPath }))]]);
      const { job } = await createJob(c, jobInput(hash));
      assert.equal(job.status, "queued");
      const r = await processNextJob(c, "w1", adapters, { heartbeat: true, heartbeatIntervalSec: 1 });
      assert.equal(r.outcome, "succeeded", `detail=${r.detail}`);
      assert.equal(await jobStatus(c, job.id), "succeeded");
      assert.equal(await rmStatus(c, hash), "auto_matched", "실제 processFile 이 auto_matched 판정");
      assert.equal(await crmCount(c), 1, "crm_files 에 1건 첨부(원자적)");
      const ex = (await c.query(`SELECT artifact_snapshot FROM job_executions WHERE job_id=$1`, [job.id])).rows[0];
      assert.ok(ex.artifact_snapshot?.resultArtifactHash, "결과 아티팩트 해시");
      assert.ok(ex.artifact_snapshot?.projectSpecificArtifacts?.[0]?.metadata?.status === "auto_matched", "아티팩트에 업무 결과 status 기록");
    } finally { await db.close(); }
  });

  test("idempotency: 부작용 커밋 후 재큐→재실행 → 중복 첨부 없음(processFile 내용해시 terminal skip)", async () => {
    const { db, c } = await freshQ();
    try {
      // 실제 위험 시나리오: 워커가 첨부(부작용) 커밋 후 completeExecution 전에 크래시 → reaper 가 job 을 재큐 →
      //   다른 워커가 재claim·재실행. processFile 은 실제 파일 sha256(file_hash) 이 이미 auto_matched(terminal) 임을 보고
      //   재첨부하지 않는다 → crm_files 중복 0. (큐 레벨이 아니라 업무 함수 레벨의 멱등성 검증.)
      const { absPath, hash } = makeTempPdf("pdf-content-B");
      const adapters = new Map([[NAME_REPORT_JOB_TYPE, makeNameReportAdapter(makeDeps(c, { absPath }))]]);
      const { job } = await createJob(c, jobInput(hash));
      assert.equal((await processNextJob(c, "w1", adapters)).outcome, "succeeded");
      assert.equal(await crmCount(c), 1);
      assert.equal(await rmStatus(c, hash), "auto_matched");
      // 재큐 시뮬레이션(크래시 후 reaper 가 되돌린 상태): job 을 다시 queued 로. lease/attempt 는 job_executions 소관이며
      //   이전 execution 은 'succeeded' 로 남아 active 부분유일 인덱스와 충돌하지 않는다 → 새 attempt 로 재claim.
      await c.query(`UPDATE jobs SET status='queued', available_at=now(), completed_at=NULL, updated_at=now() WHERE id=$1`, [job.id]);
      const r2 = await processNextJob(c, "w2", adapters);
      assert.equal(r2.outcome, "succeeded", `detail=${r2.detail}`);
      assert.equal(await crmCount(c), 1, "재실행해도 crm_files 중복 첨부 0(content-hash idempotency)");
    } finally { await db.close(); }
  });

  test("실행 중 취소 요청 → cancelled(부작용 전 중단)", async () => {
    const { db, c } = await freshQ();
    try {
      const { absPath, hash } = makeTempPdf("pdf-content-C");
      const adapters = new Map([[NAME_REPORT_JOB_TYPE, makeNameReportAdapter(makeDeps(c, { absPath }))]]);
      const { job } = await createJob(c, jobInput(hash));
      await requestCancel(c, job.id, "admin#x");
      const r = await processNextJob(c, "w1", adapters, { heartbeat: true, heartbeatIntervalSec: 1 });
      assert.equal(r.outcome, "cancelled", `detail=${r.detail}`);
      assert.equal(await jobStatus(c, job.id), "cancelled");
      assert.equal(await crmCount(c), 0, "취소 → 첨부 0");
    } finally { await db.close(); }
  });

  test("일시 실패(렌더 실패=attachment_failed) → transient 재시도(job 재큐)", async () => {
    const { db, c } = await freshQ();
    try {
      const { absPath, hash } = makeTempPdf("pdf-content-D");
      const adapters = new Map([[NAME_REPORT_JOB_TYPE, makeNameReportAdapter(makeDeps(c, { absPath, renderFail: true }))]]);
      const { job } = await createJob(c, jobInput(hash));
      const r = await processNextJob(c, "w1", adapters);
      assert.equal(r.outcome, "failed", `detail=${r.detail}`);
      assert.equal(await jobStatus(c, job.id), "queued", "attachment_failed → transient → 재큐");
      assert.equal(await rmStatus(c, hash), "attachment_failed", "report_matches 에 실패 상태 기록");
    } finally { await db.close(); }
  });

  test("영구 실패(잘못된 fileContentHash) → permanent → failed 상태 기록", async () => {
    const { db, c } = await freshQ();
    try {
      const { absPath } = makeTempPdf("pdf-content-E");
      const adapters = new Map([[NAME_REPORT_JOB_TYPE, makeNameReportAdapter(makeDeps(c, { absPath }))]]);
      const { job } = await createJob(c, jobInput("not-a-hash"));
      const r = await processNextJob(c, "w1", adapters);
      assert.equal(r.outcome, "failed", `detail=${r.detail}`);
      assert.equal(await jobStatus(c, job.id), "failed", "permanent.invalid-input → failed");
    } finally { await db.close(); }
  });
});
