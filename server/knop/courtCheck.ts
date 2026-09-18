// 달력 '개완CHK'(법적 개명허가 점검) 일정 → 고객 단계·개명허가 확인 문자 맞추기.
//
// 규칙(원장님 확정, 2026-09-19):
//   · 달력에 개완CHK 를 잡으면 그 고객의 진행단계를 '법원접수'로 올린다(이미 그 이상이면 그대로).
//   · 개명허가 확인 문자는 개완CHK 날짜 아침 9~10시에 보낸다(법원접수 +60일 규칙 대신).
//   · 개완CHK 날짜를 옮기면 문자도 따라 옮기고, 일정을 지우면 문자를 취소한다.
//   · 이미 지난 날짜의 개완CHK 는 단계만 맞추고 문자는 보내지 않는다.
//
// 고객 찾기는 새 이름 점검 알림과 같다: 번호 → 이름(옛 이름·괄호 속 이름 포함).
import { db } from "../db";
import { and, eq, inArray, like } from "drizzle-orm";
import {
  customers,
  projects,
  scheduledMessages,
  normalizePhone,
  knopStatusToMilestone,
  KNOP_MILESTONE_ENTRY,
} from "@shared/schema";
import { readEvents, calendarAvailable, type CalEvent } from "./calendar";
import { aliasesOf, followupName } from "./newNameFollowup";
import { todayKST } from "./newNameNotice";
import { scheduleDaily } from "./dailyCheckpoint";

const CHECK_FROM = (process.env.KOP_NAMING_AUTO_FROM || "2026-07-24").trim();
const CHECK_PREFIX = "gaemyeong_check";

export type CourtCheckResult = {
  advanced: string[];  // 법원접수로 올린 고객
  scheduled: string[]; // 새로 예약한 문자
  canceled: string[];  // 취소한 문자(날짜가 바뀌었거나 일정이 빠짐)
  unmatched: string[]; // 고객을 못 찾은 개완CHK
};

export async function syncCourtChecks(opts: { dryRun?: boolean } = {}): Promise<CourtCheckResult> {
  const out: CourtCheckResult = { advanced: [], scheduled: [], canceled: [], unmatched: [] };
  if (!db || !calendarAvailable()) return out;
  const d = db;
  const events = (await readEvents()) as CalEvent[];
  if (!events.length) return out; // 달력을 못 읽으면 아무것도 바꾸지 않는다

  // 고객 찾기 지도
  const custRows = (await d.select().from(customers)).filter((c) => !c.deletedAt);
  const idByPhone = new Map<string, string>();
  const idByName = new Map<string, string>();
  const nameById = new Map<string, string>();
  for (const c of custRows) {
    nameById.set(c.id, c.name);
    if (c.normalizedPhone && !idByPhone.has(c.normalizedPhone)) idByPhone.set(c.normalizedPhone, c.id);
    for (const nm of aliasesOf(c)) if (!idByName.has(nm)) idByName.set(nm, c.id);
  }

  // 고객별 개완CHK 날짜(여러 개면 가장 늦은 것)
  const chkByCust = new Map<string, string>();
  for (const e of events) {
    if (!(e.cat || "").includes("개완")) continue;
    const date = String(e.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < CHECK_FROM) continue;
    const nm = followupName(e.title || "");
    const ph = e.clientPhone ? normalizePhone(e.clientPhone) : "";
    const id = (ph && idByPhone.get(ph)) || idByName.get(nm);
    if (!id) {
      out.unmatched.push(`${date} ${e.title}`);
      continue;
    }
    const prev = chkByCust.get(id);
    if (!prev || date > prev) chkByCust.set(id, date);
  }

  // ① 단계: 법원접수 미만이면 올린다
  const { knopStore } = await import("./store");
  const projRows = await d.select().from(projects);
  const latest = new Map<string, (typeof projRows)[number]>();
  for (const p of projRows) {
    const cur = latest.get(p.customerId);
    if (!cur || (p.updatedAt && cur.updatedAt && p.updatedAt > cur.updatedAt)) latest.set(p.customerId, p);
  }
  for (const [cid] of Array.from(chkByCust)) {
    const p = latest.get(cid);
    if (!p || knopStatusToMilestone(p.status) >= 3) continue;
    out.advanced.push(nameById.get(cid) || cid);
    if (!opts.dryRun) await knopStore.advanceStatus(p.id, KNOP_MILESTONE_ENTRY[3], { fromCheck: true });
  }

  // ② 문자: 개완CHK 날짜에 1건. 다른 날짜로 잡힌 확인 문자는 취소.
  const existing = await d
    .select({ id: scheduledMessages.id, customerId: scheduledMessages.customerId, setKey: scheduledMessages.setKey, status: scheduledMessages.status })
    .from(scheduledMessages)
    .where(like(scheduledMessages.setKey, `${CHECK_PREFIX}%`));
  const today = todayKST();
  const gm = await import("./gaemyeong");
  const toCancel: string[] = [];

  for (const [cid, date] of Array.from(chkByCust)) {
    const key = `${CHECK_PREFIX}:${date}`;
    const mine = existing.filter((m) => m.customerId === cid);
    const already = mine.some((m) => m.setKey === key && m.status !== "canceled");
    // 이 날짜가 아닌 대기 중 확인 문자(60일 규칙으로 잡힌 것 포함)는 취소
    for (const m of mine) {
      if (m.status === "scheduled" && m.setKey !== key) {
        toCancel.push(m.id);
        out.canceled.push(`${nameById.get(cid) || cid} ${m.setKey}`);
      }
    }
    if (already || date < today) continue;
    out.scheduled.push(`${nameById.get(cid) || cid} ${date}`);
    if (!opts.dryRun) {
      const r = await gm.scheduleApprovalCheckOn(cid, date);
      if (!r.ok) out.scheduled[out.scheduled.length - 1] += ` (건너뜀: ${r.reason})`;
    }
  }

  // ③ 달력에서 빠진 개완CHK 로 잡힌 문자 취소 (60일 규칙으로 잡힌 것은 건드리지 않는다)
  for (const m of existing) {
    if (m.status !== "scheduled" || !m.customerId || !String(m.setKey).startsWith(`${CHECK_PREFIX}:`)) continue;
    if (chkByCust.has(m.customerId)) continue; // 위에서 처리
    toCancel.push(m.id);
    out.canceled.push(`${nameById.get(m.customerId) || m.customerId} ${m.setKey} (달력에서 빠짐)`);
  }

  if (toCancel.length && !opts.dryRun) {
    await d
      .update(scheduledMessages)
      .set({ status: "canceled" })
      .where(and(inArray(scheduledMessages.id, toCancel), eq(scheduledMessages.status, "scheduled")));
  }
  return out;
}

let _started = false;
export function startCourtCheckScheduler() {
  if (_started) return;
  _started = true;
  scheduleDaily("개완CHK → 법원접수·개명허가 확인 문자", async () => {
    const r = await syncCourtChecks();
    for (const n of r.advanced) console.log(`[KOP] 개완CHK → 법원접수: ${n}`);
    for (const s of r.scheduled) console.log(`[KOP] 개명허가 확인 예약: ${s}`);
    for (const c of r.canceled) console.log(`[KOP] 개명허가 확인 취소: ${c}`);
    for (const u of r.unmatched) console.log(`[KOP] 개완CHK 고객 못 찾음: ${u}`);
  }, 50_000);
}
