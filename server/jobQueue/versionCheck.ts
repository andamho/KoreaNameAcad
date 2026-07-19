// 버전 snapshot 검문(§12) — claim 이후 adapter 실행 전에 request↔actual 을 비교.
// 불일치 필드명만 반환(값 원문 금지). 불일치면 adapter 실행 금지 → execution verification_failed, job blocked/needs_review.
// ⚠️ correct.py 내부 hash 형식 검증과 worker 실제 manifest hash 비교는 다른 층 — 혼동 금지.
import type { RequestVersionSnapshot, ActualVersionSnapshot } from "../../shared/jobQueueContract";

// request 에서 비교 대상 버전 필드(executorRequirement 는 요구사항이라 값 비교 대상 아님).
const COMPARE_FIELDS = [
  "pipelineVersion",
  "transcriptionEngineVersion",
  "transcriptionEngineHash",
  "dictionaryVersion",
  "normalizationVersion",
  "correctionEngineVersion",
  "correctionEngineHash",
] as const;

export function compareVersionSnapshots(
  request: RequestVersionSnapshot,
  actual: ActualVersionSnapshot,
): { match: boolean; mismatchedFields: string[] } {
  const mismatchedFields: string[] = [];
  for (const f of COMPARE_FIELDS) {
    if ((request as any)[f] !== (actual as any)[f]) mismatchedFields.push(f);
  }
  // executorRequirement 는 actual.executorSnapshot 과 별도로 대조(여기서는 값 비교 필드에서 제외).
  return { match: mismatchedFields.length === 0, mismatchedFields };
}
