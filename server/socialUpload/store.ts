// ── 틱톡·네이버 클립 업로드 작업 저장소 ───────────────────────────────────────
// 표: social_upload_tasks (migrations/0007). 시각 비교는 전부 SQL now() 기준, 워커 보고는 lease_token 일치할 때만.
// [중복 게시 방지] posting(게시 버튼 직전) 상태에서 리스가 만료되면 다시 넘기지 않고 needs_review 로 바꾼다.
import crypto from "crypto";

export type Q = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number }> };
export type Platform = "tiktok" | "naver_clip";
export const PLATFORMS: Platform[] = ["tiktok", "naver_clip"];
export const LEASE_SECONDS = 20 * 60; // 영상 내려받기 + 업로드 + 게시까지
export const MAX_ATTEMPTS = 3;

export type SocialTask = {
  id: string; video_job_id: string; platform: Platform; state: string; attempts: number; lease_token: string | null;
};

export async function enqueueSocial(q: Q, videoJobId: string, platform: Platform): Promise<{ created: boolean }> {
  const r = await q.query(
    `insert into social_upload_tasks (video_job_id, platform) values ($1, $2)
     on conflict (video_job_id, platform) do nothing returning id`,
    [videoJobId, platform],
  );
  return { created: r.rows.length === 1 };
}

/** posting 중 끊긴 작업 → needs_review(다시 올리지 않음). 돌려준 행은 알림 대상 */
export async function parkStalePosting(q: Q): Promise<SocialTask[]> {
  const r = await q.query(
    `update social_upload_tasks set state = 'needs_review', lease_token = null, lease_expires_at = null,
            last_stage = 'posting', last_error = '게시 버튼을 누른 뒤 결과 보고가 없음 — 게시됐는지 직접 확인 필요(자동 재시도 안 함)',
            updated_at = now()
      where state = 'posting' and coalesce(lease_expires_at, '-infinity'::timestamp) < now()
      returning *`,
  );
  return r.rows;
}

export async function claimSocial(q: Q): Promise<SocialTask | null> {
  const token = crypto.randomBytes(24).toString("hex");
  const r = await q.query(
    `update social_upload_tasks t
        set state = 'running', lease_token = $1, lease_expires_at = now() + ($2 || ' seconds')::interval,
            attempts = t.attempts + 1, updated_at = now()
      where t.id = (
        select id from social_upload_tasks
         where (state = 'queued' and available_at <= now())
            or (state = 'running' and coalesce(lease_expires_at, '-infinity'::timestamp) < now())
         order by available_at, created_at limit 1 for update skip locked)
      returning *`,
    [token, String(LEASE_SECONDS)],
  );
  return r.rows[0] ?? null;
}

export async function heartbeatSocial(q: Q, id: string, token: string) {
  const r = await q.query(
    `update social_upload_tasks set lease_expires_at = now() + ($3 || ' seconds')::interval, updated_at = now()
      where id = $1 and lease_token = $2 and state in ('running','posting') returning id`,
    [id, token, String(LEASE_SECONDS)],
  );
  return r.rows.length === 1;
}

/** 게시 버튼을 누르기 직전에 반드시 호출 */
export async function markPosting(q: Q, id: string, token: string) {
  const r = await q.query(
    `update social_upload_tasks set state = 'posting', posting_at = now(), updated_at = now()
      where id = $1 and lease_token = $2 and state = 'running' returning id`,
    [id, token],
  );
  return r.rows.length === 1;
}

export async function markPosted(q: Q, id: string, token: string, url: string | null) {
  const r = await q.query(
    `update social_upload_tasks set state = 'posted', posted_at = now(), result_url = $3,
            lease_token = null, lease_expires_at = null, updated_at = now()
      where id = $1 and lease_token = $2 and state = 'posting' returning id`,
    [id, token, url],
  );
  return r.rows.length === 1;
}

/**
 * 실패 보고. running 에서의 실패만 재시도 가능(게시 버튼 전). posting 에서의 실패는 needs_review(게시됐을 수도 있음).
 */
export async function markSocialFailed(q: Q, id: string, token: string, stage: string, reason: string, retryable: boolean) {
  const r = await q.query(
    `update social_upload_tasks
        set state = case when state = 'posting' then 'needs_review'
                         when $5 and attempts < $6 then 'queued' else 'failed' end,
            available_at = case when state = 'running' and $5 and attempts < $6
                                then now() + (attempts * 600 || ' seconds')::interval else available_at end,
            lease_token = null, lease_expires_at = null, last_stage = $3, last_error = $4, updated_at = now()
      where id = $1 and lease_token = $2 and state in ('running','posting')
      returning state, attempts`,
    [id, token, stage, reason.slice(0, 500), retryable, MAX_ATTEMPTS],
  );
  const row = r.rows[0];
  return row ? { applied: true, state: row.state as string, attempts: Number(row.attempts) } : { applied: false, state: "", attempts: 0 };
}

export async function secondsUntilNextSocial(q: Q): Promise<number | null> {
  const r = await q.query(
    `select case when min(t) is null then null
                 else greatest(0, ceil(extract(epoch from (min(t) - now()))))::int end as s from (
       select available_at as t from social_upload_tasks where state = 'queued'
       union all
       select coalesce(lease_expires_at, '-infinity'::timestamp) from social_upload_tasks where state in ('running','posting')
     ) x`,
  );
  const s = r.rows[0]?.s;
  return s === null || s === undefined ? null : Number(s);
}

export async function getSocialTask(q: Q, id: string): Promise<SocialTask | null> {
  const r = await q.query(`select * from social_upload_tasks where id = $1`, [id]);
  return r.rows[0] ?? null;
}
