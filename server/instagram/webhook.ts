// 인스타 웹훅 수신: 서명 검증 → 페이로드 정규화 → DB 적재
//
// 1단계에서는 "이벤트를 정확히 받아 저장"까지만 한다. 실제 답글/DM 발송은 이 로그를
// 보고 실제 페이로드 형태를 확인한 뒤 2단계에서 붙인다.
import crypto from "crypto";
import { db } from "../db";
import { igEvents } from "@shared/schema";
import { igAppSecret } from "./tokens";

/** X-Hub-Signature-256 검증. 반드시 파싱 전 원본 바이트로 계산해야 한다 */
export function verifySignature(rawBody: Buffer | undefined, header: string | undefined): boolean {
  const secret = igAppSecret();
  if (!secret) {
    console.error("[IG WEBHOOK] INSTAGRAM_APP_SECRET 미설정 — 서명 검증 불가로 거부");
    return false;
  }
  if (!rawBody || !header) return false;
  if (!header.startsWith("sha256=")) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(header.slice("sha256=".length), "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export type NormalizedIgEvent = {
  kind: "comment" | "message" | "other";
  dedupeKey: string;
  igAccountId?: string;
  fromId?: string;
  fromUsername?: string;
  mediaId?: string;
  parentId?: string;
  text?: string;
  isEcho: boolean;
  raw: string;
};

/**
 * 웹훅 본문을 이벤트 목록으로 변환.
 * 댓글은 entry[].changes[], DM은 entry[].messaging[] 으로 형태가 다르다.
 */
export function normalizeWebhook(body: any): NormalizedIgEvent[] {
  const out: NormalizedIgEvent[] = [];
  const entries = Array.isArray(body?.entry) ? body.entry : [];

  for (const entry of entries) {
    const igAccountId = entry?.id ? String(entry.id) : undefined;

    // ── 댓글 ──
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const v = change?.value ?? {};
      if (change?.field !== "comments" || !v?.comment_id) continue;
      out.push({
        kind: "comment",
        dedupeKey: `comment:${v.comment_id}`,
        igAccountId,
        fromId: v?.from?.id ? String(v.from.id) : undefined,
        fromUsername: v?.from?.username ? String(v.from.username) : undefined,
        mediaId: v?.media?.id ? String(v.media.id) : undefined,
        parentId: v?.parent_id ? String(v.parent_id) : undefined,
        text: typeof v?.text === "string" ? v.text : undefined,
        isEcho: false,
        raw: JSON.stringify(change),
      });
    }

    // ── DM ──
    for (const m of Array.isArray(entry?.messaging) ? entry.messaging : []) {
      const msg = m?.message;
      if (!msg?.mid) continue;
      out.push({
        kind: "message",
        dedupeKey: `message:${msg.mid}`,
        igAccountId,
        fromId: m?.sender?.id ? String(m.sender.id) : undefined,
        text: typeof msg?.text === "string" ? msg.text : undefined,
        // is_echo=true는 우리가 보낸 DM이 되돌아온 것. 걸러내지 않으면 자기 자신에게 무한 응답한다.
        isEcho: msg?.is_echo === true,
        raw: JSON.stringify(m),
      });
    }
  }
  return out;
}

/**
 * 이벤트 적재. 중복(dedupeKey)은 조용히 무시한다.
 * 반환: 실제로 새로 저장된 건수
 */
export async function storeEvents(events: NormalizedIgEvent[]): Promise<number> {
  if (!db || events.length === 0) return 0;
  let stored = 0;
  for (const e of events) {
    try {
      const rows = await db
        .insert(igEvents)
        .values({
          kind: e.kind,
          dedupeKey: e.dedupeKey,
          igAccountId: e.igAccountId ?? null,
          fromId: e.fromId ?? null,
          fromUsername: e.fromUsername ?? null,
          mediaId: e.mediaId ?? null,
          parentId: e.parentId ?? null,
          text: e.text ?? null,
          isEcho: e.isEcho,
          raw: e.raw,
        })
        .onConflictDoNothing({ target: igEvents.dedupeKey })
        .returning({ id: igEvents.id });
      if (rows.length > 0) stored++;
    } catch (err: any) {
      // 한 건이 실패해도 나머지는 저장한다. 웹훅에는 200을 돌려줘야 Meta가 재전송을 멈춘다.
      console.error(`[IG WEBHOOK] 이벤트 저장 실패 ${e.dedupeKey}: ${err?.message}`);
    }
  }
  return stored;
}
