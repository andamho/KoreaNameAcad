// 새 이름 선택 점검 — 원장님께 텔레그램으로 알린다(고객에게 가는 문자 아님).
//
// 규칙(원장님 확정, 2026-09-19):
//   · 새 이름을 안내한 날(달력 '작명완료' 날짜) 1주 뒤부터 매주, 같은 요일 아침 점검(08:40) 때 알린다.
//   · 그 고객의 '개완CHK'(법적 개명허가 점검) 일정이 달력에 잡히면 알림을 멈춘다.
//     = 새 이름을 골라 법원에 냈다는 뜻이므로 더 물을 필요가 없다.
//   · 작명완료 일정을 달력에서 지우면 자연히 멈춘다(달력이 기준).
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
  if (db) {
    const rows = await db.select({ name: customers.name, phone: customers.phone }).from(customers);
    for (const c of rows) if (c.name && c.phone && !byName.has(c.name)) byName.set(c.name, c.phone);
  }

  // 개완CHK 일정: 이름·번호
  const chk = events.filter((e) => (e.cat || "").includes("개완"));
  const chkNames = new Set(chk.map((e) => followupName(e.title || "")).filter(Boolean));
  const chkPhones = new Set(chk.map((e) => (e.clientPhone ? normalizePhone(e.clientPhone) : "")).filter(Boolean));

  const due: FollowupItem[] = [];
  const stopped: string[] = [];
  for (const e of events) {
    if (!e.cat || !e.cat.includes("작명완료")) continue;
    const date = String(e.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < FOLLOWUP_FROM) continue;
    const name = followupName(e.title || "");
    if (!name) continue;
    const raw = e.clientPhone || findPhone(name, events, byName) || byName.get(name) || null;
    const phone = raw ? normalizePhone(raw) : null;
    if (chkNames.has(name) || (phone && chkPhones.has(phone))) {
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
