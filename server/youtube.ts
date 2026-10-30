// ── YouTube 자동배포 연동 ──
// OAuth 연결(리프레시 토큰 저장) → 액세스 토큰 자동갱신 → 숏폼 영상 업로드(resumable)
// 토큰은 oauth_tokens 테이블(provider="youtube")에 저장한다.
import { OAuth2Client } from "google-auth-library";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { oauthTokens } from "@shared/schema";
import {
  YoutubeThumbnailError,
  parseYoutubeErrorReason,
  type YoutubeVideoState,
} from "./youtubeThumbnailPolicy";
import type { ProcessingCheck } from "./ytFrame/processing";

const PROVIDER = "youtube";
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly", // 2026-10-30 공유·재생목록 저장·구독 증감(통계) — 다시 연결해야 적용
];

/** 클라이언트 ID/SECRET이 .env에 설정돼 있는지 */
export function youtubeConfigured(): boolean {
  return !!(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET);
}

/** 콜백(리디렉션) URL — 개발은 localhost, 배포는 도메인 */
function getRedirectUri(): string {
  // trim: 2026-10-30 다시 연결이 '400 invalid_request'(redirect_uri= https://… 앞에 공백)로 막힘 — 변수 값 앞뒤 공백 제거
  const base =
    process.env.PUBLIC_BASE_URL?.trim() ||
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

/**
 * 커스텀 썸네일 설정 (영상 맨 앞 프레임 등). 채널이 커스텀 썸네일 사용 가능해야 함.
 * 실패는 YoutubeThumbnailError 로 던진다 — HTTP 상태와 YouTube reason 을 구조적으로 전달해
 * 호출부가 문자열 검색 없이 재시도 여부를 판정할 수 있게 한다.
 * 연결 실패·타임아웃은 status=null, networkFailure=true 로 전달된다.
 */
export async function setYoutubeThumbnail(
  videoId: string,
  image: Buffer,
  mimeType = "image/jpeg",
): Promise<void> {
  const accessToken = await getAccessToken();
  let r: Response;
  try {
    r = await fetch(
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
  } catch (e: any) {
    throw new YoutubeThumbnailError({
      status: null,
      reason: null,
      bodyText: String(e?.message ?? e),
      networkFailure: true,
    });
  }
  if (!r.ok) {
    const bodyText = await r.text().catch(() => "");
    throw new YoutubeThumbnailError({
      status: r.status,
      reason: parseYoutubeErrorReason(bodyText),
      bodyText,
    });
  }
}

/**
 * 영상의 업로드·처리 상태 조회(진단용). 기존 youtube.readonly 스코프로 충분하다.
 * 조회 실패는 던지지 않고 null 을 돌려준다 — 진단이 본 흐름을 막으면 안 된다.
 */
export async function getYoutubeVideoState(videoId: string): Promise<YoutubeVideoState | null> {
  try {
    const accessToken = await getAccessToken();
    const r = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=status,processingDetails&id=${encodeURIComponent(videoId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!r.ok) return null;
    const j: any = await r.json();
    const it = j?.items?.[0];
    if (!it) return null;
    return {
      uploadStatus: it.status?.uploadStatus ?? null,
      processingStatus: it.processingDetails?.processingStatus ?? null,
      processingFailureReason: it.processingDetails?.processingFailureReason ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * 처리 상태 + 공개범위·제목 조회. "조회 실패"와 "영상 없음"을 구분해서 돌려준다
 * (getYoutubeVideoState 는 실패를 전부 null 로 뭉갠다). 쇼츠 장면 선택 작업의 출고 판정용.
 */
export async function checkYoutubeProcessing(videoId: string): Promise<ProcessingCheck> {
  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (e: any) {
    return { kind: "lookup_error", error: `토큰 획득 실패: ${e?.message ?? e}` };
  }
  let r: Response;
  try {
    r = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,status,processingDetails&id=${encodeURIComponent(videoId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
  } catch (e: any) {
    return { kind: "lookup_error", error: `네트워크 실패: ${e?.message ?? e}` };
  }
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    return { kind: "lookup_error", error: `HTTP ${r.status}: ${body.slice(0, 200)}` };
  }
  const j: any = await r.json().catch(() => null);
  const it = j?.items?.[0];
  if (!it) return { kind: "not_found" };
  return {
    kind: "ok",
    state: {
      uploadStatus: it.status?.uploadStatus ?? null,
      processingStatus: it.processingDetails?.processingStatus ?? null,
      processingFailureReason: it.processingDetails?.processingFailureReason ?? null,
      privacyStatus: it.status?.privacyStatus ?? null,
      title: it.snippet?.title ?? null,
    },
  };
}

/**
 * 채널·최근 영상 숫자(2026-10-30 대표님 '유튜브·틱톡·클립·스레드 몽땅 조사'): 구독자·총 조회수 + 최근 영상별 조회·좋아요·댓글.
 * 기존 youtube.readonly 스코프로 충분(Data API). 공유·구독 증감은 Analytics API(yt-analytics.readonly)가 있어야 해서 아직 안 함.
 */
export async function getYoutubeStats(limit = 20) {
  const accessToken = await getAccessToken();
  const g = async (path: string) => {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const j: any = await r.json();
    if (!r.ok) throw new Error(`YouTube 조회 실패(${r.status}): ${String(j?.error?.message ?? "").slice(0, 200)}`);
    return j;
  };
  const ch = (await g("channels?part=snippet,statistics,contentDetails&mine=true"))?.items?.[0];
  if (!ch) throw new Error("YouTube 채널을 찾지 못함");
  const uploads = ch.contentDetails?.relatedPlaylists?.uploads;
  const n = Math.min(Math.max(limit, 1), 50);
  const ids = uploads
    ? ((await g(`playlistItems?part=contentDetails&maxResults=${n}&playlistId=${encodeURIComponent(uploads)}`))?.items ?? [])
        .map((x: any) => x.contentDetails?.videoId).filter(Boolean)
    : [];
  const vids = ids.length ? (await g(`videos?part=snippet,statistics&id=${ids.join(",")}`))?.items ?? [] : [];

  // 분석(yt-analytics.readonly — 2026-10-30 대표님 '저장·공유·구독 취소'): 최근 30일 공유·재생목록 저장·구독 증감, 영상별 공유·저장.
  // 권한이 없으면(다시 연결 전) analyticsError 만 담고 나머지는 그대로. 유튜브 분석은 2~3일 늦게 집계됨.
  const day = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
  const metrics = "views,shares,videosAddedToPlaylists,subscribersGained,subscribersLost";
  const ga = async (q: string) => {
    const r = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${day(30)}&endDate=${day(0)}&metrics=${metrics}${q}`,
      { headers: { Authorization: `Bearer ${accessToken}` } });
    const j: any = await r.json();
    if (!r.ok) throw new Error(`유튜브 분석 조회 실패(${r.status}): ${String(j?.error?.message ?? "").slice(0, 160)}`);
    return j;
  };
  const row = (j: any, cells: any[]) => Object.fromEntries((j?.columnHeaders ?? []).map((h: any, i: number) => [h.name, cells[i]]));
  let analytics: Record<string, number> | null = null, analyticsError: string | null = null;
  const perVideo: Record<string, any> = {};
  try {
    const t = await ga("");
    analytics = row(t, t?.rows?.[0] ?? []) as any;
    if (ids.length) {
      const v = await ga(`&dimensions=video&filters=video==${ids.join(",")}`);
      for (const cells of v?.rows ?? []) { const o = row(v, cells); perVideo[o.video] = o; }
    }
  } catch (e: any) {
    analyticsError = String(e?.message ?? e);
  }
  return {
    channel: ch.snippet?.title,
    subscribers: Number(ch.statistics?.subscriberCount ?? 0),
    views: Number(ch.statistics?.viewCount ?? 0),
    videoCount: Number(ch.statistics?.videoCount ?? 0),
    analytics, analyticsError,
    videos: vids.map((v: any) => ({
      id: v.id, url: `https://youtu.be/${v.id}`, title: v.snippet?.title, publishedAt: v.snippet?.publishedAt,
      views: Number(v.statistics?.viewCount ?? 0), likes: Number(v.statistics?.likeCount ?? 0), comments: Number(v.statistics?.commentCount ?? 0),
      shares: perVideo[v.id]?.shares ?? null, saves: perVideo[v.id]?.videosAddedToPlaylists ?? null,
    })),
  };
}
