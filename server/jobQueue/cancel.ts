// cooperative cancel acknowledgment — 삭제하지 않고 취소 **요청**만 기록(멱등). worker 가 시작/heartbeat 시 확인 후
// acknowledgeCancel 로 execution/job 을 cancelled 로 전환한다. 관리자 함수가 execution 상태를 직접 쓰지 않는다
// (claim/lease/fencing 계약 준수 — forced-rerun 안 C 와 동일 원칙).
import type { QueueClient } from "./types";
import { sha256Hex } from "./idempotency";

const ACTIVE = ["claimed", "running"];
const TERMINAL = ["succeeded", "failed", "cancelled"];

/** 취소 요청 기록(멱등). job 을 삭제하지 않고 cancel_requested_at 만 세운다. 이미 terminal 이면 no-op. */
export async function requestCancel(c: QueueClient, jobId: string, byRef?: string | null): Promise<{ requested: boolean; alreadyTerminal: boolean }> {
  await c.query("BEGIN");
  try {
    const j = await c.query(`SELECT status, cancel_requested_at FROM jobs WHERE id=$1 FOR UPDATE`, [jobId]);
    const row = j.rows[0];
    if (!row) { await c.query("ROLLBACK"); return { requested: false, alreadyTerminal: false }; }
    if (TERMINAL.includes(row.status)) { await c.query("ROLLBACK"); return { requested: false, alreadyTerminal: true }; }
    if (!row.cancel_requested_at) {
      await c.query(`UPDATE jobs SET cancel_requested_at=now(), cancel_requested_by_ref=$2, updated_at=now() WHERE id=$1`, [jobId, byRef ?? null]);
    }
    await c.query("COMMIT");
    return { requested: true, alreadyTerminal: false };
  } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; }
}

/** worker 가 실행 전/중 확인용. cancel_requested_at 이 설정됐는가. */
export async function isCancelRequested(c: QueueClient, jobId: string): Promise<boolean> {
  const r = await c.query(`SELECT (cancel_requested_at IS NOT NULL) AS c FROM jobs WHERE id=$1`, [jobId]);
  return r.rows[0]?.c === true;
}

/**
 * worker 가 취소 요청을 받아 자기 execution 을 cancelled 로 확정(fencing + active + lease 유효할 때만).
 * 부작용 없이 중단했음을 worker 가 보장한 뒤 호출한다(claimed/미시작이면 부작용 0 이 자명).
 */
export async function acknowledgeCancel(
  c: QueueClient,
  args: { executionId: string; workerId: string; rawLeaseToken: string; jobType: string },
): Promise<{ acknowledged: boolean; detail: string }> {
  const tokenHash = sha256Hex(args.rawLeaseToken);
  await c.query("BEGIN");
  try {
    const ex = await c.query(`SELECT *, (lease_expires_at <= now()) AS __exp FROM job_executions WHERE id=$1 FOR UPDATE`, [args.executionId]);
    const row = ex.rows[0];
    if (!row) { await c.query("ROLLBACK"); return { acknowledged: false, detail: "fencing-failed" }; }
    if (!ACTIVE.includes(row.status)) { await c.query("ROLLBACK"); return { acknowledged: false, detail: "already-terminal" }; }
    if (row.worker_id !== args.workerId || row.lease_token_hash !== tokenHash) { await c.query("ROLLBACK"); return { acknowledged: false, detail: "fencing-failed" }; }
    if (row.__exp) { await c.query("ROLLBACK"); return { acknowledged: false, detail: "lease-expired" }; } // 권한 상실 → reaper 소관
    await c.query(`SELECT id FROM jobs WHERE id=$1 FOR UPDATE`, [row.job_id]);
    await c.query(`UPDATE job_executions SET status='cancelled', finished_at=now() WHERE id=$1`, [args.executionId]);
    await c.query(`UPDATE jobs SET status='cancelled', cancelled_at=now(), updated_at=now() WHERE id=$1`, [row.job_id]);
    await c.query("COMMIT");
    return { acknowledged: true, detail: "cancelled" };
  } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; }
}
