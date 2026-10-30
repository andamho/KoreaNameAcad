// ── 스레드(Threads) 게시 — 공식 Threads API 얇은 래퍼 (2026-10-23) ─────────────
// 흐름: 영상 컨테이너 만들기 → 처리 끝날 때까지 상태 확인 → 게시 → (선택) 내 글에 첫 답글로 상담 링크.
// 토큰: 원장님이 메타 개발자 '사용자 토큰 생성기'로 만든 60일 토큰을 Railway 변수 THREADS_ACCESS_TOKEN 에 넣음.
//   처음 쓸 때 DB(oauth_tokens, provider="threads")로 옮기고, 만료 10일 전부터 자동 연장(th_refresh_token)해 DB에 저장.
//   (인스타 tokens.ts 와 같은 구조 — env 는 DB가 비었을 때의 폴백)
// 한도(공식 문서): 글 500자, 영상 23~60fps·최대 5분·1GB, 24시간 250게시. 링크 카드는 글(TEXT) 게시물에만 붙음
//   → 영상 글의 상담 링크는 첫 답글(TEXT, reply_to_id + link_attachment)로 단다.
import { db } from "./db";
import { oauthTokens } from "@shared/schema";
import { eq } from "drizzle-orm";

export const THREADS_GRAPH = "https://graph.threads.com/v1.0";
const THREADS_ROOT = "https://graph.threads.com";
const PROVIDER = "threads";
export const MAX_TEXT = 500;
const REFRESH_BEFORE_MS = 10 * 24 * 3600 * 1000;

type Fetch = typeof fetch;
export type ThreadsToken = { accessToken: string; expiresAt: Date | null; source: "db" | "env" };

/** 글자 수(스레드는 500자 제한 — 한글·이모지 모두 1자로 세되, 넘으면 미리 막는다) */
export const textLength = (t: string) => Array.from(t || "").length;

/** 주제 태그 정리: 1~50자, 마침표(.)와 앰퍼샌드(&) 불가, 앞의 # 제거 */
export function cleanTopicTag(tag: unknown): string | undefined {
  const t = String(tag ?? "").replace(/^#+/, "").replace(/[.&]/g, "").trim();
  return t ? Array.from(t).slice(0, 50).join("") : undefined;
}

async function readDbToken(): Promise<ThreadsToken | null> {
  if (!db) return null;
  try {
    const [row] = await db.select().from(oauthTokens).where(eq(oauthTokens.provider, PROVIDER));
    if (row?.accessToken) return { accessToken: row.accessToken, expiresAt: row.expiresAt ?? null, source: "db" };
  } catch (e: any) {
    console.error(`[THREADS TOKEN] DB 조회 실패, env 폴백: ${e?.message}`);
  }
  return null;
}

async function saveDbToken(accessToken: string, expiresAt: Date | null, label?: string | null) {
  if (!db) return;
  const row = { provider: PROVIDER, accessToken, expiresAt, accountLabel: label ?? null, updatedAt: new Date() };
  await db.insert(oauthTokens).values(row).onConflictDoUpdate({ target: oauthTokens.provider, set: row });
}

/** 현재 토큰(DB 우선, 없으면 env). 둘 다 없으면 null */
export async function getThreadsToken(): Promise<ThreadsToken | null> {
  const d = await readDbToken();
  if (d) return d;
  const env = process.env.THREADS_ACCESS_TOKEN?.trim();
  return env ? { accessToken: env, expiresAt: null, source: "env" } : null;
}

/**
 * 연장이 필요하면 연장해서 DB에 저장한 토큰을 돌려준다.
 * - env 토큰(만료일 모름)은 처음 한 번 연장해 DB로 옮긴다(발급 24시간 안이면 메타가 거절 → 그대로 씀).
 * - DB 토큰은 만료 10일 전부터 연장.
 */
export async function ensureFreshToken(f: Fetch = fetch, now = Date.now()): Promise<ThreadsToken | null> {
  const t = await getThreadsToken();
  if (!t) return null;
  const due = t.source === "env" || (t.expiresAt && t.expiresAt.getTime() - now < REFRESH_BEFORE_MS);
  if (!due) return t;
  try {
    const r = await f(`${THREADS_ROOT}/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(t.accessToken)}`);
    const j: any = await r.json();
    if (r.ok && j?.access_token) {
      const exp = j.expires_in ? new Date(now + Number(j.expires_in) * 1000) : null;
      await saveDbToken(String(j.access_token), exp);
      return { accessToken: String(j.access_token), expiresAt: exp, source: "db" };
    }
    console.warn(`[THREADS TOKEN] 연장 안 됨(그대로 사용): ${JSON.stringify(j?.error ?? j).slice(0, 200)}`);
  } catch (e: any) {
    console.warn(`[THREADS TOKEN] 연장 요청 실패(그대로 사용): ${e?.message}`);
  }
  return t;
}

/** 연결 상태 + 계정명(토큰 값은 절대 돌려주지 않음) */
export async function getThreadsStatus(f: Fetch = fetch): Promise<{ connected: boolean; username?: string; source?: string; expiresAt?: string | null; error?: string }> {
  const t = await ensureFreshToken(f);
  if (!t) return { connected: false, error: "THREADS_ACCESS_TOKEN 없음" };
  try {
    const r = await f(`${THREADS_GRAPH}/me?fields=id,username&access_token=${encodeURIComponent(t.accessToken)}`);
    const j: any = await r.json();
    if (j?.username) {
      if (t.source === "db") await saveDbToken(t.accessToken, t.expiresAt, j.username).catch(() => {});
      return { connected: true, username: j.username, source: t.source, expiresAt: t.expiresAt?.toISOString() ?? null };
    }
    return { connected: false, source: t.source, error: String(j?.error?.message ?? "계정 조회 실패").slice(0, 200) };
  } catch (e: any) {
    return { connected: false, source: t.source, error: String(e?.message).slice(0, 200) };
  }
}

async function post(f: Fetch, path: string, params: Record<string, string | undefined>, token: string) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") body.set(k, v);
  body.set("access_token", token);
  const r = await f(`${THREADS_GRAPH}${path}`, { method: "POST", body });
  const j: any = await r.json();
  if (!r.ok || !j?.id) throw new Error(`스레드 요청 실패(${path}): ${JSON.stringify(j?.error ?? j).slice(0, 300)}`);
  return String(j.id);
}

/** 컨테이너 처리 끝날 때까지 기다림(영상). FINISHED 면 끝, ERROR/EXPIRED 면 실패 */
export async function waitContainer(
  id: string, token: string,
  opts: { f?: Fetch; firstWaitMs?: number; everyMs?: number; maxMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<void> {
  const f = opts.f ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const first = opts.firstWaitMs ?? 30_000, every = opts.everyMs ?? 15_000, max = opts.maxMs ?? 6 * 60_000;
  await sleep(first);
  for (let waited = first; ; waited += every) {
    const r = await f(`${THREADS_GRAPH}/${encodeURIComponent(id)}?fields=status,error_message&access_token=${encodeURIComponent(token)}`);
    const j: any = await r.json();
    const st = String(j?.status ?? "");
    if (st === "FINISHED") return;
    if (st === "ERROR" || st === "EXPIRED") throw new Error(`스레드 영상 처리 실패: ${st} ${j?.error_message ?? ""}`.trim());
    if (waited >= max) throw new Error(`스레드 영상 처리 시간 초과(${Math.round(max / 1000)}초, 상태 ${st || "?"})`);
    await sleep(every);
  }
}

/**
 * 영상 글 올리기(+ 선택: 첫 답글에 링크).
 * videoUrl 은 공개 HTTPS 주소(우리 서버 /objects/…). 글은 500자 이하.
 */
export async function publishThreadsVideo(
  opts: { videoUrl: string; text: string; topicTag?: string; replyText?: string; replyLink?: string },
  deps: { f?: Fetch; sleep?: (ms: number) => Promise<void>; waitOpts?: { firstWaitMs?: number; everyMs?: number; maxMs?: number } } = {},
): Promise<{ postId: string; permalink?: string; replyId?: string; replyError?: string }> {
  const f = deps.f ?? fetch;
  if (!/^https:\/\//.test(opts.videoUrl)) throw new Error("영상 주소는 https:// 공개 주소여야 합니다.");
  if (textLength(opts.text) > MAX_TEXT) throw new Error(`스레드 본문이 ${MAX_TEXT}자를 넘습니다(${textLength(opts.text)}자).`);
  if (opts.replyText && textLength(opts.replyText) > MAX_TEXT) throw new Error(`첫 답글이 ${MAX_TEXT}자를 넘습니다.`);
  const t = await ensureFreshToken(f);
  if (!t) throw new Error("스레드 토큰 없음 — Railway 변수 THREADS_ACCESS_TOKEN 확인");
  const tok = t.accessToken;

  const cid = await post(f, "/me/threads", { media_type: "VIDEO", video_url: opts.videoUrl, text: opts.text, topic_tag: cleanTopicTag(opts.topicTag) }, tok);
  await waitContainer(cid, tok, { f, sleep: deps.sleep, ...deps.waitOpts });
  const postId = await post(f, "/me/threads_publish", { creation_id: cid }, tok);

  let permalink: string | undefined;
  try {
    const r = await f(`${THREADS_GRAPH}/${encodeURIComponent(postId)}?fields=permalink&access_token=${encodeURIComponent(tok)}`);
    permalink = ((await r.json()) as any)?.permalink;
  } catch { /* 주소는 없어도 게시는 성공 */ }

  // 첫 답글(링크 카드). 실패해도 본 글은 이미 올라갔으므로 오류만 알려 준다.
  let replyId: string | undefined, replyError: string | undefined;
  if (opts.replyText) {
    try {
      const rid = await post(f, "/me/threads", { media_type: "TEXT", text: opts.replyText, reply_to_id: postId, link_attachment: opts.replyLink }, tok);
      await waitContainer(rid, tok, { f, sleep: deps.sleep, firstWaitMs: 2_000, everyMs: 3_000, maxMs: 60_000 });
      replyId = await post(f, "/me/threads_publish", { creation_id: rid }, tok);
    } catch (e: any) {
      replyError = String(e?.message).slice(0, 300);
    }
  }
  return { postId, permalink, replyId, replyError };
}

/**
 * 스레드 숫자(2026-10-30 대표님 '몽땅 조사'): 계정(팔로워·조회·좋아요·답글·리포스트) + 최근 글별 숫자.
 * threads_manage_insights 권한이 토큰에 있어야 함 — 없으면 insightsError 에 이유를 담고 글 목록만 돌려줌.
 */
export async function getThreadsStats(limit = 20, days = 30, f: Fetch = fetch) {
  const t = await ensureFreshToken(f);
  if (!t) throw new Error("THREADS_ACCESS_TOKEN 없음");
  const tok = encodeURIComponent(t.accessToken);
  const g = async (path: string) => {
    const r = await f(`${THREADS_GRAPH}${path}${path.includes("?") ? "&" : "?"}access_token=${tok}`);
    const j: any = await r.json();
    if (!r.ok || j?.error) throw new Error(String(j?.error?.message ?? `스레드 조회 실패(${r.status})`).slice(0, 200));
    return j;
  };
  const val = (d: any) => Number(d?.total_value?.value ?? (d?.values?.length ? d.values[d.values.length - 1].value : 0) ?? 0);
  const me = await g("/me?fields=id,username");
  let account: Record<string, number> = {}, insightsError: string | null = null;
  const until = Math.floor(Date.now() / 1000), since = until - Math.min(Math.max(days, 1), 30) * 86400;
  for (const m of ["followers_count", "views", "likes", "replies", "reposts", "quotes"]) {
    try {
      const j = await g(`/me/threads_insights?metric=${m}${m === "followers_count" ? "" : `&since=${since}&until=${until}`}`);
      account[m] = val(j?.data?.[0]);
    } catch (e: any) { insightsError ??= String(e?.message ?? e); }
  }
  const n = Math.min(Math.max(limit, 1), 50);
  const posts: any[] = [];
  for (const p of (await g(`/me/threads?fields=id,text,timestamp,permalink,media_type&limit=${n}`))?.data ?? []) {
    const ins: Record<string, number | null> = {};
    try {
      for (const d of (await g(`/${p.id}/insights?metric=views,likes,replies,reposts,quotes,shares`))?.data ?? []) ins[d.name] = val(d);
    } catch (e: any) { insightsError ??= String(e?.message ?? e); }
    posts.push({ id: p.id, permalink: p.permalink, timestamp: p.timestamp, type: p.media_type,
                 text: String(p.text ?? "").split("\n")[0].slice(0, 80), insights: ins });
  }
  return { username: me.username, account, posts, insightsError };
}
