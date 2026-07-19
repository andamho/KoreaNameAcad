-- cross-agent orchestration 저장 스키마 — 비파괴 additive migration.
-- 규칙: 새 테이블·인덱스·FK 생성만. 기존 테이블(jobs/job_executions/job_shadow_previews 등) DROP/ALTER/타입변경 없음.
--   데이터 INSERT/UPDATE/DELETE(backfill) 없음. jobs.status·job_executions 의미 무변경.
-- 적용: MIGRATION_MODE=inspect|dry-run|apply node --import tsx/esm server/migrate.ts 0004_cross_agent_orchestration
--   범용 러너가 레지스트리(expectedNewTables 6개, fingerprint=tests/knop/fixtures/orchestrationFingerprint.json)로
--   SQL 정적 스캔·사전 catalog 검문·기존 행수 불변·구조 fingerprint 를 BEGIN/COMMIT tx 안에서 검증(어긋나면 ROLLBACK).
--   실제 COMMIT 은 CONFIRM_APPLY=true + EXPECTED_DATABASE_HOST_HASH 핀 둘 다 명시 때만. IF NOT EXISTS 안 씀(은닉 방지).
--
-- 민감정보 계약(전 테이블 공통):
--   · 고객 원문·이름·전화번호·녹음 URL·로컬 경로·secret 을 저장하는 컬럼 없음.
--   · 민감 참조는 protected reference(HMAC hex) 또는 비민감 content_location 만. hash 는 varchar(64) hex.
--   · calls/customers/consultations 등 외부 도메인 테이블에는 FK 를 만들지 않음(물리삭제 정책 → protected reference).
--
-- 삭제/무결성 정책:
--   · 내부 orchestration 관계(job/execution/artifact/review)는 FK ON DELETE RESTRICT
--     (jobs/job_executions 는 물리삭제하지 않음 = 안전, 감사·재현 보존).
--   · orchestration_audit_log·emergency_stops 는 의도적으로 FK 없음(append-only·정지장치, 삭제 대상/외부 참조 가능).
--
-- append-only(orchestration_audit_log)·immutable(job_artifacts) 은 이 migration 에서는 컬럼/CHECK + 애플리케이션 계약으로만
--   보장한다. UPDATE/DELETE 를 물리 차단하는 DB trigger/role 은 이번 범위에 넣지 않는다.
--   근거: (1) 범용 러너의 정적 안전 스캐너가 트리거 본문의 UPDATE/DELETE 키워드를 위험 SQL 로 거부하여 충돌,
--         (2) 운영/테스트 role·teardown 과의 상호작용 검증이 별도 필요.
--   → DB 강제(append-only role/trigger, immutable BEFORE UPDATE trigger)는 별도 승인 hardening Gate 로 분리.
--
-- 순환 dependency 는 DB 로 완전 차단하지 않는다(행 간 재귀 필요). 순수 detectCycleJobs(애플리케이션 가드)로 유지.
--   DB 는 self-dependency(job_id<>depends_on_job_id) CHECK 만 둔다.

-- ── 1) job_artifacts : immutable versioned artifact(AI 간 handoff 인덱스·lineage). 먼저 생성(뒤 테이블이 FK 참조) ──
CREATE TABLE "job_artifacts" (
  "id"                          varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "producer_job_id"             varchar     NOT NULL,
  "producer_execution_id"       varchar     NOT NULL,
  "artifact_kind"               text        NOT NULL,
  "schema_version"              integer     NOT NULL,
  "content_hash"                varchar(64) NOT NULL,
  "manifest_hash"               varchar(64) NOT NULL,
  "content_location"            text,                 -- 비민감 참조(고객 식별정보·URL·경로 금지)
  "protected_content_ref"       varchar(64),          -- 민감건 HMAC hex(원문 아님)
  "sensitivity_class"           text        NOT NULL,
  "redaction_status"            text        NOT NULL,
  "immutable"                   boolean     NOT NULL DEFAULT true,
  "lineage_parent_artifact_ids" jsonb       NOT NULL DEFAULT '[]',
  "created_at"                  timestamptz NOT NULL DEFAULT now(),
  "expires_at"                  timestamptz,
  CONSTRAINT "job_artifacts_producer_job_fkey" FOREIGN KEY ("producer_job_id")
      REFERENCES "jobs"("id") ON DELETE RESTRICT,
  CONSTRAINT "job_artifacts_producer_exec_fkey" FOREIGN KEY ("producer_execution_id")
      REFERENCES "job_executions"("id") ON DELETE RESTRICT,
  CONSTRAINT "job_artifacts_content_hash_hex"  CHECK ("content_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "job_artifacts_manifest_hash_hex" CHECK ("manifest_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "job_artifacts_protected_ref_hex" CHECK ("protected_content_ref" IS NULL OR "protected_content_ref" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "job_artifacts_sensitivity_ck"    CHECK ("sensitivity_class" IN ('public','internal','confidential','customer-sensitive','secret')),
  CONSTRAINT "job_artifacts_redaction_ck"      CHECK ("redaction_status" IN ('not-required','redacted','protected-reference','pending')),
  CONSTRAINT "job_artifacts_immutable_ck"      CHECK ("immutable" = true),
  CONSTRAINT "job_artifacts_no_secret_plain"   CHECK (NOT ("sensitivity_class" = 'secret' AND "content_location" IS NOT NULL)),
  CONSTRAINT "job_artifacts_customer_needs_ref" CHECK (NOT ("sensitivity_class" = 'customer-sensitive' AND "protected_content_ref" IS NULL))
);
-- 같은 producer execution·kind·content 중복 저장 방지(멱등 writer). 동일 execution 이 다른 content 의 동일 kind 를 낼 수 있으므로 content_hash 포함.
CREATE UNIQUE INDEX "job_artifacts_dedup_uq" ON "job_artifacts" ("producer_execution_id","artifact_kind","content_hash");
CREATE INDEX "job_artifacts_kind_idx"        ON "job_artifacts" ("artifact_kind","schema_version");
CREATE INDEX "job_artifacts_producer_job_idx" ON "job_artifacts" ("producer_job_id");

-- ── 2) job_dependencies : job 간 의존(자동 다음 job 판정 근거). version pinning 포함 ──
CREATE TABLE "job_dependencies" (
  "id"                               varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "job_id"                           varchar     NOT NULL,
  "depends_on_job_id"                varchar     NOT NULL,
  "dependency_type"                  text        NOT NULL,
  "required_artifact_kind"           text,
  "required_artifact_schema_version" integer,
  "resolution_status"                text        NOT NULL DEFAULT 'pending',
  "resolved_execution_id"            varchar,
  "resolved_artifact_id"             varchar,
  "created_at"                       timestamptz NOT NULL DEFAULT now(),
  "resolved_at"                      timestamptz,
  CONSTRAINT "job_dependencies_job_fkey" FOREIGN KEY ("job_id")
      REFERENCES "jobs"("id") ON DELETE RESTRICT,
  CONSTRAINT "job_dependencies_depends_on_fkey" FOREIGN KEY ("depends_on_job_id")
      REFERENCES "jobs"("id") ON DELETE RESTRICT,
  CONSTRAINT "job_dependencies_resolved_exec_fkey" FOREIGN KEY ("resolved_execution_id")
      REFERENCES "job_executions"("id") ON DELETE RESTRICT,
  CONSTRAINT "job_dependencies_resolved_artifact_fkey" FOREIGN KEY ("resolved_artifact_id")
      REFERENCES "job_artifacts"("id") ON DELETE RESTRICT,
  CONSTRAINT "job_dependencies_no_self" CHECK ("job_id" <> "depends_on_job_id"),
  CONSTRAINT "job_dependencies_type_ck" CHECK ("dependency_type" IN ('requires-success','requires-approved-review','requires-human-approval','supersedes','retry-of','correction-of')),
  CONSTRAINT "job_dependencies_status_ck" CHECK ("resolution_status" IN ('pending','resolved','failed','cancelled'))
);
-- 같은 (job, 선행 job, 타입) 중복 dependency 방지.
CREATE UNIQUE INDEX "job_dependencies_edge_uq"      ON "job_dependencies" ("job_id","depends_on_job_id","dependency_type");
-- 미해결 dependency 를 job 기준 조회.
CREATE INDEX "job_dependencies_unresolved_idx"      ON "job_dependencies" ("job_id") WHERE "resolution_status" = 'pending';
-- 선행 job(predecessor) 기준 역방향 조회.
CREATE INDEX "job_dependencies_predecessor_idx"     ON "job_dependencies" ("depends_on_job_id");

-- ── 3) automated_reviews : consumer(다른 AI/검증기)의 자동 검토 결과 ──
CREATE TABLE "automated_reviews" (
  "id"                                 varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "reviewed_job_id"                    varchar     NOT NULL,
  "reviewed_execution_id"              varchar     NOT NULL,
  "reviewed_artifact_id"               varchar,
  "reviewer_kind"                      text        NOT NULL,
  "reviewer_version"                   text        NOT NULL,
  "decision"                           text        NOT NULL,
  "severity"                           text        NOT NULL,
  "failed_invariants"                  jsonb       NOT NULL DEFAULT '[]',
  "evidence_artifact_ids"              jsonb       NOT NULL DEFAULT '[]',  -- artifact reference 만(raw content 금지)
  "correction_instruction_artifact_id" varchar,
  "next_job_kind"                      text,
  "human_approval_required"            boolean     NOT NULL DEFAULT false,
  "created_at"                         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "automated_reviews_job_fkey" FOREIGN KEY ("reviewed_job_id")
      REFERENCES "jobs"("id") ON DELETE RESTRICT,
  CONSTRAINT "automated_reviews_exec_fkey" FOREIGN KEY ("reviewed_execution_id")
      REFERENCES "job_executions"("id") ON DELETE RESTRICT,
  CONSTRAINT "automated_reviews_artifact_fkey" FOREIGN KEY ("reviewed_artifact_id")
      REFERENCES "job_artifacts"("id") ON DELETE RESTRICT,
  CONSTRAINT "automated_reviews_correction_fkey" FOREIGN KEY ("correction_instruction_artifact_id")
      REFERENCES "job_artifacts"("id") ON DELETE RESTRICT,
  CONSTRAINT "automated_reviews_decision_ck" CHECK ("decision" IN ('approve','revise','reject','human-review')),
  CONSTRAINT "automated_reviews_reviewer_ck" CHECK ("reviewer_kind" IN ('gpt','claude','deterministic-validator')),
  CONSTRAINT "automated_reviews_severity_ck" CHECK ("severity" IN ('info','low','medium','high','critical'))
);
-- 같은 execution 을 같은 reviewer(kind+version)가 중복 검토 방지. (수정/재시도는 새 execution → reviewed_execution_id 가 달라짐)
CREATE UNIQUE INDEX "automated_reviews_reviewer_uq" ON "automated_reviews" ("reviewed_execution_id","reviewer_kind","reviewer_version");

-- ── 4) human_approvals : 사람 최종 승인(운영 반영 게이트). jobs.status 미변경, 별도 상태 ──
CREATE TABLE "human_approvals" (
  "id"                       varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "job_id"                   varchar     NOT NULL,
  "review_id"                varchar,
  "approval_status"          text        NOT NULL DEFAULT 'awaiting-approval',
  "requested_at"             timestamptz NOT NULL DEFAULT now(),
  "decided_at"               timestamptz,
  "decided_by_protected_ref" varchar(64),          -- 승인자 protected ref(원문 이메일·전화 금지)
  "decision_reason_code"     text,
  "decision_summary"         text,                 -- 시스템 요약만(고객 원문 금지, 앱 계약)
  "expires_at"               timestamptz,
  "created_at"               timestamptz NOT NULL DEFAULT now(),
  "updated_at"               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "human_approvals_job_fkey" FOREIGN KEY ("job_id")
      REFERENCES "jobs"("id") ON DELETE RESTRICT,
  CONSTRAINT "human_approvals_review_fkey" FOREIGN KEY ("review_id")
      REFERENCES "automated_reviews"("id") ON DELETE RESTRICT,
  CONSTRAINT "human_approvals_status_ck" CHECK ("approval_status" IN ('awaiting-approval','approved','rejected','revision-requested','expired','cancelled')),
  CONSTRAINT "human_approvals_approver_hex" CHECK ("decided_by_protected_ref" IS NULL OR "decided_by_protected_ref" ~ '^[0-9a-f]{64}$')
);
-- 한 job 에 활성(awaiting-approval) 승인 요청은 최대 1개.
CREATE UNIQUE INDEX "human_approvals_active_uq" ON "human_approvals" ("job_id") WHERE "approval_status" = 'awaiting-approval';
-- job 기준 승인 이력 조회.
CREATE INDEX "human_approvals_job_idx"           ON "human_approvals" ("job_id");

-- ── 5) orchestration_audit_log : append-only 감사 이벤트(FK 의도적 없음) ──
CREATE TABLE "orchestration_audit_log" (
  "id"                   varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "seq"                  bigint      GENERATED ALWAYS AS IDENTITY,  -- 전역 단조 정렬키(총 순서)
  "event_type"           text        NOT NULL,
  "actor_kind"           text        NOT NULL,
  "actor_protected_ref"  varchar(64),          -- human:<hash> 등 protected ref(원문 금지)
  "job_id"               varchar,              -- 무FK(append-only, 외부/삭제 대상 참조 가능)
  "execution_id"         varchar,
  "artifact_id"          varchar,
  "review_id"            varchar,
  "approval_id"          varchar,
  "pipeline_kind"        text,
  "event_payload"        jsonb       NOT NULL DEFAULT '{}',  -- 고객 원문·secret·DB URL·경로 금지(앱 계약)
  "created_at"           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "orchestration_audit_log_actor_ck"  CHECK ("actor_kind" IN ('system','gpt-adapter','claude-adapter','reviewer','human','worker')),
  CONSTRAINT "orchestration_audit_log_actor_hex" CHECK ("actor_protected_ref" IS NULL OR "actor_protected_ref" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "orchestration_audit_log_seq_uq"     ON "orchestration_audit_log" ("seq");
CREATE INDEX "orchestration_audit_log_job_time_idx"      ON "orchestration_audit_log" ("job_id","created_at");

-- ── 6) emergency_stops : 수동 정지 장치(FK 의도적 없음) ──
-- scope_key='' = 해당 scope 전체(global 등). 활성 stop 은 (scope_type, scope_key) 당 최대 1개(부분 유일).
CREATE TABLE "emergency_stops" (
  "id"                          varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  "scope_type"                  text        NOT NULL,
  "scope_key"                   text        NOT NULL DEFAULT '',   -- ''=scope 전체, 아니면 pipeline-kind/adapter/source 식별(비민감)
  "reason_code"                 text        NOT NULL,
  "reason_summary"              text,
  "active"                      boolean     NOT NULL DEFAULT true,
  "activated_at"                timestamptz NOT NULL DEFAULT now(),
  "activated_by_protected_ref"  varchar(64),
  "released_at"                 timestamptz,           -- 수동 해제 전 자동 재개 금지(앱 계약)
  "released_by_protected_ref"   varchar(64),
  "created_at"                  timestamptz NOT NULL DEFAULT now(),
  "updated_at"                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "emergency_stops_scope_ck" CHECK ("scope_type" IN ('global','pipeline-kind','adapter','customer-source','promotion','write-action')),
  CONSTRAINT "emergency_stops_activated_hex" CHECK ("activated_by_protected_ref" IS NULL OR "activated_by_protected_ref" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "emergency_stops_released_hex"  CHECK ("released_by_protected_ref" IS NULL OR "released_by_protected_ref" ~ '^[0-9a-f]{64}$')
);
-- 활성 global stop 중복·동일 scope 활성 stop 중복 방지 + 활성 상태 scope 조회.
CREATE UNIQUE INDEX "emergency_stops_active_scope_uq" ON "emergency_stops" ("scope_type","scope_key") WHERE "active";
