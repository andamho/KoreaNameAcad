// 새 번호 감지 알림 — 고객정보에 없는 번호로 문자가 오가는데, 휴대폰 연락처 이름이
// 기존 고객과 같으면 "새 번호로 보입니다" 라고 원장님께 텔레그램으로 알린다.
//
// 원장님 요청(2026-10-20): 이서율님이 10/7 새 번호로 바꾸고 새 번호로 문자도 주고받았는데
// (연락처 이름 "이서율(제이) 2603홍익KT" 그대로), 고객정보는 옛 번호라 10/10 개명 신청 확인
// 문자가 옛 번호로 나갔다. 시스템은 새 번호를 알 수 있었다.
//
// 번호를 자동으로 바꾸지는 않는다(가족이 한 연락처에 같이 저장된 경우 엉뚱하게 바뀔 수 있다).
// 알림을 보고 원장님이 고객정보에서 바꾸면, 아직 안 나간 예약 문자도 새 번호로 옮겨진다(store).
//
// 문자 수집 웹훅이 문자를 저장한 직후 부른다 — 따로 주기 실행하지 않는다(Neon 요금).
import { db } from "../db";
import { eq } from "drizzle-orm";
import { customers, normalizePhone } from "@shared/schema";
import { baseName } from "./reports";

const TAG_PREFIX = "새번호알림:"; // 같은 고객·같은 새 번호는 한 번만 알린다

function 태그목록(tags: unknown): string[] {
  try {
    const a = Array.isArray(tags) ? tags : JSON.parse(String(tags || "[]"));
    return Array.isArray(a) ? a.map(String) : [];
  } catch {
    return [];
  }
}

// 숫자만 남기고 국제형식(+82 10…)은 국내형식(010…)으로 — 안 맞추면 같은 번호를 다른 번호로 본다
function 번호(p?: string | null): string {
  let d = normalizePhone(p || "");
  if (d.startsWith("82") && (d.length === 11 || d.length === 12)) d = "0" + d.slice(2);
  return d;
}

// 고객정보에 있는 번호 + 예전에 쓰던 번호(번호 변경 기록) — 이 번호들은 '새 번호' 가 아니다
function 아는번호들(c: any): string[] {
  const out = [번호(c.normalizedPhone)];
  try {
    const h = Array.isArray(c.phoneHistory) ? c.phoneHistory : JSON.parse(String(c.phoneHistory || "[]"));
    for (const x of Array.isArray(h) ? h : []) out.push(번호(x?.normalized || x?.phone));
  } catch {
    /* 기록이 깨져 있으면 지금 번호만 */
  }
  return out.filter(Boolean);
}

// 연락처 이름 "이서율(제이) 2603홍익KT" → 고객 이름 부분 "이서율(제이)" → 기준 이름 "이서율"
function 연락처기준이름(contactName: string): string {
  const first = String(contactName || "").trim().split(/\s+/)[0] || "";
  return baseName(first);
}

export async function 새번호확인(
  msg: { phone?: string | null; contactName?: string | null },
  opts: { dryRun?: boolean } = {},
): Promise<{ customer: string; newPhone: string } | void> {
  try {
    if (!db) return;
    const nq = 번호(msg.phone);
    const 이름 = 연락처기준이름(msg.contactName || "");
    if (!nq || nq.length < 10 || !/^[가-힣]{2,}$/.test(이름)) return;

    const all = (await db.select().from(customers)).filter((c) => !c.deletedAt);
    if (all.some((c) => 아는번호들(c).includes(nq))) return; // 고객정보 번호이거나 예전에 쓰던 번호

    const { aliasesOf } = await import("./newNameFollowup");
    const 이름들 = (c: any) => {
      const list = aliasesOf(c).map(baseName);
      list.push(baseName(c.name));
      return list;
    };
    const hits = all.filter((c) => 이름들(c).includes(이름));
    if (hits.length !== 1) return; // 못 찾거나 같은 이름이 여럿이면 알리지 않는다
    const c = hits[0];
    if (!c.normalizedPhone) return; // 고객정보에 번호가 없던 고객은 '바뀐 번호' 가 아니다

    const tag = TAG_PREFIX + nq;
    const tags = 태그목록(c.tags);
    if (tags.includes(tag)) return;
    if (opts.dryRun) return { customer: c.name, newPhone: nq };

    const { sendAlert, esc, alertAvailable } = await import("./alertBot");
    if (!alertAvailable()) return;
    // 텔레그램은 +8210… 형식이어야 눌러서 전화를 걸 수 있다.
    const tel = (d: string) => (d.startsWith("0") && d.length >= 10 ? `+82${d.slice(1)}` : d);
    const 기준 = (process.env.PUBLIC_BASE_URL?.trim() || "https://korea-name-acad.com").replace(/\/+$/, "");
    await sendAlert(
      [
        "📱 <b>새 번호로 보입니다</b>",
        `${esc(c.name)}`,
        `고객정보 번호: ${tel(번호(c.normalizedPhone))}`,
        `새 번호: ${tel(nq)}`,
        `(연락처 이름 "${esc(String(msg.contactName || "").trim())}" 으로 문자가 오갔습니다)`,
        "",
        "맞으면 고객정보에서 번호를 바꿔 주세요. 아직 안 나간 예약 문자도 새 번호로 옮겨집니다.",
        `<a href="${기준}/admin">관리자에서 열기</a>`,
      ].join("\n"),
    );
    tags.push(tag);
    await db.update(customers).set({ tags: JSON.stringify(tags) }).where(eq(customers.id, c.id));
    console.log(`[KOP] 새 번호 감지 알림: ${c.name}`);
  } catch (e: any) {
    console.error(`[KOP] 새 번호 감지 실패: ${e?.message}`);
  }
}
