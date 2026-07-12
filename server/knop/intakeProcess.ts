// 스레드 처리: 신원매칭(resolveCustomer) → 상담 이벤트 생성 → 이메일
// 규칙:
//  - 기존 고객(번호변경·개명 포함) → 자동 연결, 현재 이름/번호/코드 사용
//  - 애매(동명이인/번호변경 의심) → 자동 중단, 확인 요청
//  - 신규 → 연락처명이 "이름260711" 형태일 때만 고객 생성(그 외는 무시)
import { intakeStore } from "./intakeStore";
import { parseContact, analyzeThread, buildConsultEventDraft, isClientContact } from "./smsIntake";
import { appendConsultEvent } from "./calendar";
import { sendCalendarCheckNotification } from "../email";
import { knopStore } from "./store";

export type ProcessResult = {
  ok: boolean;
  note?: string;
  needsConfirmation?: boolean;
  resolution?: any;
  parsed?: ReturnType<typeof parseContact>;
  analysis?: any;
  draft?: any;
  written?: boolean;
  calendarLink?: string;
  emailed?: boolean;
  customerCode?: string | null;
};

export async function processThread(
  phone: string,
  opts: { dryRun: boolean; sendEmail: boolean; requireHighConfidence?: boolean; forceCustomerId?: string }
): Promise<ProcessResult> {
  const { contactName, text, count } = await intakeStore.threadText(phone);
  if (count === 0) return { ok: false, note: "메시지 없음" };

  // ── 신원 매칭 (또는 확인 완료된 고객 강제 지정) ──
  let resolution: any;
  let customer: any = null;
  if (opts.forceCustomerId) {
    customer = await knopStore.getCustomer(opts.forceCustomerId);
    if (!customer) return { ok: false, note: "고객을 찾을 수 없음" };
    resolution = { match: "confirmed", customer };
  } else {
    resolution = await knopStore.resolveCustomer({ phone, contactName: contactName || "" });
    // 애매하면 자동 진행 금지 (사람 확인)
    if (resolution.match === "ambiguous" || resolution.match === "merge_candidate") {
      return { ok: false, needsConfirmation: true, resolution, note: resolution.note };
    }
    // 신규인데 연락처명이 "이름260711" 형태가 아니면 → 의뢰인 아님, 무시
    if (!resolution.customer && !isClientContact(contactName || "")) {
      return { ok: false, resolution, note: "의뢰인 아님(연락처명이 이름+날짜 형태 아님) — 무시" };
    }
    customer = resolution.customer || null;
  }

  const parsed = parseContact(contactName || "");
  const analysis = await analyzeThread(parsed, phone, text);
  const date = analysis.consultDate || parsed.regDate || "";
  if (!date) return { ok: false, resolution, analysis, note: "상담 날짜 미확정 — 등록하지 않음" };
  if (opts.requireHighConfidence && analysis.confidence !== "high") {
    return { ok: false, resolution, analysis, note: "확신 부족 — 자동 등록 보류(수동 확인 필요)" };
  }
  if (await intakeStore.isProcessed(phone)) {
    return { ok: false, resolution, analysis, note: "이미 처리된 스레드 — 중복 등록 방지" };
  }

  // ── 신규 의뢰인이면 고객 생성 (고객번호 자동 부여) ──
  if (!customer && !opts.dryRun && parsed.name) {
    customer = await knopStore.createCustomer({ name: parsed.name, phone });
  }
  // 발송/표시 정보: 고객이 있으면 '현재값' 우선 (개명·번호변경 반영)
  const sendName = customer?.name || parsed.name;
  const sendPhone = customer?.phone || phone;
  const code = customer?.customerCode || null;

  const draft = buildConsultEventDraft({
    name: sendName,
    date,
    time: analysis.consultTime,
    phone: sendPhone,
    hongik: parsed.hongik,
    summary: analysis.summary,
    code,
  });
  const { written, event } = await appendConsultEvent(draft, { dryRun: opts.dryRun });
  const calendarLink = `https://calendar-zeus1000.web.app/?date=${date}`;

  let emailed = false;
  if (!opts.dryRun) {
    await intakeStore.markProcessed(phone, date);
    if (customer) {
      await knopStore.addTimelineEvent({
        customerId: customer.id,
        type: "calendar",
        title: "상담일정 자동등록(문자)",
        content: `${date} ${analysis.consultTime || ""} · ${sendPhone}`.trim(),
      });
    }
    if (opts.sendEmail) {
      await sendCalendarCheckNotification({
        name: sendName,
        date,
        time: analysis.consultTime,
        phone: sendPhone,
        hongik: parsed.hongik,
        summary: analysis.summary,
        calendarLink,
      });
      emailed = true;
    }
  }
  return {
    ok: true,
    resolution: { match: resolution.match, customerCode: code },
    parsed,
    analysis,
    draft: event,
    written,
    calendarLink,
    emailed,
    customerCode: code,
  };
}
