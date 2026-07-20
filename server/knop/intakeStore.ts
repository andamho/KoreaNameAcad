// 문자→달력 자동등록: 안드로이드 문자전달 앱이 보낸 수신 문자 누적 + 스레드 그룹핑
import { db } from "../db";
import { DatabaseError } from "../storage";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { incomingSms, type IncomingSms, type InsertIncomingSms } from "@shared/schema";
import { normalizePhone } from "@shared/schema";

function requireDb() {
  if (!db) throw new DatabaseError("DB 사용 불가", "DATABASE_UNAVAILABLE");
  return db;
}
function fail(op: string, e: any): never {
  console.error(`[KNOP INTAKE ERROR] ${op}: ${e?.message}`);
  throw new DatabaseError(`${op} 실패: ${e?.message}`, "DATABASE_QUERY_FAILED");
}

export type SmsThread = {
  phone: string;
  contactName: string | null;
  messageCount: number;
  lastBody: string;
  lastAt: Date;
  processed: boolean;
  createdEventDate: string | null;
};

export const intakeStore = {
  // 문자 1건 저장 (웹훅/가져오기). 수신·발신 모두 사용.
  // 같은 번호·방향·본문이 ±2분 안에 이미 있으면 새로 넣지 않고 기존 것을 돌려준다
  // → 매크로 재전송이나 과거 문자 백필을 여러 번 돌려도 중복이 쌓이지 않음.
  async add(input: InsertIncomingSms): Promise<IncomingSms> {
    const d = requireDb();
    try {
      const phone = normalizePhone(input.phone) || input.phone;
      const direction = input.direction ?? "수신";
      const at = input.receivedAt ? new Date(input.receivedAt) : new Date();
      const [dup] = await d
        .select()
        .from(incomingSms)
        .where(
          and(
            eq(incomingSms.phone, phone),
            eq(incomingSms.body, input.body),
            eq(incomingSms.direction, direction),
            gte(incomingSms.receivedAt, new Date(at.getTime() - 120_000)),
            lte(incomingSms.receivedAt, new Date(at.getTime() + 120_000)),
          ),
        )
        .limit(1);
      if (dup) return dup;

      const [row] = await d
        .insert(incomingSms)
        .values({
          contactName: input.contactName ?? null,
          phone,
          body: input.body,
          direction,
          receivedAt: at,
        })
        .returning();
      return row;
    } catch (e) {
      fail("문자 저장", e);
    }
  },

  // 전화번호(스레드)별 요약 목록
  async listThreads(): Promise<SmsThread[]> {
    const d = requireDb();
    try {
      const rows = await d.select().from(incomingSms).orderBy(desc(incomingSms.receivedAt));
      const byPhone = new Map<string, SmsThread>();
      for (const r of rows) {
        const key = r.phone;
        if (!byPhone.has(key)) {
          byPhone.set(key, {
            phone: r.phone,
            contactName: r.contactName,
            messageCount: 0,
            lastBody: r.body,
            lastAt: r.receivedAt,
            processed: false,
            createdEventDate: null,
          });
        }
        const t = byPhone.get(key)!;
        t.messageCount++;
        if (r.contactName && !t.contactName) t.contactName = r.contactName;
        if (r.processed) {
          t.processed = true;
          if (r.createdEventDate) t.createdEventDate = r.createdEventDate;
        }
      }
      return Array.from(byPhone.values());
    } catch (e) {
      fail("스레드 목록", e);
    }
  },

  // 한 스레드의 모든 메시지 (시간순)
  async getThread(phone: string): Promise<IncomingSms[]> {
    const d = requireDb();
    try {
      const key = normalizePhone(phone) || phone;
      return await d.select().from(incomingSms).where(eq(incomingSms.phone, key)).orderBy(asc(incomingSms.receivedAt));
    } catch (e) {
      fail("스레드 조회", e);
    }
  },

  // 스레드를 대화 텍스트로 (Gemini 입력용)
  async threadText(phone: string): Promise<{ contactName: string | null; text: string; count: number }> {
    const msgs = await this.getThread(phone);
    const contactName = msgs.find((m) => m.contactName)?.contactName ?? null;
    const text = msgs
      .map((m) => `${m.direction === "발신" ? "원장" : "의뢰인"}: ${m.body}`)
      .join("\n");
    return { contactName, text, count: msgs.length };
  },

  // 스레드 처리완료 표시(중복 이벤트 방지)
  async markProcessed(phone: string, eventDate: string): Promise<void> {
    const d = requireDb();
    try {
      const key = normalizePhone(phone) || phone;
      await d.update(incomingSms).set({ processed: true, createdEventDate: eventDate }).where(eq(incomingSms.phone, key));
    } catch (e) {
      fail("스레드 처리표시", e);
    }
  },

  async isProcessed(phone: string): Promise<boolean> {
    const d = requireDb();
    try {
      const key = normalizePhone(phone) || phone;
      const rows = await d
        .select()
        .from(incomingSms)
        .where(and(eq(incomingSms.phone, key), eq(incomingSms.processed, true)));
      return rows.length > 0;
    } catch (e) {
      fail("처리여부 확인", e);
    }
  },
};
