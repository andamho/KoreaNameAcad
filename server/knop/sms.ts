// KNOP 문자 자동화: 템플릿 + 예약/발송 + 스케줄러 (solapi 재사용)
// 안전장치: env KNOP_SMS_LIVE=1 일 때만 실제 발송. 없으면 dry-run(로그만).
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

const LIVE = process.env.KNOP_SMS_LIVE === "1";

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
          scheduledAt: when,
          status: "scheduled",
        })
        .returning();
      // 즉시(예약시각이 현재 이하)면 바로 발송 시도
      if (when.getTime() <= Date.now() + 1000) {
        return (await this.sendOne(row)) ?? row;
      }
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

  // 한 건 발송 (dry-run 가드) + 상태/타임라인 갱신
  async sendOne(msg: ScheduledMessage): Promise<ScheduledMessage | undefined> {
    const d = requireDb();
    try {
      if (LIVE) {
        await sendSMS(msg.phone, msg.content);
      } else {
        console.log(`[KNOP SMS][DRY-RUN] → ${msg.phone}: ${msg.content.slice(0, 40)}… (KNOP_SMS_LIVE 미설정, 실제 발송 안 함)`);
      }
      const [row] = await d
        .update(scheduledMessages)
        .set({ status: "sent", sentAt: new Date(), error: null })
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
      await d
        .update(scheduledMessages)
        .set({ status: "failed", error: e?.message?.slice(0, 300) })
        .where(eq(scheduledMessages.id, msg.id))
        .catch(() => {});
      console.error(`[KNOP SMS] 발송 실패 ${msg.id}: ${e?.message}`);
      return undefined;
    }
  },

  // 예약 시각이 된 문자들 발송
  async runDue(): Promise<number> {
    if (!db) return 0;
    try {
      const due = await db
        .select()
        .from(scheduledMessages)
        .where(and(eq(scheduledMessages.status, "scheduled"), lte(scheduledMessages.scheduledAt, new Date())));
      for (const m of due) await this.sendOne(m);
      return due.length;
    } catch (e: any) {
      console.error(`[KNOP SMS] 스케줄러 오류: ${e?.message}`);
      return 0;
    }
  },
};

let _timer: NodeJS.Timeout | null = null;
export function startSmsScheduler() {
  if (_timer) return;
  console.log(`[KNOP SMS] 스케줄러 시작 (60초 간격, 발송모드=${LIVE ? "LIVE" : "DRY-RUN"})`);
  _timer = setInterval(() => {
    smsStore.runDue().catch(() => {});
  }, 60_000);
}
