// 실패·retry(§9). 오류를 transient/permanent/ambiguous 로 분류해 execution·job 상태를 결정.
// error_code 는 레지스트리 값만, error_summary 는 시스템 요약(≤1000자)만 — 원문·stack·고객값 금지.
import type { QueueClient, FailureClass } from "./types";
import { jobTypePolicy } from "./registry";
import { sha256Hex } from "./idempotency";
import { isErrorCode, classOfErrorCode, type ErrorCode } from "./errorCodes";
import { isValidErrorSummary } from "../../shared/jobQueueContract";

export type FailOutcome =
  | "retry-scheduled" // execution failed, job queued(backoff)
  | "failed" // execution failed, job failed(소진/영구)
  | "blocked" // execution verification_failed/failed, job blocked(버전 불일치 등)
  | "needs-review" // execution expired/failed, job needs_review(모호 부작용)
  | "already-terminal"
  | "fencing-failed";

export interface FailResult {
  outcome: FailOutcome;
  failureClass: FailureClass | null;
}

async function lockActiveExecution(c: QueueClient, executionId: string, workerId: string, tokenHash: string) {
  const ex = await c.query(`SELECT *, (lease_expires_at <= now()) AS __lease_expired FROM job_executions WHERE id=$1 FOR UPDATE`, [executionId]);
  const row = ex.rows[0];
  if (!row) return { kind: "fencing-failed" as const };
  if (!["claimed", "running"].includes(row.status)) return { kind: "already-terminal" as const };
  if (row.worker_id !== workerId || row.lease_token_hash !== tokenHash) return { kind: "fencing-failed" as const };
  if (row.__lease_expired) return { kind: "fencing-failed" as const }; // lease 만료 = 권한 상실(reaper 소관)
  return { kind: "ok" as const, row };
}

export async function failExecution(
  c: QueueClient,
  args: {
    executionId: string; workerId: string; rawLeaseToken: string; jobType: string;
    errorCode: ErrorCode; errorSummary?: string | null;
  },
): Promise<FailResult> {
  if (!isErrorCode(args.errorCode)) throw new Error(`미등록 error_code: ${args.errorCode}`);
  if (!isValidErrorSummary(args.errorSummary ?? null)) throw new Error("error_summary 길이 초과(≤1000)");
  const policy = jobTypePolicy(args.jobType);
  const tokenHash = sha256Hex(args.rawLeaseToken);
  const cls = classOfErrorCode(args.errorCode);

  await c.query("BEGIN");
  try {
    const locked = await lockActiveExecution(c, args.executionId, args.workerId, tokenHash);
    if (locked.kind !== "ok") { await c.query("ROLLBACK"); return { outcome: locked.kind, failureClass: null }; }
    const row = locked.row;
    await c.query(`SELECT id FROM jobs WHERE id=$1 FOR UPDATE`, [row.job_id]);

    let execStatus: string, jobStatus: string, availableExpr = "available_at", outcome: FailOutcome;
    const attempt = row.attempt_number as number;
    const canRetry = attempt < policy.maxAttempts;

    if (cls === "transient" && canRetry) {
      execStatus = "failed"; jobStatus = "queued";
      availableExpr = `now() + make_interval(secs => ${Math.round(backoff(policy, attempt))})`;
      outcome = "retry-scheduled";
    } else if (cls === "transient") {
      execStatus = "failed"; jobStatus = "failed"; outcome = "failed"; // 소진
    } else if (cls === "ambiguous-side-effect") {
      if (policy.ambiguousSideEffectPolicy === "retry-queued" && canRetry) {
        execStatus = "expired"; jobStatus = "queued";
        availableExpr = `now() + make_interval(secs => ${Math.round(backoff(policy, attempt))})`;
        outcome = "retry-scheduled";
      } else {
        execStatus = "expired"; jobStatus = "needs_review"; outcome = "needs-review";
      }
    } else {
      // permanent
      if (args.errorCode === "permanent.version-mismatch") { execStatus = "verification_failed"; jobStatus = "blocked"; outcome = "blocked"; }
      else { execStatus = "failed"; jobStatus = "failed"; outcome = "failed"; }
    }

    await c.query(
      `UPDATE job_executions SET status=$2, finished_at=now(), error_code=$3, error_summary=$4 WHERE id=$1`,
      [args.executionId, execStatus, args.errorCode, args.errorSummary ?? null],
    );
    await c.query(`UPDATE jobs SET status=$2, available_at=${availableExpr}, updated_at=now() WHERE id=$1`, [row.job_id, jobStatus]);
    await c.query("COMMIT");
    return { outcome, failureClass: cls };
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  }
}

function backoff(policy: ReturnType<typeof jobTypePolicy>, attemptNumber: number): number {
  const raw = policy.initialDelaySec * Math.pow(policy.multiplier, Math.max(0, attemptNumber - 1));
  return Math.min(raw, policy.maxDelaySec);
}

// 버전 snapshot 불일치(§12) — adapter 실행 전 차단. 불일치 필드명만 error_summary 에(값 원문 금지).
export async function markVersionMismatch(
  c: QueueClient,
  args: { executionId: string; workerId: string; rawLeaseToken: string; jobType: string; mismatchedFields: string[] },
): Promise<FailResult> {
  const summary = `version-mismatch: ${args.mismatchedFields.slice(0, 20).join(",")}`.slice(0, 1000);
  return failExecution(c, {
    ...args, errorCode: "permanent.version-mismatch", errorSummary: summary,
  });
}
