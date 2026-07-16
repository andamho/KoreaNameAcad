// 인스타 Business Login (재)인증 플로우
//
// 기존 .env 토큰은 릴스 발행 권한만 있을 가능성이 높다. 댓글/DM 자동화를 하려면
// manage_comments / manage_messages 스코프로 다시 동의받아야 한다.
import crypto from "crypto";
import { igAppId, igAppSecret, exchangeCodeForShortToken, exchangeForLongToken, saveIgToken } from "./tokens";
import { getMe } from "./client";

// 필요한 스코프. content_publish는 기존 릴스 자동배포를 유지하기 위해 계속 포함한다
// (재인증하면 이전 토큰 권한은 이걸로 대체되므로 빠뜨리면 릴스 배포가 깨진다).
export const IG_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
];

/** 콜백 주소. Meta 앱 대시보드에 등록한 값과 문자 하나까지 같아야 한다 */
export function redirectUri(): string {
  const base = process.env.PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (!base) throw new Error("PUBLIC_BASE_URL 미설정 (예: https://example.com)");
  return `${base}/api/instagram/oauth/callback`;
}

// ── CSRF state ──
// Railway는 인스턴스가 여러 개일 수 있어 메모리에 state를 저장하면 콜백이 다른 인스턴스로
// 갈 때 깨진다. 그래서 서버 저장 없이 app secret으로 서명한 state를 쓴다.
const STATE_TTL_MS = 10 * 60 * 1000;

function signState(payload: string): string {
  const secret = igAppSecret();
  if (!secret) throw new Error("INSTAGRAM_APP_SECRET 미설정");
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function makeState(): string {
  const payload = `${Date.now()}.${crypto.randomBytes(16).toString("hex")}`;
  return `${payload}.${signState(payload)}`;
}

export function verifyState(state: string): boolean {
  const parts = String(state || "").split(".");
  if (parts.length !== 3) return false;
  const [ts, nonce, sig] = parts;
  const expected = signState(`${ts}.${nonce}`);
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  const age = Date.now() - Number(ts);
  return Number.isFinite(age) && age >= 0 && age < STATE_TTL_MS;
}

/** 사용자를 보낼 인스타 동의 화면 URL */
export function authorizeUrl(): string {
  const appId = igAppId();
  if (!appId) throw new Error("INSTAGRAM_APP_ID 미설정");
  const q = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: IG_SCOPES.join(","),
    state: makeState(),
    // 순수 인스타 로그인으로 고정. 이게 없으면 동의 화면이 Facebook 로그인 경로로 빠질 수 있고,
    // 그러면 발급된 코드가 Facebook 로그인 제품의 리디렉션 URI 기준으로 검증돼
    // "Error validating verification code" 로 실패한다(이 앱엔 FB 이용 사례도 함께 있음).
    enable_fb_login: "0",
    force_authentication: "1", // 다른 계정으로 잘못 연결되는 사고 방지
  });
  return `https://www.instagram.com/oauth/authorize?${q}`;
}

/** 콜백에서 받은 code를 장기 토큰으로 바꿔 저장. 반환: 연결된 계정명 */
export async function completeOAuth(code: string): Promise<{ username: string; expiresAt: Date; scopes: string }> {
  const short = await exchangeCodeForShortToken(code, redirectUri());
  const long = await exchangeForLongToken(short.accessToken);

  // 저장 전에 토큰이 실제로 동작하는지 확인 (잘못된 토큰을 DB에 넣으면 릴스 배포까지 깨짐)
  const me = await getMe(long.accessToken);

  await saveIgToken({
    accessToken: long.accessToken,
    expiresAt: long.expiresAt,
    scope: short.permissions,
    accountLabel: me.username,
  });

  console.log(`[IG OAuth] 연결 완료: @${me.username}, 만료 ${long.expiresAt.toISOString()}`);
  return { username: me.username, expiresAt: long.expiresAt, scopes: short.permissions };
}
