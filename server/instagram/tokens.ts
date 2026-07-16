// 인스타 액세스 토큰 저장/조회/자동갱신 (oauth_tokens 테이블, provider="instagram")
//
// 배경: 기존에는 .env의 INSTAGRAM_ACCESS_TOKEN을 그대로 썼는데, 인스타 장기 토큰은 60일이면
// 만료된다. 즉 릴스 자동배포는 60일마다 조용히 죽는 구조였다. 여기서 토큰을 DB로 옮기고
// 만료 전에 자동 갱신한다. env 값은 DB가 비었을 때의 폴백으로만 남겨둔다.
import { db } from "../db";
import { oauthTokens } from "@shared/schema";
import { eq } from "drizzle-orm";

const PROVIDER = "instagram";

// graph.instagram.com 호출 기준 버전. v21은 2년 보증기간이 끝나 만료 예고 대상이라 v25로 올림.
export const IG_GRAPH = "https://graph.instagram.com/v25.0";

// 토큰 교환/갱신 엔드포인트는 버전 경로를 쓰지 않는다(Meta 문서 기준).
const IG_GRAPH_ROOT = "https://graph.instagram.com";
const IG_OAUTH = "https://api.instagram.com/oauth/access_token";

export type IgTokenInfo = {
  accessToken: string;
  expiresAt: Date | null;
  scope: string | null;
  accountLabel: string | null;
  source: "db" | "env";
};

export function igAppId(): string | undefined {
  return process.env.INSTAGRAM_APP_ID?.trim();
}
export function igAppSecret(): string | undefined {
  return process.env.INSTAGRAM_APP_SECRET?.trim();
}

/** 현재 사용할 토큰. DB 우선, 없으면 .env 폴백. 둘 다 없으면 null */
export async function getIgToken(): Promise<IgTokenInfo | null> {
  if (db) {
    try {
      const [row] = await db.select().from(oauthTokens).where(eq(oauthTokens.provider, PROVIDER));
      if (row?.accessToken) {
        return {
          accessToken: row.accessToken,
          expiresAt: row.expiresAt ?? null,
          scope: row.scope ?? null,
          accountLabel: row.accountLabel ?? null,
          source: "db",
        };
      }
    } catch (e: any) {
      // DB가 잠깐 죽어도 env 폴백으로 릴스 배포는 살려둔다
      console.error(`[IG TOKEN] DB 조회 실패, env 폴백 시도: ${e?.message}`);
    }
  }
  const env = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
  if (env) return { accessToken: env, expiresAt: null, scope: null, accountLabel: null, source: "env" };
  return null;
}

/** 토큰 저장(upsert). provider가 PK라 onConflictDoUpdate로 항상 1행 유지 */
export async function saveIgToken(t: {
  accessToken: string;
  expiresAt: Date | null;
  scope?: string | null;
  accountLabel?: string | null;
}): Promise<void> {
  if (!db) throw new Error("DB 사용 불가 — 토큰을 저장할 수 없습니다");
  const values = {
    provider: PROVIDER,
    accessToken: t.accessToken,
    expiresAt: t.expiresAt,
    scope: t.scope ?? null,
    accountLabel: t.accountLabel ?? null,
    updatedAt: new Date(),
  };
  await db
    .insert(oauthTokens)
    .values(values)
    .onConflictDoUpdate({ target: oauthTokens.provider, set: values });
}

/** 인증코드 → 단기 토큰(1시간). 응답의 access_token이 data[] 안에 중첩돼 있음에 주의 */
export async function exchangeCodeForShortToken(code: string, redirectUri: string): Promise<{
  accessToken: string;
  userId: string;
  permissions: string;
}> {
  const appId = igAppId();
  const secret = igAppSecret();
  if (!appId || !secret) throw new Error("INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET 미설정");

  const r = await fetch(IG_OAUTH, {
    method: "POST",
    body: new URLSearchParams({
      client_id: appId,
      client_secret: secret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    }),
  });
  const j: any = await r.json();
  const row = Array.isArray(j?.data) ? j.data[0] : j; // 신형(data[]) / 구형(flat) 모두 수용
  if (!r.ok || !row?.access_token) {
    throw new Error(`단기 토큰 교환 실패: ${JSON.stringify(j)}`);
  }
  return {
    accessToken: row.access_token,
    userId: String(row.user_id ?? ""),
    permissions: String(row.permissions ?? ""),
  };
}

/** 단기 토큰 → 장기 토큰(60일) */
export async function exchangeForLongToken(shortToken: string): Promise<{ accessToken: string; expiresAt: Date }> {
  const secret = igAppSecret();
  if (!secret) throw new Error("INSTAGRAM_APP_SECRET 미설정");

  const q = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: secret,
    access_token: shortToken,
  });
  const r = await fetch(`${IG_GRAPH_ROOT}/access_token?${q}`);
  const j: any = await r.json();
  if (!r.ok || !j?.access_token) throw new Error(`장기 토큰 교환 실패: ${JSON.stringify(j)}`);
  return { accessToken: j.access_token, expiresAt: expiresInToDate(j.expires_in) };
}

/** 장기 토큰 갱신(+60일). 발급 후 24시간이 지나야 하고, 만료 전이어야 한다 */
export async function refreshLongToken(longToken: string): Promise<{ accessToken: string; expiresAt: Date }> {
  const q = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: longToken });
  const r = await fetch(`${IG_GRAPH_ROOT}/refresh_access_token?${q}`);
  const j: any = await r.json();
  if (!r.ok || !j?.access_token) throw new Error(`토큰 갱신 실패: ${JSON.stringify(j)}`);
  return { accessToken: j.access_token, expiresAt: expiresInToDate(j.expires_in) };
}

function expiresInToDate(expiresIn: unknown): Date {
  const sec = Number(expiresIn);
  // 응답에 expires_in이 없거나 이상하면 60일로 가정(문서상 장기토큰 기본값)
  const safe = Number.isFinite(sec) && sec > 0 ? sec : 60 * 24 * 3600;
  return new Date(Date.now() + safe * 1000);
}

// ── 자동 갱신 스케줄러 ──
// 60일 토큰을 만료 15일 전부터 갱신 시도. 6시간마다 확인하므로 갱신 창을 놓칠 일이 없다.
// (Meta는 "60일간 미사용 시 영구 만료 → 재인증 필요"라 만료를 넘기면 사람이 개입해야 한다)
const REFRESH_WHEN_DAYS_LEFT = 15;
const CHECK_INTERVAL_MS = 6 * 3600 * 1000;

export async function refreshIfNeeded(): Promise<{ refreshed: boolean; reason: string }> {
  const t = await getIgToken();
  if (!t) return { refreshed: false, reason: "토큰 없음" };
  if (t.source === "env") {
    // env 토큰은 갱신해도 저장할 곳이 없다(파일을 고칠 수 없으므로). 재인증을 유도한다.
    return { refreshed: false, reason: "env 토큰 — /admin에서 인스타 재연결 필요" };
  }
  if (!t.expiresAt) return { refreshed: false, reason: "만료시각 미상" };

  const daysLeft = (t.expiresAt.getTime() - Date.now()) / 86_400_000;
  if (daysLeft > REFRESH_WHEN_DAYS_LEFT) {
    return { refreshed: false, reason: `아직 여유 있음(${Math.floor(daysLeft)}일 남음)` };
  }
  if (daysLeft <= 0) {
    return { refreshed: false, reason: "이미 만료 — 재연결 필요" };
  }

  const fresh = await refreshLongToken(t.accessToken);
  await saveIgToken({
    accessToken: fresh.accessToken,
    expiresAt: fresh.expiresAt,
    scope: t.scope,
    accountLabel: t.accountLabel,
  });
  console.log(`[IG TOKEN] 갱신 완료 — 새 만료: ${fresh.expiresAt.toISOString()}`);
  return { refreshed: true, reason: "갱신됨" };
}

let _timer: NodeJS.Timeout | null = null;
export function startIgTokenRefresh() {
  if (_timer) return;
  const tick = () =>
    refreshIfNeeded()
      .then((r) => r.refreshed && console.log("[IG TOKEN] 자동 갱신 성공"))
      .catch((e) => console.error(`[IG TOKEN] 자동 갱신 실패: ${e?.message}`));
  tick(); // 부팅 직후 1회 (오래 꺼져 있던 인스턴스가 만료 직전일 수 있음)
  _timer = setInterval(tick, CHECK_INTERVAL_MS);
  // 이 타이머만으로 프로세스를 살려둘 이유는 없다(서버는 listen이 잡고 있음).
  // unref 없으면 테스트/스크립트가 이 인터벌 때문에 종료되지 않는다.
  _timer.unref();
  console.log("[IG TOKEN] 자동 갱신 스케줄러 시작 (6시간 간격)");
}
