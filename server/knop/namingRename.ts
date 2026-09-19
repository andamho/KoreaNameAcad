// 작명장 링크 문자 → 고객정보 이름 자동 변경.
//
// 원장님 확정(2026-09-19): 원장님 폰에서 작명장 링크
//   https://korea-name-acad.com/s/운이술술풀리는이름강다희
// 를 보냈으면 새 이름을 최종 선택한 것이다. 그 번호의 고객정보 이름을
//   '성 포함 새 이름(성 뺀 기존 이름)'   예) 강금희 → 강다희(금희)
// 로 바꾼다. 원장님이 손으로 바꿀 때와 같은 updateCustomer 를 써서
// 이름 이력·기록(타임라인)이 똑같이 남는다. 바꾸면 텔레그램으로 알린다.
//
// 자동으로 바꾸지 않고 알리기만 하는 경우(틀리게 바꾸면 되돌리기 번거롭다):
//   · 가족 고객(이름에 '가족') — 링크가 가족 중 누구 이름인지 알 수 없다
//   · 한 번호로 서로 다른 새 이름 링크가 여러 개 — 누구 것인지 알 수 없다
//   · 새 이름과 기존 이름의 성이 다름 — 아이 이름 등 다른 사람일 수 있다
// 이미 '새 이름(옛 이름)' 으로 적혀 있거나 이미 새 이름이면 건드리지 않는다.
import { db } from "../db";
import { and, eq, like } from "drizzle-orm";
import { customers, incomingSms, normalizePhone, baseSurname, givenName } from "@shared/schema";

const LINK_MARK = "/s/운이술술풀리는이름";
// 문제 알림은 이 날짜 이후 링크에만(예전 링크로 매일 알림이 쌓이지 않게)
const ALERT_FROM = (process.env.KOP_NAMING_RENAME_FROM || "2026-09-19").trim();

export type RenameResult = { phone: string; from?: string; to?: string; note: string };

function linkName(body: string): string {
  return ((String(body || "").split(LINK_MARK)[1] || "").match(/^[가-힣]{2,5}/)?.[0] || "").trim();
}

export async function autoRenameFromNamingLinks(opts: { phone?: string; dryRun?: boolean; alert?: boolean } = {}): Promise<RenameResult[]> {
  if (!db) return [];
  const d = db;
  const conds = [eq(incomingSms.direction, "발신"), like(incomingSms.body, `%${LINK_MARK}%`)];
  if (opts.phone) conds.push(eq(incomingSms.phone, normalizePhone(opts.phone)));
  const rows = await d
    .select({ phone: incomingSms.phone, body: incomingSms.body, at: incomingSms.receivedAt })
    .from(incomingSms)
    .where(and(...conds));
  if (!rows.length) return [];

  // 번호별 링크 이름들
  const byPhone = new Map<string, { names: Set<string>; latest: Date }>();
  for (const r of rows) {
    const ph = normalizePhone(r.phone || "");
    const nm = linkName(r.body);
    if (!ph || !nm) continue;
    const g = byPhone.get(ph) || { names: new Set<string>(), latest: new Date(0) };
    g.names.add(nm);
    if (new Date(r.at) > g.latest) g.latest = new Date(r.at);
    byPhone.set(ph, g);
  }

  const custRows = (await d.select().from(customers)).filter((c) => !c.deletedAt);
  const fromUtc = Date.parse(`${ALERT_FROM}T00:00:00Z`) - 9 * 3600_000;
  const out: RenameResult[] = [];
  const { knopStore } = await import("./store");

  for (const [phone, g] of Array.from(byPhone)) {
    const cust = custRows.find((c) => c.normalizedPhone === phone);
    const recent = g.latest.getTime() >= fromUtc;
    const names = Array.from(g.names);
    const skip = (note: string, from?: string) => {
      out.push({ phone, from, note });
      return recent; // 최근 링크일 때만 알린다
    };
    let alertNote: string | null = null;

    if (!cust) {
      if (skip("고객정보에 없는 번호")) alertNote = `고객정보에 없는 번호라 이름을 바꾸지 못했습니다. (링크 이름: ${names.join(", ")})`;
    } else {
      const cur = cust.name || "";
      const base = cur.replace(/\s*[(（][^)）]*[)）]\s*/g, "").replace(/\s*가족\s*$/, "").trim();
      if (/[(（]/.test(cur) || names.includes(base)) {
        out.push({ phone, from: cur, note: "이미 새 이름으로 적혀 있음" });
        continue;
      }
      if (/가족/.test(cur)) {
        if (skip("가족 고객 — 누구 이름인지 모름", cur)) alertNote = `가족 고객이라 누구의 새 이름인지 알 수 없어 그대로 두었습니다. (링크 이름: ${names.join(", ")})`;
      } else if (names.length !== 1) {
        if (skip("한 번호로 여러 새 이름", cur)) alertNote = `한 번호로 새 이름 링크가 여러 개라 그대로 두었습니다. (${names.join(", ")})`;
      } else if (baseSurname(names[0]) !== baseSurname(base)) {
        if (skip("성이 다름", cur)) alertNote = `새 이름(${names[0]})과 기존 이름(${base})의 성이 달라 그대로 두었습니다. 아이 이름일 수 있습니다.`;
      } else {
        const nn = names[0];
        const to = `${nn}(${givenName(base)})`;
        out.push({ phone, from: cur, to, note: "변경" });
        if (opts.dryRun) continue;
        let map: any[] = [];
        try {
          const j = JSON.parse(String(cust.renameMap || "[]"));
          if (Array.isArray(j)) map = j;
        } catch {
          map = [];
        }
        map.push({ before: base, after: nn });
        await knopStore.updateCustomer(cust.id, { name: to, renameMap: JSON.stringify(map) } as any);
        console.log(`[KOP] 작명장 링크 → 고객정보 이름 변경: ${cur} → ${to}`);
        {
          // 이름을 바꿨으면 언제나 알린다(들어올 때든 아침 점검에서든)
          await tell(["✏️ <b>고객정보 이름 자동 변경</b>", `${cur} → ${to}`, tel(phone), "", "작명장 링크 문자가 나간 것을 확인했습니다."]);
        }
        continue;
      }
    }
    if (alertNote && opts.alert && !opts.dryRun) {
      await tell(["⚠️ <b>고객정보 이름 확인 필요</b>", `${cust?.name || "고객정보 없음"} · ${tel(phone)}`, "", alertNote]);
    }
  }
  return out;
}

function tel(phone: string): string {
  return phone.startsWith("0") ? `+82${phone.slice(1)}` : phone;
}
async function tell(lines: string[]): Promise<void> {
  try {
    const { sendAlert, esc } = await import("./alertBot");
    // 첫 줄(굵은 제목)은 그대로, 나머지는 감싼다
    await sendAlert([lines[0], ...lines.slice(1).map((l) => esc(l))].join("\n"));
  } catch {
    /* 알림 실패는 무시 */
  }
}
