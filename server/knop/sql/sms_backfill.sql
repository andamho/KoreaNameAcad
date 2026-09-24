-- SMS backfill 마이그레이션 (검증됨, PGlite 21/21). 참조용 — 아직 migrations/ 러너에 등록·운영적용 안 함.
-- 운영 반영 시 다른 브랜치의 0005/0005b 번호·순서와 조율 후 별도 승인 필요. 모두 additive.

ALTER TABLE incoming_sms
  ADD COLUMN IF NOT EXISTS ingest_source text,
  ADD COLUMN IF NOT EXISTS backfill_run_id varchar;

CREATE TABLE IF NOT EXISTS sms_backfill_runs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  range_from timestamptz,
  range_to timestamptz,
  dry_run boolean NOT NULL,
  counts jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- incoming_sms.backfill_run_id → runs (nullable FK; 레거시 행은 null)
ALTER TABLE incoming_sms
  ADD CONSTRAINT incoming_sms_backfill_run_fk
  FOREIGN KEY (backfill_run_id) REFERENCES sms_backfill_runs(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS sms_provider_links (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  provider_type text NOT NULL,
  provider_id text NOT NULL,
  incoming_sms_id varchar NOT NULL,
  link_type text NOT NULL,
  backfill_run_id varchar,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sms_provider_links_provider_uq UNIQUE (device_id, provider_type, provider_id),
  CONSTRAINT sms_provider_links_row_uq      UNIQUE (device_id, provider_type, incoming_sms_id),
  CONSTRAINT sms_provider_links_incoming_fk FOREIGN KEY (incoming_sms_id) REFERENCES incoming_sms(id) ON DELETE RESTRICT,
  CONSTRAINT sms_provider_links_run_fk      FOREIGN KEY (backfill_run_id) REFERENCES sms_backfill_runs(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS sms_backfill_items (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  backfill_run_id varchar NOT NULL,
  device_id text NOT NULL,
  provider_type text NOT NULL,
  provider_id text NOT NULL,
  state text NOT NULL,             -- existing_exact|legacy_linked|new|ambiguous|invalid
  customer_state text,             -- matched|unmatched|skipped (dry-run은 null)
  incoming_sms_id varchar,
  candidate_count int,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sms_backfill_items_uq     UNIQUE (backfill_run_id, provider_type, provider_id),
  CONSTRAINT sms_backfill_items_run_fk FOREIGN KEY (backfill_run_id) REFERENCES sms_backfill_runs(id) ON DELETE RESTRICT
);
