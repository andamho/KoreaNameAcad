-- ⚠️⚠️ DRAFT — 미적용·미등록(일반 registry 아님·general runner 로 실행 금지). 별도 승인 hardening apply Gate 에서만 적용.
-- 목적: 운영 adapter/writer 배선 전에 job_artifacts 불변성 + orchestration_audit_log/automated_reviews append-only 를
--       (1) 소유권 이전 + 비-owner 최소권한 role, (2) trigger 2차 방어로 강제. business-state 3테이블은 제한 UPDATE 허용.
--       DELETE/TRUNCATE 전면 금지(만료=tombstone/status). 신규 row 없음·기존 데이터 backfill 없음·0004 의미 변경 없음.
--
-- ⚠️ GRANT/REVOKE/UPDATE/DELETE/CREATE TRIGGER/ALTER OWNER 포함 → 일반 additive 스캐너가 거부.
--    전용 hardeningRunner(키워드 스캔 대신 exact sha256 allowlist + owner/privilege/PUBLIC fingerprint post-verify)로만 적용.
--
-- 실행 전제(prod): 이 SQL 은 (a) 6테이블의 현재 OWNER 이면서 (b) orchestration_owner 멤버인 role 로 실행해야
--    ALTER ... OWNER TO 가 성공한다. Phase 계획: migration 계정에 GRANT orchestration_owner 선행 → 적용 → 불필요 멤버십 정리.
--    격리 검증에서는 superuser 로 실행(ALTER OWNER 가능).
--
-- 비밀 없음: writer/reader 는 LOGIN role 을 '비밀번호 없이' 만든다. 실제 비밀번호·CONNECT 는 secret store/Neon 에서
--    별도 프로비저닝(ALTER ROLE ... PASSWORD 는 이 파일에 두지 않음). DB CONNECT 는 배포별로 부여.
--
-- 검증된 provider(PG17) 능력: CREATE ROLE NOLOGIN/LOGIN·GRANT/REVOKE membership·ALTER TABLE/FUNCTION OWNER TO NOLOGIN·
--    SET ROLE·컬럼 UPDATE·identity INSERT(시퀀스 grant 불요)·trigger 발화(EXECUTE grant 불요). PUBLIC REVOKE=0.
--    ⚠️ session_replication_role=replica 는 SUPERUSER 전용 → 비-superuser(owner/admin/writer/reader) 는 불가.
--       긴급 우회는 replica 가 아니라 'owner 가 ALTER TABLE DISABLE TRIGGER'(brief·global·감사·이중승인) 또는 Neon superuser.

-- ══ Phase 1: role ══
CREATE ROLE orchestration_owner  NOLOGIN;   -- 6테이블·trigger function 소유. 애플리케이션 사용 금지.
CREATE ROLE orchestration_admin  NOLOGIN;   -- migration/emergency 전용. 평소 앱 접근 금지.
CREATE ROLE orchestration_reader LOGIN;     -- 비소유자. SELECT 전용. (비밀번호 별도 프로비저닝)
CREATE ROLE orchestration_writer LOGIN;     -- 비소유자. INSERT/SELECT + 승인 컬럼 UPDATE. (비밀번호 별도)
-- admin 은 owner 멤버십으로 마이그레이션/긴급 시 SET ROLE orchestration_owner 가능(평소 미사용).
GRANT orchestration_owner TO orchestration_admin;

-- ══ Phase 2: 소유권 이전 + 최소권한(명시 열거, GRANT ALL 미사용) + trigger ══
-- 2a. PUBLIC·비소유자 기존 권한 제거(클린 슬레이트)
REVOKE ALL ON job_artifacts, job_dependencies, automated_reviews, human_approvals, orchestration_audit_log, emergency_stops FROM PUBLIC;
REVOKE ALL ON job_artifacts, job_dependencies, automated_reviews, human_approvals, orchestration_audit_log, emergency_stops FROM orchestration_reader, orchestration_writer;

-- 2b. schema USAGE(비소유자 접근 최소 전제). CREATE 는 부여하지 않음.
GRANT USAGE ON SCHEMA public TO orchestration_reader, orchestration_writer;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- 2c. reader: SELECT 만
GRANT SELECT ON job_artifacts, job_dependencies, automated_reviews, human_approvals, orchestration_audit_log, emergency_stops TO orchestration_reader;

-- 2d. writer: append-only/immutable = SELECT+INSERT / business-state = +컬럼 제한 UPDATE. DELETE/TRUNCATE/REFERENCES/TRIGGER 없음.
GRANT SELECT, INSERT ON job_artifacts, automated_reviews, orchestration_audit_log TO orchestration_writer;
GRANT SELECT, INSERT ON job_dependencies, human_approvals, emergency_stops TO orchestration_writer;
GRANT UPDATE (resolution_status, resolved_execution_id, resolved_artifact_id, resolved_at) ON job_dependencies TO orchestration_writer;
GRANT UPDATE (approval_status, decided_at, decided_by_protected_ref, decision_reason_code, decision_summary, updated_at) ON human_approvals TO orchestration_writer;
GRANT UPDATE (active, released_at, released_by_protected_ref, reason_summary, updated_at) ON emergency_stops TO orchestration_writer;

-- 2e. trigger function(공용 4개) — orchestration_owner 소유로 통일(아래 ALTER FUNCTION).
CREATE OR REPLACE FUNCTION orch_deny_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'orchestration: % on % is forbidden (immutable/append-only)', TG_OP, TG_TABLE_NAME USING ERRCODE = 'OA001'; END;$$;
CREATE OR REPLACE FUNCTION orch_deny_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'orchestration: DELETE on % is forbidden (use tombstone/status)', TG_TABLE_NAME USING ERRCODE = 'OA002'; END;$$;
CREATE OR REPLACE FUNCTION orch_guard_business_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'orchestration: identity/created_at change on % forbidden', TG_TABLE_NAME USING ERRCODE = 'OA003';
  END IF; RETURN NEW; END;$$;
CREATE OR REPLACE FUNCTION orch_deny_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'orchestration: TRUNCATE on % is forbidden', TG_TABLE_NAME USING ERRCODE = 'OA004'; END;$$;

-- immutable / append-only 3테이블: UPDATE·DELETE 전면 거부
CREATE TRIGGER job_artifacts_immutable            BEFORE UPDATE OR DELETE ON job_artifacts            FOR EACH ROW EXECUTE FUNCTION orch_deny_write();
CREATE TRIGGER automated_reviews_append_only       BEFORE UPDATE OR DELETE ON automated_reviews        FOR EACH ROW EXECUTE FUNCTION orch_deny_write();
CREATE TRIGGER orchestration_audit_log_append_only BEFORE UPDATE OR DELETE ON orchestration_audit_log  FOR EACH ROW EXECUTE FUNCTION orch_deny_write();
-- business-state 3테이블: DELETE 거부 + 식별/created_at 불변 가드(상태 UPDATE 는 허용)
CREATE TRIGGER job_dependencies_no_delete   BEFORE DELETE ON job_dependencies  FOR EACH ROW EXECUTE FUNCTION orch_deny_delete();
CREATE TRIGGER job_dependencies_guard        BEFORE UPDATE ON job_dependencies  FOR EACH ROW EXECUTE FUNCTION orch_guard_business_update();
CREATE TRIGGER human_approvals_no_delete     BEFORE DELETE ON human_approvals   FOR EACH ROW EXECUTE FUNCTION orch_deny_delete();
CREATE TRIGGER human_approvals_guard         BEFORE UPDATE ON human_approvals   FOR EACH ROW EXECUTE FUNCTION orch_guard_business_update();
CREATE TRIGGER emergency_stops_no_delete     BEFORE DELETE ON emergency_stops   FOR EACH ROW EXECUTE FUNCTION orch_deny_delete();
CREATE TRIGGER emergency_stops_guard         BEFORE UPDATE ON emergency_stops   FOR EACH ROW EXECUTE FUNCTION orch_guard_business_update();
-- TRUNCATE 전면 금지(문장 단위)
CREATE TRIGGER job_artifacts_no_truncate           BEFORE TRUNCATE ON job_artifacts           FOR EACH STATEMENT EXECUTE FUNCTION orch_deny_truncate();
CREATE TRIGGER automated_reviews_no_truncate        BEFORE TRUNCATE ON automated_reviews        FOR EACH STATEMENT EXECUTE FUNCTION orch_deny_truncate();
CREATE TRIGGER orchestration_audit_log_no_truncate  BEFORE TRUNCATE ON orchestration_audit_log  FOR EACH STATEMENT EXECUTE FUNCTION orch_deny_truncate();
CREATE TRIGGER job_dependencies_no_truncate         BEFORE TRUNCATE ON job_dependencies         FOR EACH STATEMENT EXECUTE FUNCTION orch_deny_truncate();
CREATE TRIGGER human_approvals_no_truncate          BEFORE TRUNCATE ON human_approvals          FOR EACH STATEMENT EXECUTE FUNCTION orch_deny_truncate();
CREATE TRIGGER emergency_stops_no_truncate          BEFORE TRUNCATE ON emergency_stops          FOR EACH STATEMENT EXECUTE FUNCTION orch_deny_truncate();

-- 2f. 소유권 이전(owner model A): 6테이블 + 4 function → orchestration_owner. 기존 owner 의 암묵권한 소멸.
ALTER TABLE job_artifacts            OWNER TO orchestration_owner;
ALTER TABLE job_dependencies         OWNER TO orchestration_owner;
ALTER TABLE automated_reviews        OWNER TO orchestration_owner;
ALTER TABLE human_approvals          OWNER TO orchestration_owner;
ALTER TABLE orchestration_audit_log  OWNER TO orchestration_owner;
ALTER TABLE emergency_stops          OWNER TO orchestration_owner;
ALTER FUNCTION orch_deny_write()             OWNER TO orchestration_owner;
ALTER FUNCTION orch_deny_delete()            OWNER TO orchestration_owner;
ALTER FUNCTION orch_guard_business_update()  OWNER TO orchestration_owner;
ALTER FUNCTION orch_deny_truncate()          OWNER TO orchestration_owner;

-- 2g. 미래 테이블 기본 권한 누수 방지(owner 가 만들 테이블에 PUBLIC 권한 없음)
ALTER DEFAULT PRIVILEGES FOR ROLE orchestration_owner IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;

-- ══ Phase 3(별도 검증): reader/writer/admin 별도 connection capability + 기존 app connection 의 orchestration write 실패 확인 ══
-- ══ Phase 4: adapter 배선 없이 종료. 런타임은 orchestration_writer credential 로만 접속(owner/admin 분리) ══
-- 긴급 정정은 과거 이벤트 덮어쓰기 금지 — 새 correction 이벤트 추가가 기본. trigger 우회는 owner 의 DISABLE TRIGGER(이중승인·감사)만.
