-- ⚠️⚠️ DRAFT — 미적용·미등록(일반 registry 아님·general runner 로 실행 금지). 별도 승인 hardening Gate 에서만 적용.
-- 목적: 운영 adapter/writer 가 생기기 전에 job_artifacts 불변성 + orchestration_audit_log/automated_reviews append-only 를
--       DB 권한(REVOKE) + trigger(2차 방어)로 강제. business-state(job_dependencies/human_approvals/emergency_stops)는
--       제한된 UPDATE 허용(감사 원장과 업무 상태 분리). DELETE/TRUNCATE 는 전 테이블 금지(만료=tombstone/status).
--
-- ⚠️ 이 파일에는 GRANT/REVOKE/UPDATE/DELETE/CREATE TRIGGER 가 포함되어 일반 additive 러너의 정적 스캐너가 거부한다.
--    → 전용 hardening 러너(server/migrations/hardening/hardeningRunner.ts, 키워드 스캔 대신 exact sha256 allowlist)로만 적용.
--
-- 비밀 없음: 여기서는 NOLOGIN 그룹 role 과 권한만 정의한다. 실제 LOGIN credential(writer/reader 비밀번호)은
--    이 파일에 두지 않고 별도 보안 경로(Neon console/API·secret store)에서 프로비저닝하고 그룹 role 에 멤버십만 부여한다.
--
-- 운영 사실(read-only 조사): 현재 app role = 테이블 OWNER · rolcreaterole=true · rolbypassrls=true · 6테이블 전 권한 보유.
--    → OWNER 로부터의 REVOKE 는 무효(소유자 암묵 권한). 따라서 런타임은 반드시 비-owner writer role 로 접속해야 하며,
--       trigger 는 owner/admin 실수까지 막는 2차 방어선이다(admin 은 session_replication_role=replica 로만 우회, 감사 절차 하).

-- ── 1) 최소 role (NOLOGIN 그룹) ──
CREATE ROLE orchestration_reader NOLOGIN;
CREATE ROLE orchestration_writer NOLOGIN;
CREATE ROLE orchestration_admin  NOLOGIN;

-- ── 2) 기본 권한 정리(PUBLIC 최소화) ──
REVOKE ALL ON job_artifacts, job_dependencies, automated_reviews, human_approvals, orchestration_audit_log, emergency_stops FROM PUBLIC;

-- ── 3) reader: SELECT 전용 ──
GRANT SELECT ON job_artifacts, job_dependencies, automated_reviews, human_approvals, orchestration_audit_log, emergency_stops TO orchestration_reader;

-- ── 4) writer: append-only/immutable = SELECT+INSERT / business-state = +제한 UPDATE. DELETE/TRUNCATE 없음 ──
GRANT SELECT, INSERT ON job_artifacts, automated_reviews, orchestration_audit_log TO orchestration_writer;
GRANT SELECT, INSERT ON job_dependencies, human_approvals, emergency_stops TO orchestration_writer;
-- 업무 상태 전이만 컬럼 단위 UPDATE 허용(식별·불변 컬럼 제외)
GRANT UPDATE (resolution_status, resolved_execution_id, resolved_artifact_id, resolved_at) ON job_dependencies TO orchestration_writer;
GRANT UPDATE (approval_status, decided_at, decided_by_protected_ref, decision_reason_code, decision_summary, updated_at) ON human_approvals TO orchestration_writer;
GRANT UPDATE (active, released_at, released_by_protected_ref, reason_summary, updated_at) ON emergency_stops TO orchestration_writer;

-- ── 5) admin: 전 권한(마이그레이션·긴급 전용, 런타임 사용 금지) ──
GRANT ALL ON job_artifacts, job_dependencies, automated_reviews, human_approvals, orchestration_audit_log, emergency_stops TO orchestration_admin;

-- ── 6) trigger 2차 방어선 ──
-- 6a. 전면 금지(immutable/append-only): UPDATE·DELETE 거부. machine-readable SQLSTATE.
CREATE OR REPLACE FUNCTION orch_deny_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'orchestration: % on % is forbidden (immutable/append-only)', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'OA001';
END;$$;
-- 6b. DELETE 전면 금지(business-state 포함): 만료는 물리삭제 아닌 tombstone/status.
CREATE OR REPLACE FUNCTION orch_deny_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'orchestration: DELETE on % is forbidden (use tombstone/status)', TG_TABLE_NAME
    USING ERRCODE = 'OA002';
END;$$;
-- 6c. business-state UPDATE 가드: 식별·불변 컬럼 변경 거부(상태 전이만 허용).
CREATE OR REPLACE FUNCTION orch_guard_business_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'orchestration: identity/created_at change on % forbidden', TG_TABLE_NAME USING ERRCODE = 'OA003';
  END IF;
  RETURN NEW;
END;$$;
-- 6d. TRUNCATE 전면 금지.
CREATE OR REPLACE FUNCTION orch_deny_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'orchestration: TRUNCATE on % is forbidden', TG_TABLE_NAME USING ERRCODE = 'OA004';
END;$$;

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

-- 적용 후 런타임은 orchestration_writer(비-owner LOGIN role, 별도 프로비저닝)로 접속. admin/owner 는 마이그레이션·긴급 전용.
-- 긴급 정정은 과거 이벤트 덮어쓰기 금지 — 새 correction 이벤트를 추가한다(hardening 문서 emergency 절차 참조).
