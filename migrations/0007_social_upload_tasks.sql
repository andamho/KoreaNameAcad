-- 틱톡·네이버 클립 자동 업로드 작업 큐 — 비파괴 additive migration
-- 규칙: 새 테이블·인덱스 생성만. 기존 테이블은 건드리지 않는다.
-- 적용: node --import tsx/esm server/migrate.ts (drizzle-kit push 사용 금지)
--
-- 배경: 틱톡(개발자 앱 반려)·네이버 클립(공개 API 없음)은 서버가 직접 올릴 수 없다. 배포가 끝나면 여기 작업을 남기고
-- 이 PC 워커가 받아 플레이라이트로 올린다.
--
-- 상태: queued → running → posting → posted
--                        ↘ failed(재시도 소진·재시도 불가)
--       posting 중 끊기면 다시 올리지 않고 needs_review(확인 필요) — 같은 영상이 두 번 게시되는 것을 막는다.

CREATE TABLE IF NOT EXISTS social_upload_tasks (
  id               varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  video_job_id     varchar NOT NULL,                -- video_jobs.id (논리 참조, 무FK)
  platform         text    NOT NULL,                -- tiktok | naver_clip
  state            text    NOT NULL DEFAULT 'queued',
  attempts         integer NOT NULL DEFAULT 0,
  lease_token      varchar(64),
  lease_expires_at timestamp,
  available_at     timestamp NOT NULL DEFAULT now(),
  posting_at       timestamp,                       -- 게시 버튼을 누르기 직전
  posted_at        timestamp,                       -- 게시 확인
  result_url       text,
  last_stage       text,
  last_error       text,
  created_at       timestamp NOT NULL DEFAULT now(),
  updated_at       timestamp NOT NULL DEFAULT now(),
  CONSTRAINT social_upload_tasks_job_platform_uniq UNIQUE (video_job_id, platform)
);

CREATE INDEX IF NOT EXISTS social_upload_tasks_claim_idx ON social_upload_tasks (state, available_at);
