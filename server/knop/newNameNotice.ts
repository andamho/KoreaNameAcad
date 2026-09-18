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
import { scheduleDaily } from "./dailyCheckpoint";

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

// ── 달력에서 빠진 일정의 예약 취소 ──
// 작명완료 일정을 지우거나 날짜를 옮기면, 옛 날짜로 잡힌 안내 문자는 더 이상 맞지 않는다
// (2026-09-19 고기원님: 달력엔 없는데 10/14 안내가 남아 있었음 — 원장님 지시로 자동 취소).
// 날짜를 옮긴 경우는 새 날짜로 scheduleNewNameNotices 가 다시 잡는다.
// 안전장치: 달력을 못 읽었거나 비어 있으면 아무것도 취소하지 않는다(일시 장애로 전부 날리는 사고 방지).
export async function cancelOrphanNewNameNotices(): Promise<Array<{ id: string; setKey: string; phone: string; name: string | null }>> {
  if (!db) throw new Error("DB 사용 불가");
  if (!calendarAvailable()) return [];
  const d = db;
  const events = (await readEvents()) as CalEvent[];
  if (!events.length) return [];

  const custRows = await d.select().from(customers);
  const byName = new Map<string, string>();
  for (const c of custRows) if (c.name && c.phone && !byName.has(c.name)) byName.set(c.name, c.phone);
  const nameById = new Map<string, string>();
  for (const c of custRows) nameById.set(c.id, c.name);

  // 달력에 살아 있는 작명완료: 날짜|번호, 날짜|이름 (번호 없는 일정 대비)
  const alivePhone = new Set<string>();
  const aliveName = new Set<string>();
  for (const e of events) {
    if (!e.cat || !e.cat.includes("완료")) continue;
    const date = String(e.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const { name } = parseNameCount(e.title || "");
    const raw = e.clientPhone || findPhone(name, events, byName) || null;
    if (raw) alivePhone.add(`${date}|${normalizePhone(raw)}`);
    if (name) aliveName.add(`${date}|${name}`);
  }

  const pending = await d
    .select({ id: scheduledMessages.id, setKey: scheduledMessages.setKey, phone: scheduledMessages.phone, customerId: scheduledMessages.customerId })
    .from(scheduledMessages)
    .where(and(eq(scheduledMessages.status, "scheduled"), like(scheduledMessages.setKey, `${NEWNAME_SET_PREFIX}%`)));

  const orphans = pending.filter((m) => {
    const date = String(m.setKey || "").slice(NEWNAME_SET_PREFIX.length);
    if (alivePhone.has(`${date}|${normalizePhone(m.phone)}`)) return false;
    const nm = m.customerId ? nameById.get(m.customerId) : null;
    if (nm && aliveName.has(`${date}|${nm.replace(/\s*[(（][^)）]*[)）]\s*/g, "").replace(/\s*가족\s*$/, "").trim()}`)) return false;
    return true;
  });
  if (!orphans.length) return [];

  await d
    .update(scheduledMessages)
    .set({ status: "canceled" })
    .where(and(inArray(scheduledMessages.id, orphans.map((o) => o.id)), eq(scheduledMessages.status, "scheduled")));
  return orphans.map((o) => ({ id: o.id, setKey: String(o.setKey), phone: o.phone, name: o.customerId ? nameById.get(o.customerId) ?? null : null }));
}

// ── 스케줄러: 달력을 읽어 새 작명완료 일정을 예약한다 ──
// 발송은 작명완료 전날 09:00 이고, 예약만 미리 잡아두면 되므로 자주 볼 이유가 없다.
// 예전에는 60분 간격(하루 24회)이라 Neon 컴퓨트가 계속 깨어 있었다
// → 아침 점검(08:40 KST) 하루 한 번으로 통일.
let _started = false;
export function startNewNameNoticeScheduler() {
  if (_started) return;
  _started = true;
  const run = async () => {
    try {
      // 먼저 달력에서 빠진 일정의 예약을 취소하고, 그다음 새 일정을 예약한다.
      const gone = await cancelOrphanNewNameNotices();
      for (const g of gone) console.log(`[KOP] 새이름안내 취소(달력에서 빠짐): ${g.name ?? g.phone} ${g.setKey}`);
      const r = await scheduleNewNameNotices();
      if (r.scheduled.length) console.log(`[KOP] 새이름 상담 안내 ${r.scheduled.length}건 예약`);
      const real = r.skipped.filter((s) => s.skip && s.skip !== "이미 예약/발송됨");
      for (const s of real) console.log(`[KOP] 새이름안내 건너뜀: ${s.namingDate} ${s.title} — ${s.skip}`);
    } catch (e: any) {
      console.error(`[KOP] 새이름 상담 안내 예약 실패: ${e?.message}`);
    }
  };
  scheduleDaily("새 이름 상담 안내 예약(달력 작명완료 전날 09:00)", run, 30_000);
}
