-- shadow preview 관측 테이블 (안 B) — 비파괴 additive migration.
-- 규칙: 새 테이블·인덱스만. 기존 테이블 DROP/ALTER/DML 없음. jobs/job_executions 상태·구조 무변경.
-- 적용: node --import tsx/esm server/migrate.ts 0003_create_job_shadow_previews   (기본 dry-run)
--   ⚠️ worker queue 와 물리 분리: jobs/job_executions/customer/consultation FK 없음·claim index 없음.
--   원문/URI/경로/고객값 컬럼 없음. source_record_ref = keyed HMAC(raw id 아님). 저장 대상 = valid observation.
--   UNIQUE(observation_hash) = 같은 source+key version+prospective key+pipeline hash+status+provenance+kind 중복 방지.

CREATE TABLE "job_shadow_previews" (
  "id"                                 varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "preview_schema_version"             integer     NOT NULL,
  "source_domain"                      text        NOT NULL,
  "source_record_ref"                  varchar(64) NOT NULL,
  "source_ref_key_version"             text        NOT NULL,
  "observation_kind"                   text        NOT NULL,
  "job_type"                           text        NOT NULL,
  "owner_scope"                        text        NOT NULL,
  "project_id"                         varchar,
  "prospective_idempotency_key"        varchar(64) NOT NULL,
  "payload_hash"                       varchar(64) NOT NULL,
  "execution_options_hash"             varchar(64) NOT NULL,
  "request_version_snapshot"           jsonb       NOT NULL,
  "observed_pipeline_hash"             varchar(64) NOT NULL,
  "renderer_library_version"           text,
  "source_status"                      text        NOT NULL,
  "validation_status"                  text        NOT NULL,
  "validation_error_codes"             jsonb       NOT NULL DEFAULT '[]',
  "provenance_complete"                boolean     NOT NULL,
  "historical_execution_version_known" boolean     NOT NULL DEFAULT false,
  "observed_at"                        timestamptz NOT NULL DEFAULT now(),
  "observation_hash"                   varchar(64) NOT NULL,
  "created_at"                         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "job_shadow_previews_source_ref_hex"   CHECK ("source_record_ref" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "job_shadow_previews_prospective_hex"  CHECK ("prospective_idempotency_key" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "job_shadow_previews_payload_hex"      CHECK ("payload_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "job_shadow_previews_execopts_hex"     CHECK ("execution_options_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "job_shadow_previews_pipeline_hex"     CHECK ("observed_pipeline_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "job_shadow_previews_obshash_hex"      CHECK ("observation_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "job_shadow_previews_validation_ck"    CHECK ("validation_status" IN ('valid','invalid'))
);

-- 중복 관측 방지(같은 observation_hash). queue claim 인덱스 아님.
CREATE UNIQUE INDEX "job_shadow_previews_observation_uq" ON "job_shadow_previews" ("observation_hash");
-- 조회 인덱스(과도 금지)
CREATE INDEX "job_shadow_previews_observed_idx"   ON "job_shadow_previews" ("observed_at");
CREATE INDEX "job_shadow_previews_status_idx"     ON "job_shadow_previews" ("source_status");
CREATE INDEX "job_shadow_previews_provenance_idx" ON "job_shadow_previews" ("provenance_complete");
CREATE INDEX "job_shadow_previews_prospective_idx" ON "job_shadow_previews" ("prospective_idempotency_key");
CREATE INDEX "job_shadow_previews_source_idx"     ON "job_shadow_previews" ("source_record_ref", "source_ref_key_version");
