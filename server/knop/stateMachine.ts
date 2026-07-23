// 개명 여정 상태기계: 상담→새이름→개명신청→법원허가→후속 을 순서대로 전진(뒤로 안 감).
// 각 단계 진입 시 '다음 후속문자(템플릿)'와 권장 시점(일)을 안내.
import { KNOP_MILESTONE_ENTRY, knopStatusToMilestone } from "@shared/schema";
export type Stage = {
  status: string;
  followup?: { template: string; days: number }; // 이 단계 도달 후 예정 후속
};

// 주 여정(선형). 보류/연락중지/관리완료 등 분기·종료는 별도(updateProject)로 처리.
export const JOURNEY: Stage[] = [
  { status: "상담 신청" },
  { status: "상담예약 완료", followup: { template: "상담 예약 안내", days: 0 } },
  { status: "이름분석 상담 완료" },
  { status: "개명의뢰 접수" },
  { status: "개명비 결제완료" },
  { status: "이름작업 진행중" },
  { status: "새 이름 상담 예정", followup: { template: "새 이름 상담 안내", days: 0 } },
  { status: "새 이름 상담 완료" },
  { status: "개명 신청 안내 완료", followup: { template: "개명 신청 확인", days: 7 } },
  { status: "개명 신청 완료", followup: { template: "법원 허가 확인", days: 30 } },
  { status: "법원 허가 완료", followup: { template: "변화 확인", days: 30 } },
  { status: "변화 확인", followup: { template: "후기 요청", days: 7 } },
  { status: "후기 요청", followup: { template: "장기 안부", days: 180 } },
  { status: "장기관리" },
  { status: "관리 완료" },
];

// 파이프라인 보드용 5단계 (필수 흐름). 전화번호 작명은 선택 서비스라 선에서 빼고 별도 체크박스(customers.phoneNaming).
export const MILESTONES = ["상담", "새이름", "개명신청", "법적개명", "중간관리"];
// 마일스톤 클릭 시 그 단계로 진행할 대표 상태
// 보드 6단계 정의는 shared/schema.ts 하나로 통일(서버·고객목록·고객상세 공용).
export const MILESTONE_ENTRY = KNOP_MILESTONE_ENTRY as readonly string[];
export function statusToMilestone(status: string): number {
  return knopStatusToMilestone(status);
}

export function statusRank(status: string): number {
  return JOURNEY.findIndex((s) => s.status === status);
}
export function stageOf(status: string): Stage | null {
  const i = statusRank(status);
  return i >= 0 ? JOURNEY[i] : null;
}
export function nextStage(status: string): Stage | null {
  const i = statusRank(status);
  return i >= 0 && i + 1 < JOURNEY.length ? JOURNEY[i + 1] : null;
}
