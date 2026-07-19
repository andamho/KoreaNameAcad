// read-only shadow observation 모니터 — 현재 report_matches(needs_review) 와 저장된 observation 을 메모리 비교.
// ⚠️ write 없음(INSERT/UPDATE/DELETE 금지). 신규 candidate·drift 만 집계. 원문·ID·hash 전체값 미출력.
import type { ShadowObservation } from "./shadowObservation";

// 저장된 observation 의 비교 대상 컬럼(원문 아님, 전부 hash/enum/bool).
export interface StoredObservationRow {
  source_record_ref: string;
  source_ref_key_version: string;
  observation_hash: string;
  prospective_idempotency_key: string;
  observed_pipeline_hash: string;
  source_status: string;
  validation_status: string;
  provenance_complete: boolean;
  renderer_library_version: string | null;
}

// drift = 같은 (source_record_ref, key version) 인데 다음 중 하나가 변경.
const DRIFT_FIELDS = [
  "prospectiveIdempotencyKey", "observedPipelineHash", "rendererLibraryVersion",
  "sourceStatus", "validationStatus", "provenanceComplete",
] as const;

export interface MonitorAggregate {
  selected: number; // needs_review report 수
  eligible: number; // observation 생성 가능(valid)
  invalid: number; // selected - eligible
  invalidCodes: string[]; // 사유 코드(원문 없음)
  alreadyObserved: number; // 저장된 observation_hash 일치
  unobservedEligible: number; // eligible 인데 저장 없음(신규 candidate)
  drift: number; // ref 존재하나 fields 변경
  driftFields: string[]; // 변경 필드명만(union, 값 없음)
  provenanceMismatch: number; // fresh provenanceComplete false(=invalid 로도 계수)
  duplicateExcluded: number; // needs_review 아닌(예: duplicate) report 수(참고, 대상 아님)
  write: false;
}

// fresh = buildTargetObservations 결과(eligible observations), codes = 그 실패 코드, selected = needs_review 총수.
export function compareShadowObservations(args: {
  selected: number;
  fresh: ShadowObservation[];
  invalidCodes: string[];
  stored: StoredObservationRow[];
  duplicateExcluded: number;
}): MonitorAggregate {
  const byRef = new Map<string, StoredObservationRow>();
  for (const s of args.stored) byRef.set(`${s.source_record_ref}:${s.source_ref_key_version}`, s);

  let alreadyObserved = 0, unobservedEligible = 0, drift = 0, provenanceMismatch = 0;
  const driftFields = new Set<string>();
  for (const o of args.fresh) {
    if (!o.provenanceComplete) provenanceMismatch++;
    const s = byRef.get(`${o.sourceRecordRef}:${o.sourceRefKeyVersion}`);
    if (!s) { unobservedEligible++; continue; }
    if (s.observation_hash === o.observationHash) { alreadyObserved++; continue; }
    // ref 존재·hash 상이 → drift. 변경 필드 판정(값 비교, 필드명만 수집).
    drift++;
    const cmp: Record<(typeof DRIFT_FIELDS)[number], boolean> = {
      prospectiveIdempotencyKey: s.prospective_idempotency_key !== o.prospectiveIdempotencyKey,
      observedPipelineHash: s.observed_pipeline_hash !== o.observedPipelineHash,
      rendererLibraryVersion: (s.renderer_library_version ?? null) !== (o.rendererLibraryVersion ?? null),
      sourceStatus: s.source_status !== o.sourceStatus,
      validationStatus: s.validation_status !== o.validationStatus,
      provenanceComplete: s.provenance_complete !== o.provenanceComplete,
    };
    for (const f of DRIFT_FIELDS) if (cmp[f]) driftFields.add(f);
  }
  return {
    selected: args.selected, eligible: args.fresh.length, invalid: Math.max(0, args.selected - args.fresh.length),
    invalidCodes: args.invalidCodes, alreadyObserved, unobservedEligible, drift, driftFields: Array.from(driftFields),
    provenanceMismatch, duplicateExcluded: args.duplicateExcluded, write: false,
  };
}
