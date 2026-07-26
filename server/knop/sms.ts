// KNOP 문자 자동화: 템플릿 + 예약/발송 + 스케줄러 (solapi 재사용)
// 안전장치: env KNOP_SMS_LIVE=1 일 때만 실제 발송. 없으면 dry-run(로그만).
import { randomUUID } from "crypto";
import { db } from "../db";
import { DatabaseError } from "../storage";
import { sendSMS } from "../sms";
import { knopStore } from "./store";
import { and, desc, eq, lte } from "drizzle-orm";
import {
  smsTemplates,
  scheduledMessages,
  type SmsTemplate,
  type InsertSmsTemplate,
  type ScheduledMessage,
} from "@shared/schema";

const LIVE = (process.env.KOP_SMS_LIVE || process.env.KNOP_SMS_LIVE) === "1";

function requireDb() {
  if (!db) throw new DatabaseError("DB 사용 불가", "DATABASE_UNAVAILABLE");
  return db;
}
function fail(op: string, e: any): never {
  console.error(`[KNOP SMS ERROR] ${op}: ${e?.message}`);
  throw new DatabaseError(`${op} 실패: ${e?.message}`, "DATABASE_QUERY_FAILED");
}

// ── 표준 템플릿 시드 (원장님 지정 순서: 7종) ──
const SEED: Array<{ name: string; category: string; content: string }> = [
  { name: "상담 예약 안내", category: "상담 안내", content: "안녕하세요, 한국이름학교입니다.\n\n내일 {시간}에 이름분석 운명상담이 예정되어 있어 안내드립니다.\n\n\n■ 상담 안내\n· 소요 시간 : 약 {소요시간}\n· 분석표 : 상담 바로 직전에 발송해 드립니다\n  (함께 보며 상담 진행)\n\n\n■ 상담 환경\n이어폰 또는 스피커폰을 이용해 주시고,\n원활한 진행을 위해 아래 사항을 꼭 지켜주세요.\n\n① 이동 중 상담은 어렵습니다\n   운명과 삶의 흐름에 관한 깊은 이야기를 나누는 자리인 만큼,\n   집중할 수 있는 환경에서 받아주시기 바랍니다.\n\n② 카페 등 소음이 있는 공간은 피해 주세요\n   생각보다 주변 소음이 커 상담이 어렵습니다.\n\n일정과 유의사항 확인 후 답변 부탁드립니다.\n그럼 내일 뵙겠습니다.\n\n- 한국이름학교" },
  { name: "새 이름 상담 안내", category: "새 이름 상담", content: "안녕하세요. 한국이름학교입니다.\n\n기다리셨던 {가족}새 이름이 완성되었습니다~\n\n새 이름 설명 상담을 도와드리겠습니다.\n상담은 약 {시간}분 정도 소요됩니다.\n편하신 시간을 알려주시면 일정 확정해 드리겠습니다." },
  { name: "개명 신청 확인", category: "개명 후속", content: "안녕하세요. 한국이름학교입니다.\n개명 신청은 진행하셨을까요?" },
  { name: "법원 허가 확인", category: "개명 후속", content: "안녕하세요. 한국이름학교입니다.\n법원 개명 허가 결과는 나오셨을까요?" },
  { name: "변화 확인", category: "후기/장기관리", content: "안녕하세요. 한국이름학교입니다.\n개명 후 생활, 마음, 일의 흐름, 주변 반응에 변화가 있으셨을까요?" },
  { name: "장기 안부", category: "후기/장기관리", content: "안녕하세요. 한국이름학교입니다.\n{이름}님, 그동안 잘 지내셨을까요? 개명 후 변화와 안부가 궁금해 연락드립니다." },
  { name: "후기 요청", category: "후기/장기관리", content: "소중한 변화 말씀 감사합니다.\n비슷한 고민을 가진 분들에게 큰 도움이 될 수 있어, 가능하시다면 짧은 후기를 부탁드려도 될까요?" },
];

export const smsStore = {
  async listTemplates(): Promise<SmsTemplate[]> {
    const d = requireDb();
    try {
      // 삽입 순서 유지(원장님 지정 순서)
      return await d.select().from(smsTemplates).orderBy(smsTemplates.createdAt);
    } catch (e) {
      fail("템플릿 목록", e);
    }
  },

  async seedTemplates(): Promise<number> {
    const d = requireDb();
    try {
      const existing = await d.select().from(smsTemplates);
      if (existing.length > 0) return 0; // 이미 있으면 스킵
      let n = 0;
      for (const t of SEED) {
        await d.insert(smsTemplates).values({ name: t.name, category: t.category, content: t.content });
        n++;
      }
      return n;
    } catch (e) {
      fail("템플릿 시드", e);
    }
  },

  // 템플릿을 SEED 7종으로 초기화 (사용자가 만든 커스텀은 삭제됨)
  async resetTemplates(): Promise<number> {
    const d = requireDb();
    try {
      await d.delete(smsTemplates);
      let n = 0;
      for (const t of SEED) {
        await d.insert(smsTemplates).values({ name: t.name, category: t.category, content: t.content });
        n++;
      }
      return n;
    } catch (e) {
      fail("템플릿 초기화", e);
    }
  },

  async createTemplate(input: InsertSmsTemplate): Promise<SmsTemplate> {
    const d = requireDb();
    try {
      const [row] = await d
        .insert(smsTemplates)
        .values({ name: input.name, category: input.category ?? "기타", content: input.content })
        .returning();
      return row;
    } catch (e) {
      fail("템플릿 생성", e);
    }
  },

  async updateTemplate(id: string, input: Partial<InsertSmsTemplate>): Promise<SmsTemplate | undefined> {
    const d = requireDb();
    try {
      const patch: any = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.category !== undefined) patch.category = input.category;
      if (input.content !== undefined) patch.content = input.content;
      const [row] = await d.update(smsTemplates).set(patch).where(eq(smsTemplates.id, id)).returning();
      return row;
    } catch (e) {
      fail("템플릿 수정", e);
    }
  },

  async deleteTemplate(id: string): Promise<boolean> {
    const d = requireDb();
    try {
      const res = await d.delete(smsTemplates).where(eq(smsTemplates.id, id)).returning();
      return res.length > 0;
    } catch (e) {
      fail("템플릿 삭제", e);
    }
  },

  async listMessages(status?: string): Promise<ScheduledMessage[]> {
    const d = requireDb();
    try {
      const rows = await d.select().from(scheduledMessages).orderBy(desc(scheduledMessages.scheduledAt));
      return status ? rows.filter((r) => r.status === status) : rows;
    } catch (e) {
      fail("문자 목록", e);
    }
  },

  // 예약 문자 생성 (scheduledAt 없거나 과거면 즉시 발송)
  async createMessage(input: {
    customerId?: string | null;
    projectId?: string | null;
    phone: string;
    content: string;
    templateId?: string | null;
    scheduledAt?: string | null;
    setKey?: string | null;
  }): Promise<ScheduledMessage> {
    const d = requireDb();
    try {
      const when = input.scheduledAt ? new Date(input.scheduledAt) : new Date();
      const [row] = await d
        .insert(scheduledMessages)
        .values({
          customerId: input.customerId ?? null,
          projectId: input.projectId ?? null,
          phone: input.phone,
          content: input.content,
          templateId: input.templateId ?? null,
          setKey: input.setKey ?? null,
          scheduledAt: when,
          status: "scheduled",
        })
        .returning();
      // 즉시(예약시각이 현재 이하)면 바로 발송 시도
      if (when.getTime() <= Date.now() + 1000) {
        return (await this.sendOne(row)) ?? row;
      }
      rescheduleSmsTimer(); // 새 예약 반영 — 스케줄러가 그 시각에 깨도록
      return row;
    } catch (e) {
      fail("문자 예약", e);
    }
  },

  async cancelMessage(id: string): Promise<boolean> {
    const d = requireDb();
    try {
      const res = await d
        .update(scheduledMessages)
        .set({ status: "canceled" })
        .where(and(eq(scheduledMessages.id, id), eq(scheduledMessages.status, "scheduled")))
        .returning();
      return res.length > 0;
    } catch (e) {
      fail("문자 취소", e);
    }
  },

  // 원자적 선점: scheduled → sending. RETURNING 을 받은 프로세스만 실제로 발송한다(중복 발송 차단).
  async claimOne(id: string, attemptId: string): Promise<ScheduledMessage | undefined> {
    const d = requireDb();
    try {
      const [row] = await d
        .update(scheduledMessages)
        .set({ status: "sending", claimedAt: new Date(), attemptId })
        .where(and(eq(scheduledMessages.id, id), eq(scheduledMessages.status, "scheduled")))
        .returning();
      return row; // 없으면(다른 프로세스가 이미 선점/취소됨) undefined
    } catch (e: any) {
      console.error(`[KNOP SMS] 선점 실패 ${id}: ${e?.message}`);
      return undefined;
    }
  },

  // 한 건 발송 (dry-run 가드) + 상태/타임라인 갱신.
  // 반드시 claimOne 으로 선점한 뒤 호출한다.
  async sendOne(msg: ScheduledMessage): Promise<ScheduledMessage | undefined> {
    const d = requireDb();
    try {
      let providerMessageId: string | undefined;
      if (LIVE) {
        await d.update(scheduledMessages).set({ attemptedAt: new Date() }).where(eq(scheduledMessages.id, msg.id));
        const r = await sendSMS(msg.phone, msg.content);
        providerMessageId = r?.messageId;
      } else {
        console.log(`[KNOP SMS][DRY-RUN] → ${msg.phone}: ${msg.content.slice(0, 40)}… (KNOP_SMS_LIVE 미설정, 실제 발송 안 함)`);
      }
      const [row] = await d
        .update(scheduledMessages)
        .set({ status: "sent", sentAt: new Date(), error: null, providerMessageId: providerMessageId ?? null })
        .where(eq(scheduledMessages.id, msg.id))
        .returning();
      if (msg.customerId) {
        await knopStore.addTimelineEvent({
          customerId: msg.customerId,
          projectId: msg.projectId,
          type: "message",
          title: LIVE ? "문자 발송" : "문자 발송(시뮬레이션)",
          content: msg.content,
          metadata: { messageId: msg.id, phone: msg.phone },
        });
      }
      return row;
    } catch (e: any) {
      // 발송 여부가 불확실하면 failed 로 단정하지 않는다(재발송 시 중복 위험) → 사람이 확인할 상태로 분리
      const uncertain = e?.uncertain === true;
      await d
        .update(scheduledMessages)
        .set({ status: uncertain ? "delivery_unknown" : "failed", error: e?.message?.slice(0, 300) })
        .where(eq(scheduledMessages.id, msg.id))
        .catch(() => {});
      console.error(`[KNOP SMS] 발송 ${uncertain ? "불확실(확인 필요)" : "실패"} ${msg.id}: ${e?.message}`);
      return undefined;
    }
  },

  // 'sending' 으로 고착된 건 복구: 선점 후 프로세스가 죽은 경우.
  // 공급자에 이미 보냈을 수 있으므로 재발송하지 않고 delivery_unknown 으로 분리한다.
  async recoverStuckSending(olderThanMs = 10 * 60 * 1000): Promise<number> {
    if (!db) return 0;
    try {
      const cutoff = new Date(Date.now() - olderThanMs);
      const rows = await db
        .update(scheduledMessages)
        .set({ status: "delivery_unknown", error: "선점 후 중단됨(발송 여부 불확실) — 확인 필요" })
        .where(and(eq(scheduledMessages.status, "sending"), lte(scheduledMessages.claimedAt, cutoff)))
        .returning();
      if (rows.length) console.warn(`[KNOP SMS] 고착 복구: ${rows.length}건 → delivery_unknown(확인 필요)`);
      return rows.length;
    } catch (e: any) {
      console.error(`[KNOP SMS] 고착 복구 오류: ${e?.message}`);
      return 0;
    }
  },

  // 예약 시각이 된 문자들 발송. 각 건을 원자적으로 선점한 뒤에만 실제 발송한다.
  async runDue(): Promise<number> {
    if (!db) return 0;
    try {
      await this.recoverStuckSending(); // 선점 후 중단된 건 먼저 정리
      const due = await db
        .select({ id: scheduledMessages.id })
        .from(scheduledMessages)
        .where(and(eq(scheduledMessages.status, "scheduled"), lte(scheduledMessages.scheduledAt, new Date())));
      let handled = 0;
      for (const { id } of due) {
        const attemptId = randomUUID();
        const claimed = await this.claimOne(id, attemptId); // 선점 실패 = 다른 프로세스가 처리 중 → 건너뜀
        if (!claimed) continue;
        await this.sendOne(claimed);
        handled++;
      }
      return handled;
    } catch (e: any) {
      console.error(`[KNOP SMS] 스케줄러 오류: ${e?.message}`);
      return 0;
    }
  },
};

// 스케줄러: 1분마다 묻지 않고 "다음 예약 시각"에 맞춰 깨어난다.
// 예약이 없으면 길게 자므로 DB(Neon)가 잠들 수 있다 → 컴퓨트 절약. 발송 시각 정확도는 그대로.
let _timer: NodeJS.Timeout | null = null;
// 인메모리 타이머만 쓰는 구조이므로 안전 확인 상한은 5분(타이머 유실·놓친 예약 회수용)
const MAX_SLEEP_MS = 5 * 60 * 1000;
const MIN_SLEEP_MS = 5_000;

async function nextDueDelay(): Promise<number> {
  if (!db) return MAX_SLEEP_MS;
  try {
    const [row] = await db
      .select({ at: scheduledMessages.scheduledAt })
      .from(scheduledMessages)
      .where(eq(scheduledMessages.status, "scheduled"))
      .orderBy(scheduledMessages.scheduledAt)
      .limit(1);
    if (!row?.at) return MAX_SLEEP_MS; // 예약 없음 → 길게 잔다
    const wait = new Date(row.at as any).getTime() - Date.now();
    return Math.max(MIN_SLEEP_MS, Math.min(MAX_SLEEP_MS, wait));
  } catch {
    return MAX_SLEEP_MS;
  }
}

async function smsTick() {
  await smsStore.runDue().catch(() => {});
  const delay = await nextDueDelay();
  _timer = setTimeout(smsTick, delay);
}

export function startSmsScheduler() {
  if (_timer) return;
  console.log(`[KNOP SMS] 스케줄러 시작 (다음 예약시각 기준, 발송모드=${LIVE ? "LIVE" : "DRY-RUN"})`);
  _timer = setTimeout(smsTick, MIN_SLEEP_MS);
}

// 새 예약이 생기면 그 시각에 맞춰 타이머를 다시 잡는다(늦게 깨는 일 없게).
export function rescheduleSmsTimer() {
  if (!_timer) return;
  clearTimeout(_timer);
  _timer = setTimeout(smsTick, MIN_SLEEP_MS);
}
