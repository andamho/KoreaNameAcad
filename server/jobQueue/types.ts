// 영속 작업 큐 runtime 타입(prototype). 운영 routes/cron/worker 에 연결하지 않는다.
// 값·상태의 권위는 shared/jobQueueContract.ts. 여기서는 runtime 동작 타입만 추가.
import type {
  JobStatus,
  ExecutionStatus,
  ExecutionReason,
  VerificationStatus,
  RequestVersionSnapshot,
  ActualVersionSnapshot,
  ArtifactSnapshot,
  ExecutorSnapshot,
} from "../../shared/jobQueueContract";

// pg.Client 와 PGlite 를 같은 모양으로 다루는 최소 인터페이스(각 worker = 독립 커넥션).
export interface QueueClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
  exec?(sql: string): Promise<void>;
}

export interface JobRow {
  id: string;
  owner_scope: string;
  project_id: string | null;
  job_type: string;
  status: JobStatus;
  priority: number;
  input_identity: unknown;
  request_version_snapshot: RequestVersionSnapshot;
  execution_options: unknown | null;
  execution_options_hash: string;
  payload_hash: string;
  idempotency_key: string;
  parent_job_id: string | null;
  reprocess_reason: string | null;
  available_at: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
}

export interface ExecutionRow {
  id: string;
  job_id: string;
  attempt_number: number;
  execution_reason: ExecutionReason;
  status: ExecutionStatus;
  worker_id: string | null;
  lease_token_hash: string | null;
  leased_at: string | null;
  lease_expires_at: string | null;
  heartbeat_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  actual_version_snapshot: ActualVersionSnapshot | null;
  artifact_snapshot: ArtifactSnapshot | null;
  executor_snapshot: ExecutorSnapshot | null;
  manifest_uri: string | null;
  manifest_artifact_hash: string | null;
  error_code: string | null;
  error_summary: string | null;
  verification_status: VerificationStatus | null;
  created_at: string;
}

// claim 성공 시 반환. raw lease token 은 이 반환값에만 존재 — DB/로그/manifest 저장 금지.
export interface ClaimResult {
  job: JobRow;
  executionId: string;
  attemptNumber: number;
  rawLeaseToken: string; // 절대 저장 금지(호출자 메모리 전용)
  leaseExpiresAt: string;
  adapterInput: {
    jobType: string;
    inputIdentity: unknown;
    executionOptions: unknown | null;
    requestVersionSnapshot: RequestVersionSnapshot;
  };
}

// 실패 분류(§9). 자동 retry 여부·목표 job 상태가 분류로 결정된다.
export type FailureClass = "transient" | "permanent" | "ambiguous-side-effect";

// worker 가 완료 시 제출하는 결과.
export interface CompletionInput {
  actualVersionSnapshot: ActualVersionSnapshot;
  artifactSnapshot: ArtifactSnapshot;
  executorSnapshot: ExecutorSnapshot;
  manifestUri?: string | null;
  manifestArtifactHash?: string | null; // 검증 필수 아티팩트 무결성 대조
  verificationStatus: VerificationStatus;
}

export type {
  JobStatus,
  ExecutionStatus,
  ExecutionReason,
  VerificationStatus,
  RequestVersionSnapshot,
  ActualVersionSnapshot,
  ArtifactSnapshot,
  ExecutorSnapshot,
};
