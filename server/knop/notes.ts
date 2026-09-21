// 관리자 메모(원장님이 보고 고치는 짧은 글). 예: 고객 목록 '새이름' 옆 [관리] 팝업의 흐름 안내.
//
// 새 표를 만들면 운영 DB 구조를 바꿔야 하므로, 이미 있는 notice_steps 에 set_key='note:<키>' 로
// 한 줄 저장한다. 개명후관리 화면은 정해진 세트(gaemyeong_*)만 읽으므로 여기 행은 섞이지 않는다.
import { db } from "../db";
import { and, eq } from "drizzle-orm";
import { noticeSteps } from "@shared/schema";

const PREFIX = "note:";

// 저장된 적이 없을 때 보여 줄 기본 글
export const NOTE_DEFAULTS: Record<string, string> = {
  "naming-flow": [
    "① 작명장 링크 발송 (자동 확인)",
    "② 다음 날 아침: 개명 신청 안내",
    "③ 15일 뒤 아침: 개명 신청 확인",
    "   고객이 신청했다고 답하면 ③은 보내지 않음",
  ].join("\n"),
  "court-flow": [
    "① 달력에 개완CHK 등록 → 다음 날 아침 법원접수로 자동 변경",
    "② 개완CHK 날 아침: 개명허가 확인 문자",
    "   (개완CHK 없으면 법원접수 60일 뒤)",
    "③ 허가 나면 개명승인 누르기 → 정화하기 문자 4건",
    "   (다음 날 · 8일 · 15일 · 22일째)",
  ].join("\n"),
};

export function isNoteKey(k: string): boolean {
  return Object.prototype.hasOwnProperty.call(NOTE_DEFAULTS, k);
}

export async function getNote(key: string): Promise<string> {
  if (!db) return NOTE_DEFAULTS[key] ?? "";
  const [row] = await db
    .select()
    .from(noticeSteps)
    .where(and(eq(noticeSteps.setKey, PREFIX + key), eq(noticeSteps.step, 0)));
  return row ? row.body : NOTE_DEFAULTS[key] ?? "";
}

export async function saveNote(key: string, body: string): Promise<string> {
  if (!db) throw new Error("DB 사용 불가");
  const text = String(body ?? "").slice(0, 4000);
  const [row] = await db
    .select()
    .from(noticeSteps)
    .where(and(eq(noticeSteps.setKey, PREFIX + key), eq(noticeSteps.step, 0)));
  if (row) {
    await db.update(noticeSteps).set({ body: text, updatedAt: new Date() }).where(eq(noticeSteps.id, row.id));
  } else {
    await db.insert(noticeSteps).values({ setKey: PREFIX + key, step: 0, name: key, body: text, offsetDays: 0 });
  }
  return text;
}
