// ── Instagram 릴스 게시 — Graph API 얇은 래퍼 ───────────────────────────────
// graph.instagram.com (Instagram API with Instagram Login). 2단계 게시: 컨테이너 → 처리대기 → 게시.
// 인스타는 video_url 이 "공개 인터넷 주소"여야 함 → R2 객체를 실서버(/objects/)로 서빙.
//
// [중요] 이 파일은 HTTP 호출만 한다. 폴링·유예·리스·중복방지 같은 판단은 전부
// reconcile.ts(오케스트레이션) + publishDecision.ts(순수 판정) 로 옮겼다.
// 예전 구조는 ERROR 를 곧바로 최종 실패로 확정하고 creation_id 를 버려서,
// 나중에 FINISHED 가 된 컨테이너를 다시 찾아갈 수 없었다.
//
// 토큰은 oauth_tokens 테이블에서 읽고 만료 전 자동 갱신된다(tokens.ts).
import { IG_GRAPH, getIgToken } from "./tokens";

export async function instagramConfigured(): Promise<boolean> {
  return !!(await getIgToken());
}

export async function igToken(): Promise<string> {
  const t = await getIgToken();
  if (!t) throw new Error("인스타 토큰 없음 — /admin에서 인스타 연결 필요");
  return t.accessToken;
}

/** 연결 상태 + 계정명 조회 */
export async function getInstagramStatus(): Promise<{ connected: boolean; username?: string }> {
  const t = await getIgToken();
  if (!t) return { connected: false };
  try {
    const r = await fetch(`${IG_GRAPH}/me?fields=username,account_type&access_token=${t.accessToken}`);
    const j: any = await r.json();
    if (j?.username) return { connected: true, username: j.username };
    return { connected: false };
  } catch {
    return { connected: false };
  }
}

/** 1단계: 릴스 컨테이너 생성. videoUrl 은 공개 접근 가능한 mp4 URL 이어야 한다 */
export async function igCreateReelContainer(opts: {
  token: string;
  videoUrl: string;
  caption: string;
}): Promise<{ creationId: string; raw: unknown }> {
  const params = new URLSearchParams({
    media_type: "REELS",
    video_url: opts.videoUrl,
    caption: opts.caption || "",
    access_token: opts.token,
  });
  const r = await fetch(`${IG_GRAPH}/me/media`, { method: "POST", body: params });
  const j: any = await r.json();
  if (!r.ok || !j?.id) throw new Error(`인스타 컨테이너 생성 실패: ${JSON.stringify(j)}`);
  return { creationId: String(j.id), raw: j };
}

/**
 * 2단계: 컨테이너 처리 상태 조회.
 * status_code: IN_PROGRESS | FINISHED | ERROR | PUBLISHED | EXPIRED
 * [주의] ERROR 는 최종 상태가 아닐 수 있다. 실제로 ERROR 를 낸 컨테이너가 뒤늦게 FINISHED 가 된
 * 사례가 있었다(2026-08-06). 그래서 여기서는 판단하지 않고 원문 그대로 올려보낸다.
 */
export async function igFetchContainerStatus(opts: {
  token: string;
  creationId: string;
}): Promise<{ statusCode: string; raw: any }> {
  const r = await fetch(
    `${IG_GRAPH}/${encodeURIComponent(opts.creationId)}?fields=id,status_code,status&access_token=${opts.token}`,
  );
  const j: any = await r.json();
  if (!r.ok && !j?.status_code) {
    throw new Error(`인스타 컨테이너 상태 조회 실패: ${JSON.stringify(j?.error ?? j)}`);
  }
  return { statusCode: String(j?.status_code ?? "UNKNOWN"), raw: j };
}

/** 3단계: 게시. 반드시 리스를 쥔 실행만 호출해야 한다(reconcile.ts 가 보장) */
export async function igMediaPublish(opts: {
  token: string;
  creationId: string;
}): Promise<{ mediaId: string; raw: unknown }> {
  const r = await fetch(`${IG_GRAPH}/me/media_publish`, {
    method: "POST",
    body: new URLSearchParams({ creation_id: opts.creationId, access_token: opts.token }),
  });
  const j: any = await r.json();
  if (!r.ok || !j?.id) throw new Error(`인스타 게시 실패: ${JSON.stringify(j)}`);
  return { mediaId: String(j.id), raw: j };
}
