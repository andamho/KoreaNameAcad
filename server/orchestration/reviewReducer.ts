// 순수 review transition reducer — automated review decision → 다음 동작. job 생성/실행 없음(설계 로직).
//   approve → 다음 dependency 해제(+ human 필요 시 approval 대기)
//   revise  → correction job 생성 의도(previous 와 correction-of 관계)
//   reject  → 파이프라인 중단
//   human-review → 서호님 승인 대기
import type { AutomatedReviewResult, HumanApprovalState } from "../../shared/orchestration/types";

export type ReviewOutcome = "release-dependency" | "create-correction-job" | "stop-pipeline" | "await-human-approval";
export interface ReviewTransition {
  outcome: ReviewOutcome;
  humanApprovalState: HumanApprovalState;
  nextJobKind: string | null;
  correctionInstructionsPresent: boolean;
}

export function reviewTransition(review: AutomatedReviewResult): ReviewTransition {
  switch (review.decision) {
    case "approve":
      // 승인이라도 humanApprovalRequired 면 운영 반영 전 사람 승인 대기(승인 전 반영 금지).
      return review.humanApprovalRequired
        ? { outcome: "await-human-approval", humanApprovalState: "awaiting-approval", nextJobKind: null, correctionInstructionsPresent: false }
        : { outcome: "release-dependency", humanApprovalState: "not-required", nextJobKind: review.nextJobKind, correctionInstructionsPresent: false };
    case "revise":
      return { outcome: "create-correction-job", humanApprovalState: "revision-requested", nextJobKind: review.nextJobKind ?? "correction", correctionInstructionsPresent: !!review.correctionInstructions };
    case "reject":
      return { outcome: "stop-pipeline", humanApprovalState: "rejected", nextJobKind: null, correctionInstructionsPresent: false };
    case "human-review":
      return { outcome: "await-human-approval", humanApprovalState: "awaiting-approval", nextJobKind: null, correctionInstructionsPresent: false };
  }
}

// 사람 승인 전이(승인/거절/보류만으로 다음 상태 결정 — raw log 해석·재시도 트리거 요구 금지).
export function humanApprovalTransition(current: HumanApprovalState, action: "approve" | "reject" | "request-revision" | "cancel" | "expire"):
  { next: HumanApprovalState; applyAllowed: boolean } {
  if (current !== "awaiting-approval") return { next: current, applyAllowed: false }; // 대기 상태에서만 전이
  switch (action) {
    case "approve": return { next: "approved", applyAllowed: true }; // 승인 후에만 운영 반영
    case "reject": return { next: "rejected", applyAllowed: false };
    case "request-revision": return { next: "revision-requested", applyAllowed: false };
    case "cancel": return { next: "cancelled", applyAllowed: false };
    case "expire": return { next: "expired", applyAllowed: false };
  }
}
