-- 쇼츠 썸네일 "장면 선택" 작업 큐 — 비파괴 additive migration
-- 규칙: 새 테이블·인덱스 생성만. 기존 테이블은 건드리지 않는다.
-- 적용: node --import tsx/esm server/migrate.ts (drizzle-kit push 사용 금지)
--
-- 배경: 쇼츠는 Data API thumbnails.set(이미지 업로드)이 HTTP 200 이어도 표시되지 않는다.
-- 유튜브 앱의 "장면 선택"만 실제로 반영된다(2026-10-03 실측). 앱 조작은 이 PC 의 에뮬레이터에서만
-- 가능하므로, 서버는 업로드 완료 시 작업을 여기 남기고 PC 워커가 받아 처리한다.
--
-- 상태: queued → running → saved → verified | verify_failed | needs_review(확인 필요) | unverifiable
--                         ↘ failed (재시도 소진·대상 확인 실패·처리 실패)
-- saved_at(앱에서 저장 성공)과 verified_at/verify_result(실제 썸네일 반영 확인)는 따로 기록한다.

CREATE TABLE IF NOT EXISTS yt_frame_tasks (
  id               varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  video_job_id     varchar,                       -- video_jobs.id (논리 참조, 무FK)
  video_id         text    NOT NULL,              -- 유튜브 영상 ID — 중복 방지 기준
  expected_title   text,                          -- 앱 화면 제목 대조용(보조 확인)
  source_r2_key    text,                          -- 원본 영상(반영 확인 시 기대 프레임 추출용)
  privacy_status   text,                          -- public|unlisted|private — 공개 썸네일로 확인 가능 여부
  frame_sec        integer NOT NULL DEFAULT 0,    -- 고를 장면(초). 앞 0.4초 썸네일 이미지 → 0
  state            text    NOT NULL DEFAULT 'queued',
  attempts         integer NOT NULL DEFAULT 0,    -- 워커에게 넘겨진 횟수
  lease_token      varchar(64),
  lease_expires_at timestamp,
  available_at     timestamp NOT NULL DEFAULT now(),
  saved_at         timestamp,                     -- 앱에서 저장 성공
  verified_at      timestamp,                     -- 반영 확인 시각
  verify_result    text,                          -- match | mismatch | uncertain | unverifiable_non_public
  last_stage       text,                          -- 마지막 실패 단계(identity|navigate|save|verify|processing…)
  last_error       text,
  created_at       timestamp NOT NULL DEFAULT now(),
  updated_at       timestamp NOT NULL DEFAULT now(),
  CONSTRAINT yt_frame_tasks_video_uniq UNIQUE (video_id)
);

-- 워커 선점용: 대기 중이거나 리스가 만료된 진행 중 작업
CREATE INDEX IF NOT EXISTS yt_frame_tasks_claim_idx ON yt_frame_tasks (state, available_at);
CREATE INDEX IF NOT EXISTS yt_frame_tasks_job_idx ON yt_frame_tasks (video_job_id);
