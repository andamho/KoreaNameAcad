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
--    이 SQL 은 **현재 6테이블 owner 인 기존 app/migration-owner 연결**로 실행한다. bootstrap 멤버십은 SQL **내부**에서 처리한다:
--      Phase 1 끝  : GRANT orchestration_owner TO CURRENT_USER WITH SET TRUE, INHERIT FALSE;  ← self-참조(현재 owner 이름 불요)
--      Phase 2 끝  : REVOKE orchestration_owner FROM CURRENT_USER;                              ← 잔여 membership 0
--    이렇게 하면 apply Gate 가 owner 이름을 몰라도 SQL 이 자족적으로 소유권 이전을 수행한다(정적 SQL 이 CURRENT_USER 로 자기 참조).
--    ❌ 금지: GRANT <기존 app role> TO orchestration_deployer (= B) · GRANT <기존 app role> TO orchestration_owner
--    ⚠️ PG16+ non-superuser(실측): ALTER … OWNER TO 는 executor 의 SET ROLE 가능 + 새 owner 의 schema CREATE 를 요구하고,
--       ALTER DEFAULT PRIVILEGES FOR ROLE X 는 X 로 SET ROLE 한 상태를 요구한다 → 2f 는 임시 CREATE, 2g 는 SET ROLE 로 처리한다.
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
-- ⚠️ PG16+ non-superuser: 멤버십은 명시적으로 SET TRUE(SET ROLE 체인 동작) · INHERIT FALSE(권한 자동상속 차단=최소권한).
--    옵션을 생략하면 SET/INHERIT 기본값이 엔진·member rolinherit 에 의존해 체인이 깨지거나 권한이 새어 나갈 수 있다(실측 확정).
GRANT orchestration_owner TO orchestration_admin    WITH SET TRUE, INHERIT FALSE;  -- admin → SET ROLE owner
GRANT orchestration_admin TO orchestration_deployer WITH SET TRUE, INHERIT FALSE;  -- deployer → SET ROLE admin (→ owner)
-- bootstrap(owner model A): 이 SQL 을 실행하는 **현재 6테이블 owner(CURRENT_USER)** 가 orchestration_owner 로
--   SET ROLE / ALTER … OWNER TO 를 수행할 수 있도록 임시 멤버십을 SQL 내부에서 부여한다(정적 SQL 이 CURRENT_USER 로 자기 참조).
--   Phase 2 끝에서 즉시 REVOKE 하여 잔여 멤버십 0. (기존: 이름을 모른다며 apply Gate 외부 GRANT/REVOKE → self-참조로 내부화·자족화)
GRANT orchestration_owner TO CURRENT_USER WITH SET TRUE, INHERIT FALSE;

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
       AND grantee <> current_user   -- ⚠️ 실행 주체(현재 owner) 자신은 제외한다: 여기서 회수하면 이후 owner 의 CREATE TRIGGER 가
                                      --    비-superuser 에서 42501(permission denied)로 막힌다. executor 의 암묵 owner 권한은 2f 소유권 이전으로 소멸한다.
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM %I', g.table_name, g.grantee);
  END LOOP;
END$$;

-- 2b. schema USAGE(비소유자 접근 최소 전제). CREATE 는 부여하지 않는다(owner-only-creation).
--     owner 도 USAGE 를 갖는다: 소유한 함수/테이블을 SET ROLE 로 조작(2g' REVOKE·break-glass DISABLE TRIGGER)하려면 schema USAGE 필요.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO orchestration_reader, orchestration_writer, orchestration_owner;

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
-- ⚠️ PG16+ non-superuser: `ALTER … OWNER TO orchestration_owner` 는 (a) executor 가 orchestration_owner 로 SET ROLE 가능
--    (위 bootstrap GRANT WITH SET TRUE 로 충족) **AND** (b) orchestration_owner 가 그 객체의 schema 에 **CREATE** 보유,
--    두 조건을 모두 요구한다. 그래서 이전 직전에만 CREATE 를 임시 부여하고, 이전 직후 회수한다
--    (owner 는 평상시 public 에 CREATE 0 = owner-only-creation 정책·fnsec-schema-create-privilege-zero 유지).
GRANT CREATE ON SCHEMA public TO orchestration_owner;
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
REVOKE CREATE ON SCHEMA public FROM orchestration_owner;

-- 2g'. 소유권 이전 후 함수 ACL 재확인(재선언, 멱등). ALTER FUNCTION … OWNER TO 는 ACL 을 `{new=X/new}` 로 재작성하며
--      PUBLIC 회수 상태를 유지하지만, 엔진 동작에 의존하지 않도록 명시 재선언한다. 이전 후에는 함수 소유자가
--      orchestration_owner 이므로 **owner 로 SET ROLE 한 상태**에서만 REVOKE 가능하다(비-superuser: 이전 소유자는 더 이상 못 함).
SET ROLE orchestration_owner;
REVOKE ALL ON FUNCTION orch_deny_write(), orch_deny_delete(), orch_guard_business_update(), orch_deny_truncate() FROM PUBLIC;
REVOKE ALL ON FUNCTION orch_deny_write(), orch_deny_delete(), orch_guard_business_update(), orch_deny_truncate()
  FROM orchestration_reader, orchestration_writer, orchestration_deployer;
RESET ROLE;

-- 2g. 미래 객체 기본 권한 누수 방지.
-- ⚠️⚠️ 정정 대상 결함(PG 17.10 · PGlite 실측): `ALTER DEFAULT PRIVILEGES ... IN SCHEMA <s> REVOKE ... FROM PUBLIC` 는
--   **빈 ACL 에서 시작**하므로 PUBLIC 회수가 no-op 이고 pg_default_acl 행조차 생성되지 않는다
--   → 이후 생성되는 함수는 `proacl=null` = **PUBLIC EXECUTE 보유**. **스키마 한정 없는 전역 형식**만 실효가 있다.
-- ⚠️ 추가 정정(PG16+ non-superuser): `ALTER DEFAULT PRIVILEGES FOR ROLE X …` 는 executor 가 X 로 **SET ROLE 한 상태**여야 한다
--   (INHERIT FALSE 라 자동 상속 없음). 그래서 각 role 로 SET ROLE 후 `FOR ROLE` 없이(=현재 role) ALTER DEFAULT PRIVILEGES 한다.
-- 적용 대상 role: 함수를 만들 수 있는 3개 전부(owner·admin·deployer). admin/deployer 는 defense-in-depth 이며 함수 생성 허용을 뜻하지 않는다
--   (세 role 모두 public schema CREATE 0 → 평상시 함수 생성 불가).
DO $$
DECLARE r text; granted boolean; me text := current_user;
BEGIN
  FOREACH r IN ARRAY ARRAY['orchestration_owner', 'orchestration_admin', 'orchestration_deployer'] LOOP
    granted := false;
    IF NOT pg_has_role(me, r, 'SET') THEN
      EXECUTE format('GRANT %I TO %I WITH SET TRUE, INHERIT FALSE', r, me);
      granted := true;
    END IF;
    EXECUTE format('SET ROLE %I', r);
    ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;   -- 실효(전역 형식) — pg_default_acl 행 생성
    ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM PUBLIC;          -- 진짜 no-op(내장 기본값에 PUBLIC 없음) — 선언적
    ALTER DEFAULT PRIVILEGES REVOKE ALL ON SEQUENCES FROM PUBLIC;
    RESET ROLE;
    IF granted THEN EXECUTE format('REVOKE %I FROM %I', r, me); END IF;
  END LOOP;
END $$;

-- bootstrap 해제: 현재 owner(CURRENT_USER) 의 orchestration_owner 임시 멤버십 회수 → 잔여 멤버십 0(운영 credential 만 SET ROLE 경로 보유).
REVOKE orchestration_owner FROM CURRENT_USER;

-- ══ Phase 3(별도 검증)·Phase 4(adapter 배선 없이 종료·런타임 writer credential 접속) ══
-- 긴급 정정 기본 = 새 correction/reversal 이벤트 INSERT(원본 보존). DISABLE TRIGGER 는 최후 수단 runbook(이중승인·즉시 재enable·재검증).
