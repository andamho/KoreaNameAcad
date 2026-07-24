// worker 실행 루프 — claim → running → (cancel 확인) → adapter.execute → complete / fail.
// 각 worker = 독립 커넥션(QueueClient). commit 이후에만 adapter 실행. raw lease token 은 메모리 전용(저장/로그 금지).
// 장시간 adapter 는 heartbeat 옵션으로 주기적 heartbeat + cancel 확인 + lease-상실 시 조기 중단(fencing 유지: complete 는 만료 lease 거부).
import type { QueueClient, CompletionInput } from "./types";
import type { JobAdapter } from "./adapters/types";
import { AdapterError } from "./adapters/types";
import { claimNextJob } from "./claim";
import { markRunning } from "./running";
import { heartbeat } from "./heartbeat";
import { completeExecution } from "./complete";
import { failExecution } from "./fail";
import { isCancelRequested, acknowledgeCancel } from "./cancel";
import { isErrorCode, type ErrorCode } from "./errorCodes";
import { jobTypePolicy } from "./registry";

export type ProcessOutcome =
  | "idle" | "succeeded" | "cancelled" | "failed" | "no-adapter" | "not-running" | "complete-rejected" | "lease-lost";

export interface ProcessResult { outcome: ProcessOutcome; jobId?: string; executionId?: string; detail?: string }

export interface ProcessOptions {
  jobTypes?: string[];
  /** true 면 adapter 실행 중 주기적 heartbeat + cancel 확인(장시간 작업). 기본 false(짧은 작업). */
  heartbeat?: boolean;
  /** heartbeat 주기(초). 미지정이면 jobType 정책값. 테스트에서 짧게 지정. */
  heartbeatIntervalSec?: number;
}

type Fence = { executionId: string; workerId: string; rawLeaseToken: string; jobType: string };

/** adapter 를 heartbeat 루프 안에서 실행. 취소/lease-상실 시 abort 신호를 주고 조기 반환한다. timer 는 반드시 정리. */
async function executeWithHeartbeat(
  c: QueueClient, fence: Fence, adapter: JobAdapter, adapterInput: any, jobId: string, intervalSec: number,
): Promise<{ completion?: CompletionInput; aborted?: "cancel" | "lease-lost"; error?: unknown }> {
  const controller = new AbortController();
  let aborted: "cancel" | "lease-lost" | null = null;
  const tick = async () => {
    try {
      const alive = await heartbeat(c, fence);
      if (!alive) { aborted = "lease-lost"; controller.abort(); return; }
      if (await isCancelRequested(c, jobId)) { aborted = "cancel"; controller.abort(); }
    } catch { aborted = "lease-lost"; controller.abort(); } // heartbeat 자체 실패 = 권한 불확실 → 중단
  };
  const timer = setInterval(() => { void tick(); }, Math.max(1, intervalSec) * 1000);
  try {
    const completion = await adapter.execute(adapterInput, { signal: controller.signal });
    if (aborted) return { aborted };            // 완료했어도 이미 권한 상실/취소 → complete 하지 않음
    return { completion };
  } catch (e) {
    if (aborted) return { aborted };
    return { error: e };
  } finally {
    clearInterval(timer);
  }
}

/**
 * 큐에서 job 하나를 claim 해 처리한다(worker 1 tick). 부작용 adapter 는 commit 이후 실행됨을 전제.
 * idle = 처리할 job 없음. fencing 은 markRunning/heartbeat/complete/fail 전 계층에서 유지된다.
 */
export async function processNextJob(
  c: QueueClient, workerId: string, adapters: Map<string, JobAdapter>, opts: ProcessOptions = {},
): Promise<ProcessResult> {
  const claim = await claimNextJob(c, workerId, { jobTypes: opts.jobTypes });
  if (!claim) return { outcome: "idle" };
  const base = { jobId: claim.job.id, executionId: claim.executionId };
  const fence: Fence = { executionId: claim.executionId, workerId, rawLeaseToken: claim.rawLeaseToken, jobType: claim.job.job_type };

  const adapter = adapters.get(claim.job.job_type);
  if (!adapter) {
    await failExecution(c, { ...fence, errorCode: "permanent.invalid-input", errorSummary: "no adapter registered for jobType" });
    return { outcome: "no-adapter", ...base };
  }

  const running = await markRunning(c, { executionId: claim.executionId, workerId, rawLeaseToken: claim.rawLeaseToken });
  if (!running) return { outcome: "not-running", ...base, detail: "markRunning fencing failed" };

  // 실행 시작 직후 취소 요청 확인(미시작=부작용 0 → 즉시 cancelled).
  if (await isCancelRequested(c, claim.job.id)) {
    const ack = await acknowledgeCancel(c, fence);
    return { outcome: ack.acknowledged ? "cancelled" : "not-running", ...base, detail: ack.detail };
  }

  try {
    let completion: CompletionInput;
    if (opts.heartbeat) {
      const interval = opts.heartbeatIntervalSec ?? jobTypePolicy(claim.job.job_type).heartbeatIntervalSec;
      const r = await executeWithHeartbeat(c, fence, adapter, claim.adapterInput, claim.job.id, interval);
      if (r.aborted === "cancel") {
        const ack = await acknowledgeCancel(c, fence);
        return { outcome: ack.acknowledged ? "cancelled" : "lease-lost", ...base, detail: ack.detail };
      }
      if (r.aborted === "lease-lost") return { outcome: "lease-lost", ...base, detail: "lease 상실 → 완료 포기(reaper 소관)" };
      if (r.error) throw r.error;
      completion = r.completion!;
    } else {
      completion = await adapter.execute(claim.adapterInput);
    }

    const comp = await completeExecution(c, { ...fence, result: completion });
    if (comp.outcome === "succeeded") return { outcome: "succeeded", ...base };
    if (comp.outcome === "rejected-verification" || comp.outcome === "rejected-missing-artifact-hash") {
      await failExecution(c, { ...fence, errorCode: "permanent.artifact-corrupt", errorSummary: comp.outcome });
      return { outcome: "complete-rejected", ...base, detail: comp.outcome };
    }
    return { outcome: "failed", ...base, detail: comp.outcome }; // fencing/lease-expired → 권한 상실
  } catch (e) {
    const errorCode: ErrorCode = e instanceof AdapterError && isErrorCode(e.errorCode) ? e.errorCode : "transient.timeout";
    const summary = e instanceof AdapterError ? e.summary : "adapter threw non-AdapterError";
    await failExecution(c, { ...fence, errorCode, errorSummary: String(summary).slice(0, 1000) });
    return { outcome: "failed", ...base, detail: errorCode };
  }
}
