// 영속 작업 큐 상태·snapshot 계약의 단일 소스(2단계 동결 계약).
// ⚠️ 타입·validator 만. claim·retry·worker·API·DB write 구현 없음(이번 커밋 범위). status 컬럼은 text 이므로 값의 권위는 여기.

// ── 상태 값 ──
export const JOB_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled", "blocked", "needs_review"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const JOB_TERMINAL_STATUSES = ["succeeded", "failed", "cancelled"] as const;

export const EXECUTION_STATUSES = ["claimed", "running", "succeeded", "failed", "expired", "cancelled", "verification_failed"] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];
export const EXECUTION_ACTIVE_STATUSES = ["claimed", "running"] as const; // 부분유일·reaper 대상

export const EXECUTION_REASONS = ["normal", "retry", "forced-rerun"] as const;
export type ExecutionReason = (typeof EXECUTION_REASONS)[number];

export const VERIFICATION_STATUSES = ["pending", "passed", "failed", "skipped"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

const setOf = (a: readonly string[]) => new Set(a);
const JOB_SET = setOf(JOB_STATUSES), EXEC_SET = setOf(EXECUTION_STATUSES), REASON_SET = setOf(EXECUTION_REASONS), VERIF_SET = setOf(VERIFICATION_STATUSES);
export const isJobStatus = (v: unknown): v is JobStatus => typeof v === "string" && JOB_SET.has(v);
export const isExecutionStatus = (v: unknown): v is ExecutionStatus => typeof v === "string" && EXEC_SET.has(v);
export const isExecutionReason = (v: unknown): v is ExecutionReason => typeof v === "string" && REASON_SET.has(v);
export const isVerificationStatus = (v: unknown): v is VerificationStatus => typeof v === "string" && VERIF_SET.has(v);

// succeeded 로 전환 가능한 조건: 검증 필수 jobType 은 passed 만, 비필수는 skipped 도 허용(정책 registry).
export function jobSucceededAllowed(verification: VerificationStatus, verificationRequired: boolean): boolean {
  return verification === "passed" || (!verificationRequired && verification === "skipped");
}

// ── snapshot schemaVersion (JSON 문서 구조 버전; pipeline/normalization/correctionEngine 버전과 별개) ──
export const SNAPSHOT_SCHEMA_VERSION = 1;

// ── priority 범위(0–1000, 작을수록 우선) ──
export const PRIORITY = { min: 0, max: 1000, default: 100, systemUrgent: [0, 49], adminHigh: [50, 99], normal: 100, lowBatch: [101, 1000] } as const;
export function isValidPriority(p: unknown): p is number {
  return typeof p === "number" && Number.isInteger(p) && p >= PRIORITY.min && p <= PRIORITY.max;
}

// ── SHA-256 lowercase hex validator (idempotency_key·payload_hash·lease_token_hash 등 varchar(64)) ──
const SHA256_RE = /^[0-9a-f]{64}$/;
export const isSha256Hex = (v: unknown): v is string => typeof v === "string" && SHA256_RE.test(v);

// ── error_summary 제한(시스템 요약만; 원문·stack·고객값 금지) ──
export const ERROR_SUMMARY_MAX = 1000;
export const isValidErrorSummary = (v: unknown): boolean => v == null || (typeof v === "string" && v.length <= ERROR_SUMMARY_MAX);

// ── snapshot 타입(미사용 슬롯 = null; 빈문자열 금지) ──
export type RequestVersionSnapshot = {
  schemaVersion: number;
  pipelineVersion: string | null;
  transcriptionEngineVersion: string | null;
  transcriptionEngineHash: string | null;
  dictionaryVersion: string | null;
  normalizationVersion: number | null;
  correctionEngineVersion: string | null;
  correctionEngineHash: string | null;
  executorRequirement: string | null;
  projectSpecific?: Record<string, unknown> | null;
};
export type ActualVersionSnapshot = Omit<RequestVersionSnapshot, "executorRequirement">;
export type ArtifactSnapshotItem = {
  artifactType: string;
  uri: string;                 // 고객 식별정보 포함 금지
  byteHash: string;
  contentHash: string | null;
  sizeBytes: number | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
};
export type ArtifactSnapshot = {
  inputAssetHash: string | null;
  learnedExportArtifactHash: string | null;
  resultArtifactHash: string | null;
  contentHash: string | null;
  projectSpecificArtifacts?: ArtifactSnapshotItem[] | null;
  // manifestArtifactHash 는 전용 컬럼(job_executions.manifest_artifact_hash) — 여기 중복 저장 안 함.
};
export type ExecutorSnapshot = {
  executorType: string;
  executorVersion: string;
  runtimeVersion: string | null;
  workerIdentity: string | null;
  environmentFingerprint: string | null; // 해시/식별자만(환경변수 원문·비밀값 금지)
};

// snapshot 정규화 규칙: 미사용 슬롯은 반드시 null(빈문자열 금지).
export function assertNoEmptyString(obj: Record<string, unknown>, at = "snapshot"): void {
  for (const [k, v] of Object.entries(obj)) {
    if (v === "") throw new Error(`${at}.${k}: 빈문자열 금지(미사용은 null)`);
  }
}
