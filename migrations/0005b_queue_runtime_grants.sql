-- ⚠️ 미적용 · 운영자 적용 대상(GRANT/CREATE ROLE 포함 → 일반 additive 러너 아님. applyQueueRuntime.ts/PowerShell 로 승인 후 적용).
-- 목적: 큐 런타임 role 분리 최소권한. **소유자 연결(neondb_owner) 없이** worker/admin 이 각자 최소 권한으로 동작.
--   jobs/job_executions 는 hardening 6테이블이 아니다(상태가 계속 변하는 조정 테이블) → owner=neondb_owner 유지, GRANT 만.
--   id 는 uuid(gen_random_uuid) 라 시퀀스 GRANT 불요.
--
-- 1) worker(=orchestration_writer): claim·running·heartbeat·complete/fail·reaper·job 생성. SELECT/INSERT/UPDATE.
GRANT SELECT, INSERT, UPDATE ON "jobs"           TO orchestration_writer;
GRANT SELECT, INSERT, UPDATE ON "job_executions" TO orchestration_writer;

-- 2) admin API 전용 role: 목록·상세(SELECT) + 취소 **요청**(cancel 컬럼 UPDATE)만. INSERT·execution UPDATE·DELETE 없음.
--    reader(SELECT 전용)로는 cancel_requested_at 을 못 세우므로 별도 최소권한 role 을 만든다.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='orchestration_queue_admin') THEN
    CREATE ROLE orchestration_queue_admin LOGIN;  -- 비밀번호는 secret store 프로비저닝(SQL 밖)
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO orchestration_queue_admin;
GRANT SELECT ON "jobs", "job_executions" TO orchestration_queue_admin;
GRANT UPDATE ("cancel_requested_at", "cancel_requested_by_ref", "updated_at") ON "jobs" TO orchestration_queue_admin;

-- 3) reader(모니터링): SELECT 만.
GRANT SELECT ON "jobs", "job_executions" TO orchestration_reader;

-- 4) DB CONNECT(정적 SQL 은 DB 이름을 모르므로 current_database() 로).
DO $$ BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO orchestration_writer, orchestration_queue_admin, orchestration_reader', current_database());
END $$;

-- ⚠️ ORCHESTRATION_WORKER_URL = orchestration_writer · ORCHESTRATION_ADMIN_URL = orchestration_queue_admin.
--    소유자 URL(NEON_DATABASE_URL) 을 런타임 큐 작업에 재사용 금지.
