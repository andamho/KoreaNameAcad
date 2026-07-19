// shadow observation(관측) 모델 — 안 B: 별도 job_shadow_previews(운영 jobs 아님). 스키마=migrations/0003.
// ⚠️ 운영 DB write 없음(격리/테스트만). worker 구조적 claim 불가(jobs/execution FK 없음·claim index 없음).
// 과거 report 행 preview = "현재 코드로 재표현한 prospective candidate"(과거 실행 identity 증명 아님).
import type { RequestVersionSnapshot } from "../../../shared/jobQueueContract";
import { canonicalStringify, sha256Hex } from "../idempotency";
import type { InternalReportQueuePreview } from "./internalReportPreview";

export const SHADOW_PREVIEW_SCHEMA_VERSION = 1;

// 관측 종류(운영 write 대상 정책과 연결).
export type ObservationKind = "baseline" | "needs-review" | "new-ingest" | "version-change";

export interface RendererProvenance {
  rendererLibrary: string; // pymupdf
  rendererLibraryVersion: string | null; // repo 고정값(requirements-report-renderer.txt). null 이면 재현성 불완전
}

export interface ShadowObservationInput {
  sourceDomain: string; // "internal-report"
  sourceRecordRef: string; // keyed HMAC(raw id 아님)
  sourceRefKeyVersion: string; // HMAC key version(예: v1)
  observationKind: ObservationKind;
  preview: InternalReportQueuePreview;
  sourceStatus: string;
  provenance: RendererProvenance;
  observedPipelineHash: string | null;
  observedAt: string; // ISO(주입, Date.now 미사용)
}

export interface ShadowObservation {
  previewSchemaVersion: number;
  sourceDomain: string;
  sourceRecordRef: string;
  sourceRefKeyVersion: string;
  observationKind: ObservationKind;
  jobType: string;
  ownerScope: string;
  projectId: string | null;
  prospectiveIdempotencyKey: string | null; // 과거 실행 증명 아님
  payloadHash: string | null;
  executionOptionsHash: string | null;
  requestVersionSnapshot: RequestVersionSnapshot | null;
  observedPipelineHash: string | null;
  rendererLibraryVersion: string | null;
  sourceStatus: string;
  validationStatus: "valid" | "invalid";
  validationErrorCodes: string[];
  provenanceComplete: boolean; // renderer lib version 고정 && pipeline hash && preview valid
  historicalExecutionVersionKnown: false; // 항상 false
  observedAt: string;
  observationHash: string; // dedup(observedAt·id 제외 canonical)
}

// observation_hash canonical: 같은 관측 dedup, 다음 변화는 새 observation.
//   pipeline hash / source status / prospective key / provenance complete / validation status / observationKind / key version 변경 → 새 row.
//   제외: observedAt · DB id · 로그 정보.
export function computeObservationHash(o: {
  previewSchemaVersion: number; sourceDomain: string; sourceRecordRef: string; sourceRefKeyVersion: string;
  prospectiveIdempotencyKey: string | null; observedPipelineHash: string | null; sourceStatus: string;
  validationStatus: string; provenanceComplete: boolean; observationKind: ObservationKind;
}): string {
  return sha256Hex(canonicalStringify({
    previewSchemaVersion: o.previewSchemaVersion, sourceDomain: o.sourceDomain,
    sourceRecordRef: o.sourceRecordRef, sourceRefKeyVersion: o.sourceRefKeyVersion,
    prospectiveIdempotencyKey: o.prospectiveIdempotencyKey, observedPipelineHash: o.observedPipelineHash,
    sourceStatus: o.sourceStatus, validationStatus: o.validationStatus,
    provenanceComplete: o.provenanceComplete, observationKind: o.observationKind,
  }));
}

export function buildShadowObservation(input: ShadowObservationInput): ShadowObservation {
  const p = input.preview;
  const provenanceComplete = input.provenance.rendererLibraryVersion != null && input.observedPipelineHash != null && p.valid;
  const validationStatus = p.valid ? "valid" : "invalid";
  const observationHash = computeObservationHash({
    previewSchemaVersion: SHADOW_PREVIEW_SCHEMA_VERSION, sourceDomain: input.sourceDomain,
    sourceRecordRef: input.sourceRecordRef, sourceRefKeyVersion: input.sourceRefKeyVersion,
    prospectiveIdempotencyKey: p.idempotencyKey, observedPipelineHash: input.observedPipelineHash,
    sourceStatus: input.sourceStatus, validationStatus, provenanceComplete, observationKind: input.observationKind,
  });
  return {
    previewSchemaVersion: SHADOW_PREVIEW_SCHEMA_VERSION, sourceDomain: input.sourceDomain,
    sourceRecordRef: input.sourceRecordRef, sourceRefKeyVersion: input.sourceRefKeyVersion,
    observationKind: input.observationKind, jobType: p.jobType, ownerScope: p.ownerScope, projectId: p.projectId,
    prospectiveIdempotencyKey: p.idempotencyKey, payloadHash: p.payloadHash, executionOptionsHash: p.executionOptionsHash,
    requestVersionSnapshot: p.requestVersionSnapshot, observedPipelineHash: input.observedPipelineHash,
    rendererLibraryVersion: input.provenance.rendererLibraryVersion,
    sourceStatus: input.sourceStatus, validationStatus, validationErrorCodes: p.validationErrors.map((e) => e.code),
    provenanceComplete, historicalExecutionVersionKnown: false, observedAt: input.observedAt, observationHash,
  };
}
