-- ⚠️⚠️ ROLLBACK for 0001_orchestration_immutability_roles.sql — 미적용·미등록(별도 승인 apply Gate 의 롤백 경로에서만).
-- 목적: 0001 적용을 **post-commit** 되돌린다(트랜잭션 내 검증 실패는 runHardening 이 자동 ROLLBACK 하므로 이 파일 불요).
--   6테이블·4함수 소유권을 실행 주체(CURRENT_USER)로 환원 → 15 trigger 제거 → 4 함수 제거 → 5 role 정리·삭제.
--   ⚠️ 데이터는 보존한다(테이블 자체는 DROP 하지 않음). 신규 row·backfill 없음.
--
-- ⚠️ PG16+ non-superuser 제약(실측 반영):
--   - 소유권을 orchestration_owner → CURRENT_USER 로 되돌리려면 executor 가 owner 의 권한을 **상속(INHERIT TRUE)** 해야
--     owner 소유 객체를 자기 것처럼 ALTER OWNER 할 수 있다(executor 는 role 생성자라 ADMIN 보유 → 재-GRANT 가능).
--   - DROP ROLE 은 role 이 소유·피부여 obj 가 있으면 2BP01 로 막힌다 → DROP OWNED BY 로 소유물·부여 privilege 선정리.

-- 0) executor 가 owner 권한을 상속하도록 임시 재부여(ADMIN 보유 전제). 소유권 환원·trigger/함수 조작에 필요.
GRANT orchestration_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
GRANT CREATE ON SCHEMA public TO CURRENT_USER;   -- 새 owner(=executor) 가 schema CREATE 보유(멱등; 대개 이미 보유)

-- 1) trigger 재활성(비활성 잔존 방지) 후 15 trigger 제거. executor 가 owner 권한 상속 상태라 owner 소유 테이블 조작 가능.
DO $$
DECLARE t record;
DECLARE tbls text[] := ARRAY['job_artifacts','job_dependencies','automated_reviews','human_approvals','orchestration_audit_log','emergency_stops'];
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='public' AND c.relname = ANY(tbls) AND c.relkind='r' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', t.relname);  -- USER 만: system RI(FK) 트리거는 비-superuser 가 못 건드린다
  END LOOP;
END$$;
DROP TRIGGER IF EXISTS job_artifacts_immutable            ON job_artifacts;
DROP TRIGGER IF EXISTS automated_reviews_append_only       ON automated_reviews;
DROP TRIGGER IF EXISTS orchestration_audit_log_append_only ON orchestration_audit_log;
DROP TRIGGER IF EXISTS job_dependencies_no_delete   ON job_dependencies;
DROP TRIGGER IF EXISTS job_dependencies_guard        ON job_dependencies;
DROP TRIGGER IF EXISTS human_approvals_no_delete     ON human_approvals;
DROP TRIGGER IF EXISTS human_approvals_guard         ON human_approvals;
DROP TRIGGER IF EXISTS emergency_stops_no_delete     ON emergency_stops;
DROP TRIGGER IF EXISTS emergency_stops_guard         ON emergency_stops;
DROP TRIGGER IF EXISTS job_artifacts_no_truncate           ON job_artifacts;
DROP TRIGGER IF EXISTS automated_reviews_no_truncate        ON automated_reviews;
DROP TRIGGER IF EXISTS orchestration_audit_log_no_truncate  ON orchestration_audit_log;
DROP TRIGGER IF EXISTS job_dependencies_no_truncate         ON job_dependencies;
DROP TRIGGER IF EXISTS human_approvals_no_truncate          ON human_approvals;
DROP TRIGGER IF EXISTS emergency_stops_no_truncate          ON emergency_stops;

-- 2) 소유권 환원: 6테이블 + 4함수 → CURRENT_USER(executor). executor 가 owner 권한 상속 상태라 가능.
ALTER TABLE job_artifacts            OWNER TO CURRENT_USER;
ALTER TABLE job_dependencies         OWNER TO CURRENT_USER;
ALTER TABLE automated_reviews        OWNER TO CURRENT_USER;
ALTER TABLE human_approvals          OWNER TO CURRENT_USER;
ALTER TABLE orchestration_audit_log  OWNER TO CURRENT_USER;
ALTER TABLE emergency_stops          OWNER TO CURRENT_USER;
ALTER FUNCTION orch_deny_write()             OWNER TO CURRENT_USER;
ALTER FUNCTION orch_deny_delete()            OWNER TO CURRENT_USER;
ALTER FUNCTION orch_guard_business_update()  OWNER TO CURRENT_USER;
ALTER FUNCTION orch_deny_truncate()          OWNER TO CURRENT_USER;

-- 3) 함수 제거(소유권 환원 후 executor 가 소유하므로 가능).
DROP FUNCTION IF EXISTS orch_deny_write();
DROP FUNCTION IF EXISTS orch_deny_delete();
DROP FUNCTION IF EXISTS orch_guard_business_update();
DROP FUNCTION IF EXISTS orch_deny_truncate();

-- 4) role 정리: 부여 privilege·default ACL 제거 후 DROP ROLE.
--    (a) executor 가 6테이블 소유자로 환원됐으므로 runtime role 의 table privilege 를 직접 REVOKE.
REVOKE ALL ON job_artifacts, job_dependencies, automated_reviews, human_approvals, orchestration_audit_log, emergency_stops
  FROM orchestration_reader, orchestration_writer;
REVOKE USAGE ON SCHEMA public FROM orchestration_reader, orchestration_writer, orchestration_owner;
--    (b) 각 role 의 나머지(전역 default ACL 등)를 제거. DROP OWNED BY 는 executor 가 대상 role 의 권한을 **상속(USAGE)** 해야 가능하므로,
--        상속이 없으면 임시로 INHERIT TRUE 를 부여하고(executor 는 role 생성자라 ADMIN 보유) 정리 후 회수한다. 존재하는 role 만 처리(멱등).
DO $$
DECLARE r text; granted boolean;
BEGIN
  FOREACH r IN ARRAY ARRAY['orchestration_reader','orchestration_writer','orchestration_deployer','orchestration_admin','orchestration_owner'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      granted := false;
      IF NOT pg_has_role(current_user, r, 'USAGE') THEN EXECUTE format('GRANT %I TO CURRENT_USER WITH INHERIT TRUE', r); granted := true; END IF;
      EXECUTE format('DROP OWNED BY %I CASCADE', r);   -- 소유물 없음(2단계 환원) + 부여 privilege·default ACL 제거
      IF granted THEN EXECUTE format('REVOKE %I FROM CURRENT_USER', r); END IF;
    END IF;
  END LOOP;
END$$;
-- membership 체인 해제
REVOKE orchestration_admin FROM orchestration_deployer;
REVOKE orchestration_owner FROM orchestration_admin;
DROP ROLE IF EXISTS orchestration_reader;
DROP ROLE IF EXISTS orchestration_writer;
DROP ROLE IF EXISTS orchestration_deployer;
DROP ROLE IF EXISTS orchestration_admin;
DROP ROLE IF EXISTS orchestration_owner;

-- 5) executor 의 schema CREATE 는 원상(대개 이미 보유했으므로 명시 회수하지 않는다 — 필요 시 apply Gate 가 판단).
