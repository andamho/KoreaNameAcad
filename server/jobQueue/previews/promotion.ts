// shadow observation → 실제 jobs "승격" 계약. ⚠️ 승격은 UPDATE·row 복사가 아니라 새 createJob 호출이다.
// shadow table 에서 jobs 로 SQL 복사 금지. 이번 Gate 는 적격성 검문 계약만(DB write 없음, worker OFF).
import type { ShadowObservation } from "./shadowObservation";

export type PromotionBlockReason =
  | "VALIDATION_NOT_VALID"
  | "PROVENANCE_INCOMPLETE" // renderer lib version 미고정 등 → 재현성 불완전 → 실행 승격 금지
  | "KEY_RECOMPUTE_MISMATCH" // prospective key ≠ 승격 시점 재계산 key → identity 불안정
  | "SOURCE_STATUS_NOT_ELIGIBLE"; // terminal historical 등 정책상 대상 아님

export interface PromotionCheck {
  eligible: boolean;
  reasons: PromotionBlockReason[]; // 안정 코드만(민감정보 없음)
}

// recomputedIdempotencyKey = 승격 시점에 원본 입력으로 runtime computeIdempotencyKey 를 다시 돌린 값.
// (observation 에 저장된 prospective key 가 아니라, 현재 데이터/provenance 로 재계산한 값과 대조.)
export function checkShadowPromotion(
  obs: ShadowObservation,
  recomputedIdempotencyKey: string | null,
  opts: { sourceStatusEligible: boolean },
): PromotionCheck {
  const reasons: PromotionBlockReason[] = [];
  if (obs.validationStatus !== "valid") reasons.push("VALIDATION_NOT_VALID");
  if (!obs.provenanceComplete) reasons.push("PROVENANCE_INCOMPLETE");
  if (!obs.prospectiveIdempotencyKey || !recomputedIdempotencyKey || recomputedIdempotencyKey !== obs.prospectiveIdempotencyKey) {
    reasons.push("KEY_RECOMPUTE_MISMATCH");
  }
  if (!opts.sourceStatusEligible) reasons.push("SOURCE_STATUS_NOT_ELIGIBLE");
  return { eligible: reasons.length === 0, reasons };
}

// 승격 실행은 이 모듈이 하지 않는다. 적격이면 호출자가 runtime createJob(client, input) 를 새로 호출한다.
// (shadow row 는 감사 기록으로 유지, jobs 는 createJob 의 전역 UNIQUE(idempotency_key) 로 중복 방지.)
export const PROMOTION_EXECUTES_VIA = "createJob" as const;
