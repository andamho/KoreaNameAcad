-- 인스타 릴스 게시 조정(reconciliation) 테이블 3종 — 비파괴 additive migration
-- 규칙: 새 테이블·인덱스 생성만. 기존 테이블(video_jobs / oauth_tokens)은 한 컬럼도 건드리지 않는다.
-- 적용: node --import tsx/esm server/migrate.ts (drizzle-kit push 사용 금지)
--
-- 배경: 컨테이너 폴링이 인스타의 일시적 ERROR 를 최종 실패로 확정해 버렸고, creation_id 를
-- 어디에도 남기지 않아 나중에 FINISHED 가 된 컨테이너를 다시 찾아갈 수 없었다.
-- 게시권·리스·재확인 상태의 정본은 전부 ig_publications 에 둔다.
-- video_jobs.ig_status / ig_media_id 는 화면 호환용 사본으로만 남는다(기존 어휘 유지).

-- ── 1) OAuth 계정 바인딩 ─────────────────────────────────────────────────────
-- 게시할 때마다 /me 를 호출하지 않기 위해 계정 ID 를 고정해 둔다.
-- 토큰 원문은 저장하지 않는다. 대조는 sha256 지문으로만 한다.
CREATE TABLE IF NOT EXISTS ig_account_binding (
  provider          text PRIMARY KEY,              -- 'instagram' (Instagram Login)
  account_id        text NOT NULL,                 -- IG user ID (OAuth 응답 user_id 또는 단발 백필)
  username          text,                          -- 진단 기록용
  oauth_token_id    text,                          -- oauth_tokens.provider (논리 참조, 무FK)
  token_fingerprint varchar(64),                   -- sha256(access_token) — 원문 저장 금지
  source            text NOT NULL DEFAULT 'oauth', -- oauth | backfill
  bound_at          timestamp NOT NULL DEFAULT now(),
  updated_at        timestamp NOT NULL DEFAULT now()
);

-- ── 2) 게시권·리스의 유일한 권위 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ig_publications (
  id                    varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  video_job_id          varchar NOT NULL,          -- video_jobs.id (논리 참조, 무FK)
  instagram_account_id  text    NOT NULL,          -- 컨테이너 생성 시점 계정 스냅숏
  creation_id           text,                      -- IG 컨테이너 ID
  container_created_at  timestamp,                 -- EXPIRED(24h) 판정 기준
  container_generation  integer NOT NULL DEFAULT 1,-- 컨테이너 생성 횟수(교체될 때만 증가)
  converted_r2_key      text,                      -- 업로드한 변환본 R2 키
  content_fingerprint   varchar(64),               -- sha256(videoR2Key+caption) — 진단 전용
  media_id              text,                      -- 게시 성공 시. PUBLISHED 인데 역조회 실패면 NULL 허용
  state                 text    NOT NULL,          -- publishing | published | publish_unknown
  lease_token           varchar(64),
  lease_expires_at      timestamp,
  publish_attempt_count integer NOT NULL DEFAULT 0,-- media_publish 호출 직전에만 증가
  check_attempt         integer NOT NULL DEFAULT 0,-- 완료된 유예 재조회 수(0/1/2/3)
  next_check_at         timestamp,                 -- 다음 재확인 시각(재시작 복구 근거)
  last_reconciled_at    timestamp,
  claimed_at            timestamp NOT NULL DEFAULT now(),
  published_at          timestamp,
  updated_at            timestamp NOT NULL DEFAULT now(),
  CONSTRAINT ig_publications_job_account_uniq UNIQUE (video_job_id, instagram_account_id)
);

-- 복구 스윕용: 아직 안 끝났고 재확인 시각이 지난 행만 골라낸다.
CREATE INDEX IF NOT EXISTS ig_publications_pending_idx
  ON ig_publications (next_check_at)
  WHERE state <> 'published';

CREATE INDEX IF NOT EXISTS ig_publications_job_idx ON ig_publications (video_job_id);
CREATE INDEX IF NOT EXISTS ig_publications_creation_idx ON ig_publications (creation_id);

-- ── 3) 상태조회 응답 이력 ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ig_publish_events (
  id             varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id varchar,                          -- ig_publications.id
  video_job_id   varchar NOT NULL,
  creation_id    text,
  event_type     text NOT NULL,                    -- container_created | status_poll | transition
                                                   -- | publish_attempt | publish_result | recovery
  status_code    text,                             -- IG status_code 원본
  raw_response   jsonb,                            -- 상태조회 응답 전문
  from_state     text,
  to_state       text,
  attempt        integer,
  note           text,
  occurred_at    timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ig_publish_events_job_idx ON ig_publish_events (video_job_id, occurred_at);
CREATE INDEX IF NOT EXISTS ig_publish_events_pub_idx ON ig_publish_events (publication_id, occurred_at);

-- events → publications FK (둘 다 이번에 새로 만드는 테이블)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ig_publish_events_publication_fk') THEN
    ALTER TABLE ig_publish_events
      ADD CONSTRAINT ig_publish_events_publication_fk
      FOREIGN KEY (publication_id) REFERENCES ig_publications(id) ON DELETE SET NULL;
  END IF;
END $$;
