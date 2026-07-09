// ── Instagram 릴스 자동배포 (Instagram API with Instagram Login) ──
// graph.instagram.com 사용. 2단계 게시: 컨테이너 생성 → 처리 대기 → 게시.
// 인스타는 video_url이 "공개 인터넷 주소"여야 함 → R2 객체를 실서버(/objects/)로 서빙.
const IG_BASE = "https://graph.instagram.com/v21.0";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function instagramConfigured(): boolean {
  return !!process.env.INSTAGRAM_ACCESS_TOKEN;
}

function igToken(): string {
  const t = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!t) throw new Error("INSTAGRAM_ACCESS_TOKEN 미설정");
  return t;
}

/** 연결 상태 + 계정명 조회 */
export async function getInstagramStatus(): Promise<{ connected: boolean; username?: string }> {
  if (!instagramConfigured()) return { connected: false };
  try {
    const r = await fetch(`${IG_BASE}/me?fields=username,account_type&access_token=${igToken()}`);
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
  const t = igToken();

  // 1) 미디어 컨테이너 생성 (REELS)
  const createParams = new URLSearchParams({
    media_type: "REELS",
    video_url: opts.videoUrl,
    caption: opts.caption || "",
    access_token: t,
  });
  const c = await fetch(`${IG_BASE}/me/media`, { method: "POST", body: createParams });
  const cj: any = await c.json();
  if (!c.ok || !cj?.id) {
    throw new Error(`인스타 컨테이너 생성 실패: ${JSON.stringify(cj)}`);
  }
  const creationId = cj.id;

  // 2) 처리 상태 폴링 (인스타가 영상을 가져와 인코딩 — 시간 걸림)
  let finished = false;
  for (let i = 0; i < 45; i++) {
    await sleep(4000);
    const s = await fetch(`${IG_BASE}/${creationId}?fields=status_code,status&access_token=${t}`);
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
  const p = await fetch(`${IG_BASE}/me/media_publish`, {
    method: "POST",
    body: new URLSearchParams({ creation_id: creationId, access_token: t }),
  });
  const pj: any = await p.json();
  if (!p.ok || !pj?.id) {
    throw new Error(`인스타 게시 실패: ${JSON.stringify(pj)}`);
  }
  return { mediaId: pj.id };
}
