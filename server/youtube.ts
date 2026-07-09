// ── YouTube 자동배포 연동 ──
// OAuth 연결(리프레시 토큰 저장) → 액세스 토큰 자동갱신 → 숏폼 영상 업로드(resumable)
// 토큰은 oauth_tokens 테이블(provider="youtube")에 저장한다.
import { OAuth2Client } from "google-auth-library";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { oauthTokens } from "@shared/schema";

const PROVIDER = "youtube";
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

/** 클라이언트 ID/SECRET이 .env에 설정돼 있는지 */
export function youtubeConfigured(): boolean {
  return !!(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET);
}

/** 콜백(리디렉션) URL — 개발은 localhost, 배포는 도메인 */
function getRedirectUri(): string {
  const base =
    process.env.PUBLIC_BASE_URL ||
    (process.env.NODE_ENV === "production"
      ? "https://korea-name-acad.com"
      : "http://localhost:5000");
  return `${base.replace(/\/$/, "")}/api/auth/youtube/callback`;
}

function makeOAuthClient(): OAuth2Client {
  return new OAuth2Client({
    clientId: process.env.YOUTUBE_CLIENT_ID,
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
    redirectUri: getRedirectUri(),
  });
}

/** 동의 화면으로 보낼 인증 URL 생성 */
export function getYoutubeAuthUrl(state: string): string {
  return makeOAuthClient().generateAuthUrl({
    access_type: "offline", // 리프레시 토큰 발급
    prompt: "consent",      // 매번 리프레시 토큰 확실히 수신
    scope: SCOPES,
    state,
  });
}

/** 콜백에서 code를 토큰으로 교환하고 저장 */
export async function handleYoutubeCallback(code: string): Promise<{ channelTitle?: string }> {
  const client = makeOAuthClient();
  const { tokens } = await client.getToken(code);

  let channelTitle: string | undefined;
  if (tokens.access_token) {
    try {
      const r = await fetch(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        { headers: { Authorization: `Bearer ${tokens.access_token}` } },
      );
      const j: any = await r.json();
      channelTitle = j?.items?.[0]?.snippet?.title;
    } catch {
      /* 채널명 조회 실패는 무시 */
    }
  }

  await saveTokens({
    refreshToken: tokens.refresh_token ?? undefined,
    accessToken: tokens.access_token ?? undefined,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
    scope: tokens.scope ?? undefined,
    accountLabel: channelTitle,
  });
  return { channelTitle };
}

async function saveTokens(t: {
  refreshToken?: string;
  accessToken?: string;
  expiresAt?: Date;
  scope?: string;
  accountLabel?: string;
}): Promise<void> {
  if (!db) throw new Error("DB 사용 불가");
  const existing = await db.select().from(oauthTokens).where(eq(oauthTokens.provider, PROVIDER));
  const cur = existing[0];
  const row = {
    provider: PROVIDER,
    // 리프레시 토큰이 이번에 안 오면 기존 것을 유지
    refreshToken: t.refreshToken ?? cur?.refreshToken ?? null,
    accessToken: t.accessToken ?? null,
    expiresAt: t.expiresAt ?? null,
    scope: t.scope ?? cur?.scope ?? null,
    accountLabel: t.accountLabel ?? cur?.accountLabel ?? null,
    updatedAt: new Date(),
  };
  if (cur) {
    await db.update(oauthTokens).set(row).where(eq(oauthTokens.provider, PROVIDER));
  } else {
    await db.insert(oauthTokens).values(row);
  }
}

/** 연결 상태 조회 */
export async function getYoutubeStatus(): Promise<{ connected: boolean; channelTitle?: string }> {
  if (!db) return { connected: false };
  const rows = await db.select().from(oauthTokens).where(eq(oauthTokens.provider, PROVIDER));
  const r = rows[0];
  return { connected: !!r?.refreshToken, channelTitle: r?.accountLabel ?? undefined };
}

/** 저장된 리프레시 토큰으로 유효한 액세스 토큰 획득(자동 갱신) */
async function getAccessToken(): Promise<string> {
  if (!db) throw new Error("DB 사용 불가");
  const rows = await db.select().from(oauthTokens).where(eq(oauthTokens.provider, PROVIDER));
  const r = rows[0];
  if (!r?.refreshToken) throw new Error("YouTube가 연결되지 않았습니다. 먼저 계정을 연결하세요.");
  const client = makeOAuthClient();
  client.setCredentials({ refresh_token: r.refreshToken });
  const { token } = await client.getAccessToken(); // 만료 시 자동 갱신
  if (!token) throw new Error("액세스 토큰 획득 실패");
  return token;
}

/** 숏폼 영상 업로드 (resumable). 반환: 업로드된 videoId */
export async function uploadYoutubeVideo(opts: {
  video: Buffer;
  mimeType?: string;
  title: string;
  description?: string;
  tags?: string[];
  privacyStatus?: "public" | "private" | "unlisted";
}): Promise<{ videoId: string }> {
  const accessToken = await getAccessToken();
  const mime = opts.mimeType || "video/mp4";
  const meta = {
    snippet: {
      title: opts.title.slice(0, 100),
      description: opts.description ?? "",
      tags: opts.tags ?? [],
    },
    status: {
      privacyStatus: opts.privacyStatus ?? "private",
      selfDeclaredMadeForKids: false,
    },
  };

  // 1) resumable 업로드 세션 시작
  const init = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mime,
        "X-Upload-Content-Length": String(opts.video.length),
      },
      body: JSON.stringify(meta),
    },
  );
  if (!init.ok) {
    throw new Error(`YouTube 업로드 세션 시작 실패: ${init.status} ${await init.text()}`);
  }
  const uploadUrl = init.headers.get("location");
  if (!uploadUrl) throw new Error("YouTube 업로드 URL을 받지 못했습니다.");

  // 2) 실제 바이트 업로드
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mime, "Content-Length": String(opts.video.length) },
    body: opts.video,
  });
  if (!put.ok) {
    throw new Error(`YouTube 업로드 실패: ${put.status} ${await put.text()}`);
  }
  const result: any = await put.json();
  if (!result?.id) throw new Error("YouTube 응답에 videoId가 없습니다.");
  return { videoId: result.id };
}

/** 커스텀 썸네일 설정 (영상 맨 앞 프레임 등). 채널이 커스텀 썸네일 사용 가능해야 함. */
export async function setYoutubeThumbnail(
  videoId: string,
  image: Buffer,
  mimeType = "image/jpeg",
): Promise<void> {
  const accessToken = await getAccessToken();
  const r = await fetch(
    `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": mimeType.startsWith("image/") ? mimeType : "image/jpeg",
      },
      body: image,
    },
  );
  if (!r.ok) {
    throw new Error(`썸네일 설정 실패: ${r.status} ${await r.text()}`);
  }
}
