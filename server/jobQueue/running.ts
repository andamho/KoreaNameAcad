// claimed → running 전이(§6). adapter 를 실제 시작하기 직전에 호출.
// fencing(exec id + worker id + token hash + status=claimed) 일치 때만 running 전환.
// 반환 false = adapter 시작 금지(탈취·만료·이미 running). started_at 기록.
import type { QueueClient } from "./types";
import { sha256Hex } from "./idempotency";

export async function markRunning(
  c: QueueClient,
  args: { executionId: string; workerId: string; rawLeaseToken: string },
): Promise<boolean> {
  const tokenHash = sha256Hex(args.rawLeaseToken);
  const r = await c.query(
    `UPDATE job_executions
        SET status='running', started_at = now()
      WHERE id=$1 AND worker_id=$2 AND lease_token_hash=$3 AND status='claimed'
        AND lease_expires_at > now()
      RETURNING id`,
    [args.executionId, args.workerId, tokenHash],
  );
  return r.rows.length === 1;
}
