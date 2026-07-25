-- ⚠️ 미적용 · 운영자 적용 대상(GRANT/CREATE ROLE 포함 → applyQueueRuntime.ts/PowerShell 로 승인 후 적용).
-- 목적: 이름분석표 **업무 처리**(processFile + gatherCandidates) 전용 최소권한 role.
--   로컬 name-report 워커가 소유자(neondb_owner) 없이, 실제 필요한 테이블·연산에만 접근.
--
-- processFile/gatherCandidates 가 실제로 하는 DB 연산(코드 전수 확인):
--   customers       : SELECT            (후보 조회)
--   consultations   : SELECT            (신청일·people_data 조회)
--   crm_files       : SELECT, INSERT    (기존 첨부 확인 + 자동첨부 INSERT)
--   report_matches  : SELECT, INSERT, UPDATE  (판정 행 생성·상태/점수/렌더URL 갱신)
--   DELETE·DDL·소유권·시퀀스(id=gen_random_uuid) : 없음.  jobs/job_executions : 접근 없음.
--
-- id 는 모두 gen_random_uuid() 기본값 → 시퀀스 GRANT 불요.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='orchestration_report_processor') THEN
    CREATE ROLE orchestration_report_processor LOGIN;  -- 비밀번호는 secret store 프로비저닝(SQL 밖)
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO orchestration_report_processor;
GRANT SELECT                 ON "customers"      TO orchestration_report_processor;
GRANT SELECT                 ON "consultations"  TO orchestration_report_processor;
GRANT SELECT, INSERT         ON "crm_files"      TO orchestration_report_processor;
GRANT SELECT, INSERT, UPDATE ON "report_matches" TO orchestration_report_processor;

DO $$ BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO orchestration_report_processor', current_database());
END $$;

-- ⚠️ NAME_REPORT_DB_URL = orchestration_report_processor. 소유자 URL(NEON_DATABASE_URL) 을 name-report 처리에 재사용 금지.
