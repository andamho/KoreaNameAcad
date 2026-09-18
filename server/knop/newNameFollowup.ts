// 새 이름 선택 점검 — 원장님께 텔레그램으로 알린다(고객에게 가는 문자 아님).
//
// 규칙(원장님 확정, 2026-09-19):
//   · 새 이름을 안내한 날(달력 '작명완료' 날짜) 1주 뒤부터 매주, 같은 요일 아침 점검(08:40) 때 알린다.
//   · 그 고객의 '개완CHK'(법적 개명허가 점검) 일정이 달력에 잡히면 알림을 멈춘다.
//     = 새 이름을 골라 법원에 냈다는 뜻이므로 더 물을 필요가 없다.
//   · 작명완료 일정을 달력에서 지우면 자연히 멈춘다(달력이 기준).
//   · 아가 이름(제목에 '아가')은 개명 허가 절차가 없으므로 대상이 아니다.
//   · 고객정보 태그에 '새이름점검제외' 가 있으면 뺀다(원장님이 개별로 뺀 고객 — 강다희·김이나).
//   · 태그 '새이름점검포함' 이 있으면 기준일(7/24) 전 작명완료라도 넣는다(정연희님).
//   · 고객정보 이름을 새 이름으로 바꿨으면 멈춘다(원장님 확정) — 이름을 바꿨다는 것 자체가
//     새 이름을 골랐다는 뜻이다. 판정: 지금 이름이 달력의 옛 이름과 다르거나,
//     '새 이름(옛 이름)' 괄호 표기이거나, 개명 전후 기록(rename_map)이 있다.
//   · 개명 뒤 고객정보 이름을 새 이름으로 바꾸고 달력에 새 이름으로 개완CHK 를 잡는다
//     (홍나영 → 홍수안). 고객정보의 이름 이력(name_history·rename_map)으로 옛 이름과
//     새 이름을 같은 사람으로 묶어 비교한다.
//
// 상태를 DB 에 저장하지 않는다. 매일 달력만 보고 '오늘이 7·14·21…일째인가'를 계산하므로
// 일정을 옮기거나 지우면 그대로 따라간다.
import { db } from "../db";
import { customers, normalizePhone } from "@shared/schema";
import { findPhone, parseNameCount, readEvents, calendarAvailable, type CalEvent } from "./calendar";
import { scheduleDaily } from "./dailyCheckpoint";
import { todayKST } from "./newNameNotice";

// 이 날짜 이후의 작명완료만 본다(미용감사 자동 발동과 같은 기준일).
const FOLLOWUP_FROM = (process.env.KOP_NAMING_AUTO_FROM || "2026-07-24").trim();

// 달력 제목 → 사람 이름. "530이제이"(시각 앞머리), "김유진(비번2)"(괄호 메모),
// "진유정2"(인원), "노유혁님아가"(님 뒤 설명) 모두 이름만 남긴다.
export function followupName(title: string): string {
  const t = (title || "")
    .replace(/[(（][^)）]*[)）]/g, "")
    .replace(/^\s*\d+\s*/, "")
    .trim();
  return parseNameCount(t).name.replace(/님.*$/, "").replace(/\s*가족\s*$/, "").trim();
}

// 고객의 모든 이름: 지금 이름 + 이름 이력 + 개명 전후(가족 개명 포함).
export function aliasesOf(c: any): string[] {
  const out = new Set<string>();
  const add = (n: unknown) => {
    const v = followupName(String(n || ""));
    if (v) out.add(v);
  };
  add(c.name);
  // '새 이름(옛 이름)' 표기: 괄호 안이 이름만이면 성을 붙여 옛 이름으로 본다.
  // 홍수안(나영) → 홍나영, 윤하라(미옥가족) → 윤미옥. 이름 이력이 없어도 이어진다.
  const m = /^\s*([가-힣])[가-힣]*\s*[(（]\s*([가-힣]{1,3})(?:\s*가족)?\s*[)）]/.exec(String(c.name || ""));
  if (m) add(m[1] + m[2]);
  const parse = (v: unknown): any[] => {
    if (Array.isArray(v)) return v;
    try { const j = JSON.parse(String(v || "[]")); return Array.isArray(j) ? j : []; } catch { return []; }
  };
  for (const h of parse(c.nameHistory)) add(h?.name);
  for (const m of parse(c.renameMap)) { add(m?.before); add(m?.after); }
  return Array.from(out);
}

export const EXCLUDE_TAG = "새이름점검제외";
export const INCLUDE_TAG = "새이름점검포함";

// 고객정보 이름이 새 이름으로 바뀌었나(달력 작명완료의 이름 = 옛 이름 기준).
function isRenamed(c: any, calendarName: string): boolean {
  if (/[(（]/.test(String(c.name || ""))) return true; // 홍수안(나영)
  if (followupName(String(c.name || "")) !== calendarName) return true; // 달력은 옛 이름, 고객정보는 새 이름
  try {
    const m = Array.isArray(c.renameMap) ? c.renameMap : JSON.parse(String(c.renameMap || "[]"));
    if (Array.isArray(m) && m.some((x: any) => x?.before && x?.after && x.before !== x.after)) return true;
  } catch {
    /* 기록이 깨졌으면 무시 */
  }
  return false;
}
function hasTag(tags: unknown, tag: string): boolean {
  try {
    const arr = Array.isArray(tags) ? tags : JSON.parse(String(tags || "[]"));
    return Array.isArray(arr) && arr.includes(tag);
  } catch {
    return false;
  }
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

// 텔레그램은 tel: 링크를 막는다. +8210… 형식이면 눌러서 걸 수 있다.
function telFormat(p: string | null): string {
  const d = (p || "").replace(/\D/g, "");
  return d.startsWith("0") && d.length >= 10 ? `+82${d.slice(1)}` : p || "번호 없음";
}

export type FollowupItem = { name: string; namingDate: string; days: number; week: number; phone: string | null };

// 오늘 알릴 대상 계산(발송 없음).
export async function planNewNameFollowups(today = todayKST()): Promise<{ due: FollowupItem[]; stopped: string[] }> {
  if (!calendarAvailable()) return { due: [], stopped: [] };
  const events = (await readEvents()) as CalEvent[];
  if (!events.length) return { due: [], stopped: [] };

  const byName = new Map<string, string>();
  // 이름(옛 이름 포함) → 고객 id. 개명한 고객은 옛 이름·새 이름이 모두 같은 id 를 가리킨다.
  const idByName = new Map<string, string>();
  const idByPhone = new Map<string, string>();
  const phoneById = new Map<string, string>();
  const excluded = new Set<string>(); // 태그 '새이름점검제외' 가 달린 고객 id
  const included = new Set<string>(); // 태그 '새이름점검포함' 이 달린 고객 id
  const custById = new Map<string, any>();
  if (db) {
    const rows = await db.select().from(customers);
    for (const c of rows) {
      if (c.deletedAt) continue;
      if (c.name && c.phone && !byName.has(c.name)) byName.set(c.name, c.phone);
      if (c.phone) phoneById.set(c.id, c.phone);
      if (hasTag(c.tags, EXCLUDE_TAG)) excluded.add(c.id);
      if (hasTag(c.tags, INCLUDE_TAG)) included.add(c.id);
      custById.set(c.id, c);
      if (c.normalizedPhone && !idByPhone.has(c.normalizedPhone)) idByPhone.set(c.normalizedPhone, c.id);
      for (const nm of aliasesOf(c)) if (!idByName.has(nm)) idByName.set(nm, c.id);
    }
  }
  // 사람 열쇠: 고객이면 고객 id, 아니면 이름 그대로.
  const keyOf = (name: string, phone: string | null) =>
    (phone && idByPhone.get(phone)) || idByName.get(name) || `이름:${name}`;

  // 개완CHK 일정: 사람 열쇠
  const chkKeys = new Set<string>();
  for (const e of events) {
    if (!(e.cat || "").includes("개완")) continue;
    const nm = followupName(e.title || "");
    const ph = e.clientPhone ? normalizePhone(e.clientPhone) : null;
    if (nm || ph) chkKeys.add(keyOf(nm, ph));
  }

  const due: FollowupItem[] = [];
  const stopped: string[] = [];
  for (const e of events) {
    if (!e.cat || !e.cat.includes("작명완료")) continue;
    const date = String(e.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (/아가/.test(e.title || "")) continue; // 아가 이름은 개명 허가 절차가 없다
    const name = followupName(e.title || "");
    if (!name) continue;
    let raw = e.clientPhone || findPhone(name, events, byName) || byName.get(name) || null;
    const key = keyOf(name, raw ? normalizePhone(raw) : null);
    if (date < FOLLOWUP_FROM && !included.has(key)) continue;
    if (!raw && !key.startsWith("이름:")) raw = phoneById.get(key) || null; // 개명한 고객은 고객정보 번호로
    const phone = raw ? normalizePhone(raw) : null;
    if (excluded.has(key)) continue;
    const cust = custById.get(key);
    if (cust && isRenamed(cust, name)) {
      stopped.push(name);
      continue;
    }
    if (chkKeys.has(key)) {
      stopped.push(name);
      continue;
    }
    const days = daysBetween(date, today);
    if (days >= 7 && days % 7 === 0) due.push({ name, namingDate: date, days, week: days / 7, phone });
  }
  due.sort((a, b) => a.namingDate.localeCompare(b.namingDate));
  return { due, stopped };
}

export function renderFollowup(items: FollowupItem[], esc: (v: unknown) => string): string {
  const lines = ["🔔 <b>새 이름 선택 점검</b>", ""];
  for (const it of items) {
    const md = it.namingDate.slice(5).replace("-", "/");
    lines.push(`${esc(it.name)}님 · 안내 ${md} · ${it.week}주차`);
    lines.push(telFormat(it.phone));
    lines.push("");
  }
  lines.push("개완CHK 일정을 잡으면 알림이 멈춥니다.");
  return lines.join("\n");
}

// 아침 점검 시간대(08:30~09:00 KST)에만 보낸다. 배포·재시작 때 도는 점검이
// 오후에 같은 알림을 또 보내지 않게 하기 위해서다. 같은 날 두 번 보내지 않는다.
let _lastSentDay = "";
function inMorningWindow(): boolean {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  const m = k.getUTCHours() * 60 + k.getUTCMinutes();
  return m >= 8 * 60 + 30 && m < 9 * 60;
}

export async function sendNewNameFollowups(opts: { force?: boolean } = {}): Promise<FollowupItem[]> {
  const today = todayKST();
  if (!opts.force && (!inMorningWindow() || _lastSentDay === today)) return [];
  const { due } = await planNewNameFollowups(today);
  if (!due.length) return [];
  const { sendAlert, esc, alertAvailable } = await import("./alertBot");
  if (!alertAvailable()) return [];
  await sendAlert(renderFollowup(due, esc));
  _lastSentDay = today;
  console.log(`[KOP] 새 이름 선택 점검 알림: ${due.map((d) => `${d.name}(${d.week}주)`).join(", ")}`);
  return due;
}

let _started = false;
export function startNewNameFollowupScheduler() {
  if (_started) return;
  _started = true;
  scheduleDaily("새 이름 선택 점검 알림(작명완료 1주 뒤부터 매주)", async () => {
    await sendNewNameFollowups();
  }, 40_000);
}
