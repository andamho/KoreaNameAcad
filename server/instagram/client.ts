// graph.instagram.com 호출 공통 래퍼 (Instagram API with Instagram Login)
import { IG_GRAPH, getIgToken } from "./tokens";

export class IgApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
    readonly subcode?: number,
  ) {
    super(message);
    this.name = "IgApiError";
  }

  /** 레이트리밋 계열(4=앱, 17=유저, 32=요청수, 613=커스텀) → 재시도 가치 있음 */
  get isRateLimit(): boolean {
    return this.code === 4 || this.code === 17 || this.code === 32 || this.code === 613;
  }

  /** 토큰 만료/무효(190) → 재시도 무의미, 사람이 재연결해야 함 */
  get isAuthError(): boolean {
    return this.code === 190 || this.status === 401;
  }
}

async function callGraph(
  path: string,
  opts: { method?: "GET" | "POST" | "DELETE"; params?: Record<string, string>; token: string },
): Promise<any> {
  const method = opts.method ?? "GET";
  const url = `${IG_GRAPH}${path.startsWith("/") ? path : `/${path}`}`;
  const params = new URLSearchParams({ ...(opts.params ?? {}), access_token: opts.token });

  const r =
    method === "GET" || method === "DELETE"
      ? await fetch(`${url}?${params}`, { method })
      : await fetch(url, { method, body: params });

  const text = await r.text();
  let j: any;
  try {
    j = text ? JSON.parse(text) : {};
  } catch {
    throw new IgApiError(`응답 파싱 실패(${r.status}): ${text.slice(0, 200)}`, r.status);
  }

  if (!r.ok || j?.error) {
    const e = j?.error ?? {};
    throw new IgApiError(
      e.message || `Graph 호출 실패(${r.status})`,
      r.status,
      typeof e.code === "number" ? e.code : undefined,
      typeof e.error_subcode === "number" ? e.error_subcode : undefined,
    );
  }
  return j;
}

/** 저장된 토큰으로 Graph 호출. 토큰이 없으면 던진다 */
export async function igGraph(
  path: string,
  opts: { method?: "GET" | "POST" | "DELETE"; params?: Record<string, string> } = {},
): Promise<any> {
  const t = await getIgToken();
  if (!t) throw new IgApiError("인스타 토큰 없음 — /admin에서 인스타 연결 필요", 401, 190);
  return callGraph(path, { ...opts, token: t.accessToken });
}

/** 임의 토큰으로 Graph 호출 (OAuth 콜백 중 아직 저장 전 토큰 검증용) */
export async function igGraphWithToken(
  token: string,
  path: string,
  opts: { method?: "GET" | "POST" | "DELETE"; params?: Record<string, string> } = {},
): Promise<any> {
  return callGraph(path, { ...opts, token });
}

/** 내 계정 정보 */
export async function getMe(token?: string): Promise<{ id: string; username: string; account_type?: string }> {
  const params = { fields: "id,username,account_type" };
  return token ? igGraphWithToken(token, "/me", { params }) : igGraph("/me", { params });
}

/** 이 앱이 구독 중인 웹훅 필드 조회 */
export async function getSubscribedFields(): Promise<string[]> {
  const j = await igGraph("/me/subscribed_apps", { params: { fields: "subscribed_fields" } });
  const first = Array.isArray(j?.data) ? j.data[0] : undefined;
  const fields = first?.subscribed_fields;
  if (!Array.isArray(fields)) return [];
  // 응답이 ["comments"] 또는 [{name:"comments"}] 두 형태로 관찰됨 → 둘 다 수용
  return fields.map((f: any) => (typeof f === "string" ? f : f?.name)).filter(Boolean);
}

/** 댓글에 공개 답글 달기. 반환: 생성된 답글 id */
export async function replyToComment(commentId: string, message: string): Promise<{ id: string }> {
  const j = await igGraph(`/${commentId}/replies`, { method: "POST", params: { message } });
  if (!j?.id) throw new IgApiError(`답글 실패: ${JSON.stringify(j)}`, 502);
  return { id: j.id };
}

/** 내 게시물에 댓글 달기(배포 뒤 첫 댓글 — 신청 방법 안내). 반환: 생성된 댓글 id */
export async function commentOnMedia(mediaId: string, message: string): Promise<{ id: string }> {
  const j = await igGraph(`/${mediaId}/comments`, { method: "POST", params: { message } });
  if (!j?.id) throw new IgApiError(`댓글 실패: ${JSON.stringify(j)}`, 502);
  return { id: j.id };
}

/**
 * 댓글 작성자에게 Private Reply DM. 댓글 후 7일 이내, 댓글당 1회만 허용.
 * recipient를 comment_id로 지정하는 게 핵심(IGSID가 아니라).
 * 반환: {recipient_id, message_id}
 */
export async function sendPrivateReply(commentId: string, text: string): Promise<{ recipientId?: string; messageId?: string }> {
  const j = await igGraph(`/me/messages`, {
    method: "POST",
    params: { recipient: JSON.stringify({ comment_id: commentId }), message: JSON.stringify({ text }) },
  });
  if (j?.error) throw new IgApiError(`Private Reply 실패: ${JSON.stringify(j.error)}`, 502);
  return { recipientId: j?.recipient_id, messageId: j?.message_id };
}

/** 일반 DM 발송 (IGSID 대상, 24시간 창 내). 반환: {recipient_id, message_id} */
export async function sendDirectMessage(igsid: string, text: string): Promise<{ recipientId?: string; messageId?: string }> {
  const j = await igGraph(`/me/messages`, {
    method: "POST",
    params: { recipient: JSON.stringify({ id: igsid }), message: JSON.stringify({ text }) },
  });
  if (j?.error) throw new IgApiError(`DM 발송 실패: ${JSON.stringify(j.error)}`, 502);
  return { recipientId: j?.recipient_id, messageId: j?.message_id };
}

/** 웹훅 구독 (댓글 + DM) */
export async function subscribeWebhooks(fields = ["comments", "messages"]): Promise<void> {
  const j = await igGraph("/me/subscribed_apps", {
    method: "POST",
    params: { subscribed_fields: fields.join(",") },
  });
  if (!j?.success) throw new IgApiError(`웹훅 구독 실패: ${JSON.stringify(j)}`, 500);
}

/**
 * 앱 단위 웹훅 설정 조회 — 콜백 URL이 실제로 등록·활성인지 확인.
 * 계정 단위 구독(/me/subscribed_apps)과 별개이며, 이게 없으면 Meta가 아무 데도 안 보낸다.
 * graph.facebook.com 의 앱 subscriptions 엣지를 앱 액세스 토큰(app-id|app-secret)으로 조회.
 */
export async function getAppWebhookConfig(): Promise<
  | { ok: true; instagram: any | null; all: any[] }
  | { ok: false; error: string }
> {
  const appId = process.env.META_APP_ID?.trim();
  const secret = process.env.META_APP_SECRET?.trim();
  if (!appId) return { ok: false, error: "META_APP_ID 미설정" };
  if (!secret) return { ok: false, error: "META_APP_SECRET 미설정" };

  const appToken = `${appId}|${secret}`;
  const url = `https://graph.facebook.com/v25.0/${appId}/subscriptions?access_token=${encodeURIComponent(appToken)}`;
  const r = await fetch(url);
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j?.error) {
    return { ok: false, error: j?.error?.message || `조회 실패(${r.status})` };
  }
  const all = Array.isArray(j?.data) ? j.data : [];
  const instagram = all.find((s: any) => s.object === "instagram") ?? null;
  return { ok: true, instagram, all };
}

// ── 통계(2026-10-30 대표님 '조회수·저장·전달·댓글, 팔로워가 몇 명에서 몇 명이 됐는지') ──
// 권한 instagram_business_manage_insights 가 있어야 insights 가 나온다(없으면 기본 숫자만 + insightsError).
// 지표 하나가 그 게시물 종류에 없으면 호출 전체가 실패하므로 하나씩 물어 모은다.
const MEDIA_METRICS = ["views", "reach", "saved", "shares", "comments", "likes", "total_interactions"];
const ACCOUNT_METRICS = ["reach", "views", "accounts_engaged", "total_interactions", "likes", "comments", "saves", "shares", "follows_and_unfollows"];

async function metricValues(path: string, metrics: string[], params: Record<string, string>) {
  const out: Record<string, number | null> = {};
  let firstError: string | null = null;
  for (const m of metrics) {
    try {
      const j = await igGraph(path, { params: { ...params, metric: m, ...(m === "follows_and_unfollows" ? { breakdown: "follow_type" } : {}) } });
      const d = Array.isArray(j?.data) ? j.data[0] : null;
      const tv = d?.total_value;
      if (m === "follows_and_unfollows" && Array.isArray(tv?.breakdowns?.[0]?.results)) {
        for (const r of tv.breakdowns[0].results) out[String(r.dimension_values?.[0] ?? "").toLowerCase()] = Number(r.value ?? 0);
      }
      out[m] = tv ? Number(tv.value ?? 0) : d?.values?.length ? Number(d.values[d.values.length - 1].value ?? 0) : null;
    } catch (e: any) {
      out[m] = null;
      firstError ??= String(e?.message ?? e).slice(0, 200);
    }
  }
  return { values: out, error: firstError };
}

/** 계정 숫자: 지금 팔로워 수 + 최근 days 일(최대 30)의 하루하루 팔로워 증감 + 기간 합계 지표 */
export async function getAccountStats(days = 30) {
  const me = await igGraph("/me", { params: { fields: "id,username,followers_count,follows_count,media_count" } });
  const d = Math.min(Math.max(days, 1), 30);
  const until = Math.floor(Date.now() / 1000), since = until - d * 86400;
  let followerDaily: { date: string; value: number }[] = [];
  let insightsError: string | null = null;
  try {
    const j = await igGraph("/me/insights", { params: { metric: "follower_count", period: "day", since: String(since), until: String(until) } });
    followerDaily = (j?.data?.[0]?.values ?? []).map((v: any) => ({ date: String(v.end_time ?? "").slice(0, 10), value: Number(v.value ?? 0) }));
  } catch (e: any) {
    insightsError = String(e?.message ?? e).slice(0, 200);
  }
  const totals = await metricValues("/me/insights", ACCOUNT_METRICS,
    { period: "day", metric_type: "total_value", since: String(since), until: String(until) });
  return {
    username: me.username, followers: Number(me.followers_count ?? 0), follows: Number(me.follows_count ?? 0), mediaCount: Number(me.media_count ?? 0),
    days: d, followerDaily, totals: totals.values, insightsError: insightsError ?? totals.error,
  };
}

/** 최근 게시물 limit 개(최대 50)의 숫자: 기본(좋아요·댓글) + insights(조회·도달·저장·공유…) */
export async function getMediaStats(limit = 20) {
  const n = Math.min(Math.max(limit, 1), 50);
  const j = await igGraph("/me/media", {
    params: { fields: "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count", limit: String(n) },
  });
  const items: any[] = [];
  let insightsError: string | null = null;
  for (const m of j?.data ?? []) {
    const ins = await metricValues(`/${m.id}/insights`, MEDIA_METRICS, {});
    insightsError ??= ins.error;
    items.push({
      id: m.id, permalink: m.permalink, timestamp: m.timestamp, type: m.media_product_type || m.media_type,
      caption: String(m.caption ?? "").split("\n")[0].slice(0, 80),
      likes: Number(m.like_count ?? 0), comments: Number(m.comments_count ?? 0), insights: ins.values,
    });
  }
  return { items, insightsError };
}
