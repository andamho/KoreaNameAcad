// 순수 retry/correction policy — 실행 이력 → 다음 동작 분류. 무한 루프 차단·budget fail-closed(설계 로직).
//   retry: 동일 작업·동일 입력·일시 실패 복구 → 새 execution.
//   correction: 논리/품질 검토 실패 → correction instruction artifact + 새 job(correction-of).
//   구분: retry 는 같은 job 새 execution, correction 은 새 job.
import type { OrchestrationErrorCode } from "../../shared/orchestration/types";

export type FailureClass = "transient" | "permanent" | "review-revise" | "budget" | "ambiguous";
export type PolicyAction = "retry" | "create-correction-job" | "human-review" | "fail";

// 권장 기본값(근거 포함, 운영 미적용 — jobType registry 확정 시 반영):
//   transient retry 최대 3(일시 provider 오류 회복 여유), correction loop 최대 3(수렴 시도 제한),
//   같은 failed invariant 2회 반복 → human-review(자동 수렴 실패 신호), budget 초과 → fail-closed.
export interface RetryCorrectionPolicy {
  maxRetries: number; // 권장 3
  maxCorrections: number; // 권장 3
  repeatedInvariantThreshold: number; // 권장 2
}
export const RECOMMENDED_POLICY: RetryCorrectionPolicy = { maxRetries: 3, maxCorrections: 3, repeatedInvariantThreshold: 2 };

export interface FailureContext {
  failureClass: FailureClass;
  attemptCount: number; // 지금까지의 execution 시도 수(이번 실패 포함)
  correctionCount: number; // 지금까지 correction 반복 수
  repeatedInvariantCount: number; // 동일 failed invariant 반복 횟수
  errorCode: OrchestrationErrorCode | null;
}

export interface PolicyDecision { action: PolicyAction; reasonCode: string }

export function classifyFailure(ctx: FailureContext, policy: RetryCorrectionPolicy = RECOMMENDED_POLICY): PolicyDecision {
  // 반복 동일 오류 → 자동 수렴 실패로 보고 사람 검토 승격(무한 루프 차단).
  if (ctx.repeatedInvariantCount >= policy.repeatedInvariantThreshold) return { action: "human-review", reasonCode: "repeated-failed-invariant" };

  switch (ctx.failureClass) {
    case "budget":
      // 한도 초과: 자동 축약·임의 모델 변경으로 진행 금지 → fail-closed(또는 human-review).
      return { action: "human-review", reasonCode: "budget-exceeded" };
    case "transient":
      return ctx.attemptCount < policy.maxRetries
        ? { action: "retry", reasonCode: "transient-retry" }
        : { action: "fail", reasonCode: "retry-limit-exceeded" };
    case "review-revise":
      return ctx.correctionCount < policy.maxCorrections
        ? { action: "create-correction-job", reasonCode: "revise-correction" }
        : { action: "human-review", reasonCode: "correction-limit-exceeded" };
    case "permanent":
      return { action: "fail", reasonCode: "permanent-error" };
    case "ambiguous":
      // 모호(외부 부작용 불명확 등) → 자동 재시도 금지, 사람 검토.
      return { action: "human-review", reasonCode: "ambiguous-outcome" };
  }
}
