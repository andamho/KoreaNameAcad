-- ⚠️ 미적용. cooperative cancel acknowledgment 용 additive 컬럼(신규 row·backfill 없음·기존 의미 무변경).
-- jobs 에 취소 **요청** 기록 컬럼 추가. worker 가 이 값을 보고 acknowledgeCancel 로 cancelled 전환한다.
-- (기존 cancelled_at 은 실제 취소 완료 시각. cancel_requested_at 은 취소 요청 시각으로 분리.)
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "cancel_requested_at"      timestamptz;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "cancel_requested_by_ref"  text;
-- 대기/실행 중 취소 요청을 빠르게 조회(부분 인덱스).
CREATE INDEX IF NOT EXISTS "jobs_cancel_requested_idx" ON "jobs" ("cancel_requested_at")
  WHERE "cancel_requested_at" IS NOT NULL AND "status" IN ('queued','running');
