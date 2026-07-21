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
-- ⚠️ 소유권 이전 bootstrap = **A 채택**(B 는 Reject: deployer 가 기존 app role 권한을 상속하는 privilege explosion).
--    이 SQL 은 **현재 6테이블 owner 인 기존 app/migration-owner 연결**로 실행한다. Gate 가 앞뒤로 다음을 처리:
--      (사전) GRANT orchestration_owner TO <현재 owner role>;   ← 허용: 현재 owner 가 잠시 orchestration_owner 의 member
--      (사후) REVOKE orchestration_owner FROM <현재 owner role>; + 회수 확인(잔여 membership 0)
--    ❌ 금지: GRANT <기존 app role> TO orchestration_deployer (= B) · GRANT <기존 app role> TO orchestration_owner
--    (정적 SQL 은 현재 owner 이름을 모르므로 위 GRANT/REVOKE 는 apply Gate 가 수행한다.)
--    ALTER DEFAULT PRIVILEGES(2g)는 대상 role 멤버십이 필요하므로, 없으면 DO 블록이 임시 부여 후 즉시 회수한다(부여한 것만).
--
-- ⚠️ 함수 권한 정정(2e/2g'/2g): 미래 함수의 PUBLIC EXECUTE 는 **스키마 한정 default privileges 로 막을 수 없다**.
--    기존 4함수 = 정확한 signature 명시 REVOKE(소유권 이전 후 재선언), 미래 함수 = **전역 형식** default privileges 3 role.
--
-- 검증된 PG17 능력: CREATE ROLE NOLOGIN/LOGIN·membership·ALTER TABLE/FUNCTION OWNER TO NOLOGIN·SET ROLE·컬럼 UPDATE·
--   identity INSERT(시퀀스 grant 불요)·trigger 발화(EXECUTE grant 불요)·PUBLIC REVOKE=0.
--   함수 기본값: SECURITY INVOKER(prosecdef=false)·proconfig=null(search_path 미설정)·volatile·non-strict·parallel-unsafe.
--   ⚠️ SECURITY DEFINER 는 채택하지 않는다(INVOKER 유지). trigger 발화에 EXECUTE 가 불요하므로 DEFINER 가 불필요하고,
--      DEFINER 는 search_path 주입면을 새로 만든다. 함수 본문은 RAISE/TG_* 와 NEW/OLD 컬럼 비교만 사용하며
--      **스키마 미한정 객체·연산자를 참조하지 않으므로** search_path 의존이 없다(그래서 proconfig 고정도 요구하지 않는다).
--      단 fingerprint 는 prosecdef=false 와 proconfig=null 을 **고정 기대값으로 hard stop** 검사한다(무단 변경 탐지).
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
-- 정확한 signature 기준 명시 REVOKE. PUBLIC 뿐 아니라 runtime role 도 선언적으로 회수(현재 grant 가 없어도 의도를 감사 가능하게 남긴다).
-- 발화(trigger firing)는 EXECUTE 권한을 요구하지 않으므로 이 REVOKE 는 trigger 동작에 영향이 없다(직접 호출만 차단). — PG 17.10 검증
-- ⚠️ REVOKE 는 **직접 grant 만** 제거한다. orchestration_deployer/admin 은 owner membership 을 통해 EXECUTE 를 상속하며
--    이는 설계상 의도된 break-glass 경로다(회수 불가). 따라서 fingerprint 는 reader/writer 에 대해서만 EXECUTE=false 를 강제하고,
--    ACL grantee 집합이 {orchestration_owner} 뿐인지를 함께 검사한다.
REVOKE ALL ON FUNCTION orch_deny_write(), orch_deny_delete(), orch_guard_business_update(), orch_deny_truncate() FROM PUBLIC;
REVOKE ALL ON FUNCTION orch_deny_write(), orch_deny_delete(), orch_guard_business_update(), orch_deny_truncate()
  FROM orchestration_reader, orchestration_writer, orchestration_deployer;

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

-- 2g'. 소유권 이전 후 함수 ACL 재확인(재선언). PG 17.10 실측상 ALTER FUNCTION ... OWNER TO 는 ACL 을
--      `{old=X/old}` → `{new=X/new}` 로 재작성하며 PUBLIC 회수 상태를 유지하지만, 엔진 동작에 의존하지 않도록 명시 재선언한다(멱등).
REVOKE ALL ON FUNCTION orch_deny_write(), orch_deny_delete(), orch_guard_business_update(), orch_deny_truncate() FROM PUBLIC;
REVOKE ALL ON FUNCTION orch_deny_write(), orch_deny_delete(), orch_guard_business_update(), orch_deny_truncate()
  FROM orchestration_reader, orchestration_writer, orchestration_deployer;

-- 2g. 미래 객체 기본 권한 누수 방지.
-- ⚠️⚠️ 정정 대상 결함(PG 17.10 · PGlite 실측): `ALTER DEFAULT PRIVILEGES ... IN SCHEMA <s> REVOKE ... FROM PUBLIC` 는
--   **빈 ACL 에서 시작**하므로 PUBLIC 회수가 no-op 이고 pg_default_acl 행조차 생성되지 않는다
--   → 이후 생성되는 함수는 `proacl=null` = **PUBLIC EXECUTE 보유**. (이전 판 116행이 여기에 해당)
--   **스키마 한정 없는 전역 형식**만 내장 기본값(`=X/owner` 포함)에서 시작하므로 PUBLIC EXECUTE 제거가 실제 적용된다:
--   → 행 `{orchestration_owner=X/orchestration_owner}` 생성, 이후 **모든 스키마**의 새 함수가 `public=false`.
-- 적용 대상 role: 함수를 만들 수 있는 3개 전부(owner 뿐 아니라 admin·deployer 도 포함해야 누수가 닫힌다 — `FOR ROLE` 목록 밖 role 이 만든 함수는 미보호).
-- 비 superuser 환경(Neon)에서는 `FOR ROLE` 대상의 **멤버십**이 필요하므로, 없으면 임시로 부여하고 즉시 회수한다(부여한 것만 회수).
DO $$
DECLARE r text; granted boolean; me text := current_user;
BEGIN
  FOREACH r IN ARRAY ARRAY['orchestration_owner', 'orchestration_admin', 'orchestration_deployer'] LOOP
    granted := false;
    IF NOT pg_has_role(me, r, 'MEMBER') THEN
      EXECUTE format('GRANT %I TO %I', r, me);
      granted := true;
    END IF;
    -- FUNCTIONS: default privileges 형식 중 실효가 있는 것은 전역 형식뿐이다(스키마 한정은 no-op).
    -- ⚠️ 다만 default ACL 은 **보조 방어선**이다. 최종 보장은 owner-only creation + exact-signature REVOKE + fingerprint.
    -- authoritative = orchestration_owner. admin/deployer 는 defense-in-depth 이며 **함수 생성 권한을 허용한다는 뜻이 아니다**
    -- (세 role 모두 public schema CREATE 가 없어 평상시 함수를 만들 수 없다).
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC', r);
    -- TABLES/SEQUENCES: 내장 기본값에 PUBLIC 이 없어 행이 생기지 않는 **진짜 no-op**(무해). 선언적 의도로만 유지.
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL ON TABLES FROM PUBLIC', r);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL ON SEQUENCES FROM PUBLIC', r);
    IF granted THEN EXECUTE format('REVOKE %I FROM %I', r, me); END IF;
  END LOOP;
END $$;

-- ══ Phase 3(별도 검증)·Phase 4(adapter 배선 없이 종료·런타임 writer credential 접속) ══
-- 긴급 정정 기본 = 새 correction/reversal 이벤트 INSERT(원본 보존). DISABLE TRIGGER 는 최후 수단 runbook(이중승인·즉시 재enable·재검증).
