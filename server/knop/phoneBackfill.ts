// 번호 되쓰기: 번호 없는 작명완료 일정에, 같은 사람의 다른 기록에서 번호를 찾아 채움.
// 소스 우선순위: 상담일정 → 상담신청DB → KNOP고객. 같은 이름에 다른 번호 여럿이면 애매(자동 안 함).
import { db } from "../db";
import { sql } from "drizzle-orm";
import { readEvents, parseNameCount, applyEventPhones, type CalEvent } from "./calendar";
import { knopStore } from "./store";

type SrcMap = Map<string, Set<string>>;
function addName(m: SrcMap, name: string, phone: string) {
  if (!name || !phone) return;
  if (!m.has(name)) m.set(name, new Set());
  m.get(name)!.add(phone);
}

async function loadSources(events: CalEvent[]) {
  const cal: SrcMap = new Map();
  for (const e of events) {
    if (e.cat === "상담" && e.clientPhone) addName(cal, parseNameCount(e.title || "").name, e.clientPhone);
  }
  const cons: SrcMap = new Map();
  if (db) {
    const res: any = await db.execute(sql`SELECT phone, people_data, depositor_name FROM consultations`);
    for (const r of res.rows || res) {
      try {
        for (const p of JSON.parse(r.people_data || "[]")) if (p?.name) addName(cons, p.name, r.phone);
      } catch {}
      if (r.depositor_name) addName(cons, r.depositor_name, r.phone);
    }
  }
  const cust: SrcMap = new Map();
  for (const c of await knopStore.listCustomers()) addName(cust, c.name, c.phone);
  return { cal, cons, cust };
}

function resolve(
  name: string,
  s: { cal: SrcMap; cons: SrcMap; cust: SrcMap }
): { phone?: string; source?: string; ambiguous?: boolean; phones?: string[] } {
  const order: Array<[string, SrcMap]> = [
    ["상담일정", s.cal],
    ["상담신청DB", s.cons],
    ["KNOP고객", s.cust],
  ];
  for (const [src, m] of order) {
    const set = m.get(name);
    if (set && set.size) {
      if (set.size === 1) return { phone: Array.from(set)[0], source: src };
      return { ambiguous: true, source: src, phones: Array.from(set) };
    }
  }
  return {};
}

export type BackfillPreview = {
  fillable: Array<{ id?: string; date?: string; title?: string; name: string; people: number; source: string; phone: string }>;
  ambiguous: Array<{ id?: string; date?: string; title?: string; name: string; source: string; phones: string[] }>;
  missing: Array<{ id?: string; date?: string; title?: string; name: string }>;
  counts: { fillable: number; ambiguous: number; missing: number };
};

export async function previewBackfill(): Promise<BackfillPreview> {
  const events = await readEvents();
  const sources = await loadSources(events);
  const targets = events.filter((e) => e.cat && e.cat.includes("완료") && !e.clientPhone);
  const fillable: BackfillPreview["fillable"] = [];
  const ambiguous: BackfillPreview["ambiguous"] = [];
  const missing: BackfillPreview["missing"] = [];
  for (const e of targets) {
    const { name, people } = parseNameCount(e.title || "");
    const r = resolve(name, sources);
    const base = { id: e.id, date: e.date, title: e.title };
    if (r.ambiguous) ambiguous.push({ ...base, name, source: r.source!, phones: r.phones! });
    else if (r.phone) fillable.push({ ...base, name, people, source: r.source!, phone: r.phone });
    else missing.push({ ...base, name });
  }
  return {
    fillable,
    ambiguous,
    missing,
    counts: { fillable: fillable.length, ambiguous: ambiguous.length, missing: missing.length },
  };
}

export async function applyBackfill(dryRun: boolean): Promise<{ attempted: number; written: number; dryRun: boolean }> {
  const { fillable } = await previewBackfill();
  const updates = fillable.map((f) => ({ id: f.id, date: f.date, title: f.title, phone: f.phone }));
  const res = await applyEventPhones(updates, { dryRun });
  return { attempted: updates.length, written: res.written, dryRun };
}
