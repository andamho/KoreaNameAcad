// 새 이름 상담 안내 — 달력의 '작명완료' 일정 기준으로 전날 09:00 KST 에 예약한다.
//
// 기준이 달력인 이유: 이름이 나오는 날짜는 달력에만 있다. 고객 단계(상담/개명신청/…)에는
// 날짜가 없어서 발송 시점을 결정할 수 없다. → 단계 자동화(미용감사·정화하기)와는 완전히 별개 경로.
//
// 문구는 코드에 박지 않고 안내문자 탭의 DB 템플릿("새 이름 상담 안내")을 읽어 쓴다.
// 원장님이 탭에서 문구를 고치면 다음 예약부터 그대로 반영된다.
//
// 치환 규칙(원장님 확정):
//   인원수 = 달력 제목 뒤 숫자 ("김경순"→1, "김경순2"→2, "김경순3"→3)
//   {시간} = 인원수 × 10 (명당 10분)
//   {가족} = 1명이면 "ㅇㅇㅇ님 " / 2명 이상이면 "가족분들의 "
//   {이름} = 이름
import { db } from "../db";
import { and, eq, inArray, isNotNull, like } from "drizzle-orm";
import { customers, normalizePhone, scheduledMessages, smsTemplates } from "@shared/schema";
import { findPhone, parseNameCount, readEvents, calendarAvailable, type CalEvent } from "./calendar";
import { smsStore } from "./sms";

const TEMPLATE_NAME = "새 이름 상담 안내";
export const NEWNAME_SET_PREFIX = "newname:";
export const NEWNAME_SET_LABEL = "새 이름 상담 안내";

// ── 치환 ──
export function newNameMinutes(people: number): number {
  return Math.max(1, people) * 10; // 명당 10분
}
export function renderNewNameNotice(content: string, name: string, people: number): string {
  const fam = people >= 2 ? "가족분들의 " : `${name}님 `;
  return content
    .replace(/\{이름\}/g, name)
    .replace(/\{가족\}/g, fam)
    .replace(/\{시간\}/g, String(newNameMinutes(people)));
}

// ── 날짜 ──
// 서울 기준 오늘 (YYYY-MM-DD)
export function todayKST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
// 작명완료일(KST YYYY-MM-DD)의 '전날 09:00 KST' 을 UTC 순간으로.
// KST 09:00 = UTC 00:00 (같은 날) → 전날 09:00 KST = UTC (D-1) 00:00.
export function noticeSendAt(namingDate: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(namingDate);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) - 1, 0, 0, 0));
}

export type NewNamePlan = {
  namingDate: string;
  title: string;
  name: string;
  people: number;
  phone: string | null;
  minutes: number;
  sendAt: string | null; // 실제 예약될 시각(ISO). 전날 09시가 이미 지났으면 '지금'
  setKey: string;
  content: string | null;
  skip: string | null; // 건너뛰는 이유(있으면 예약 안 함)
};

// 예약 대상 계산 (발송/DB 쓰기 없음 — dry-run 겸용)
export async function planNewNameNotices(): Promise<NewNamePlan[]> {
  if (!db) throw new Error("DB 사용 불가");
  if (!calendarAvailable()) throw new Error("달력 키 없음");
  const d = db;

  const [tpl] = await d.select().from(smsTemplates).where(eq(smsTemplates.name, TEMPLATE_NAME));
  const events = await readEvents();
  const today = todayKST();

  // 고객 이름→전화 보조 소스(달력에 번호가 없는 일정 대비)
  const custRows = await d.select().from(customers);
  const byName = new Map<string, string>();
  for (const c of custRows) if (c.name && c.phone && !byName.has(c.name)) byName.set(c.name, c.phone);
  const custByPhone = new Map<string, string>();
  for (const c of custRows) if (c.normalizedPhone && !custByPhone.has(c.normalizedPhone)) custByPhone.set(c.normalizedPhone, c.id);

  // 이미 예약/발송된 건 (setKey 로 멱등)
  const existing = await d
    .select({ setKey: scheduledMessages.setKey, phone: scheduledMessages.phone, status: scheduledMessages.status })
    .from(scheduledMessages)
    .where(and(isNotNull(scheduledMessages.setKey), like(scheduledMessages.setKey, `${NEWNAME_SET_PREFIX}%`)));
  const done = new Set(existing.filter((r) => r.status !== "canceled").map((r) => `${r.setKey}|${normalizePhone(r.phone)}`));

  const plans: NewNamePlan[] = [];
  for (const e of events as CalEvent[]) {
    if (!e.cat || !e.cat.includes("완료")) continue;
    const date = String(e.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    // 지나간 일정은 대상 아님(과거 고객에게 새 이름 안내가 다시 나가면 안 된다)
    if (date < today) continue;

    const { name, people } = parseNameCount(e.title || "");
    const rawPhone = e.clientPhone || findPhone(name, events, byName) || null;
    const phone = rawPhone ? normalizePhone(rawPhone) : null;
    const setKey = `${NEWNAME_SET_PREFIX}${date}`;
    const base = noticeSendAt(date);
    // 전날 09시가 이미 지났으면(일정이 오늘이거나, 뒤늦게 등록된 경우) 곧바로 보낸다
    const sendAt = base && base.getTime() > Date.now() ? base : new Date(Date.now() + 60_000);

    let skip: string | null = null;
    if (!name) skip = "제목에서 이름을 못 읽음";
    else if (!phone) skip = "전화번호 없음";
    else if (!tpl) skip = `템플릿 '${TEMPLATE_NAME}' 없음`;
    else if (done.has(`${setKey}|${phone}`)) skip = "이미 예약/발송됨";

    plans.push({
      namingDate: date,
      title: e.title || "",
      name,
      people,
      phone,
      minutes: newNameMinutes(people),
      sendAt: base ? sendAt.toISOString() : null,
      setKey,
      content: tpl && name ? renderNewNameNotice(tpl.content, name, people) : null,
      skip,
    });
  }
  plans.sort((a, b) => a.namingDate.localeCompare(b.namingDate));
  return plans;
}

// 실제 예약 생성. 반환: 새로 예약한 건 + 건너뛴 건
export async function scheduleNewNameNotices(): Promise<{ scheduled: NewNamePlan[]; skipped: NewNamePlan[] }> {
  if (!db) throw new Error("DB 사용 불가");
  const d = db;
  const plans = await planNewNameNotices();
  const scheduled: NewNamePlan[] = [];
  const skipped: NewNamePlan[] = [];

  const custRows = await d.select({ id: customers.id, np: customers.normalizedPhone }).from(customers);
  const custByPhone = new Map<string, string>();
  for (const c of custRows) if (c.np && !custByPhone.has(c.np)) custByPhone.set(c.np, c.id);

  for (const p of plans) {
    if (p.skip || !p.phone || !p.content || !p.sendAt) {
      skipped.push(p);
      continue;
    }
    try {
      await smsStore.createMessage({
        customerId: custByPhone.get(p.phone) ?? null,
        phone: p.phone,
        content: p.content,
        setKey: p.setKey,
        scheduledAt: p.sendAt,
      });
      scheduled.push(p);
      console.log(`[KOP] 새이름안내 예약: ${p.name}(${p.people}명·${p.minutes}분) 작명완료 ${p.namingDate} → ${p.sendAt}`);
    } catch (e: any) {
      skipped.push({ ...p, skip: `예약 실패: ${e?.message}` });
      console.error(`[KOP] 새이름안내 예약 실패 ${p.name}: ${e?.message}`);
    }
  }
  return { scheduled, skipped };
}

// ── 스케줄러: 달력을 주기적으로 읽어 새 작명완료 일정을 예약한다 ──
// 달력 변경은 급하지 않고 Neon 을 자주 깨우면 비용이 든다 → 60분 간격(구분 동기화와 동일 정책).
let _timer: NodeJS.Timeout | null = null;
export function startNewNameNoticeScheduler() {
  if (_timer) return;
  const run = async () => {
    try {
      const r = await scheduleNewNameNotices();
      if (r.scheduled.length) console.log(`[KOP] 새이름 상담 안내 ${r.scheduled.length}건 예약`);
      const real = r.skipped.filter((s) => s.skip && s.skip !== "이미 예약/발송됨");
      for (const s of real) console.log(`[KOP] 새이름안내 건너뜀: ${s.namingDate} ${s.title} — ${s.skip}`);
    } catch (e: any) {
      console.error(`[KOP] 새이름 상담 안내 예약 실패: ${e?.message}`);
    }
  };
  console.log("[KOP] 새 이름 상담 안내 스케줄러 시작 (달력 작명완료 전날 09:00 · 60분 간격 점검)");
  setTimeout(run, 30_000); // 서버 기동 30초 후 1회
  _timer = setInterval(run, 60 * 60_000);
}
