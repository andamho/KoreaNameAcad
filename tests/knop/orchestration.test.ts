// cross-agent orchestration 계약 검증(순수 로직·스키마, 운영 배선·외부 AI 호출 없음).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { resolveRunnable, detectCycleJobs, type ResolverInput } from "../../server/orchestration/dependencyResolver";
import { reviewTransition, humanApprovalTransition } from "../../server/orchestration/reviewReducer";
import { classifyFailure, RECOMMENDED_POLICY } from "../../server/orchestration/retryPolicy";
import { isStopped, modelPinMatches, isStaleReview, nextJobIdempotencyKey, isDuplicateNextJob, orchestrationPreflight } from "../../server/orchestration/guards";
import { validate, ArtifactManifestSchema, AutomatedReviewResultSchema, ClaudeAdapterOutputSchema, GptAdapterOutputSchema } from "../../shared/orchestration/schema";
import type { JobDependency, AutomatedReviewResult, ArtifactManifest, EmergencyStop } from "../../shared/orchestration/types";

const H = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const dep = (jobId: string, dependsOnJobId: string, over: Partial<JobDependency> = {}): JobDependency => ({
  jobId, dependsOnJobId, dependencyType: "requires-success", requiredArtifactKind: null, requiredArtifactSchemaVersion: null,
  resolutionStatus: "pending", resolvedExecutionId: null, resolvedArtifactId: null, createdAt: "t", resolvedAt: null, ...over,
});
const manifest = (over: Partial<ArtifactManifest> = {}): ArtifactManifest => ({
  artifactId: "a1", producerJobId: "j0", producerExecutionId: "e0", artifactKind: "error-analysis", schemaVersion: 1,
  contentHash: H("c"), manifestHash: H("m"), contentLocation: "ref://x", protectedReference: null,
  sensitivityClass: "internal", redactionStatus: "not-required", createdAt: "t", immutable: true, lineageParentArtifactIds: [], expiresAt: null, ...over,
});
const review = (over: Partial<AutomatedReviewResult> = {}): AutomatedReviewResult => ({
  decision: "approve", findings: [], failedInvariants: [], regressionResults: { passed: 1, failed: 0 }, evidenceArtifactIds: ["a1"],
  correctionInstructions: null, nextJobKind: "release", humanApprovalRequired: false, reviewerVersion: "r1", reviewedExecutionId: "e1", reviewedArtifactHash: H("c"), ...over,
});

describe("cross-agent orchestration contract", () => {
  test("1. dependency 전부 충족 → runnable", () => {
    const input: ResolverInput = { jobs: [{ jobId: "A", status: "succeeded" }, { jobId: "B", status: "queued" }], dependencies: [dep("B", "A")], artifacts: [], reviews: [], humanApprovals: [] };
    const r = resolveRunnable(input);
    assert.deepEqual(r.runnable, ["B"]); assert.equal(r.blocked.length, 0);
  });
  test("2. dependency 미충족(선행 미완료) → blocked", () => {
    const r = resolveRunnable({ jobs: [{ jobId: "A", status: "running" }, { jobId: "B", status: "queued" }], dependencies: [dep("B", "A")], artifacts: [], reviews: [], humanApprovals: [] });
    assert.equal(r.runnable.length, 0); assert.ok(r.blocked[0].reasons.includes("dependency-missing"));
  });
  test("3. dependency 실패 → blocked(fail-closed)", () => {
    const r = resolveRunnable({ jobs: [{ jobId: "A", status: "failed" }, { jobId: "B", status: "queued" }], dependencies: [dep("B", "A", { resolutionStatus: "failed" })], artifacts: [], reviews: [], humanApprovals: [] });
    assert.ok(r.blocked[0].reasons.includes("dependency-missing"));
  });
  test("4. 순환 dependency → cycle-detected", () => {
    const deps = [dep("A", "B"), dep("B", "A")];
    assert.ok(detectCycleJobs(deps).has("A") && detectCycleJobs(deps).has("B"));
    const r = resolveRunnable({ jobs: [{ jobId: "A", status: "queued" }, { jobId: "B", status: "queued" }], dependencies: deps, artifacts: [], reviews: [], humanApprovals: [] });
    assert.ok(r.blocked.every((b) => b.reasons.includes("cycle-detected")));
  });
  test("5. version pin mismatch → blocked", () => {
    const r = resolveRunnable({ jobs: [{ jobId: "A", status: "succeeded" }, { jobId: "B", status: "queued" }], dependencies: [dep("B", "A", { requiredArtifactKind: "error-analysis", requiredArtifactSchemaVersion: 2 })], artifacts: [{ artifactId: "a1", producerJobId: "A", artifactKind: "error-analysis", schemaVersion: 1 }], reviews: [], humanApprovals: [] });
    assert.ok(r.blocked[0].reasons.includes("version-pin-mismatch"));
  });
  test("6. required artifact 없음 → artifact-integrity-failure", () => {
    const r = resolveRunnable({ jobs: [{ jobId: "A", status: "succeeded" }, { jobId: "B", status: "queued" }], dependencies: [dep("B", "A", { requiredArtifactKind: "corrected-transcript" })], artifacts: [], reviews: [], humanApprovals: [] });
    assert.ok(r.blocked[0].reasons.includes("artifact-integrity-failure"));
  });
  test("7. requires-approved-review·requires-human-approval 게이트", () => {
    const base = { jobs: [{ jobId: "A", status: "succeeded" as const }, { jobId: "B", status: "queued" as const }], artifacts: [] };
    assert.equal(resolveRunnable({ ...base, dependencies: [dep("B", "A", { dependencyType: "requires-approved-review" })], reviews: [], humanApprovals: [] }).runnable.length, 0);
    assert.equal(resolveRunnable({ ...base, dependencies: [dep("B", "A", { dependencyType: "requires-approved-review" })], reviews: [{ jobId: "A", decision: "approve" }], humanApprovals: [] }).runnable.length, 1);
    assert.equal(resolveRunnable({ ...base, dependencies: [dep("B", "A", { dependencyType: "requires-human-approval" })], reviews: [], humanApprovals: [{ jobId: "A", state: "approved" }] }).runnable.length, 1);
  });
  test("8. review approve → release-dependency(human 불필요)", () => {
    const t = reviewTransition(review({ decision: "approve", humanApprovalRequired: false }));
    assert.equal(t.outcome, "release-dependency"); assert.equal(t.nextJobKind, "release");
  });
  test("9. review approve + humanApprovalRequired → await-human-approval(승인 전 반영 금지)", () => {
    assert.equal(reviewTransition(review({ decision: "approve", humanApprovalRequired: true })).outcome, "await-human-approval");
  });
  test("10. review revise → create-correction-job", () => {
    const t = reviewTransition(review({ decision: "revise", correctionInstructions: "fix", nextJobKind: "correction-logic-implementation" }));
    assert.equal(t.outcome, "create-correction-job"); assert.equal(t.humanApprovalState, "revision-requested");
  });
  test("11. review reject → stop-pipeline / human-review → await", () => {
    assert.equal(reviewTransition(review({ decision: "reject" })).outcome, "stop-pipeline");
    assert.equal(reviewTransition(review({ decision: "human-review" })).outcome, "await-human-approval");
  });
  test("12. human approval 전이: approve만 applyAllowed", () => {
    assert.deepEqual(humanApprovalTransition("awaiting-approval", "approve"), { next: "approved", applyAllowed: true });
    assert.equal(humanApprovalTransition("awaiting-approval", "reject").applyAllowed, false);
    assert.equal(humanApprovalTransition("approved", "approve").applyAllowed, false); // 대기 상태 아니면 전이 없음
  });
  test("13. retry 한도: transient attempts<max retry, 소진 fail", () => {
    assert.equal(classifyFailure({ failureClass: "transient", attemptCount: 1, correctionCount: 0, repeatedInvariantCount: 0, errorCode: null }).action, "retry");
    assert.equal(classifyFailure({ failureClass: "transient", attemptCount: 3, correctionCount: 0, repeatedInvariantCount: 0, errorCode: null }).action, "fail");
  });
  test("14. correction 한도·budget·permanent·ambiguous·반복오류", () => {
    assert.equal(classifyFailure({ failureClass: "review-revise", attemptCount: 1, correctionCount: 1, repeatedInvariantCount: 0, errorCode: null }).action, "create-correction-job");
    assert.equal(classifyFailure({ failureClass: "review-revise", attemptCount: 1, correctionCount: 3, repeatedInvariantCount: 0, errorCode: null }).action, "human-review");
    assert.equal(classifyFailure({ failureClass: "budget", attemptCount: 1, correctionCount: 0, repeatedInvariantCount: 0, errorCode: "budget-exceeded" }).action, "human-review");
    assert.equal(classifyFailure({ failureClass: "permanent", attemptCount: 1, correctionCount: 0, repeatedInvariantCount: 0, errorCode: null }).action, "fail");
    assert.equal(classifyFailure({ failureClass: "ambiguous", attemptCount: 1, correctionCount: 0, repeatedInvariantCount: 0, errorCode: null }).action, "human-review");
    assert.equal(classifyFailure({ failureClass: "transient", attemptCount: 1, correctionCount: 0, repeatedInvariantCount: 2, errorCode: null }).action, "human-review"); // 반복 오류 승격
  });
  test("15. artifact schema/hash·immutable·민감정보 검증", () => {
    assert.ok(validate(ArtifactManifestSchema, manifest()).ok);
    assert.ok(!validate(ArtifactManifestSchema, manifest({ contentHash: "nothex" as any })).ok, "hash mismatch");
    assert.ok(!validate(ArtifactManifestSchema, { ...manifest(), immutable: false } as any).ok, "immutable=true 필수");
    assert.ok(!validate(ArtifactManifestSchema, manifest({ sensitivityClass: "secret", contentLocation: "ref://x" })).ok, "secret content 금지");
    assert.ok(!validate(ArtifactManifestSchema, manifest({ sensitivityClass: "customer-sensitive", contentLocation: "ref://x", protectedReference: null, redactionStatus: "not-required" })).ok, "customer-sensitive protected 필요");
  });
  test("16. adapter 출력 schema: 결과 없는 성공·테스트 실패 성공 거부 / review 정합", () => {
    const okClaude = { changedFileManifest: ["a.ts"], diffHash: H("d"), commitHash: null, testsExecuted: ["test:knop"], testResults: { passed: 5, failed: 0 }, producedArtifactManifests: [], policyViolations: [], executionLogsReference: "log://x", finalStatus: "succeeded", retryable: false };
    assert.ok(validate(ClaudeAdapterOutputSchema, okClaude).ok);
    assert.ok(!validate(ClaudeAdapterOutputSchema, { ...okClaude, testsExecuted: [], testResults: null }).ok, "테스트 미실행 성공 금지");
    assert.ok(!validate(ClaudeAdapterOutputSchema, { ...okClaude, testResults: { passed: 4, failed: 1 } }).ok, "테스트 실패 성공 금지");
    assert.ok(!validate(AutomatedReviewResultSchema, review({ decision: "revise", correctionInstructions: null }) as any).ok, "revise correction 필요");
    assert.ok(!validate(AutomatedReviewResultSchema, review({ decision: "approve", failedInvariants: ["x"] }) as any).ok, "approve인데 failedInvariant");
  });
  test("17. emergency stop·model pin·stale·duplicate 가드", () => {
    const stops: EmergencyStop[] = [{ scope: "pipeline-kind", target: "call-transcription", active: true, reasonCode: "quality-hold", engagedAt: "t", releasedAt: null }];
    assert.ok(isStopped(stops, { pipelineKind: "call-transcription" }).stopped);
    assert.ok(!isStopped(stops, { pipelineKind: "internal-report" }).stopped);
    assert.ok(isStopped([{ scope: "global", target: null, active: true, reasonCode: "x", engagedAt: "t", releasedAt: null }], { pipelineKind: "anything" }).stopped);
    assert.ok(modelPinMatches("gpt-x", "v1", { model: "gpt-x", systemInstructionVersion: "v1" }) && !modelPinMatches("gpt-x", "v1", { model: "gpt-y", systemInstructionVersion: "v1" }));
    assert.ok(isStaleReview(H("old"), H("new")) && !isStaleReview(H("same"), H("same")));
    const k = nextJobIdempotencyKey({ dependencyJobId: "A", nextJobKind: "review", resolvedArtifactId: "a1" });
    assert.ok(isDuplicateNextJob(new Set([k]), k) && !isDuplicateNextJob(new Set(), k));
  });
  test("18. fail-closed preflight: 하나라도 위반이면 ok=false·코드", () => {
    const allOk = { dependencyMet: true, artifactHashOk: true, schemaValid: true, modelPinOk: true, baseCommitOk: true, testsPassed: true, sensitivityOk: true, withinBudget: true, withinRetryCorrectionLimit: true, approvalUnambiguous: true, noDuplicateIdempotency: true, leaseOwnershipClear: true, provenanceComplete: true, notStopped: true };
    assert.deepEqual(orchestrationPreflight(allOk), { ok: true, codes: [] });
    const bad = orchestrationPreflight({ ...allOk, testsPassed: false, notStopped: false });
    assert.ok(!bad.ok && bad.codes.includes("tests-not-run") && bad.codes.includes("emergency-stopped"));
  });
});
