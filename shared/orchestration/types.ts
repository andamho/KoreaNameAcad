// cross-agent orchestration 계약 — 타입/enum(설계 전용, 운영 배선 없음).
// 최상위 원칙: 모든 파이프라인은 시스템이 AI 간 작업·결과·검토를 자동 연결, 운영자는 정답 확정+최종 승인만.
// GPT/Claude 결과 교환은 채팅 복사가 아니라 versioned artifact + job dependency 로.

// ── job dependency ──
export const DEPENDENCY_TYPES = [
  "requires-success", "requires-approved-review", "requires-human-approval",
  "supersedes", "retry-of", "correction-of",
] as const;
export type DependencyType = (typeof DEPENDENCY_TYPES)[number];

export const DEPENDENCY_RESOLUTION = ["pending", "resolved", "failed", "cancelled"] as const;
export type DependencyResolution = (typeof DEPENDENCY_RESOLUTION)[number];

export interface JobDependency {
  jobId: string;
  dependsOnJobId: string;
  dependencyType: DependencyType;
  requiredArtifactKind: string | null; // ArtifactKind, null=성공만 요구
  requiredArtifactSchemaVersion: number | null; // version pinning(오래된 artifact 오소비 방지)
  resolutionStatus: DependencyResolution;
  resolvedExecutionId: string | null;
  resolvedArtifactId: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

// ── artifact handoff ──
export const ARTIFACT_KINDS = [
  "transcription-source", "corrected-transcript", "transcription-diff", "error-analysis",
  "correction-rule-proposal", "code-change-plan", "code-test-result", "automated-review",
  "human-approval-request", "release-manifest",
] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export const SENSITIVITY_CLASSES = ["public", "internal", "confidential", "customer-sensitive", "secret"] as const;
export type SensitivityClass = (typeof SENSITIVITY_CLASSES)[number];
export const REDACTION_STATUS = ["not-required", "redacted", "protected-reference", "pending"] as const;
export type RedactionStatus = (typeof REDACTION_STATUS)[number];

// artifact 는 immutable. 원문 대신 protected reference/hash. secret 저장 금지.
export interface ArtifactManifest {
  artifactId: string;
  producerJobId: string;
  producerExecutionId: string;
  artifactKind: ArtifactKind;
  schemaVersion: number;
  contentHash: string; // sha256
  manifestHash: string; // sha256(구성요소)
  contentLocation: string | null; // 비민감 경로/URI(고객 식별정보 금지)
  protectedReference: string | null; // 민감건 = HMAC ref
  sensitivityClass: SensitivityClass;
  redactionStatus: RedactionStatus;
  createdAt: string;
  immutable: true;
  lineageParentArtifactIds: string[];
  expiresAt: string | null;
}

// ── 실행 결과 오류 분류(공통) ──
export const ORCHESTRATION_ERROR_CODES = [
  // adapter/provider
  "transient-provider-error", "rate-limited", "timeout", "invalid-output-schema",
  "sensitive-data-policy-failure", "dependency-missing", "artifact-integrity-failure",
  "budget-exceeded", "permanent-model-error",
  // Claude/코드 실행
  "out-of-scope-write", "base-commit-drift", "secret-access-attempt", "unauthorized-db-write",
  "force-push-attempt", "unauthorized-deploy", "unauthorized-migration", "tests-not-run",
  "empty-result",
  // orchestration
  "cycle-detected", "version-pin-mismatch", "stale-execution", "duplicate-next-job",
  "retry-limit-exceeded", "correction-limit-exceeded", "approval-ambiguous",
  "provenance-incomplete", "emergency-stopped",
] as const;
export type OrchestrationErrorCode = (typeof ORCHESTRATION_ERROR_CODES)[number];

// ── budget(job 정책) ──
export interface JobBudget {
  maxPromptTokens: number | null;
  maxCompletionTokens: number | null;
  maxTotalTokens: number | null;
  maxCostUsd: number | null;
  maxExecutionSeconds: number | null;
  maxToolCalls: number | null;
  maxRetries: number;
  maxCorrections: number;
  maxArtifactBytes: number | null;
}

// ── GPT adapter 계약 ──
export interface GptAdapterInput {
  jobSnapshot: unknown; // 불변 요청 스냅샷 참조
  dependencyArtifactManifests: ArtifactManifest[];
  allowedArtifactContentRefs: string[]; // 접근 허용 artifact(민감도 정책)
  modelPin: string; // 예: gpt-x, 고정
  systemInstructionVersion: string;
  budget: JobBudget;
  sensitivityPolicy: SensitivityClass; // 이 job 이 다룰 수 있는 최대 민감도
}
export interface GptAdapterOutput {
  structuredResult: unknown; // schema validation 통과 필수(자유텍스트만 금지)
  producedArtifactManifest: ArtifactManifest | null;
  reviewDecision: ReviewDecision | null; // 검토 job 이면
  analysisResult: unknown | null;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number; costUsd: number | null; executionSeconds: number };
  errorClassification: OrchestrationErrorCode | null;
  retryable: boolean;
  contentHash: string;
  modelVersionSnapshot: { model: string; systemInstructionVersion: string };
}

// ── Claude adapter 계약 ──
export interface ClaudeAdapterInput {
  instructionArtifactRef: string;
  repositoryReference: string; // owner/repo
  baseCommit: string;
  allowedFileScope: string[]; // glob
  forbiddenFileScope: string[];
  testCommandAllowlist: string[];
  writePermissionPolicy: { operationalDbWrite: boolean; branchOnly: string | null; allowMigration: boolean };
  costTimeToolLimits: JobBudget;
  dependencyArtifactRefs: string[];
}
export interface ClaudeAdapterOutput {
  changedFileManifest: string[];
  diffHash: string | null;
  commitHash: string | null;
  testsExecuted: string[];
  testResults: { passed: number; failed: number } | null;
  producedArtifactManifests: ArtifactManifest[];
  policyViolations: OrchestrationErrorCode[];
  executionLogsReference: string; // 원문 아님(보안 로그 ref)
  finalStatus: "succeeded" | "failed" | "blocked";
  retryable: boolean;
}

// ── automated review ──
export const REVIEW_DECISIONS = ["approve", "revise", "reject", "human-review"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];
export const SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

export interface AutomatedReviewResult {
  decision: ReviewDecision;
  findings: { code: string; severity: Severity; failedInvariant?: string | null }[]; // 원문 없음
  failedInvariants: string[];
  regressionResults: { passed: number; failed: number } | null;
  evidenceArtifactIds: string[];
  correctionInstructions: string | null; // revise 시 correction artifact 로
  nextJobKind: string | null;
  humanApprovalRequired: boolean;
  reviewerVersion: string;
  reviewedExecutionId: string;
  reviewedArtifactHash: string;
}

// ── human approval ──
export const HUMAN_APPROVAL_STATES = [
  "not-required", "awaiting-approval", "approved", "rejected", "revision-requested", "expired", "cancelled",
] as const;
export type HumanApprovalState = (typeof HUMAN_APPROVAL_STATES)[number];

// 승인 화면(원문 민감정보 제외 evidence 만)
export interface HumanApprovalRequest {
  jobId: string;
  purpose: string;
  changeSummary: string;
  verificationResults: unknown;
  riskItems: string[];
  costAndExecutionCount: { costUsd: number | null; executionCount: number };
  applyImpact: string;
  rollbackMethod: string;
  evidenceArtifactIds: string[]; // 민감 원문 제외
  state: HumanApprovalState;
}

// ── audit log(append-only) ──
export interface AuditLogEntry {
  at: string;
  actor: string; // "system"|"gpt-adapter"|"claude-adapter"|"reviewer"|"human:<id-hash>"
  action: string; // job-created·dependency-resolved·artifact-consumed·artifact-produced·review-decided·human-approved·retry·correction·emergency-stop 등
  jobId: string | null;
  executionId: string | null;
  artifactIds: string[];
  modelToolVersion: string | null;
  errorCode: OrchestrationErrorCode | null;
}

// ── emergency stop ──
export const STOP_SCOPES = [
  "global", "pipeline-kind", "adapter", "customer-source", "promotion", "write-action",
] as const;
export type StopScope = (typeof STOP_SCOPES)[number];
export interface EmergencyStop {
  scope: StopScope;
  target: string | null; // pipeline-kind/adapter/source 식별(민감값 아님)
  active: boolean;
  reasonCode: string;
  engagedAt: string;
  releasedAt: string | null; // 수동 해제 전 자동 재개 금지
}
