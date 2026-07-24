// 운영 smoke job — worker 가동 후 안전하게 큐 경로를 1회 검증. **preview 계산 adapter(internal-report) 전용**.
// ⚠️ 실제 고객 데이터·파일 변경 0(순수 계산). raw payload·credential·lease token 출력 금지. job ID·최종 상태만.
// ⚠️ CONFIRM_QUEUE_SMOKE=true 필수. idempotency 고정(중복 실행 = 같은 job, 새로 안 만듦).
//
// 사용(worker 가 별도로 가동 중):
//   CONFIRM_QUEUE_SMOKE=true ORCHESTRATION_WORKER_URL=<writer dsn> node --import tsx/esm scripts/createQueueSmokeJob.ts
//   (SMOKE_WORKER_INLINE=true 면 worker 없이 이 프로세스가 직접 처리 — 격리/자체 검증용)
//   (ORCHESTRATION_ADMIN_URL 있으면 admin 조회까지 확인)
import "dotenv/config";
import { acquireQueueClient, queueConnectionConfigured } from "../server/jobQueue/connection";
import { createJob } from "../server/jobQueue/createJob";
import { processNextJob } from "../server/jobQueue/worker";
import { internalReportComputeAdapter } from "../server/jobQueue/adapters/internalReport";
import { getJobDetail } from "../server/jobQueue/adminApi";
import { sha256Hex } from "../server/jobQueue/idempotency";
import type { RequestVersionSnapshot } from "../shared/jobQueueContract";

const die = (m: string): never => { console.error(`[smoke] ❌ ${m}`); process.exit(1); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 고정 identity — 재실행 시 같은 idempotency key(중복 job 안 만듦). 실제 고객 데이터 아님(합성 상수).
const SMOKE_SOURCE_HASH = sha256Hex("queue-smoke-fixed-source");
const snap: RequestVersionSnapshot = {
  schemaVersion: 1, pipelineVersion: "smoke-p1", transcriptionEngineVersion: null, transcriptionEngineHash: null,
  dictionaryVersion: null, normalizationVersion: null, correctionEngineVersion: null, correctionEngineHash: null,
  executorRequirement: null,
};
const smokeInput = {
  ownerScope: "korea-name-acad", projectId: null, jobType: "internal-report",
  inputIdentity: { sourceAssetHash: SMOKE_SOURCE_HASH, reportType: "individual", rendererVersion: "smoke-r1" },
  requestVersionSnapshot: snap, executionOptions: null, payloadHash: sha256Hex("queue-smoke-payload"),
};

export async function main(): Promise<number> {
  if ((process.env.CONFIRM_QUEUE_SMOKE || "").trim() !== "true") die("CONFIRM_QUEUE_SMOKE=true 필수(명시적 승인).");
  if (!queueConnectionConfigured("worker")) die("ORCHESTRATION_WORKER_URL 미설정(fail-closed).");
  const inline = (process.env.SMOKE_WORKER_INLINE || "").trim() === "true";
  const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 30000);

  const { queue, release } = await acquireQueueClient("worker");
  let jobId = "";
  try {
    const { job, created } = await createJob(queue, smokeInput as any);
    jobId = job.id;
    console.log(`[smoke] job=${jobId} created=${created} status=${job.status} (preview 계산 adapter · 고객 데이터 변경 0)`);

    if (inline) {
      // ⚠️ processNextJob 은 큐의 **다음** job 을 가져온다 → smoke 자기 job 이 terminal 될 때까지 반복 처리(최대 20회).
      const adapters = new Map([[internalReportComputeAdapter().jobType, internalReportComputeAdapter()]]);
      for (let k = 0; k < 20; k++) {
        const r = await processNextJob(queue, "smoke-inline", adapters, { heartbeat: true, heartbeatIntervalSec: 1 });
        if (r.outcome === "idle") break;
        if (r.jobId === jobId) { console.log(`[smoke] inline 처리(자기 job) → ${r.outcome}${r.detail ? " (" + r.detail + ")" : ""}`); }
        const st = (await queue.query(`SELECT status FROM jobs WHERE id=$1`, [jobId])).rows[0]?.status;
        if (["succeeded", "failed", "cancelled"].includes(st)) break;
      }
    } else {
      console.log(`[smoke] worker(별도 프로세스) 처리 대기 — 최대 ${timeoutMs}ms polling…`);
    }

    // 최종 상태 polling
    const deadline = Date.now() + timeoutMs;
    let status = "";
    while (Date.now() < deadline) {
      status = (await queue.query(`SELECT status FROM jobs WHERE id=$1`, [jobId])).rows[0]?.status ?? "";
      if (["succeeded", "failed", "cancelled"].includes(status)) break;
      await sleep(1000);
    }
    console.log(`[smoke] 최종: job=${jobId} status=${status || "timeout"}`);

    // admin 조회(선택)
    if (queueConnectionConfigured("admin")) {
      const { queue: aq, release: ar } = await acquireQueueClient("admin");
      try { const d = await getJobDetail(aq, jobId); console.log(`[smoke] admin 조회: status=${d?.status} executions=${d?.executions.length} resultHash=${d?.executions[0]?.resultArtifactHash ? "present" : "none"}`); }
      finally { await ar().catch(() => {}); }
    }
    return status === "succeeded" ? 0 : 1;
  } catch (e: any) { return die(`smoke 실패: ${String(e?.message ?? e).slice(0, 200)}`); }
  finally { await release().catch(() => {}); }
}

const isDirect = process.argv[1] && /createQueueSmokeJob\.(ts|js)$/.test(process.argv[1].replace(/\\/g, "/"));
if (isDirect) { main().then((c) => process.exit(c)); }
