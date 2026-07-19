-- 영속 작업 큐 (persistent job queue) — 비파괴 additive migration.
-- 규칙: 새 테이블·인덱스·FK 생성만. 기존 테이블 DROP/DELETE/ALTER/타입변경 없음. 데이터 INSERT/UPDATE/DELETE 없음.
-- 적용: node --import tsx/esm server/migrate.ts 0002_create_persistent_job_queue   (기본 dry-run)
--   server/migrate.ts 범용 러너가 레지스트리(expectedNewTables=jobs·job_executions,
--   fingerprint=tests/knop/fixtures/jobQueueFingerprint.json)로 SQL 정적 스캔·사전 catalog 검문·
--   기존 행수 불변·구조 fingerprint 를 BEGIN/COMMIT tx 안에서 검증한다(어긋나면 ROLLBACK).
--   실제 COMMIT 은 ALLOW_PRODUCTION_MIGRATION=true + EXPECTED_DATABASE_HOST_HASH 핀 명시 때만.
--   IF NOT EXISTS 안 씀(구조 불일치 은닉 방지; 재실행은 사전 catalog fingerprint 검문으로 관리).
-- 확정: jobs 19컬럼, job_executions 21컬럼, FK 2(RESTRICT), unique/부분유일 인덱스 3 + 조회 인덱스 3.
--   전역 UNIQUE·job+attempt UNIQUE·active execution 부분유일은 전부 "인덱스" 표현(Drizzle uniqueIndex 와 parity).
--   project_id 무FK(projects 물리삭제 정책), run_revision 없음. timestamptz + DB now(), jsonb, varchar(64) hash.

CREATE TABLE "jobs" (
  "id"                       varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_scope"              text        NOT NULL,
  "project_id"               varchar,
  "job_type"                 text        NOT NULL,
  "status"                   text        NOT NULL DEFAULT 'queued',
  "priority"                 integer     NOT NULL DEFAULT 100,
  "input_identity"           jsonb       NOT NULL,
  "request_version_snapshot" jsonb       NOT NULL,
  "execution_options"        jsonb,
  "execution_options_hash"   varchar(64) NOT NULL,
  "payload_hash"             varchar(64) NOT NULL,
  "idempotency_key"          varchar(64) NOT NULL,
  "parent_job_id"            varchar,
  "reprocess_reason"         text,
  "available_at"             timestamptz NOT NULL DEFAULT now(),
  "created_at"               timestamptz NOT NULL DEFAULT now(),
  "updated_at"               timestamptz NOT NULL DEFAULT now(),
  "completed_at"             timestamptz,
  "cancelled_at"             timestamptz,
  CONSTRAINT "jobs_parent_job_id_fkey" FOREIGN KEY ("parent_job_id")
      REFERENCES "jobs"("id") ON DELETE RESTRICT
);

CREATE TABLE "job_executions" (
  "id"                      varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "job_id"                  varchar     NOT NULL,
  "attempt_number"          integer     NOT NULL,
  "execution_reason"        text        NOT NULL DEFAULT 'normal',
  "status"                  text        NOT NULL DEFAULT 'claimed',
  "worker_id"               text,
  "lease_token_hash"        varchar(64),
  "leased_at"               timestamptz,
  "lease_expires_at"        timestamptz,
  "heartbeat_at"            timestamptz,
  "started_at"              timestamptz,
  "finished_at"             timestamptz,
  "actual_version_snapshot" jsonb,
  "artifact_snapshot"       jsonb,
  "executor_snapshot"       jsonb,
  "manifest_uri"            text,
  "manifest_artifact_hash"  varchar(64),
  "error_code"              text,
  "error_summary"           text,
  "verification_status"     text,
  "created_at"              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "job_executions_job_id_fkey" FOREIGN KEY ("job_id")
      REFERENCES "jobs"("id") ON DELETE RESTRICT
);

-- UNIQUE 는 인덱스로 통일(active_uq 가 부분유일=인덱스여야 하므로 나머지도 인덱스 → Drizzle uniqueIndex parity)
CREATE UNIQUE INDEX "jobs_idempotency_key_key"        ON "jobs" ("idempotency_key");
CREATE UNIQUE INDEX "job_executions_job_attempt_key"  ON "job_executions" ("job_id","attempt_number");
CREATE UNIQUE INDEX "job_executions_active_uq"        ON "job_executions" ("job_id") WHERE "status" IN ('claimed','running');

-- 조회/스캔 인덱스
CREATE INDEX "jobs_claim_idx"             ON "jobs" ("priority","available_at","created_at","id") WHERE "status" = 'queued';
CREATE INDEX "job_executions_reaper_idx"  ON "job_executions" ("lease_expires_at") WHERE "status" IN ('claimed','running');
CREATE INDEX "jobs_parent_idx"            ON "jobs" ("parent_job_id");
CREATE INDEX "jobs_project_created_idx"   ON "jobs" ("project_id","created_at");
