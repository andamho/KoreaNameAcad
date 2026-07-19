// hardening 대상 orchestration 테이블(단일 소스).
export const SIX_TABLES = [
  "job_artifacts",
  "job_dependencies",
  "automated_reviews",
  "human_approvals",
  "orchestration_audit_log",
  "emergency_stops",
] as const;
