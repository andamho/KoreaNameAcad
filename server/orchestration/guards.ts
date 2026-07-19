// 순수 fail-closed 가드(설계 로직) — 다음 job 자동 생성·운영 반영 전 검문. 위반 시 machine-readable code.
import type { EmergencyStop, StopScope, OrchestrationErrorCode } from "../../shared/orchestration/types";

// emergency stop: scope 별 정지. 활성 정지가 대상을 덮으면 신규 job 생성/반영 금지.
export interface StopContext { pipelineKind?: string | null; adapter?: string | null; customerSource?: string | null; isPromotion?: boolean; isWriteAction?: boolean }
export function isStopped(stops: EmergencyStop[], ctx: StopContext): { stopped: boolean; scopes: StopScope[] } {
  const scopes: StopScope[] = [];
  for (const s of stops) {
    if (!s.active) continue;
    if (s.scope === "global") scopes.push("global");
    else if (s.scope === "pipeline-kind" && s.target && s.target === ctx.pipelineKind) scopes.push("pipeline-kind");
    else if (s.scope === "adapter" && s.target && s.target === ctx.adapter) scopes.push("adapter");
    else if (s.scope === "customer-source" && s.target && s.target === ctx.customerSource) scopes.push("customer-source");
    else if (s.scope === "promotion" && ctx.isPromotion) scopes.push("promotion");
    else if (s.scope === "write-action" && ctx.isWriteAction) scopes.push("write-action");
  }
  return { stopped: scopes.length > 0, scopes };
}

// model/version pin 대조 — 실제 실행 model 이 job 이 고정한 pin 과 다르면 다음 job 생성 금지.
export function modelPinMatches(expectedModel: string, expectedInstructionVersion: string, actual: { model: string; systemInstructionVersion: string }): boolean {
  return actual.model === expectedModel && actual.systemInstructionVersion === expectedInstructionVersion;
}

// stale execution 결과 거부 — 검토가 참조한 artifact hash 가 현재와 다르면 거부(과거 결과 덮어쓰기 방지).
export function isStaleReview(reviewedArtifactHash: string, currentArtifactHash: string): boolean {
  return reviewedArtifactHash !== currentArtifactHash;
}

// 동일 dependency 로부터 중복 next-job 생성 방지 — (source dep, next kind, resolved artifact) idempotency.
export function nextJobIdempotencyKey(parts: { dependencyJobId: string; nextJobKind: string; resolvedArtifactId: string }): string {
  return `${parts.dependencyJobId}|${parts.nextJobKind}|${parts.resolvedArtifactId}`;
}
export function isDuplicateNextJob(existingKeys: Set<string>, key: string): boolean {
  return existingKeys.has(key);
}

// fail-closed 종합 검문(다음 job 생성/반영 전). 하나라도 위반이면 진행 금지.
export interface PreflightInput {
  dependencyMet: boolean; artifactHashOk: boolean; schemaValid: boolean; modelPinOk: boolean;
  baseCommitOk: boolean; testsPassed: boolean; sensitivityOk: boolean; withinBudget: boolean;
  withinRetryCorrectionLimit: boolean; approvalUnambiguous: boolean; noDuplicateIdempotency: boolean;
  leaseOwnershipClear: boolean; provenanceComplete: boolean; notStopped: boolean;
}
export function orchestrationPreflight(i: PreflightInput): { ok: boolean; codes: OrchestrationErrorCode[] } {
  const codes: OrchestrationErrorCode[] = [];
  if (!i.dependencyMet) codes.push("dependency-missing");
  if (!i.artifactHashOk) codes.push("artifact-integrity-failure");
  if (!i.schemaValid) codes.push("invalid-output-schema");
  if (!i.modelPinOk) codes.push("version-pin-mismatch");
  if (!i.baseCommitOk) codes.push("base-commit-drift");
  if (!i.testsPassed) codes.push("tests-not-run");
  if (!i.sensitivityOk) codes.push("sensitive-data-policy-failure");
  if (!i.withinBudget) codes.push("budget-exceeded");
  if (!i.withinRetryCorrectionLimit) codes.push("correction-limit-exceeded");
  if (!i.approvalUnambiguous) codes.push("approval-ambiguous");
  if (!i.noDuplicateIdempotency) codes.push("duplicate-next-job");
  if (!i.leaseOwnershipClear) codes.push("stale-execution");
  if (!i.provenanceComplete) codes.push("provenance-incomplete");
  if (!i.notStopped) codes.push("emergency-stopped");
  return { ok: codes.length === 0, codes };
}
