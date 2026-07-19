-- ⚠️⚠️ DRAFT — 미적용·미등록(일반 registry 아님·general runner 로 실행 금지). 별도 승인 hardening apply Gate 에서만 적용.
-- 목적: 운영 adapter/writer 배선 전에 job_artifacts 불변 + audit/reviews append-only 를 (1) 소유권 이전 + 비-owner 최소권한,
--       (2) trigger 2차 방어로 강제. business-state 3테이블은 제한 UPDATE 허용. DELETE/TRUNCATE 전면 금지(만료=tombstone/status).
--       신규 row 없음·backfill 없음·0004 의미 변경 없음.
--
-- ⚠️ GRANT/REVOKE/UPDATE/DELETE/CREATE TRIGGER/ALTER OWNER 포함 → 일반 additive 스캐너 거부.
--    전용 hardeningRunner(exact sha256 allowlist + owner/privilege/PUBLIC/app-role/function fingerprint post-verify)로만 적용.
--
-- 5-role 모델(운영 credential 관점):
--   orchestration_owner   : NOLOGIN, 6테이블·trigger function 소유. 직접 접속 금지.
--   orchestration_admin   : NOLOGIN, 관리 capability 묶음(owner membership). 직접 접속 금지.
--   orchestration_deployer: LOGIN, migration/hardening/emergency 전용. 평상시 비활성/격리. 필요 시 SET ROLE orchestration_admin. 사용 후 rotation.
--   orchestration_writer  : LOGIN, 비소유자. 최소 INSERT/SELECT + 승인 컬럼 UPDATE.
--   orchestration_reader  : LOGIN, 비소유자. SELECT.
-- 실제 migration 실행 주체 = orchestration_deployer LOGIN → SET ROLE orchestration_admin (admin 이 스스로 접속하지 않음).
--
-- ⚠️ 소유권 이전(ALTER ... OWNER TO orchestration_owner) 전제: 실행 role 이 (현재 owner) 이면서 (orchestration_owner 멤버) 여야 함.
--    apply Gate Phase 2 에서: GRANT <현재 owner role> TO orchestration_deployer; GRANT orchestration_owner TO orchestration_deployer;
--    → deployer 로 실행 → 완료 후 REVOKE <현재 owner role> FROM orchestration_deployer. (정적 SQL 은 현재 owner 이름을 모르므로 Gate 가 처리.)
--    ALTER DEFAULT PRIVILEGES FOR ROLE orchestration_owner 는 orchestration_owner 멤버(=admin, deployer via admin)로 실행.
--
-- 검증된 PG17 능력: CREATE ROLE NOLOGIN/LOGIN·membership·ALTER TABLE/FUNCTION OWNER TO NOLOGIN·SET ROLE·컬럼 UPDATE·
--   identity INSERT(시퀀스 grant 불요)·trigger 발화(EXECUTE grant 불요)·PUBLIC REVOKE=0.
--   ⚠️ session_replication_role=replica 는 SUPERUSER 전용 → 비-superuser 불가. 긴급 우회는 owner 의 ALTER TABLE DISABLE TRIGGER(runbook).

-- ══ Phase 1: role ══
CREATE ROLE orchestration_owner    NOLOGIN;
CREATE ROLE orchestration_admin    NOLOGIN;
CREATE ROLE orchestration_deployer LOGIN;   -- 비밀번호는 SQL 밖 secret store 프로비저닝
CREATE ROLE orchestration_reader   LOGIN;
CREATE ROLE orchestration_writer   LOGIN;
GRANT orchestration_owner TO orchestration_admin;      -- admin → SET ROLE owner
GRANT orchestration_admin TO orchestration_deployer;   -- deployer → SET ROLE admin (→ owner)

-- ══ Phase 2: 기존 app role·PUBLIC 권한 완전 제거 → 최소 GRANT → trigger → 소유권 이전 → default privileges ══
-- 2a. PUBLIC 및 orchestration_* 이외 모든 grantee(기존 app role 포함)의 6테이블 명시 권한 회수(클린 슬레이트)
REVOKE ALL ON job_artifacts, job_dependencies, automated_reviews, human_approvals, orchestration_audit_log, emergency_stops FROM PUBLIC;
DO $$
DECLARE g record;
DECLARE tbls text[] := ARRAY['job_artifacts','job_dependencies','automated_reviews','human_approvals','orchestration_audit_log','emergency_stops'];
BEGIN
  FOR g IN
    SELECT DISTINCT grantee, table_name FROM information_schema.role_table_grants
     WHERE table_schema='public' AND table_name = ANY(tbls)
       AND grantee <> 'PUBLIC' AND grantee NOT LIKE 'orchestration\_%'
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM %I', g.table_name, g.grantee);
  END LOOP;
END$$;

-- 2b. schema USAGE(비소유자 접근 최소 전제). CREATE 미부여.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO orchestration_reader, orchestration_writer;

-- 2c. reader: SELECT 만
GRANT SELECT ON job_artifacts, job_dependencies, automated_reviews, human_approvals, orchestration_audit_log, emergency_stops TO orchestration_reader;

-- 2d. writer: append-only/immutable = SELECT+INSERT / business-state = +컬럼 UPDATE. DELETE/TRUNCATE/REFERENCES/TRIGGER 없음.
GRANT SELECT, INSERT ON job_artifacts, automated_reviews, orchestration_audit_log TO orchestration_writer;
GRANT SELECT, INSERT ON job_dependencies, human_approvals, emergency_stops TO orchestration_writer;
GRANT UPDATE (resolution_status, resolved_execution_id, resolved_artifact_id, resolved_at) ON job_dependencies TO orchestration_writer;
GRANT UPDATE (approval_status, decided_at, decided_by_protected_ref, decision_reason_code, decision_summary, updated_at) ON human_approvals TO orchestration_writer;
GRANT UPDATE (active, released_at, released_by_protected_ref, reason_summary, updated_at) ON emergency_stops TO orchestration_writer;

-- 2e. trigger function(공용 4). PUBLIC EXECUTE 제거 → reader/writer/app 직접 호출 불가(발화에는 EXECUTE 불요, 직접 호출만 차단).
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
REVOKE ALL ON FUNCTION orch_deny_write(), orch_deny_delete(), orch_guard_business_update(), orch_deny_truncate() FROM PUBLIC;

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

-- 2f. 소유권 이전(owner model A): 6테이블 + 4 function → orchestration_owner. 기존 owner 암묵권한 소멸.
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

-- 2g. 미래 객체 기본 권한 누수 방지(owner 가 만들 tables/sequences/functions 에 PUBLIC 권한 없음). owner 멤버로 실행.
ALTER DEFAULT PRIVILEGES FOR ROLE orchestration_owner IN SCHEMA public REVOKE ALL ON TABLES    FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE orchestration_owner IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE orchestration_owner IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC;

-- ══ Phase 3(별도 검증)·Phase 4(adapter 배선 없이 종료·런타임 writer credential 접속) ══
-- 긴급 정정 기본 = 새 correction/reversal 이벤트 INSERT(원본 보존). DISABLE TRIGGER 는 최후 수단 runbook(이중승인·즉시 재enable·재검증).
