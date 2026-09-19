// 개명 신청 안내 문자 — 새 이름을 최종 선택한 고객에게 다음 날 보낸다.
// (원장님: 제목은 '개명 신청 안내'. 기존 '개명 신청 확인' 템플릿은 따로 그대로 둔다.)
//
// 기준(원장님 확정, 2026-09-19): 원장님 폰에서 작명장 링크
//   https://korea-name-acad.com/s/운이술술풀리는이름강다희
// 가 든 문자가 '발신'으로 잡히면 = 새 이름을 최종 선택했다는 뜻.
// 그 다음 날 아침 9~10시에 '개명 신청 안내' 문자를 보낸다.
//
// 문구는 코드에 박지 않는다. 안내문자 탭의 DB 템플릿 '개명 신청 안내' 를 읽고,
// {이름} 은 성을 뺀 이름(강다희 → 다희)으로 바꾼다. 원장님이 탭에서 고치면 다음 예약부터 반영된다.
//
// 아침 점검(08:40) 때 하루 한 번 훑는다. 한 번호에는 한 번만 보낸다(set_key 로 멈춤).
// 이 기능을 만든 날 이전에 보낸 링크(노이산·김해윤·홍수안·강다희)에는 보내지 않는다.
import { db } from "../db";
import { and, eq, gte, like, ne } from "drizzle-orm";
import { customers, incomingSms, scheduledMessages, smsTemplates, normalizePhone, callName } from "@shared/schema";
import { smsStore } from "./sms";
import { scheduleDaily } from "./dailyCheckpoint";
import { todayKST } from "./newNameNotice";

const TEMPLATE_NAME = "개명 신청 안내";
export const APPLY_SET = "gaemyeong_apply";
const LINK_MARK = "/s/운이술술풀리는이름";
// 이 날짜(KST) 이후에 보낸 링크만 본다.
const APPLY_FROM = (process.env.KOP_APPLY_NOTICE_FROM || "2026-09-19").trim();

// KST 날짜 문자열(YYYY-MM-DD)에 일 수를 더한다.
function addDays(date: string, n: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
// UTC 순간 → KST 날짜
function kstDate(d: Date): string {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

export type ApplyPlan = { phone: string; name: string; linkSentAt: string; sendDate: string; skip: string | null };

export async function scheduleApplyNotices(opts: { dryRun?: boolean } = {}): Promise<ApplyPlan[]> {
  if (!db) return [];
  const d = db;
  const [tpl] = await d.select().from(smsTemplates).where(eq(smsTemplates.name, TEMPLATE_NAME));

  // KST 자정 = UTC 전날 15:00
  const fromUtc = new Date(Date.parse(`${APPLY_FROM}T00:00:00Z`) - 9 * 3600_000);
  const sent = await d
    .select({ phone: incomingSms.phone, contactName: incomingSms.contactName, receivedAt: incomingSms.receivedAt, body: incomingSms.body })
    .from(incomingSms)
    .where(and(eq(incomingSms.direction, "발신"), like(incomingSms.body, `%${LINK_MARK}%`), gte(incomingSms.receivedAt, fromUtc)));
  if (!sent.length) return [];

  const done = new Set(
    (
      await d
        .select({ phone: scheduledMessages.phone })
        .from(scheduledMessages)
        .where(and(eq(scheduledMessages.setKey, APPLY_SET), ne(scheduledMessages.status, "canceled")))
    ).map((r) => normalizePhone(r.phone)),
  );
  const custRows = await d.select().from(customers);
  const custByPhone = new Map<string, (typeof custRows)[number]>();
  for (const c of custRows) if (!c.deletedAt && c.normalizedPhone && !custByPhone.has(c.normalizedPhone)) custByPhone.set(c.normalizedPhone, c);

  const now = Date.now();
  const today = todayKST();
  const kstMin = (() => { const k = new Date(now + 9 * 3600_000); return k.getUTCHours() * 60 + k.getUTCMinutes(); })();
  const plans: ApplyPlan[] = [];
  const seen = new Set<string>();

  // 번호마다 가장 이른 링크 발송을 기준으로 한다.
  sent.sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());
  for (const s of sent) {
    const phone = normalizePhone(s.phone || "");
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    const cust = custByPhone.get(phone);
    // 부를 이름: 고객정보 → 폰 연락처 이름 → 링크 끝의 이름(운이술술풀리는이름노이산 → 노이산).
    // 링크 이름은 아이 이름일 수도 있어(부모가 받음) 마지막 대안으로만 쓴다.
    const fromLink = (String(s.body || "").split(LINK_MARK)[1] || "").match(/^[가-힣]{2,4}/)?.[0] || "";
    const name = callName(cust?.name || s.contactName || fromLink);
    const linkDay = kstDate(new Date(s.receivedAt));
    // 링크 보낸 다음 날. 그날 아침이 이미 지났으면(점검을 놓친 경우) 가장 가까운 아침.
    let sendDate = addDays(linkDay, 1);
    if (sendDate < today) sendDate = today;
    if (sendDate === today && kstMin >= 9 * 60 + 50) sendDate = addDays(today, 1);

    let skip: string | null = null;
    if (done.has(phone)) skip = "이미 예약/발송됨";
    else if (!tpl) skip = `템플릿 '${TEMPLATE_NAME}' 없음`;
    else if (!name) skip = "이름을 모름";
    plans.push({ phone, name, linkSentAt: s.receivedAt.toISOString(), sendDate, skip });
    if (skip || opts.dryRun) continue;

    const [y, m, dd] = sendDate.split("-").map(Number);
    // KST 09:mm:ss = UTC 00:mm:ss 같은 날
    const when = new Date(Date.UTC(y, m - 1, dd, 0, Math.floor(Math.random() * 50), Math.floor(Math.random() * 60)));
    await smsStore.createMessage({
      customerId: cust?.id ?? null,
      phone,
      content: tpl!.content.replace(/\{이름\}/g, name).trim(),
      scheduledAt: when.toISOString(),
      setKey: APPLY_SET,
    });
    done.add(phone);
    console.log(`[KOP] 개명 신청 안내 예약: ${name}님 ${phone} → ${sendDate} (링크 발송 ${linkDay})`);
  }
  return plans;
}

let _started = false;
export function startApplyNoticeScheduler() {
  if (_started) return;
  _started = true;
  scheduleDaily("개명 신청 안내 예약(작명장 링크 발송 다음 날)", async () => {
    await scheduleApplyNotices();
  }, 60_000);
}
