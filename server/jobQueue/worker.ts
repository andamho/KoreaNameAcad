// worker 실행 루프 — claim → running → (cancel 확인) → adapter.execute → complete / fail.
// 각 worker = 독립 커넥션(QueueClient). commit 이후에만 adapter 실행. raw lease token 은 메모리 전용(저장 금지).
import type { QueueClient } from "./types";
import type { JobAdapter } from "./adapters/types";
import { AdapterError } from "./adapters/types";
import { claimNextJob } from "./claim";
import { markRunning } from "./running";
import { completeExecution } from "./complete";
import { failExecution } from "./fail";
import { isCancelRequested, acknowledgeCancel } from "./cancel";
import { isErrorCode, type ErrorCode } from "./errorCodes";

export type ProcessOutcome =
  | "idle"              // claim 할 job 없음
  | "succeeded"
  | "cancelled"
  | "failed"            // adapter 실패 → fail 라우팅(retry/needs_review/failed 는 fail 정책이 결정)
  | "no-adapter"        // 등록 adapter 없음 → permanent fail
  | "not-running"       // markRunning fencing 실패(경합/탈취)
  | "complete-rejected"; // 완료 정책 위반(artifact/verification) → fail 라우팅

export interface ProcessResult {
  outcome: ProcessOutcome;
  jobId?: string;
  executionId?: string;
  detail?: string;
}

/**
 * 큐에서 job 하나를 claim 해 처리한다(worker 1 tick). 부작용 있는 adapter 는 반드시 commit 이후 실행됨을 전제.
 * 반환 outcome 으로 상위 루프가 진행/중단을 판단한다. idle = 처리할 job 없음.
 */
export async function processNextJob(
  c: QueueClient,
  workerId: string,
  adapters: Map<string, JobAdapter>,
  opts: { jobTypes?: string[] } = {},
): Promise<ProcessResult> {
  const claim = await claimNextJob(c, workerId, { jobTypes: opts.jobTypes });
  if (!claim) return { outcome: "idle" };
  const base = { jobId: claim.job.id, executionId: claim.executionId };
  const fence = { executionId: claim.executionId, workerId, rawLeaseToken: claim.rawLeaseToken, jobType: claim.job.job_type };

  const adapter = adapters.get(claim.job.job_type);
  if (!adapter) {
    await failExecution(c, { ...fence, errorCode: "permanent.invalid-input", errorSummary: "no adapter registered for jobType" });
    return { outcome: "no-adapter", ...base };
  }

  // claimed → running (fencing). 실패면 다른 worker 가 가져갔거나 lease 만료.
  const running = await markRunning(c, { executionId: claim.executionId, workerId, rawLeaseToken: claim.rawLeaseToken });
  if (!running) return { outcome: "not-running", ...base, detail: "markRunning fencing failed" };

  // cooperative cancel: 실행 시작 직후 취소 요청 확인(미시작=부작용 0 이 자명 → 즉시 cancelled).
  if (await isCancelRequested(c, claim.job.id)) {
    const ack = await acknowledgeCancel(c, fence);
    return { outcome: ack.acknowledged ? "cancelled" : "not-running", ...base, detail: ack.detail };
  }

  try {
    const completion = await adapter.execute(claim.adapterInput);
    const comp = await completeExecution(c, { ...fence, result: completion });
    if (comp.outcome === "succeeded") return { outcome: "succeeded", ...base };
    if (comp.outcome === "rejected-verification" || comp.outcome === "rejected-missing-artifact-hash") {
      await failExecution(c, { ...fence, errorCode: "permanent.artifact-corrupt", errorSummary: comp.outcome });
      return { outcome: "complete-rejected", ...base, detail: comp.outcome };
    }
    // fencing-failed / lease-expired / already-terminal → worker 가 권한을 잃음. reaper/다른 worker 소관.
    return { outcome: "failed", ...base, detail: comp.outcome };
  } catch (e) {
    const errorCode: ErrorCode = e instanceof AdapterError && isErrorCode(e.errorCode) ? e.errorCode : "transient.timeout";
    const summary = e instanceof AdapterError ? e.summary : "adapter threw non-AdapterError";
    await failExecution(c, { ...fence, errorCode, errorSummary: String(summary).slice(0, 1000) });
    return { outcome: "failed", ...base, detail: errorCode };
  }
}
