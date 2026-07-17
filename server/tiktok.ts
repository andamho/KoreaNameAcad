// ── TikTok 자동배포 연동 (Content Posting API) ──
// OAuth(v2) 연결 → 토큰 저장/갱신 → 영상 업로드(초안 inbox: video.upload).
// video.publish(완전 자동 게시)는 앱 심사(오디트) 통과 후에만 가능 → 그 전엔 초안까지.
// 토큰은 oauth_tokens 테이블(provider="tiktok")에 저장.
import { eq } from "drizzle-orm";
import { db } from "./db";
import { oauthTokens } from "@shared/schema";

const PROVIDER = "tiktok";
const AUTH_BASE = "https://www.tiktok.com/v2/auth/authorize/";
const API_BASE = "https://open.tiktokapis.com/v2";
// video.upload=초안(inbox). video.publish=다이렉트 포스트(캡션 포함 자동 게시).
// 심사(오디트) 전에는 다이렉트 포스트가 강제로 SELF_ONLY(비공개)로만 게시됨(TikTok 정책). 통과 후 PUBLIC 가능.
const SCOPES = "user.info.basic,video.upload,video.publish";

export function tiktokConfigured(): boolean {
  return !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);
}

function getRedirectUri(): string {
  const base =
    process.env.PUBLIC_BASE_URL ||
    (process.env.NODE_ENV === "production"
      ? "https://korea-name-acad.com"
      : "http://localhost:5000");
  return `${base.replace(/\/$/, "")}/api/auth/tiktok/callback`;
}

/** 동의 화면 URL */
export function getTiktokAuthUrl(state: string): string {
  const clientKey = process.env.TIKTOK_CLIENT_KEY || "";
  const redirectUri = getRedirectUri();
  // 주의: scope의 콤마는 인코딩하면 안 됨(TikTok이 %2C를 스코프의 일부로 취급 → scope 오류).
  // scope 값(user.info.basic / video.upload)은 특수문자가 없어 그대로 붙여도 안전.
  return (
    `${AUTH_BASE}?client_key=${encodeURIComponent(clientKey)}` +
    `&scope=${SCOPES}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`
  );
}

/** 콜백: code → 토큰 교환 후 저장 */
export async function handleTiktokCallback(code: string): Promise<{ displayName?: string }> {
  const body = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY || "",
    client_secret: process.env.TIKTOK_CLIENT_SECRET || "",
    code,
    grant_type: "authorization_code",
    redirect_uri: getRedirectUri(),
  });
  const r = await fetch(`${API_BASE}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const j: any = await r.json();
  if (!r.ok || !j?.access_token) {
    throw new Error(`TikTok 토큰 교환 실패: ${JSON.stringify(j)}`);
  }

  let displayName: string | undefined;
  try {
    const u = await fetch(`${API_BASE}/user/info/?fields=open_id,display_name`, {
      headers: { Authorization: `Bearer ${j.access_token}` },
    });
    const uj: any = await u.json();
    displayName = uj?.data?.user?.display_name;
  } catch {
    /* 표시명 조회 실패 무시 */
  }

  await saveTokens({
    refreshToken: j.refresh_token,
    accessToken: j.access_token,
    expiresAt: j.expires_in ? new Date(Date.now() + j.expires_in * 1000) : undefined,
    scope: j.scope,
    accountLabel: displayName,
  });
  return { displayName };
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

export async function getTiktokStatus(): Promise<{ connected: boolean; displayName?: string }> {
  if (!db) return { connected: false };
  const rows = await db.select().from(oauthTokens).where(eq(oauthTokens.provider, PROVIDER));
  const r = rows[0];
  return { connected: !!r?.refreshToken, displayName: r?.accountLabel ?? undefined };
}

/** 저장된 refresh token으로 유효한 access token 확보(만료 시 갱신 후 저장) */
async function getAccessToken(): Promise<string> {
  if (!db) throw new Error("DB 사용 불가");
  const rows = await db.select().from(oauthTokens).where(eq(oauthTokens.provider, PROVIDER));
  const r = rows[0];
  if (!r?.refreshToken) throw new Error("TikTok이 연결되지 않았습니다. 먼저 계정을 연결하세요.");

  // 액세스 토큰이 아직 유효하면 재사용
  if (r.accessToken && r.expiresAt && r.expiresAt.getTime() > Date.now() + 60_000) {
    return r.accessToken;
  }
  // 갱신
  const body = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY || "",
    client_secret: process.env.TIKTOK_CLIENT_SECRET || "",
    grant_type: "refresh_token",
    refresh_token: r.refreshToken,
  });
  const resp = await fetch(`${API_BASE}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const j: any = await resp.json();
  if (!resp.ok || !j?.access_token) {
    throw new Error(`TikTok 토큰 갱신 실패: ${JSON.stringify(j)}`);
  }
  await saveTokens({
    refreshToken: j.refresh_token,
    accessToken: j.access_token,
    expiresAt: j.expires_in ? new Date(Date.now() + j.expires_in * 1000) : undefined,
    scope: j.scope,
  });
  return j.access_token;
}

/**
 * 영상을 TikTok 초안(inbox)으로 업로드. FILE_UPLOAD(바이트) 방식.
 * 반환 후 사용자가 TikTok 앱 알림/초안에서 마무리 게시(탭 한 번). 반환: publishId
 */
export async function uploadTiktokDraft(video: Buffer): Promise<{ publishId: string }> {
  const accessToken = await getAccessToken();
  const size = video.length;

  // 1) 업로드 세션 초기화 (단일 청크: 작은 숏폼)
  const init = await fetch(`${API_BASE}/post/publish/inbox/video/init/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      source_info: {
        source: "FILE_UPLOAD",
        video_size: size,
        chunk_size: size,
        total_chunk_count: 1,
      },
    }),
  });
  const ij: any = await init.json();
  const uploadUrl = ij?.data?.upload_url;
  const publishId = ij?.data?.publish_id;
  if (!init.ok || !uploadUrl || !publishId) {
    throw new Error(`TikTok 업로드 초기화 실패: ${JSON.stringify(ij)}`);
  }

  // 2) 바이트 업로드 (단일 청크 전체)
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(size),
      "Content-Range": `bytes 0-${size - 1}/${size}`,
    },
    body: video,
  });
  if (!put.ok) {
    throw new Error(`TikTok 업로드 실패: ${put.status} ${await put.text()}`);
  }
  return { publishId };
}

/**
 * 크리에이터 정보 조회 — 다이렉트 포스트 전 필수(TikTok 요구).
 * 허용 공개범위(privacy_level_options)·상호작용 가능여부·최대영상길이 등을 돌려준다.
 * 심사 전 앱은 보통 privacy_level_options=["SELF_ONLY"]만 반환(강제 비공개).
 */
async function getTiktokCreatorInfo(accessToken: string): Promise<{
  privacyOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxDurationSec?: number;
}> {
  const r = await fetch(`${API_BASE}/post/publish/creator_info/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
  });
  const j: any = await r.json();
  if (!r.ok || j?.error?.code !== "ok") {
    throw new Error(`TikTok creator_info 실패: ${JSON.stringify(j?.error || j)}`);
  }
  const d = j.data || {};
  return {
    privacyOptions: Array.isArray(d.privacy_level_options) ? d.privacy_level_options : [],
    commentDisabled: !!d.comment_disabled,
    duetDisabled: !!d.duet_disabled,
    stitchDisabled: !!d.stitch_disabled,
    maxDurationSec: d.max_video_post_duration_sec,
  };
}

/** 게시 상태 조회(다이렉트 포스트 확인용). PUBLISH_COMPLETE=완료, FAILED=실패. */
async function fetchTiktokPublishStatus(
  accessToken: string,
  publishId: string,
): Promise<{ status: string; failReason?: string; postIds?: string[] }> {
  const r = await fetch(`${API_BASE}/post/publish/status/fetch/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({ publish_id: publishId }),
  });
  const j: any = await r.json();
  const d = j?.data || {};
  return { status: d.status || "UNKNOWN", failReason: d.fail_reason, postIds: d.publicaly_available_post_id || d.public_post_id };
}

/**
 * 다이렉트 포스트(video.publish) — 캡션(title)·공개범위 포함 자동 게시.
 * creator_info로 허용 공개범위 확인 → PUBLIC 가능하면 PUBLIC, 아니면(심사 전) SELF_ONLY.
 * init(post_info) → 바이트 업로드 → 상태 폴링으로 완료/실패 확정. 반환: publishId·privacy·status.
 */
export async function publishTiktokVideo(
  video: Buffer,
  caption: string,
): Promise<{ publishId: string; privacy: string; status: string }> {
  const accessToken = await getAccessToken();
  const size = video.length;

  // 1) 크리에이터 정보 → 공개범위 결정(PUBLIC 우선, 없으면 허용된 첫 옵션=심사 전 SELF_ONLY)
  const info = await getTiktokCreatorInfo(accessToken);
  const privacy =
    info.privacyOptions.find((p) => p === "PUBLIC_TO_EVERYONE") || info.privacyOptions[0] || "SELF_ONLY";
  const title = (caption || "").slice(0, 2200); // TikTok title 최대 2200자

  // 2) 다이렉트 포스트 초기화 (post_info + FILE_UPLOAD 단일 청크)
  const init = await fetch(`${API_BASE}/post/publish/video/init/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      post_info: {
        title,
        privacy_level: privacy,
        disable_comment: false,
        disable_duet: false,
        disable_stitch: false,
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: size,
        chunk_size: size,
        total_chunk_count: 1,
      },
    }),
  });
  const ij: any = await init.json();
  const uploadUrl = ij?.data?.upload_url;
  const publishId = ij?.data?.publish_id;
  if (!init.ok || !uploadUrl || !publishId) {
    throw new Error(`TikTok 다이렉트포스트 초기화 실패: ${JSON.stringify(ij?.error || ij)}`);
  }

  // 3) 바이트 업로드
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(size),
      "Content-Range": `bytes 0-${size - 1}/${size}`,
    },
    body: video,
  });
  if (!put.ok) {
    throw new Error(`TikTok 업로드 실패: ${put.status} ${await put.text()}`);
  }

  // 4) 상태 폴링 — 완료/실패 확정(최대 ~40초). 타임아웃 시 PROCESSING으로 반환(게시는 계속 진행될 수 있음)
  let status = "PROCESSING";
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const s = await fetchTiktokPublishStatus(accessToken, publishId);
    status = s.status;
    if (status === "PUBLISH_COMPLETE") break;
    if (status === "FAILED") {
      throw new Error(`TikTok 게시 실패: ${s.failReason || "FAILED"} (privacy=${privacy})`);
    }
  }
  return { publishId, privacy, status };
}
