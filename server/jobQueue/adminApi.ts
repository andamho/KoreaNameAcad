// 관리자 작업목록 API — 순수 함수(QueueClient 주입). 라우팅·인증은 상위(routes)에서.
// ⚠️ 반환값에 고객 원문·비밀값·URI 를 담지 않는다(상태·개수·해시·타임스탬프·에러코드만). request/actual snapshot 은
//    버전 식별자만 있으므로 그대로 노출 가능하나, artifact/executor snapshot 의 uri·환경지문은 제외한다.
import type { QueueClient } from "./types";
import type { JobStatus } from "../../shared/jobQueueContract";
import { requestCancel } from "./cancel";

export interface JobListItem {
  id: string;
  ownerScope: string;
  projectId: string | null;
  jobType: string;
  status: JobStatus;
  priority: number;
  attempts: number;            // 지금까지 생성된 execution 수
  cancelRequested: boolean;
  availableAt: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}
export interface JobDetail extends JobListItem {
  idempotencyKey: string;
  requestVersionSnapshot: unknown;   // 버전 식별자만(계약상 비밀 없음)
  executions: {
    id: string;
    attemptNumber: number;
    reason: string;
    status: string;
    startedAt: string | null;
    finishedAt: string | null;
    leaseExpiresAt: string | null;
    heartbeatAt: string | null;
    verificationStatus: string | null;
    errorCode: string | null;
    errorSummary: string | null;      // 시스템 요약(≤1000) — 원문 아님(계약)
    resultArtifactHash: string | null; // artifact snapshot 에서 해시만
  }[];
}

const LIST_SQL = `
  SELECT j.id, j.owner_scope, j.project_id, j.job_type, j.status, j.priority,
         (j.cancel_requested_at IS NOT NULL) AS cancel_requested,
         j.available_at, j.created_at, j.updated_at, j.completed_at,
         (SELECT count(*)::int FROM job_executions e WHERE e.job_id=j.id) AS attempts`;

const rowToItem = (r: any): JobListItem => ({
  id: r.id, ownerScope: r.owner_scope, projectId: r.project_id, jobType: r.job_type,
  status: r.status, priority: r.priority, attempts: Number(r.attempts ?? 0),
  cancelRequested: r.cancel_requested === true, availableAt: r.available_at,
  createdAt: r.created_at, updatedAt: r.updated_at, completedAt: r.completed_at,
});

/** 작업목록 조회(status·jobType·ownerScope 필터, 최신순). limit 상한 200. */
export async function listJobs(
  c: QueueClient,
  filter: { status?: JobStatus; jobType?: string; ownerScope?: string; limit?: number } = {},
): Promise<JobListItem[]> {
  const where: string[] = []; const params: unknown[] = [];
  if (filter.status) { params.push(filter.status); where.push(`j.status=$${params.length}`); }
  if (filter.jobType) { params.push(filter.jobType); where.push(`j.job_type=$${params.length}`); }
  if (filter.ownerScope) { params.push(filter.ownerScope); where.push(`j.owner_scope=$${params.length}`); }
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  params.push(limit);
  const sql = `${LIST_SQL} FROM jobs j ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY j.created_at DESC LIMIT $${params.length}`;
  const r = await c.query(sql, params);
  return r.rows.map(rowToItem);
}

/** 단일 작업 상세(execution 이력 포함, 최신 attempt 우선). */
export async function getJobDetail(c: QueueClient, jobId: string): Promise<JobDetail | null> {
  const jr = await c.query(`${LIST_SQL}, j.idempotency_key, j.request_version_snapshot FROM jobs j WHERE j.id=$1`, [jobId]);
  const j = jr.rows[0];
  if (!j) return null;
  const er = await c.query(
    `SELECT id, attempt_number, execution_reason, status, started_at, finished_at, lease_expires_at,
            heartbeat_at, verification_status, error_code, error_summary, artifact_snapshot
       FROM job_executions WHERE job_id=$1 ORDER BY attempt_number DESC`, [jobId]);
  return {
    ...rowToItem(j),
    idempotencyKey: j.idempotency_key,
    requestVersionSnapshot: j.request_version_snapshot,
    executions: er.rows.map((e: any) => ({
      id: e.id, attemptNumber: e.attempt_number, reason: e.execution_reason, status: e.status,
      startedAt: e.started_at, finishedAt: e.finished_at, leaseExpiresAt: e.lease_expires_at, heartbeatAt: e.heartbeat_at,
      verificationStatus: e.verification_status, errorCode: e.error_code, errorSummary: e.error_summary,
      resultArtifactHash: e.artifact_snapshot?.resultArtifactHash ?? null,
    })),
  };
}

/** 관리자 취소 요청(멱등). 실제 취소는 worker 가 acknowledgeCancel 로 확정(직접 상태 쓰지 않음). */
export async function requestJobCancel(c: QueueClient, jobId: string, adminRef?: string | null) {
  return requestCancel(c, jobId, adminRef ?? null);
}
