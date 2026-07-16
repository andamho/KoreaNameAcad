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
