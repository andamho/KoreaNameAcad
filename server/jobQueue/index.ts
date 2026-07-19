// jobQueue runtime prototype barrel. ⚠️ 이 모듈은 운영 routes/cron/worker entrypoint 에 연결하지 않는다
// (이번 Gate = 계약+prototype+격리 테스트만). 실제 배선은 별도 adapter integration Gate.
export * from "./types";
export * from "./registry";
export * from "./errorCodes";
export * from "./idempotency";
export * from "./leaseToken";
export * from "./versionCheck";
export * from "./createJob";
export * from "./claim";
export * from "./running";
export * from "./heartbeat";
export * from "./complete";
export * from "./fail";
export * from "./reaper";
export * from "./rerun";
export * from "./repository";
export * from "./invariant";
export { internalReportAdapter } from "./adapters/internalReport";
export { AdapterError, type JobAdapter } from "./adapters/types";
