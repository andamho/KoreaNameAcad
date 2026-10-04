// ── 쇼츠 썸네일 장면 선택 작업 저장소 ────────────────────────────────────────
// 표: yt_frame_tasks (migrations/0006). 순수 SQL 만 쓰고 클라이언트는 주입받는다
// (운영 = pg 풀, 테스트 = PGlite).
//
// [시각 규칙] 시각 컬럼은 timestamp(without tz) 다. JS Date 를 넣거나 읽어서 비교하지 않는다.
//            기록·비교는 전부 SQL now() 기준(드라이버가 로컬 타임존으로 해석해 9시간 어긋난 전례).
// [펜싱]     워커가 보고하는 모든 변경은 lease_token 이 일치할 때만 반영된다.
import crypto from "crypto";

export type Q = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number }> };

export type FrameTaskState =
  | "queued" | "running" | "saved"
  | "verified" | "verify_failed" | "needs_review" | "unverifiable" | "failed";

export const TERMINAL_STATES: FrameTaskState[] = ["verified", "verify_failed", "needs_review", "unverifiable", "failed"];

export type VerifyResult = "match" | "mismatch" | "uncertain" | "unverifiable_non_public";
export const VERIFY_RESULTS: VerifyResult[] = ["match", "mismatch", "uncertain", "unverifiable_non_public"];

/** 워커가 이만큼 소식이 없으면 다른 실행이 다시 가져갈 수 있다 */
export const LEASE_SECONDS = 15 * 60;
/** 같은 작업을 워커에게 넘기는 최대 횟수 */
export const MAX_ATTEMPTS = 4;

export type FrameTask = {
  id: string;
  video_job_id: string | null;
  video_id: string;
  expected_title: string | null;
  source_r2_key: string | null;
  privacy_status: string | null;
  frame_sec: number;
  state: FrameTaskState;
  attempts: number;
  lease_token: string | null;
};

const newToken = () => crypto.randomBytes(24).toString("hex");

/** 작업 생성. 같은 영상 ID 가 이미 있으면 새로 만들지 않는다(중복 방지) */
export async function enqueueFrameTask(
  q: Q,
  t: { videoJobId?: string | null; videoId: string; expectedTitle?: string | null; sourceR2Key?: string | null; privacyStatus?: string | null; frameSec?: number },
): Promise<{ created: boolean; task: FrameTask }> {
  if (!/^[A-Za-z0-9_-]{11}$/.test(t.videoId)) throw new Error(`잘못된 영상 ID: ${t.videoId}`);
  const ins = await q.query(
    `insert into yt_frame_tasks (video_job_id, video_id, expected_title, source_r2_key, privacy_status, frame_sec)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (video_id) do nothing
     returning *`,
    [t.videoJobId ?? null, t.videoId, t.expectedTitle ?? null, t.sourceR2Key ?? null, t.privacyStatus ?? null, t.frameSec ?? 0],
  );
  if (ins.rows[0]) return { created: true, task: ins.rows[0] };
  const cur = await q.query(`select * from yt_frame_tasks where video_id = $1`, [t.videoId]);
  return { created: false, task: cur.rows[0] };
}

/**
 * 워커에게 넘길 작업 1건을 원자적으로 선점한다.
 * 대상: 대기 중(available_at 지남) 이거나, 진행 중인데 리스가 만료된 것(워커가 죽은 경우 회수).
 * 반환된 lease_token 이 이후 모든 보고의 열쇠다.
 */
export async function claimFrameTask(q: Q): Promise<FrameTask | null> {
  const token = newToken();
  const r = await q.query(
    `update yt_frame_tasks t
        set state = 'running',
            lease_token = $1,
            lease_expires_at = now() + ($2 || ' seconds')::interval,
            attempts = t.attempts + 1,
            updated_at = now()
      where t.id = (
        select id from yt_frame_tasks
         where (state = 'queued' and available_at <= now())
            or (state in ('running','saved') and coalesce(lease_expires_at, '-infinity'::timestamp) < now())
         order by available_at, created_at
         limit 1
         for update skip locked
      )
      returning *`,
    [token, String(LEASE_SECONDS)],
  );
  return r.rows[0] ?? null;
}

/** 리스 연장(작업이 오래 걸릴 때) */
export async function heartbeatFrameTask(q: Q, id: string, token: string): Promise<boolean> {
  const r = await q.query(
    `update yt_frame_tasks set lease_expires_at = now() + ($3 || ' seconds')::interval, updated_at = now()
      where id = $1 and lease_token = $2 and state in ('running','saved') returning id`,
    [id, token, String(LEASE_SECONDS)],
  );
  return r.rows.length === 1;
}

/** 아직 넘길 때가 아님(예: 유튜브 처리 중) → 대기로 되돌리고 delay 뒤에 다시 */
export async function deferFrameTask(q: Q, id: string, token: string, delaySec: number, stage: string, reason: string): Promise<boolean> {
  const r = await q.query(
    `update yt_frame_tasks
        set state = 'queued', lease_token = null, lease_expires_at = null,
            attempts = greatest(attempts - 1, 0),            -- 처리 대기는 시도 횟수로 치지 않는다
            available_at = now() + ($3 || ' seconds')::interval,
            last_stage = $4, last_error = $5, updated_at = now()
      where id = $1 and lease_token = $2 and state = 'running' returning id`,
    [id, token, String(delaySec), stage, reason.slice(0, 500)],
  );
  return r.rows.length === 1;
}

/** 앱에서 저장 성공 — 반영 확인 전 단계. 확인 동안 리스를 유지한다 */
export async function markFrameSaved(q: Q, id: string, token: string): Promise<boolean> {
  const r = await q.query(
    `update yt_frame_tasks set state = 'saved', saved_at = now(),
            lease_expires_at = now() + ($3 || ' seconds')::interval, updated_at = now()
      where id = $1 and lease_token = $2 and state = 'running' returning id`,
    [id, token, String(LEASE_SECONDS)],
  );
  return r.rows.length === 1;
}

/**
 * 반영 확인 결과(종결). match→verified, mismatch→verify_failed, uncertain→needs_review(확인 필요 — 성공 아님),
 * 비공개 등→unverifiable
 */
export async function markFrameVerified(
  q: Q, id: string, token: string,
  result: VerifyResult, detail: string,
): Promise<boolean> {
  const state: FrameTaskState =
    result === "match" ? "verified" : result === "mismatch" ? "verify_failed" : result === "uncertain" ? "needs_review" : "unverifiable";
  const r = await q.query(
    `update yt_frame_tasks set state = $3, verified_at = now(), verify_result = $4,
            last_stage = case when $3 in ('verify_failed','needs_review') then 'verify' else last_stage end,
            last_error = case when $3 in ('verify_failed','needs_review') then $5 else last_error end,
            lease_token = null, lease_expires_at = null, updated_at = now()
      where id = $1 and lease_token = $2 and state = 'saved' returning id`,
    [id, token, state, result, detail.slice(0, 500)],
  );
  return r.rows.length === 1;
}

/**
 * 실패 보고. retryable 이고 시도가 남았으면 백오프 후 대기로, 아니면 종결(failed).
 * 반환: 종결됐는지(알림 대상).
 */
export async function markFrameFailed(
  q: Q, id: string, token: string, stage: string, reason: string, retryable: boolean,
): Promise<{ applied: boolean; terminal: boolean; attempts: number }> {
  const r = await q.query(
    `update yt_frame_tasks
        set state = case when $5 and attempts < $6 then 'queued' else 'failed' end,
            available_at = case when $5 and attempts < $6 then now() + (least(attempts, 4) * 300 || ' seconds')::interval else available_at end,
            lease_token = null, lease_expires_at = null,
            last_stage = $3, last_error = $4, updated_at = now()
      where id = $1 and lease_token = $2 and state in ('running','saved')
      returning state, attempts`,
    [id, token, stage, reason.slice(0, 500), retryable, MAX_ATTEMPTS],
  );
  const row = r.rows[0];
  return row ? { applied: true, terminal: row.state === "failed", attempts: Number(row.attempts) } : { applied: false, terminal: false, attempts: 0 };
}

/**
 * 다음에 깨어나야 할 때까지 남은 초. 지금 넘길 게 있으면 0, 없으면 null.
 * (대기 중 작업의 available_at, 진행 중 작업의 리스 만료 중 가장 이른 것) — 서버가 타이머를 맞추는 데 쓴다.
 */
export async function secondsUntilNextWork(q: Q): Promise<number | null> {
  const r = await q.query(
    // 주의: greatest(0, NULL) 은 0 이다 → 작업이 없을 때 NULL 을 그대로 돌려주도록 case 로 감싼다
    `select case when min(t) is null then null
                 else greatest(0, ceil(extract(epoch from (min(t) - now()))))::int end as s from (
       select available_at as t from yt_frame_tasks where state = 'queued'
       union all
       select coalesce(lease_expires_at, '-infinity'::timestamp) from yt_frame_tasks where state in ('running','saved')
     ) x`,
  );
  const s = r.rows[0]?.s;
  return s === null || s === undefined ? null : Number(s);
}

export async function getFrameTask(q: Q, id: string): Promise<FrameTask | null> {
  const r = await q.query(`select * from yt_frame_tasks where id = $1`, [id]);
  return r.rows[0] ?? null;
}
