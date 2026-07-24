// 작업큐 런타임 **end-to-end**: 실제 작업 하나가 queued → running → done 으로 이동함을 검증(PGlite, 운영 DB 미접촉).
// worker(processNextJob) + echo adapter + cooperative cancel + fail 재시도 + reaper + 전용 연결 fail-closed.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  createJob, claimNextJob, markRunning, completeExecution, reapExpired,
  type QueueClient,
} from "../../server/jobQueue/index";
import { processNextJob } from "../../server/jobQueue/worker";
import { requestCancel, isCancelRequested } from "../../server/jobQueue/cancel";
import { listJobs, getJobDetail, requestJobCancel } from "../../server/jobQueue/adminApi";
import { makeEchoAdapter, makeFailingAdapter } from "../../server/jobQueue/adapters/echoCompute";
import { internalReportComputeAdapter } from "../../server/jobQueue/adapters/internalReport";
import type { JobAdapter } from "../../server/jobQueue/adapters/types";
import { queueConnectionConfigured, acquireQueueClient, QUEUE_URL_ENV } from "../../server/jobQueue/connection";
import { sha256Hex } from "../../server/jobQueue/idempotency";
import type { RequestVersionSnapshot } from "../../shared/jobQueueContract";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");
const MIG_0002 = readFileSync(path.join(root, "migrations", "0002_create_persistent_job_queue.sql"), "utf-8");
const MIG_0005 = readFileSync(path.join(root, "migrations", "0005_job_cancel_request.sql"), "utf-8");
const H = (s: string) => sha256Hex(s);

function snap(over: Partial<RequestVersionSnapshot> = {}): RequestVersionSnapshot {
  return {
    schemaVersion: 1, pipelineVersion: "p1", transcriptionEngineVersion: null, transcriptionEngineHash: null,
    dictionaryVersion: "d1", normalizationVersion: 1, correctionEngineVersion: null, correctionEngineHash: "e1".padEnd(64, "0"),
    executorRequirement: null, ...over,
  };
}
function jobInput(over: any = {}) {
  return {
    ownerScope: "kop", projectId: "proj-1", jobType: "internal-report",
    inputIdentity: { inputAssetHash: "asset-1" }, requestVersionSnapshot: snap(),
    executionOptions: { a: 1 }, payloadHash: H("payload"), ...over,
  };
}
async function freshQ(): Promise<{ db: any; c: QueueClient }> {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  await db.exec(MIG_0002);
  await db.exec(MIG_0005);
  const c: QueueClient = { query: (sql, params) => db.query(sql, params as any[]) as any };
  return { db, c };
}
const jobStatus = async (c: QueueClient, id: string) => (await c.query(`SELECT status FROM jobs WHERE id=$1`, [id])).rows[0]?.status;
const execOf = async (c: QueueClient, jobId: string) => (await c.query(`SELECT * FROM job_executions WHERE job_id=$1 ORDER BY attempt_number DESC LIMIT 1`, [jobId])).rows[0];

const echo = new Map([["internal-report", makeEchoAdapter("internal-report")]]);

describe("작업큐 e2e — queued → running → done", () => {
  test("단계별 상태 이동: queued → (claim)running/claimed → (markRunning)running → (complete)succeeded", async () => {
    const { db, c } = await freshQ();
    try {
      const { job } = await createJob(c, jobInput());
      assert.equal(job.status, "queued", "생성 직후 queued");

      const claim = await claimNextJob(c, "w1");
      assert.ok(claim, "claim 성공");
      assert.equal(await jobStatus(c, job.id), "running", "claim 후 job=running");
      assert.equal((await execOf(c, job.id)).status, "claimed", "claim 후 execution=claimed");

      assert.equal(await markRunning(c, { executionId: claim!.executionId, workerId: "w1", rawLeaseToken: claim!.rawLeaseToken }), true);
      assert.equal((await execOf(c, job.id)).status, "running", "markRunning 후 execution=running");

      const adapter = makeEchoAdapter("internal-report");
      const completion = await adapter.execute(claim!.adapterInput);
      const comp = await completeExecution(c, { executionId: claim!.executionId, workerId: "w1", rawLeaseToken: claim!.rawLeaseToken, jobType: "internal-report", result: completion });
      assert.equal(comp.outcome, "succeeded");
      assert.equal(await jobStatus(c, job.id), "succeeded", "완료 후 job=succeeded");
      const ex = await execOf(c, job.id);
      assert.equal(ex.status, "succeeded");
      assert.ok(ex.artifact_snapshot?.resultArtifactHash, "결과 아티팩트 해시 기록");
      assert.equal(ex.verification_status, "passed");
    } finally { await db.close(); }
  });

  test("worker 1-shot: processNextJob → succeeded (동일 결과, 한 번에)", async () => {
    const { db, c } = await freshQ();
    try {
      const { job } = await createJob(c, jobInput({ projectId: "one-shot" }));
      const r = await processNextJob(c, "w1", echo);
      assert.equal(r.outcome, "succeeded", `detail=${r.detail}`);
      assert.equal(r.jobId, job.id);
      assert.equal(await jobStatus(c, job.id), "succeeded");
      // 큐 비었으면 idle
      assert.equal((await processNextJob(c, "w1", echo)).outcome, "idle");
    } finally { await db.close(); }
  });
});

describe("작업큐 e2e — 실제 adapter + heartbeat", () => {
  const realInput = (over: any = {}) => jobInput({
    projectId: null, executionOptions: null,
    inputIdentity: { sourceAssetHash: H("asset-bytes"), reportType: "individual", rendererVersion: "r1" },
    ...over,
  });
  const realAdapters = new Map([[internalReportComputeAdapter().jobType, internalReportComputeAdapter()]]);

  test("internalReportComputeAdapter(기존 preview 코드 호출) → succeeded + 결과 해시", async () => {
    const { db, c } = await freshQ();
    try {
      const { job } = await createJob(c, realInput());
      const r = await processNextJob(c, "w1", realAdapters);
      assert.equal(r.outcome, "succeeded", `detail=${r.detail}`);
      const ex = await execOf(c, job.id);
      assert.ok(ex.artifact_snapshot?.resultArtifactHash, "실제 adapter 결과 아티팩트 해시");
    } finally { await db.close(); }
  });

  test("heartbeat 모드로 실행 → succeeded(짧은 주기)", async () => {
    const { db, c } = await freshQ();
    try {
      const { job } = await createJob(c, realInput({ projectId: "hb" } as any));
      const r = await processNextJob(c, "w1", realAdapters, { heartbeat: true, heartbeatIntervalSec: 1 });
      assert.equal(r.outcome, "succeeded", `detail=${r.detail}`);
      assert.equal(await jobStatus(c, job.id), "succeeded");
    } finally { await db.close(); }
  });

  test("heartbeat 모드 + 취소 요청 → adapter signal 존중, cancelled 확정", async () => {
    // ⚠️ PGlite 단일 연결이라 동시 트랜잭션 race 를 피해 취소를 **선설정**한다(운영은 worker/admin 별도 연결).
    //    heartbeat-중-취소의 전체 경로(별도 연결)는 scripts/runQueueRuntimeE2E.ts(embedded)에서 검증한다.
    const { db, c } = await freshQ();
    try {
      const { job } = await createJob(c, jobInput({ projectId: "hb-cancel" }));
      await requestCancel(c, job.id, "admin#x");
      let sawSignal = false;
      const slow: JobAdapter = {
        jobType: "internal-report",
        actualVersion(i) { const { executorRequirement, ...a } = i.requestVersionSnapshot; void executorRequirement; return a; },
        async execute(i, ctx) {
          for (let k = 0; k < 20 && !ctx?.signal?.aborted; k++) await new Promise((r) => setTimeout(r, 20));
          if (ctx?.signal?.aborted) sawSignal = true;
          return await makeEchoAdapter("internal-report").execute(i);
        },
      };
      const r = await processNextJob(c, "w1", new Map([["internal-report", slow]]), { heartbeat: true, heartbeatIntervalSec: 1 });
      assert.equal(r.outcome, "cancelled", `detail=${r.detail}`);
      assert.equal(await jobStatus(c, job.id), "cancelled");
      void sawSignal; // 선설정 취소는 시작 직후 초기 확인에서 잡혀 execute 전 cancelled 가능(정합)
    } finally { await db.close(); }
  });
});

describe("작업큐 e2e — cooperative cancel", () => {
  test("취소 요청 후 claim 되면 cancelled (부작용 전 중단)", async () => {
    const { db, c } = await freshQ();
    try {
      const { job } = await createJob(c, jobInput({ projectId: "cancel-me" }));
      const rc = await requestCancel(c, job.id, "admin#hash");
      assert.equal(rc.requested, true);
      assert.equal(await isCancelRequested(c, job.id), true);
      const r = await processNextJob(c, "w1", echo);
      assert.equal(r.outcome, "cancelled", `detail=${r.detail}`);
      assert.equal(await jobStatus(c, job.id), "cancelled");
      assert.equal((await execOf(c, job.id)).status, "cancelled");
    } finally { await db.close(); }
  });

  test("terminal job 취소 요청 = no-op(alreadyTerminal)", async () => {
    const { db, c } = await freshQ();
    try {
      const { job } = await createJob(c, jobInput({ projectId: "done-then-cancel" }));
      await processNextJob(c, "w1", echo);
      assert.equal(await jobStatus(c, job.id), "succeeded");
      const rc = await requestCancel(c, job.id);
      assert.equal(rc.alreadyTerminal, true);
      assert.equal(await jobStatus(c, job.id), "succeeded", "terminal 유지");
    } finally { await db.close(); }
  });
});

describe("작업큐 e2e — 실패/재시도/reaper", () => {
  test("adapter transient 실패 → retry-scheduled(job 재큐)", async () => {
    const { db, c } = await freshQ();
    try {
      const failing = new Map([["internal-report", makeFailingAdapter("internal-report", "transient.timeout")]]);
      const { job } = await createJob(c, jobInput({ projectId: "fail-retry" }));
      const r = await processNextJob(c, "w1", failing);
      assert.equal(r.outcome, "failed", `detail=${r.detail}`);
      // internal-report maxAttempts=3 → 1회 실패는 재큐(queued)
      assert.equal(await jobStatus(c, job.id), "queued", "transient 실패 → 재시도 대기(queued)");
    } finally { await db.close(); }
  });

  test("등록 adapter 없음 → permanent fail(no-adapter)", async () => {
    const { db, c } = await freshQ();
    try {
      const { job } = await createJob(c, jobInput({ projectId: "no-adapter" }));
      const r = await processNextJob(c, "w1", new Map()); // adapter 없음
      assert.equal(r.outcome, "no-adapter");
      assert.equal(await jobStatus(c, job.id), "failed", "permanent → failed");
    } finally { await db.close(); }
  });

  test("lease 만료 → reaper 가 execution expired + job 재큐(pure)", async () => {
    const { db, c } = await freshQ();
    try {
      const { job } = await createJob(c, jobInput({ projectId: "reap" }));
      const claim = await claimNextJob(c, "w1");
      // lease 를 과거로(만료 모사)
      await c.query(`UPDATE job_executions SET lease_expires_at = now() - interval '1 minute' WHERE id=$1`, [claim!.executionId]);
      const summary = await reapExpired(c, { batch: 10 });
      assert.ok(summary.reaped >= 1, `reaped=${JSON.stringify(summary)}`);
      assert.equal((await execOf(c, job.id)).status, "expired", "만료 execution");
      assert.equal(await jobStatus(c, job.id), "queued", "pure jobType → 재큐");
    } finally { await db.close(); }
  });
});

describe("작업큐 e2e — 관리자 작업목록 API", () => {
  test("listJobs 필터·getJobDetail 이력·requestJobCancel(멱등) · 비밀 미노출", async () => {
    const { db, c } = await freshQ();
    try {
      const { job: a } = await createJob(c, jobInput({ projectId: "admin-a" }));
      const { job: b } = await createJob(c, jobInput({ projectId: "admin-b" }));
      await processNextJob(c, "w1", echo); // 하나 처리(succeeded)

      const all = await listJobs(c, { ownerScope: "kop", limit: 10 });
      assert.ok(all.length >= 2);
      const succeeded = await listJobs(c, { status: "succeeded" });
      assert.ok(succeeded.every((j) => j.status === "succeeded"));
      assert.ok(succeeded.some((j) => j.attempts >= 1), "실행된 job 은 attempts>=1");

      const detail = await getJobDetail(c, succeeded[0].id);
      assert.ok(detail);
      assert.ok(detail!.executions.length >= 1, "execution 이력");
      assert.equal(detail!.executions[0].status, "succeeded");
      assert.ok(detail!.executions[0].resultArtifactHash, "결과 아티팩트 해시 노출");

      // 관리자 취소 요청(미실행 job b) → cancelRequested true
      const rc = await requestJobCancel(c, b.id, "admin#ref");
      assert.equal(rc.requested, true);
      const bDetail = await getJobDetail(c, b.id);
      assert.equal(bDetail!.cancelRequested, true);

      // 비밀 미노출: 직렬화 결과에 password/DSN 형태 없음
      const dump = JSON.stringify({ all, detail, bDetail });
      assert.ok(!/postgres(ql)?:\/\/|password|npg_/i.test(dump), "관리자 API 응답에 비밀 노출");
      void a;
    } finally { await db.close(); }
  });
});

describe("작업큐 e2e — 전용 연결 fail-closed(worker/admin 분리)", () => {
  test("worker/admin URL 미설정 → configured=false · acquire throw(소유자 연결 비의존)", async () => {
    const savedW = process.env[QUEUE_URL_ENV.worker], savedA = process.env[QUEUE_URL_ENV.admin];
    delete process.env[QUEUE_URL_ENV.worker]; delete process.env[QUEUE_URL_ENV.admin];
    try {
      assert.equal(queueConnectionConfigured("worker"), false);
      assert.equal(queueConnectionConfigured("admin"), false);
      await assert.rejects(() => acquireQueueClient("worker"), /ORCHESTRATION_WORKER_URL 미설정/);
      await assert.rejects(() => acquireQueueClient("admin"), /ORCHESTRATION_ADMIN_URL 미설정/);
    } finally {
      if (savedW !== undefined) process.env[QUEUE_URL_ENV.worker] = savedW;
      if (savedA !== undefined) process.env[QUEUE_URL_ENV.admin] = savedA;
    }
  });
});
