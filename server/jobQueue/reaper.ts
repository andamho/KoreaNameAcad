// reaper(§10) — lease 만료된 active execution 을 회수. 동시 실행 안전(FOR UPDATE SKIP LOCKED + batch).
// jobType 정책: pure/idempotent(retry-queued) → execution expired, job queued(소진 시 failed);
//              non-idempotent(needs-review) → execution expired, job needs_review(부작용 발생 여부 불명).
import type { QueueClient } from "./types";
import { jobTypePolicy } from "./registry";

export interface ReapSummary {
  reaped: number;
  requeued: number;
  failed: number;
  needsReview: number;
}

export async function reapExpired(c: QueueClient, opts: { batch?: number } = {}): Promise<ReapSummary> {
  const batch = opts.batch ?? 50;
  const sum: ReapSummary = { reaped: 0, requeued: 0, failed: 0, needsReview: 0 };
  await c.query("BEGIN");
  try {
    // 만료 + 아직 active + (방어적으로) job running 인 execution 만.
    const rows = (
      await c.query(
        `SELECT e.id, e.job_id, e.attempt_number, e.status, e.started_at, j.job_type
           FROM job_executions e JOIN jobs j ON j.id=e.job_id
          WHERE e.status IN ('claimed','running') AND e.lease_expires_at < now() AND j.status='running'
          ORDER BY e.lease_expires_at ASC
          FOR UPDATE OF e SKIP LOCKED
          LIMIT $1`,
        [batch],
      )
    ).rows;

    for (const r of rows) {
      const policy = jobTypePolicy(r.job_type);
      const attempt = r.attempt_number as number;
      const canRetry = attempt < policy.maxAttempts;
      // adapter 실제 시작 증명 = running + started_at. claimed(started_at null)=side effect 시작 전 → 안전 requeue.
      const sideEffectStarted = r.status === "running" && r.started_at !== null;
      await c.query(`SELECT id FROM jobs WHERE id=$1 FOR UPDATE`, [r.job_id]);

      let jobStatus: string, availableExpr = "available_at", errorCode: string;
      // 비멱등이면서 부작용이 실제 시작됐으면 사람 검토(중복 위험 불명). 그 외(pure/idempotent, 또는 미시작)는 재시도/소진.
      if (policy.ambiguousSideEffectPolicy === "needs-review" && sideEffectStarted) {
        jobStatus = "needs_review"; errorCode = "ambiguous.side-effect-unknown"; sum.needsReview++;
      } else if (canRetry) {
        jobStatus = "queued";
        availableExpr = `now() + make_interval(secs => ${Math.round(backoff(policy, attempt))})`;
        errorCode = "transient.timeout"; sum.requeued++;
      } else {
        jobStatus = "failed"; errorCode = "transient.timeout"; sum.failed++;
      }

      await c.query(
        `UPDATE job_executions SET status='expired', finished_at=now(), error_code=$2, error_summary='lease expired (reaper)' WHERE id=$1`,
        [r.id, errorCode],
      );
      await c.query(`UPDATE jobs SET status=$2, available_at=${availableExpr}, updated_at=now() WHERE id=$1`, [r.job_id, jobStatus]);
      sum.reaped++;
    }
    await c.query("COMMIT");
    return sum;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  }
}

function backoff(policy: ReturnType<typeof jobTypePolicy>, attemptNumber: number): number {
  const raw = policy.initialDelaySec * Math.pow(policy.multiplier, Math.max(0, attemptNumber - 1));
  return Math.min(raw, policy.maxDelaySec);
}
