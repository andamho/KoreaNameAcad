// claim 트랜잭션(§5). FOR UPDATE SKIP LOCKED 로 queued job 1건 선점 → execution 생성 → job running.
// commit 이후에만 adapter 실행(호출자 책임). raw lease token 은 반환값에만 존재(DB/로그 금지).
import type { QueueClient, ClaimResult, JobRow } from "./types";
import { jobTypePolicy } from "./registry";
import { generateLeaseToken } from "./leaseToken";
import { EXECUTION_ACTIVE_STATUSES } from "../../shared/jobQueueContract";

export async function claimNextJob(
  c: QueueClient,
  workerId: string,
  opts: { jobTypes?: string[] } = {},
): Promise<ClaimResult | null> {
  await c.query("BEGIN");
  try {
    const typeFilter = opts.jobTypes && opts.jobTypes.length ? `AND job_type = ANY($1)` : "";
    const params = opts.jobTypes && opts.jobTypes.length ? [opts.jobTypes] : [];
    // 선점 순서 = 부분 인덱스 컬럼 순서(priority, available_at, created_at, id). available_at<=now() 는 쿼리 필터.
    const picked = await c.query(
      `SELECT * FROM jobs
        WHERE status='queued' AND available_at <= now() ${typeFilter}
        ORDER BY priority ASC, available_at ASC, created_at ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1`,
      params,
    );
    if (!picked.rows[0]) {
      await c.query("ROLLBACK");
      return null;
    }
    const job = picked.rows[0] as JobRow;
    const policy = jobTypePolicy(job.job_type);

    // 불변식: queued job 은 active execution 이 없어야 한다(방어 검증).
    const active = await c.query(
      `SELECT id FROM job_executions WHERE job_id=$1 AND status = ANY($2) LIMIT 1`,
      [job.id, EXECUTION_ACTIVE_STATUSES as unknown as string[]],
    );
    if (active.rows[0]) {
      await c.query("ROLLBACK");
      throw new Error(`불변식 위반: queued job ${job.id} 에 active execution 존재`);
    }

    const nextAttempt =
      ((await c.query(`SELECT COALESCE(max(attempt_number),0)::int AS m FROM job_executions WHERE job_id=$1`, [job.id]))
        .rows[0].m as number) + 1;
    const reason = nextAttempt === 1 ? "normal" : "retry";
    const { raw, hash } = generateLeaseToken();

    const ins = await c.query(
      `INSERT INTO job_executions
         (job_id, attempt_number, execution_reason, status, worker_id, lease_token_hash,
          leased_at, lease_expires_at, created_at)
       VALUES ($1,$2,$3,'claimed',$4,$5, now(), now() + make_interval(secs => $6), now())
       RETURNING id, lease_expires_at`,
      [job.id, nextAttempt, reason, workerId, hash, policy.leaseDurationSec],
    );
    const executionId = ins.rows[0].id as string;
    const leaseExpiresAt = ins.rows[0].lease_expires_at as string;

    await c.query(`UPDATE jobs SET status='running', updated_at=now() WHERE id=$1`, [job.id]);
    await c.query("COMMIT");

    return {
      job,
      executionId,
      attemptNumber: nextAttempt,
      rawLeaseToken: raw,
      leaseExpiresAt,
      adapterInput: {
        jobType: job.job_type,
        inputIdentity: job.input_identity,
        executionOptions: job.execution_options,
        requestVersionSnapshot: job.request_version_snapshot,
      },
    };
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  }
}
