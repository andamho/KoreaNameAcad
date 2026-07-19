// shadow observation(관측) 모델 — 안 B: 별도 job_shadow_previews 에 저장(운영 jobs 아님).
// ⚠️ 이번 Gate = 계약·격리 prototype 만. 운영 DB write·schema.ts·migration 파일 없음. worker 구조적 claim 불가.
// 과거 report 행에 대한 preview 는 "현재 코드로 재표현한 prospective candidate"이지 과거 실행 identity 증명이 아니다.
import type { RequestVersionSnapshot } from "../../../shared/jobQueueContract";
import { canonicalStringify, sha256Hex } from "../idempotency";
import type { InternalReportQueuePreview } from "./internalReportPreview";

export const SHADOW_PREVIEW_SCHEMA_VERSION = 1;

// renderer 실행 provenance. library version 이 repo 에 고정 안 되면 provenanceComplete=false → worker 승격 금지.
export interface RendererProvenance {
  rendererLibrary: string; // 예: pymupdf
  rendererLibraryVersion: string | null; // repo 고정값. null 이면 재현성 불완전
}

export interface ShadowObservationInput {
  sourceDomain: string; // "internal-report"
  sourceRecordRef: string; // 안전한 내부 참조(raw id 아님 — 호출자가 keyed HMAC/hash 로 변환. 비밀키는 코드에 없음)
  preview: InternalReportQueuePreview;
  sourceStatus: string; // report_matches.status
  provenance: RendererProvenance;
  observedPipelineHash: string | null; // 관측 시점 pipeline manifest hash
  observedAt: string; // ISO(호출자 주입, Date.now 사용 안 함)
}

export interface ShadowObservation {
  previewSchemaVersion: number;
  sourceDomain: string;
  sourceRecordRef: string;
  jobType: string;
  ownerScope: string;
  projectId: string | null;
  // ⚠️ prospective — 현재 queue 계약으로 변환한 candidate identity. 과거 실행 identity 증명 아님.
  prospectiveIdempotencyKey: string | null;
  payloadHash: string | null;
  executionOptionsHash: string | null;
  requestVersionSnapshot: RequestVersionSnapshot | null;
  observedPipelineHash: string | null;
  sourceStatus: string;
  validationStatus: "valid" | "invalid";
  validationErrorCodes: string[];
  provenanceComplete: boolean; // renderer lib version 고정 && pipeline hash 존재
  historicalExecutionVersionKnown: false; // 항상 false — 과거 실행 버전 미확인
  observedAt: string;
  observationHash: string; // dedup: 같은 source+prospective key+pipeline hash → 같은 값
}

export function buildShadowObservation(input: ShadowObservationInput): ShadowObservation {
  const p = input.preview;
  const provenanceComplete = input.provenance.rendererLibraryVersion != null && input.observedPipelineHash != null && p.valid;
  const observationHash = sha256Hex(canonicalStringify({
    sourceDomain: input.sourceDomain, sourceRecordRef: input.sourceRecordRef,
    prospectiveIdempotencyKey: p.idempotencyKey, observedPipelineHash: input.observedPipelineHash,
  }));
  return {
    previewSchemaVersion: SHADOW_PREVIEW_SCHEMA_VERSION,
    sourceDomain: input.sourceDomain, sourceRecordRef: input.sourceRecordRef,
    jobType: p.jobType, ownerScope: p.ownerScope, projectId: p.projectId,
    prospectiveIdempotencyKey: p.idempotencyKey, payloadHash: p.payloadHash, executionOptionsHash: p.executionOptionsHash,
    requestVersionSnapshot: p.requestVersionSnapshot, observedPipelineHash: input.observedPipelineHash,
    sourceStatus: input.sourceStatus,
    validationStatus: p.valid ? "valid" : "invalid",
    validationErrorCodes: p.validationErrors.map((e) => e.code),
    provenanceComplete, historicalExecutionVersionKnown: false,
    observedAt: input.observedAt, observationHash,
  };
}

// ── 격리 prototype 스키마(테스트 전용, migrations/ 아님·schema.ts 아님) ──
// worker queue 와 물리적 분리: jobs/job_executions FK 없음, claim index 없음, execution 관계 없음.
// 원문·URI·경로 컬럼 없음. 같은 source+prospective key+pipeline hash 중복 관측 방지(UNIQUE observation_hash).
export const SHADOW_PROTOTYPE_DDL = `
CREATE TABLE job_shadow_previews (
  id                          varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  preview_schema_version      integer NOT NULL,
  source_domain               text NOT NULL,
  source_record_ref           text NOT NULL,          -- keyed HMAC/hash(raw id 아님)
  job_type                    text NOT NULL,
  owner_scope                 text NOT NULL,
  project_id                  text,
  prospective_idempotency_key varchar(64),
  payload_hash                varchar(64),
  execution_options_hash      varchar(64),
  request_version_snapshot    jsonb,
  observed_pipeline_hash      varchar(64),
  source_status               text NOT NULL,
  validation_status           text NOT NULL,
  validation_error_codes      jsonb NOT NULL DEFAULT '[]',
  provenance_complete         boolean NOT NULL,
  historical_execution_version_known boolean NOT NULL DEFAULT false,
  observed_at                 timestamptz NOT NULL,
  observation_hash            varchar(64) NOT NULL,
  created_at                  timestamptz NOT NULL DEFAULT now()
);
-- 중복 관측 방지(같은 source+prospective key+pipeline hash). queue claim 인덱스 아님.
CREATE UNIQUE INDEX job_shadow_previews_observation_uq ON job_shadow_previews (observation_hash);
CREATE INDEX job_shadow_previews_source_idx ON job_shadow_previews (source_domain, source_record_ref);
`;
