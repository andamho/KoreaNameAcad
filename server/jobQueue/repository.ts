// 조회 헬퍼(읽기 전용) — 테스트·adapter·모니터링용. 상태 변경은 claim/complete/fail/reaper 만.
import type { QueueClient, JobRow, ExecutionRow } from "./types";

export async function getJob(c: QueueClient, jobId: string): Promise<JobRow | null> {
  return (await c.query(`SELECT * FROM jobs WHERE id=$1`, [jobId])).rows[0] ?? null;
}
export async function getExecution(c: QueueClient, executionId: string): Promise<ExecutionRow | null> {
  return (await c.query(`SELECT * FROM job_executions WHERE id=$1`, [executionId])).rows[0] ?? null;
}
export async function listExecutions(c: QueueClient, jobId: string): Promise<ExecutionRow[]> {
  return (await c.query(`SELECT * FROM job_executions WHERE job_id=$1 ORDER BY attempt_number ASC`, [jobId])).rows;
}
export async function activeExecution(c: QueueClient, jobId: string): Promise<ExecutionRow | null> {
  return (
    await c.query(`SELECT * FROM job_executions WHERE job_id=$1 AND status IN ('claimed','running')`, [jobId])
  ).rows[0] ?? null;
}
export async function countByStatus(c: QueueClient): Promise<Record<string, number>> {
  const rows = (await c.query(`SELECT status, count(*)::int n FROM jobs GROUP BY status`)).rows;
  return Object.fromEntries(rows.map((r: any) => [r.status, r.n]));
}
