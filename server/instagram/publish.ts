// ── Instagram 릴스 자동배포 (Instagram API with Instagram Login) ──
// graph.instagram.com 사용. 2단계 게시: 컨테이너 생성 → 처리 대기 → 게시.
// 인스타는 video_url이 "공개 인터넷 주소"여야 함 → R2 객체를 실서버(/objects/)로 서빙.
//
// 토큰은 oauth_tokens 테이블에서 읽고 만료 전 자동 갱신된다(tokens.ts).
// .env의 INSTAGRAM_ACCESS_TOKEN은 DB가 비었을 때의 폴백으로만 남아 있다.
import { IG_GRAPH, getIgToken } from "./tokens";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function instagramConfigured(): Promise<boolean> {
  return !!(await getIgToken());
}

async function igToken(): Promise<string> {
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

/** 릴스 게시. videoUrl은 공개 접근 가능한 mp4 URL이어야 함. 반환: 게시된 mediaId */
export async function publishInstagramReel(opts: {
  videoUrl: string;
  caption?: string;
}): Promise<{ mediaId: string }> {
  const t = await igToken();

  // 1) 미디어 컨테이너 생성 (REELS)
  const createParams = new URLSearchParams({
    media_type: "REELS",
    video_url: opts.videoUrl,
    caption: opts.caption || "",
    access_token: t,
  });
  const c = await fetch(`${IG_GRAPH}/me/media`, { method: "POST", body: createParams });
  const cj: any = await c.json();
  if (!c.ok || !cj?.id) {
    throw new Error(`인스타 컨테이너 생성 실패: ${JSON.stringify(cj)}`);
  }
  const creationId = cj.id;

  // 2) 처리 상태 폴링 (인스타가 영상을 가져와 인코딩 — 시간 걸림)
  let finished = false;
  for (let i = 0; i < 45; i++) {
    await sleep(4000);
    const s = await fetch(`${IG_GRAPH}/${creationId}?fields=status_code,status&access_token=${t}`);
    const sj: any = await s.json();
    if (sj?.status_code === "FINISHED") {
      finished = true;
      break;
    }
    if (sj?.status_code === "ERROR") {
      throw new Error(`인스타 영상 처리 실패: ${JSON.stringify(sj)}`);
    }
    // IN_PROGRESS면 계속 대기
  }
  if (!finished) throw new Error("인스타 영상 처리 시간 초과(3분).");

  // 3) 게시
  const p = await fetch(`${IG_GRAPH}/me/media_publish`, {
    method: "POST",
    body: new URLSearchParams({ creation_id: creationId, access_token: t }),
  });
  const pj: any = await p.json();
  if (!p.ok || !pj?.id) {
    throw new Error(`인스타 게시 실패: ${JSON.stringify(pj)}`);
  }
  return { mediaId: pj.id };
}
