-- ⚠️⚠️ DRAFT — 미적용·미등록 migration. migrations/ 폴더 아님, server/migrations/registry.ts 에 등록 안 함.
-- 이 파일은 cross-agent orchestration 계약의 스키마 초안(설계 참고)일 뿐, 운영/격리 어디에도 적용하지 않는다.
-- 실제 적용은 별도 승인 migration Gate 에서(additive·db:push 금지·fingerprint·격리 검증 후).
-- FK·claim index 등은 job-queue-contract 원칙(감사·재현·물리삭제 금지) 따라 실제 Gate 에서 확정.

-- job 간 dependency(자동 다음 job 판정 근거). version pinning 포함.
CREATE TABLE job_dependencies (
  id                              varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                          varchar NOT NULL,
  depends_on_job_id               varchar NOT NULL,
  dependency_type                 text NOT NULL,   -- requires-success/-approved-review/-human-approval/supersedes/retry-of/correction-of
  required_artifact_kind          text,
  required_artifact_schema_version integer,
  resolution_status               text NOT NULL DEFAULT 'pending', -- pending/resolved/failed/cancelled
  resolved_execution_id           varchar,
  resolved_artifact_id            varchar,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  resolved_at                     timestamptz,
  CONSTRAINT job_dependencies_no_self CHECK (job_id <> depends_on_job_id)
  -- UNIQUE(job_id, depends_on_job_id, dependency_type) 중복 dependency 방지(실제 Gate 확정)
);

-- immutable versioned artifact(AI 간 handoff). 원문 금지 — protected reference/hash.
CREATE TABLE job_artifacts (
  id                          varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  producer_job_id             varchar NOT NULL,
  producer_execution_id       varchar NOT NULL,
  artifact_kind               text NOT NULL,
  schema_version              integer NOT NULL,
  content_hash                varchar(64) NOT NULL,
  manifest_hash               varchar(64) NOT NULL,
  content_location            text,           -- 비민감 참조
  protected_reference         varchar(64),    -- 민감건 HMAC
  sensitivity_class           text NOT NULL,  -- public/internal/confidential/customer-sensitive/secret
  redaction_status            text NOT NULL,
  lineage_parent_artifact_ids jsonb NOT NULL DEFAULT '[]',
  immutable                   boolean NOT NULL DEFAULT true,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  expires_at                  timestamptz,
  CONSTRAINT job_artifacts_hash_hex CHECK (content_hash ~ '^[0-9a-f]{64}$' AND manifest_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT job_artifacts_no_secret_content CHECK (NOT (sensitivity_class='secret' AND content_location IS NOT NULL))
);

-- automated review 결과(consumer 검토).
CREATE TABLE automated_reviews (
  id                     varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewed_job_id        varchar NOT NULL,
  reviewed_execution_id  varchar NOT NULL,
  reviewed_artifact_hash varchar(64) NOT NULL,
  decision               text NOT NULL,       -- approve/revise/reject/human-review
  failed_invariants      jsonb NOT NULL DEFAULT '[]',
  evidence_artifact_ids  jsonb NOT NULL DEFAULT '[]',
  human_approval_required boolean NOT NULL DEFAULT false,
  reviewer_version       text NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now()
);

-- 사람 승인(운영 반영 게이트).
CREATE TABLE human_approvals (
  id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        varchar NOT NULL,
  state         text NOT NULL DEFAULT 'awaiting-approval', -- not-required/awaiting-approval/approved/rejected/revision-requested/expired/cancelled
  approver_ref  varchar(64),   -- 사람 식별 hash(원문 아님)
  decided_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- append-only 감사 로그.
CREATE TABLE orchestration_audit_log (
  id                 varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  at                 timestamptz NOT NULL DEFAULT now(),
  actor              text NOT NULL,   -- system/gpt-adapter/claude-adapter/reviewer/human:<hash>
  action             text NOT NULL,
  job_id             varchar,
  execution_id       varchar,
  artifact_ids       jsonb NOT NULL DEFAULT '[]',
  model_tool_version text,
  error_code         text
  -- append-only(UPDATE/DELETE 정책 차단은 role/trigger 로, 실제 Gate 확정)
);

-- emergency stop(수동 정지 장치).
CREATE TABLE emergency_stops (
  id           varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  scope        text NOT NULL,   -- global/pipeline-kind/adapter/customer-source/promotion/write-action
  target       text,
  active       boolean NOT NULL DEFAULT true,
  reason_code  text NOT NULL,
  engaged_at   timestamptz NOT NULL DEFAULT now(),
  released_at  timestamptz      -- 수동 해제 전 자동 재개 금지
);
