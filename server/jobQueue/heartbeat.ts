// heartbeat(§7) — fencing: exec id + worker id + token hash + status active 일치 때만 갱신.
// DB now() 기준으로 heartbeat_at·lease_expires_at 연장. token 교체·attempt 변경·terminal heartbeat 금지.
// 반환 false = fencing 실패(만료·탈취·terminal) → worker 는 즉시 작업 중단해야 함.
import type { QueueClient } from "./types";
import { jobTypePolicy } from "./registry";
import { sha256Hex } from "./idempotency";

export async function heartbeat(
  c: QueueClient,
  args: { executionId: string; workerId: string; rawLeaseToken: string; jobType: string },
): Promise<boolean> {
  const policy = jobTypePolicy(args.jobType);
  const tokenHash = sha256Hex(args.rawLeaseToken);
  // 부분유일 인덱스가 job 당 active execution 을 1개로 보장 → status active 인 이 행이 곧 유일 active.
  // reaper 가 만료 처리하면 status != active 가 되어 여기서 거부된다(lease "허용 범위 내" 판정).
  const r = await c.query(
    `UPDATE job_executions
        SET heartbeat_at = now(), lease_expires_at = now() + make_interval(secs => $4)
      WHERE id=$1 AND worker_id=$2 AND lease_token_hash=$3
        AND status IN ('claimed','running')
        AND lease_expires_at > now()
      RETURNING id`,
    [args.executionId, args.workerId, tokenHash, policy.leaseDurationSec],
  );
  return r.rows.length === 1;
}
