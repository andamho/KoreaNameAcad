// ── 인스타 계정 바인딩 (fail-closed) ────────────────────────────────────────
// 목적: 게시할 때마다 /me 를 호출하지 않고도 "지금 이 토큰이 어느 계정인지"를 확정한다.
//
// 규칙
//  - OAuth 연결 시 이미 돌아오는 user_id 를 즉시 upsert (호출 0회)
//  - 기존 연결처럼 바인딩이 아예 없을 때만 /me?fields=id,username 로 단 한 번 백필
//  - 저장된 계정과 새로 연결된 계정이 다르면 자동 교체 금지 → conflict 로 잠그고 게시 차단
//  - 토큰 원문은 저장·로그 금지. 대조가 필요하면 sha256 지문만 쓴다
//  - 확정할 수 없으면 게시하지 않는다(env 폴백 토큰 포함)
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { igAccountBinding } from "@shared/schema";
import { IG_GRAPH, getIgToken } from "./tokens";

const PROVIDER = "instagram";

/** 토큰 원문 대신 남기는 지문. 로그·DB 어디에도 원문을 두지 않기 위함 */
export function tokenFingerprint(accessToken: string): string {
  return crypto.createHash("sha256").update(accessToken).digest("hex");
}

export class InstagramAccountUnresolved extends Error {
  constructor(reason: string) {
    super(`인스타 계정 확정 불가 — ${reason}`);
    this.name = "InstagramAccountUnresolved";
  }
}

async function readBinding() {
  if (!db) return null;
  const [row] = await db.select().from(igAccountBinding).where(eq(igAccountBinding.provider, PROVIDER));
  return row ?? null;
}

/**
 * OAuth 콜백에서 호출. 토큰 교환 응답의 user_id 를 그대로 저장한다(추가 API 호출 없음).
 * 이미 다른 계정이 묶여 있으면 덮어쓰지 않고 conflict 로 잠근다 → 이후 게시가 전부 막힌다.
 */
export async function bindAccountFromOAuth(opts: {
  accountId: string;
  accessToken: string;
  username?: string | null;
}): Promise<{ bound: boolean; conflict: boolean }> {
  if (!db) throw new Error("DB 사용 불가 — 계정 바인딩을 저장할 수 없습니다");
  const accountId = String(opts.accountId || "").trim();
  if (!accountId) throw new InstagramAccountUnresolved("OAuth 응답에 user_id 없음");

  const cur = await readBinding();
  if (cur && cur.accountId !== accountId) {
    // 자동 교체 금지. 사람이 확인하고 풀어야 한다.
    await db
      .update(igAccountBinding)
      .set({ source: `conflict:${accountId}`, updatedAt: new Date() })
      .where(eq(igAccountBinding.provider, PROVIDER));
    console.error(`[IG BIND] 계정 충돌 — 저장=${cur.accountId} 신규=${accountId}. 게시를 차단합니다.`);
    return { bound: false, conflict: true };
  }

  const values = {
    provider: PROVIDER,
    accountId,
    username: opts.username ?? cur?.username ?? null,
    oauthTokenId: PROVIDER,
    tokenFingerprint: tokenFingerprint(opts.accessToken),
    source: "oauth",
    updatedAt: new Date(),
  };
  await db.insert(igAccountBinding).values(values).onConflictDoUpdate({
    target: igAccountBinding.provider,
    set: values,
  });
  return { bound: true, conflict: false };
}

/**
 * 바인딩이 없을 때만 단 한 번 /me?fields=id,username 로 백필.
 * 이미 있으면 API 를 호출하지 않는다. 실패하면 던진다(게시는 호출부에서 막힌다).
 */
export async function backfillBindingOnce(): Promise<{ accountId: string; username: string | null } | null> {
  if (!db) return null;
  const cur = await readBinding();
  if (cur) return { accountId: cur.accountId, username: cur.username };

  const t = await getIgToken();
  if (!t) throw new InstagramAccountUnresolved("인스타 토큰 없음");

  const r = await fetch(`${IG_GRAPH}/me?fields=id,username&access_token=${t.accessToken}`);
  const j: any = await r.json();
  if (!r.ok || !j?.id) {
    throw new InstagramAccountUnresolved(`/me 백필 실패: ${JSON.stringify(j?.error ?? j)}`);
  }

  const values = {
    provider: PROVIDER,
    accountId: String(j.id),
    username: j.username ?? null,
    oauthTokenId: PROVIDER,
    tokenFingerprint: tokenFingerprint(t.accessToken),
    source: "backfill",
    updatedAt: new Date(),
  };
  await db.insert(igAccountBinding).values(values).onConflictDoUpdate({
    target: igAccountBinding.provider,
    set: values,
  });
  console.log(`[IG BIND] 백필 완료 — account_id=${values.accountId} username=${values.username ?? "(없음)"}`);
  return { accountId: values.accountId, username: values.username };
}

/**
 * 게시 직전에 부르는 fail-closed 관문.
 * 확정된 account_id 를 돌려주거나, 확정 불가면 던진다. /me 는 백필 때 단 한 번만 호출된다.
 */
export async function resolveAccountIdOrFail(): Promise<string> {
  if (!db) throw new InstagramAccountUnresolved("DB 사용 불가");

  const t = await getIgToken();
  if (!t) throw new InstagramAccountUnresolved("인스타 토큰 없음 — /admin 에서 연결 필요");
  if (t.source === "env") {
    // env 폴백 토큰은 어느 계정인지 추적할 근거가 없다 → 게시 금지
    throw new InstagramAccountUnresolved("env 폴백 토큰 — 계정 바인딩 불가. /admin 에서 인스타 재연결 필요");
  }

  let row = await readBinding();
  if (!row) {
    await backfillBindingOnce(); // 없을 때만, 단 한 번
    row = await readBinding();
  }
  if (!row) throw new InstagramAccountUnresolved("바인딩 없음(백필 실패)");
  if (row.source.startsWith("conflict")) {
    throw new InstagramAccountUnresolved(
      `계정 충돌 상태(${row.source}) — 사람이 확인 후 해제해야 합니다. 자동 교체하지 않습니다`,
    );
  }
  return row.accountId;
}
