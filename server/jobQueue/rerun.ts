// forced-rerun(§retry 계약) — 같은 job 에 새 execution(executionReason='forced-rerun') 생성.
// 기존 execution·결과 보존(덮어쓰기 금지), idempotencyKey·request snapshot 불변. run_revision 남용 안 함.
// reprocess(입력·버전 변경)는 별도 — createJob 에 parentJobId+reprocessReason 을 주어 새 job 을 만든다(새 key).
import type { QueueClient, ClaimResult, JobRow } from "./types";
import { jobTypePolicy } from "./registry";
import { generateLeaseToken } from "./leaseToken";

export async function claimForcedRerun(c: QueueClient, jobId: string, workerId: string): Promise<ClaimResult | null> {
  await c.query("BEGIN");
  try {
    const picked = await c.query(`SELECT * FROM jobs WHERE id=$1 FOR UPDATE`, [jobId]);
    const job = picked.rows[0] as JobRow | undefined;
    if (!job) { await c.query("ROLLBACK"); return null; }
    // forced-rerun 허용 상태(관리자 승인 작업): terminal + 검토 대기 상태. 진행 중(queued/running) 금지.
    const ALLOWED = ["succeeded", "failed", "cancelled", "blocked", "needs_review"];
    if (!ALLOWED.includes(job.status)) {
      await c.query("ROLLBACK");
      throw new Error(`forced-rerun 불가: job ${jobId} 상태=${job.status}(허용: ${ALLOWED.join("/")})`);
    }
    const active = await c.query(`SELECT id FROM job_executions WHERE job_id=$1 AND status IN ('claimed','running') LIMIT 1`, [jobId]);
    if (active.rows[0]) { await c.query("ROLLBACK"); throw new Error("이미 active execution 존재"); }

    const policy = jobTypePolicy(job.job_type);
    const nextAttempt = ((await c.query(`SELECT COALESCE(max(attempt_number),0)::int m FROM job_executions WHERE job_id=$1`, [jobId])).rows[0].m as number) + 1;
    const { raw, hash } = generateLeaseToken();
    const ins = await c.query(
      `INSERT INTO job_executions
         (job_id, attempt_number, execution_reason, status, worker_id, lease_token_hash, leased_at, lease_expires_at, created_at)
       VALUES ($1,$2,'forced-rerun','claimed',$3,$4, now(), now() + make_interval(secs => $5), now())
       RETURNING id, lease_expires_at`,
      [jobId, nextAttempt, workerId, hash, policy.leaseDurationSec],
    );
    await c.query(`UPDATE jobs SET status='running', completed_at=NULL, updated_at=now() WHERE id=$1`, [jobId]);
    await c.query("COMMIT");
    return {
      job, executionId: ins.rows[0].id, attemptNumber: nextAttempt,
      rawLeaseToken: raw, leaseExpiresAt: ins.rows[0].lease_expires_at,
      adapterInput: { jobType: job.job_type, inputIdentity: job.input_identity, executionOptions: job.execution_options, requestVersionSnapshot: job.request_version_snapshot },
    };
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  }
}
