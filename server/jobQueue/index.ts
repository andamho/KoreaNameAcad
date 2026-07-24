// jobQueue runtime prototype — public barrel(RC). ⚠️ 운영 routes/cron/worker entrypoint 에 연결하지 않는다
// (adapter integration 은 별도 Gate). 이 barrel 은 RC 공개 표면만 노출한다.
//
// 비공개(테스트/내부 전용 — 필요 시 하위 경로에서 직접 import):
//   - adapters/internalReport(internalReportAdapter): 프로토타입/테스트 전용 adapter
//   - leaseToken(generateLeaseToken 등): 내부 helper(claim 이 직접 사용)
//   - forced-rerun 실행: 미지원(requestForcedRerun 은 명시적 오류만)

// 상태·snapshot·타입
export * from "./types";
// jobType 정책 레지스트리(조회)
export { jobTypePolicy, registeredJobTypes, backoffSeconds } from "./registry";
export type { JobTypePolicy, SideEffectClass } from "./registry";
// error code 레지스트리
export { ERROR_CODES, isErrorCode, classOfErrorCode } from "./errorCodes";
export type { ErrorCode } from "./errorCodes";
// 멱등·canonical(shadow-preview 계산에도 필요)
export {
  canonicalStringify, sha256Hex, computeExecutionOptionsHash, computeIdempotencyKey,
  CanonicalizationError, IDEMPOTENCY_SCHEMA_VERSION,
} from "./idempotency";
export type { IdempotencyParts } from "./idempotency";
// version snapshot 검문
export { compareVersionSnapshots } from "./versionCheck";
// 상태 전이 연산(운영 배선은 별도 Gate)
export { createJob, HashIdentityMismatchError } from "./createJob";
export type { CreateJobInput, CreateJobResult } from "./createJob";
export { claimNextJob } from "./claim";
export { markRunning } from "./running";
export { heartbeat } from "./heartbeat";
export { completeExecution } from "./complete";
export type { CompleteOutcome, CompleteResult } from "./complete";
export { failExecution, markVersionMismatch } from "./fail";
export type { FailOutcome, FailResult } from "./fail";
export { reapExpired } from "./reaper";
export type { ReapSummary } from "./reaper";
// 조회·진단(읽기 전용)
export { getJob, getExecution, listExecutions, activeExecution, countByStatus } from "./repository";
export { inspectJobInvariant } from "./invariant";
export type { InvariantViolation, InvariantReport } from "./invariant";
// forced-rerun: 현 스키마 미지원(안 C) — 계약·오류만 공개
export { FORCED_RERUN_SUPPORTED, ForcedRerunUnsupportedError, requestForcedRerun } from "./rerun";
// adapter 인터페이스(계약)
export { AdapterError } from "./adapters/types";
export type { JobAdapter } from "./adapters/types";
export { makeEchoAdapter, makeFailingAdapter } from "./adapters/echoCompute";
// worker 실행 루프 + cooperative cancel + 전용 연결(런타임 배선)
export { processNextJob } from "./worker";
export type { ProcessResult, ProcessOutcome } from "./worker";
export { requestCancel, isCancelRequested, acknowledgeCancel } from "./cancel";
export { queueConnectionConfigured, acquireQueueClient, queueHostHash, QUEUE_URL_ENV } from "./connection";
// 관리자 작업목록 API(순수 함수)
export { listJobs, getJobDetail, requestJobCancel, type JobListItem, type JobDetail } from "./adminApi";
