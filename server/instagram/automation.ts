// 인스타 댓글 자동응답 로직: 키워드 매칭 → 공개 답글 + Private Reply DM
//
// 안전장치: INSTAGRAM_SEND_LIVE=1 일 때만 실제 발송. 없으면 dry-run(로그만).
// 기존 KNOP 문자 자동화의 KOP_SMS_LIVE 패턴과 동일하게, 실수로 실제 발송되는 걸 막는다.
import { db } from "../db";
import { igEvents } from "@shared/schema";
import { replyToComment, sendPrivateReply, IgApiError } from "./client";

export const SEND_LIVE = process.env.INSTAGRAM_SEND_LIVE === "1";

// 원장님 확정 문구 (2026-07). 나중에 DB/화면에서 편집할 수 있게 뺄 예정.
export const RULE = {
  keyword: "이름",
  // 똑같은 문구 반복은 제재 위험 → 답글은 여러 개 중 랜덤. DM은 지정 문구 1종.
  commentReplies: [
    "이름에 관심가져주셔서 감사합니다. DM보내드렸습니다.",
  ],
  dmText: "이름과 나이 그리고 상담받고싶으신 이유를 가능한 구체적으로 적어주세요",
};

/** 답글 문구 하나 고르기 (index로 결정 — Math.random 회피, 재현 가능) */
function pickReply(seed: string): string {
  const arr = RULE.commentReplies;
  if (arr.length === 1) return arr[0];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return arr[h % arr.length];
}

export function matchesKeyword(text: string | undefined | null): boolean {
  return !!text && text.includes(RULE.keyword);
}

export type ProcessResult = {
  commentId: string;
  matched: boolean;
  live: boolean;
  replied?: { id: string };
  dm?: { recipientId?: string; messageId?: string };
  errors: string[];
  skippedReason?: string;
};

/**
 * 댓글 하나를 처리: 키워드 매칭 시 공개 답글 + Private Reply DM.
 * @param opts.force 키워드 무시하고 무조건 발송 (관리자 테스트/녹화용)
 */
export async function processComment(opts: {
  commentId: string;
  text?: string | null;
  fromUsername?: string | null;
  force?: boolean;
}): Promise<ProcessResult> {
  const { commentId } = opts;
  const result: ProcessResult = { commentId, matched: matchesKeyword(opts.text), live: SEND_LIVE, errors: [] };

  if (!opts.force && !result.matched) {
    result.skippedReason = `키워드 "${RULE.keyword}" 없음`;
    return result;
  }

  const replyText = pickReply(commentId);

  // ── 1) 공개 답글 ──
  try {
    if (SEND_LIVE) {
      result.replied = await replyToComment(commentId, replyText);
    } else {
      console.log(`[IG AUTO][DRY-RUN] 답글 → 댓글 ${commentId}: "${replyText}"`);
      result.replied = { id: "(dry-run)" };
    }
  } catch (e: any) {
    result.errors.push(`답글 실패: ${e?.message}`);
  }

  // ── 2) Private Reply DM ──
  try {
    if (SEND_LIVE) {
      result.dm = await sendPrivateReply(commentId, RULE.dmText);
    } else {
      console.log(`[IG AUTO][DRY-RUN] DM → 댓글작성자(${commentId}): "${RULE.dmText}"`);
      result.dm = { messageId: "(dry-run)" };
    }
  } catch (e: any) {
    result.errors.push(`DM 실패: ${e?.message}`);
  }

  // ── 3) 발송 기록 (ig_events, kind=action) ──
  if (db) {
    await db
      .insert(igEvents)
      .values({
        kind: "action",
        dedupeKey: `action:${commentId}:${Date.now()}`,
        fromUsername: opts.fromUsername ?? null,
        parentId: commentId, // 어떤 댓글에 대한 액션인지
        text: `[${SEND_LIVE ? "LIVE" : "DRY"}] 답글="${replyText}" DM="${RULE.dmText}"${result.errors.length ? " 오류:" + result.errors.join("; ") : ""}`,
        raw: JSON.stringify(result),
      })
      .catch((e) => console.error(`[IG AUTO] 기록 실패: ${e?.message}`));
  }

  return result;
}
