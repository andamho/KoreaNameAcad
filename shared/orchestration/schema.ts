// cross-agent orchestration — zod 스키마(설계 검증용). 자유텍스트만 반환하는 adapter 금지:
// GPT/Claude 출력은 이 스키마를 통과해야 다음 job 생성 가능(fail-closed).
import { z } from "zod";
import {
  DEPENDENCY_TYPES, DEPENDENCY_RESOLUTION, ARTIFACT_KINDS, SENSITIVITY_CLASSES, REDACTION_STATUS,
  ORCHESTRATION_ERROR_CODES, REVIEW_DECISIONS, SEVERITIES, HUMAN_APPROVAL_STATES, STOP_SCOPES,
} from "./types";

const sha256 = z.string().regex(/^[0-9a-f]{64}$/, "sha256 lowercase hex");
const iso = z.string().min(1);

export const JobBudgetSchema = z.object({
  maxPromptTokens: z.number().int().positive().nullable(),
  maxCompletionTokens: z.number().int().positive().nullable(),
  maxTotalTokens: z.number().int().positive().nullable(),
  maxCostUsd: z.number().nonnegative().nullable(),
  maxExecutionSeconds: z.number().int().positive().nullable(),
  maxToolCalls: z.number().int().nonnegative().nullable(),
  maxRetries: z.number().int().min(0).max(10),
  maxCorrections: z.number().int().min(0).max(10),
  maxArtifactBytes: z.number().int().positive().nullable(),
});

export const ArtifactManifestSchema = z.object({
  artifactId: z.string().min(1),
  producerJobId: z.string().min(1),
  producerExecutionId: z.string().min(1),
  artifactKind: z.enum(ARTIFACT_KINDS),
  schemaVersion: z.number().int().positive(),
  contentHash: sha256,
  manifestHash: sha256,
  contentLocation: z.string().nullable(),
  protectedReference: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  sensitivityClass: z.enum(SENSITIVITY_CLASSES),
  redactionStatus: z.enum(REDACTION_STATUS),
  createdAt: iso,
  immutable: z.literal(true),
  lineageParentArtifactIds: z.array(z.string()),
  expiresAt: iso.nullable(),
}).superRefine((a, ctx) => {
  // secret 은 artifact content 로 저장 금지(location 있으면 위반)
  if (a.sensitivityClass === "secret" && a.contentLocation) ctx.addIssue({ code: "custom", message: "secret content 저장 금지" });
  // customer-sensitive 는 원문 location 대신 protected reference 필요
  if (a.sensitivityClass === "customer-sensitive" && !a.protectedReference && a.redactionStatus !== "redacted")
    ctx.addIssue({ code: "custom", message: "customer-sensitive 는 protected reference/redaction 필요" });
});

export const JobDependencySchema = z.object({
  jobId: z.string().min(1),
  dependsOnJobId: z.string().min(1),
  dependencyType: z.enum(DEPENDENCY_TYPES),
  requiredArtifactKind: z.enum(ARTIFACT_KINDS).nullable(),
  requiredArtifactSchemaVersion: z.number().int().positive().nullable(),
  resolutionStatus: z.enum(DEPENDENCY_RESOLUTION),
  resolvedExecutionId: z.string().nullable(),
  resolvedArtifactId: z.string().nullable(),
  createdAt: iso,
  resolvedAt: iso.nullable(),
}).refine((d) => d.jobId !== d.dependsOnJobId, "self-dependency 금지");

export const AutomatedReviewResultSchema = z.object({
  decision: z.enum(REVIEW_DECISIONS),
  findings: z.array(z.object({ code: z.string().min(1), severity: z.enum(SEVERITIES), failedInvariant: z.string().nullable().optional() })),
  failedInvariants: z.array(z.string()),
  regressionResults: z.object({ passed: z.number().int().min(0), failed: z.number().int().min(0) }).nullable(),
  evidenceArtifactIds: z.array(z.string()),
  correctionInstructions: z.string().nullable(),
  nextJobKind: z.string().nullable(),
  humanApprovalRequired: z.boolean(),
  reviewerVersion: z.string().min(1),
  reviewedExecutionId: z.string().min(1),
  reviewedArtifactHash: sha256,
}).superRefine((r, ctx) => {
  if (r.decision === "revise" && !r.correctionInstructions) ctx.addIssue({ code: "custom", message: "revise 는 correctionInstructions 필요" });
  if (r.decision === "approve" && r.failedInvariants.length) ctx.addIssue({ code: "custom", message: "approve 인데 failedInvariants 존재" });
});

export const GptAdapterOutputSchema = z.object({
  structuredResult: z.unknown(),
  producedArtifactManifest: ArtifactManifestSchema.nullable(),
  reviewDecision: z.enum(REVIEW_DECISIONS).nullable(),
  analysisResult: z.unknown().nullable(),
  usage: z.object({ promptTokens: z.number().int().min(0), completionTokens: z.number().int().min(0), totalTokens: z.number().int().min(0), costUsd: z.number().nonnegative().nullable(), executionSeconds: z.number().min(0) }),
  errorClassification: z.enum(ORCHESTRATION_ERROR_CODES).nullable(),
  retryable: z.boolean(),
  contentHash: sha256,
  modelVersionSnapshot: z.object({ model: z.string().min(1), systemInstructionVersion: z.string().min(1) }),
});

export const ClaudeAdapterOutputSchema = z.object({
  changedFileManifest: z.array(z.string()),
  diffHash: sha256.nullable(),
  commitHash: z.string().nullable(),
  testsExecuted: z.array(z.string()),
  testResults: z.object({ passed: z.number().int().min(0), failed: z.number().int().min(0) }).nullable(),
  producedArtifactManifests: z.array(ArtifactManifestSchema),
  policyViolations: z.array(z.enum(ORCHESTRATION_ERROR_CODES)),
  executionLogsReference: z.string().min(1),
  finalStatus: z.enum(["succeeded", "failed", "blocked"]),
  retryable: z.boolean(),
}).superRefine((o, ctx) => {
  // 테스트 미실행/결과 없는 성공 금지
  if (o.finalStatus === "succeeded" && (!o.testResults || o.testsExecuted.length === 0)) ctx.addIssue({ code: "custom", message: "테스트 미실행 성공 금지" });
  if (o.finalStatus === "succeeded" && o.testResults && o.testResults.failed > 0) ctx.addIssue({ code: "custom", message: "테스트 실패인데 성공 금지" });
  if (o.finalStatus === "succeeded" && o.policyViolations.length) ctx.addIssue({ code: "custom", message: "정책 위반인데 성공 금지" });
});

export const HumanApprovalStateSchema = z.enum(HUMAN_APPROVAL_STATES);
export const StopScopeSchema = z.enum(STOP_SCOPES);

// 검증 헬퍼 — {ok, errors(경로·메시지만, 값 원문 없음)}.
export function validate<T>(schema: z.ZodType<T>, value: unknown): { ok: true; value: T } | { ok: false; errors: string[] } {
  const r = schema.safeParse(value);
  if (r.success) return { ok: true, value: r.data };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
}
