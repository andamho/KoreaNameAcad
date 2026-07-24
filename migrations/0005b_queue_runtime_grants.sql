-- ⚠️ 미적용 · 운영자 적용 대상(GRANT 포함 → 일반 additive 러너 아님, hardening apply 와 유사하게 승인 후 적용).
-- 목적: 큐 런타임(orchestration_writer/reader)이 **소유자 연결(neondb_owner) 없이** jobs/job_executions 를 운영하도록 최소 권한 부여.
--   jobs/job_executions 는 hardening 6테이블이 아니다(상태가 계속 변하는 조정 테이블) → owner=neondb_owner 유지, GRANT 만 부여.
--   id 는 uuid(gen_random_uuid) 라 시퀀스 GRANT 불요.
--
-- writer(런타임 주체): job 생성·claim·running·heartbeat·complete/fail·cancel 요청/ack 에 필요한 SELECT/INSERT/UPDATE.
GRANT SELECT, INSERT, UPDATE ON "jobs"            TO orchestration_writer;
GRANT SELECT, INSERT, UPDATE ON "job_executions"  TO orchestration_writer;
-- reader(관리자 조회/모니터): SELECT 만.
GRANT SELECT ON "jobs"           TO orchestration_reader;
GRANT SELECT ON "job_executions" TO orchestration_reader;
-- ⚠️ writer 에게 DELETE/TRUNCATE/REFERENCES/TRIGGER 는 부여하지 않는다(취소=상태 전이, 삭제 아님).
-- ⚠️ ORCHESTRATION_QUEUE_URL = orchestration_writer credential(별도 password, secret store). 소유자 URL 재사용 금지.
