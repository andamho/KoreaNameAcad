-- 이름분석표 자동매칭 판정 테이블 (비파괴 additive migration)
-- 규칙: 새 테이블·인덱스·FK 생성만. 기존 테이블 DROP/DELETE/ALTER/타입변경 없음.
-- 적용: node --import tsx/esm server/migrate.ts (drizzle-kit push 사용 금지)

CREATE TABLE IF NOT EXISTS report_matches (
  id                     varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name              text NOT NULL,
  file_path              text,
  file_hash              text,
  first_seen_at          timestamp NOT NULL DEFAULT now(),
  extracted_name         text,
  report_type            text,
  status                 text NOT NULL DEFAULT 'pending',
  matched_customer_id    varchar,
  matched_consultation_id varchar,
  top_score              integer,
  second_score           integer,
  score_gap              integer,
  match_reason           text,
  candidate_snapshot     text,
  manually_confirmed_by  text,
  manually_confirmed_at  timestamp,
  created_at             timestamp NOT NULL DEFAULT now(),
  updated_at             timestamp NOT NULL DEFAULT now()
);

-- 조회·중복방지용 인덱스 (모두 새 테이블 대상)
CREATE INDEX IF NOT EXISTS report_matches_status_idx     ON report_matches (status);
CREATE INDEX IF NOT EXISTS report_matches_file_name_idx  ON report_matches (file_name);
CREATE INDEX IF NOT EXISTS report_matches_file_hash_idx  ON report_matches (file_hash);
CREATE INDEX IF NOT EXISTS report_matches_customer_idx   ON report_matches (matched_customer_id);

-- FK: 새 테이블에서 기존 테이블 참조(기존 테이블은 변경 없음). 고객/상담 삭제 시 NULL 로만.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'report_matches_customer_fk') THEN
    ALTER TABLE report_matches
      ADD CONSTRAINT report_matches_customer_fk
      FOREIGN KEY (matched_customer_id) REFERENCES customers(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'report_matches_consultation_fk') THEN
    ALTER TABLE report_matches
      ADD CONSTRAINT report_matches_consultation_fk
      FOREIGN KEY (matched_consultation_id) REFERENCES consultations(id) ON DELETE SET NULL;
  END IF;
END $$;
