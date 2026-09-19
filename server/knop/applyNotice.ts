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
//
// ② 개명 신청 확인(원장님 확정, 2026-09-19): 안내 문자가 나간 뒤 15일째 아침에
//    '개명 신청 확인' 템플릿을 보낸다. 그 사이 고객이 '개명 신청했다'는 문자를 보내오면
//    취소한다. 판독은 AI(Gemini)가 문맥으로 한다 — '상담 신청서 작성', '내일 신청하려고요'
//    처럼 단어만 보면 틀리는 문자가 실제로 섞여 있기 때문이다. 진행단계가 법원접수 이상이어도 취소.
import { db } from "../db";
import { and, desc, eq, gte, like, ne } from "drizzle-orm";
import { customers, incomingSms, projects, scheduledMessages, smsTemplates, normalizePhone, callName, knopStatusToMilestone } from "@shared/schema";
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

// ── ② 개명 신청 확인 ──
const CHECK_TEMPLATE = "개명 신청 확인";
export const APPLY_CHECK_SET = "gaemyeong_apply_check";
const CHECK_AFTER_DAYS = 15; // 원장님 변경(2026-09-19): 10일 → 15일

// 안내가 나간 번호마다 15일째 아침에 확인 문자 1건 예약.
export async function scheduleApplyChecks(opts: { dryRun?: boolean } = {}): Promise<string[]> {
  if (!db) return [];
  const d = db;
  const [tpl] = await d.select().from(smsTemplates).where(eq(smsTemplates.name, CHECK_TEMPLATE));
  if (!tpl) return [];
  const sentNotices = await d
    .select()
    .from(scheduledMessages)
    .where(and(eq(scheduledMessages.setKey, APPLY_SET), eq(scheduledMessages.status, "sent")));
  if (!sentNotices.length) return [];
  const have = new Set(
    (
      await d
        .select({ phone: scheduledMessages.phone })
        .from(scheduledMessages)
        .where(eq(scheduledMessages.setKey, APPLY_CHECK_SET))
    ).map((r) => normalizePhone(r.phone)),
  );
  const custRows = await d.select().from(customers);
  const nameById = new Map(custRows.map((c) => [c.id, c.name]));
  const today = todayKST();
  const k = new Date(Date.now() + 9 * 3600_000);
  const kstMin = k.getUTCHours() * 60 + k.getUTCMinutes();
  const out: string[] = [];
  for (const n of sentNotices) {
    const phone = normalizePhone(n.phone);
    if (!phone || have.has(phone) || !n.sentAt) continue;
    let sendDate = addDays(kstDate(new Date(n.sentAt)), CHECK_AFTER_DAYS);
    if (sendDate < today) sendDate = today;
    if (sendDate === today && kstMin >= 9 * 60 + 50) sendDate = addDays(today, 1);
    const name = callName((n.customerId && nameById.get(n.customerId)) || "");
    out.push(`${name || phone} ${sendDate}`);
    have.add(phone);
    if (opts.dryRun) continue;
    const [y, m, dd] = sendDate.split("-").map(Number);
    const when = new Date(Date.UTC(y, m - 1, dd, 0, Math.floor(Math.random() * 50), Math.floor(Math.random() * 60)));
    await smsStore.createMessage({
      customerId: n.customerId ?? null,
      phone,
      content: tpl.content.replace(/\{이름\}/g, name).trim(),
      scheduledAt: when.toISOString(),
      setKey: APPLY_CHECK_SET,
    });
    console.log(`[KOP] 개명 신청 확인 예약: ${name || phone} → ${sendDate} (안내 발송 ${kstDate(new Date(n.sentAt))})`);
  }
  return out;
}

// 고객 답장 판독: 법원에 개명 신청을 이미 했거나 하는 중이라고 말했나.
export const JUDGE_SYSTEM = `너는 작명소(한국이름학교)가 받은 고객 문자를 읽는 도우미다.
작명소는 고객에게 "새 이름으로 법원에 개명 신청을 빨리 하시라"는 안내를 보냈다.
그 뒤 고객이 보낸 문자들을 보고, 고객이 법원 개명(허가) 신청을 이미 했거나 지금 하고 있다고
말했는지 판단해 JSON으로만 답한다.
- applied: 신청(접수·제출)을 마쳤거나, 진행 중이라고 말하면 true
  예) "신청 완료요", "접수해 놓은 상태에요", "지금 신청중에 있습니다", "법원에 서류 냈어요"
- 아직 안 했거나 계획·질문이면 false
  예) "내일 신청하려고요", "서류 준비 중이에요", "어떻게 신청하나요?", "신청하면 알려드릴게요"
- 개명 신청이 아닌 다른 신청(상담 신청서, 이름분석 신청 등)은 false
- quote: 판단 근거가 된 고객 문장(없으면 "")`;
export const JUDGE_SCHEMA = {
  type: "object",
  properties: { applied: { type: "boolean" }, quote: { type: "string" } },
  required: ["applied", "quote"],
};

export async function judgeAppliedText(text: string): Promise<{ applied: boolean; quote: string }> {
  const { geminiJson } = await import("../reviewPipeline/gemini");
  const v = await geminiJson<{ applied: boolean; quote: string }>(JUDGE_SYSTEM, [{ text: text.slice(0, 3000) }], JUDGE_SCHEMA, 256, 0);
  return { applied: !!v?.applied, quote: String(v?.quote || "") };
}

// 대기 중인 개명 신청 확인 문자를 살펴 취소할 것은 취소한다. phone 을 주면 그 번호만.
export async function judgeApplyReplies(onlyPhone?: string): Promise<Array<{ phone: string; reason: string }>> {
  if (!db) return [];
  const d = db;
  const pending = (
    await d
      .select()
      .from(scheduledMessages)
      .where(and(eq(scheduledMessages.setKey, APPLY_CHECK_SET), eq(scheduledMessages.status, "scheduled")))
  ).filter((m) => !onlyPhone || normalizePhone(m.phone) === normalizePhone(onlyPhone));
  const canceled: Array<{ phone: string; reason: string }> = [];
  for (const m of pending) {
    const phone = normalizePhone(m.phone);
    let reason: string | null = null;

    // 진행단계가 법원접수 이상이면 이미 신청한 것
    if (m.customerId) {
      const [p] = await d.select().from(projects).where(eq(projects.customerId, m.customerId)).orderBy(desc(projects.updatedAt)).limit(1);
      if (p && knopStatusToMilestone(p.status) >= 3) reason = "진행단계가 법원접수 이상";
    }

    // 안내가 나간 뒤 고객이 보낸 문자
    if (!reason) {
      const [notice] = await d
        .select()
        .from(scheduledMessages)
        .where(and(eq(scheduledMessages.setKey, APPLY_SET), eq(scheduledMessages.status, "sent"), eq(scheduledMessages.phone, m.phone)))
        .limit(1);
      const since = notice?.sentAt ? new Date(notice.sentAt) : new Date(Date.now() - 30 * 86_400_000);
      const replies = await d
        .select({ body: incomingSms.body })
        .from(incomingSms)
        .where(and(eq(incomingSms.phone, phone), ne(incomingSms.direction, "발신"), gte(incomingSms.receivedAt, since)))
        .orderBy(incomingSms.receivedAt);
      if (replies.length) {
        try {
          const v = await judgeAppliedText(replies.map((r) => `- ${r.body}`).join("\n"));
          if (v.applied) reason = `고객 답장: "${v.quote.slice(0, 80)}"`;
        } catch (e: any) {
          // 판독 실패 시에는 취소하지 않는다(확인 문자는 부드러운 안부라 나가도 무방)
          console.error(`[KOP] 개명 신청 답장 판독 실패 ${phone}: ${e?.message}`);
        }
      }
    }

    if (!reason) continue;
    const upd = await d
      .update(scheduledMessages)
      .set({ status: "canceled" })
      .where(and(eq(scheduledMessages.id, m.id), eq(scheduledMessages.status, "scheduled")))
      .returning({ id: scheduledMessages.id });
    if (!upd.length) continue;
    canceled.push({ phone, reason });
    console.log(`[KOP] 개명 신청 확인 취소: ${phone} — ${reason}`);
    try {
      const { sendAlert, esc } = await import("./alertBot");
      const name = m.customerId ? (await d.select().from(customers).where(eq(customers.id, m.customerId)))[0]?.name : null;
      const tel = phone.startsWith("0") ? `+82${phone.slice(1)}` : phone;
      // 원장님 지정 문구: 신청 완료를 확인했으므로 확인 문자를 보내지 않는다.
      await sendAlert(
        [
          "\u2705 <b>개명 신청 완료 확인</b>",
          `${esc(name || "고객정보 없는 번호")} \u00B7 ${tel}`,
          "",
          "개명 신청을 완료한 것을 확인했기에 개명 신청 확인 문자를 보내지 않습니다.",
          "",
          `근거: ${esc(reason)}`,
        ].join("\n"),
      );
    } catch {
      /* 알림 실패는 무시 */
    }
  }
  return canceled;
}

let _started = false;
export function startApplyNoticeScheduler() {
  if (_started) return;
  _started = true;
  scheduleDaily("개명 신청 안내·확인 예약(작명장 링크 발송 다음 날 / 안내 15일 뒤)", async () => {
    // 놓친 작명장 링크가 있으면 고객정보 이름부터 맞춘다(문제 알림은 안 보냄 — 들어올 때 이미 알렸다)
    await (await import("./namingRename")).autoRenameFromNamingLinks({ alert: false }).catch(() => []);
    await judgeApplyReplies(); // 먼저 취소할 것 정리
    await scheduleApplyNotices();
    await scheduleApplyChecks();
  }, 60_000);
}
