// KNOP 운영 플랫폼 API 라우트 (MVP1) — 전부 관리자 전용
import type { Express, Request, Response, RequestHandler } from "express";
import { knopStore } from "./store";
import { parsePaymentSms, matchPayment } from "./paymentAi";
import { transcribeCall, summarizeTranscript } from "./callAi";
import { transcribeLocal, localTranscribeAvailable } from "./localTranscribe";
import { learnFromEdit, listRules, upsertManualRule, setRuleEnabled, deleteRule, analyzeRules, seedRulesFromJsonOnce, exportLearnedToJson } from "./learnedDict";
import * as gm from "./gaemyeong";
import { isSetKey } from "./gaemyeong";
import { smsStore, startSmsScheduler } from "./sms";
import {
  calendarAvailable,
  readEvents,
  parseNameCount,
  parseConsult,
  findPhone,
  buildConsultReminder,
  buildNewNameNotice,
  newNameDuration,
  tomorrowKST,
  appendConsultEvent,
} from "./calendar";
import { parseContact, analyzeThread, buildConsultEventDraft } from "./smsIntake";
import { sendCalendarCheckNotification } from "../email";
import { intakeStore } from "./intakeStore";
import { processThread } from "./intakeProcess";
import { JOURNEY, nextStage } from "./stateMachine";
import { previewBackfill, applyBackfill } from "./phoneBackfill";
import { reportsAvailable, reportsForName, resolveReportPath } from "./reports";
import { syncReports, startReportSync } from "./reportSync";
import { recordingsAvailable, recordingsForCustomer, resolveRecordingPath } from "./recordings";
import crypto from "crypto";
import fs from "fs";
import { insertIncomingSmsSchema } from "@shared/schema";
import { insertSmsTemplateSchema, insertScheduledMessageSchema } from "@shared/schema";
import { ObjectStorageService } from "../object_storage/objectStorage";
import { DatabaseError } from "../storage";
import {
  insertCustomerSchema,
  insertProjectSchema,
  insertTimelineEventSchema,
  insertCrmFileSchema,
  insertCalendarEventSchema,
  insertAiInboxSchema,
} from "@shared/schema";

function handle(res: Response, route: string, error: any) {
  if (error instanceof DatabaseError) {
    if (error.code === "NOT_FOUND") return res.status(404).json({ error: error.message });
    console.error(`[KNOP 503] ${route} :: ${error.code} ${error.message}`);
    return res.status(503).json({ error: error.code });
  }
  if (error?.name === "ZodError") {
    return res.status(400).json({ error: "invalid_input", detail: error.errors });
  }
  console.error(`[KNOP 500] ${route} :: ${error?.message}`);
  return res.status(500).json({ error: "internal_error" });
}

// 하루의 시작/끝 (기본 KST). 클라이언트가 ISO 범위를 넘겨주면 그걸 사용.
function dayRange(dateISO?: string): { start: string; end: string } {
  const base = dateISO ? new Date(dateISO) : new Date();
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const end = new Date(base);
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function registerKnopRoutes(app: Express, requireAdmin: RequestHandler) {
  const P = "/api/knop";

  // 문자 표준 템플릿 시드 + 예약문자 스케줄러 기동
  smsStore
    .seedTemplates()
    .then((n) => n && console.log(`[KNOP SMS] 표준 템플릿 ${n}개 시드됨`))
    .catch(() => {});
  startSmsScheduler();
  startReportSync(); // 이름분석 폴더 자동 동기화 (로컬만; 배포는 no-op)

  // 교정사전: 기존 로컬 JSON 규칙을 DB로 1회 이관 후, DB→로컬 JSON 재생성(어디서 고쳐도 반영)
  seedRulesFromJsonOnce()
    .then(() => exportLearnedToJson())
    .catch(() => {});

  // ── 문자 자동화: 템플릿 ──
  app.get(`${P}/sms/templates`, requireAdmin, async (_req, res) => {
    try {
      res.json(await smsStore.listTemplates());
    } catch (e) {
      handle(res, "GET sms templates", e);
    }
  });
  app.post(`${P}/sms/templates`, requireAdmin, async (req, res) => {
    try {
      res.json(await smsStore.createTemplate(insertSmsTemplateSchema.parse(req.body)));
    } catch (e) {
      handle(res, "POST sms template", e);
    }
  });
  app.post(`${P}/sms/templates/reset`, requireAdmin, async (_req, res) => {
    try {
      res.json({ count: await smsStore.resetTemplates() });
    } catch (e) {
      handle(res, "POST sms templates reset", e);
    }
  });
  app.patch(`${P}/sms/templates/:id`, requireAdmin, async (req, res) => {
    try {
      const row = await smsStore.updateTemplate(req.params.id, insertSmsTemplateSchema.partial().parse(req.body));
      if (!row) return res.status(404).json({ error: "not_found" });
      res.json(row);
    } catch (e) {
      handle(res, "PATCH sms template", e);
    }
  });
  app.delete(`${P}/sms/templates/:id`, requireAdmin, async (req, res) => {
    try {
      res.json({ ok: await smsStore.deleteTemplate(req.params.id) });
    } catch (e) {
      handle(res, "DELETE sms template", e);
    }
  });

  // ── 달력 연동: 자동 발송 미리보기 (dry-run) ──
  app.get(`${P}/calendar/preview`, requireAdmin, async (_req, res) => {
    try {
      if (!calendarAvailable()) return res.status(400).json({ error: "calendar_key_missing" });
      const events = await readEvents();
      // KNOP 고객 이름→전화 (보조 소스)
      const customers = await knopStore.listCustomers();
      const byName = new Map<string, string>();
      customers.forEach((c) => {
        if (c.name && c.phone && !byName.has(c.name)) byName.set(c.name, c.phone);
      });

      const tmr = tomorrowKST();
      const tomorrowConsults = events
        .filter((e) => e.cat === "상담" && e.date === tmr && e.clientPhone)
        .map((e) => {
          const p = parseConsult(e);
          return { date: e.date, name: p.name, people: p.people, phone: e.clientPhone, durationMin: p.duration };
        });

      const newNameCandidates = events
        .filter((e) => e.cat && e.cat.includes("완료"))
        .map((e) => {
          const { name, people } = parseNameCount(e.title || "");
          const phone = findPhone(name, events, byName);
          return { date: e.date, title: e.title, name, people, phone: phone || null, durationMin: newNameDuration(people) };
        });

      res.json({
        tomorrow: tmr,
        tomorrowConsults,
        newNameCandidates,
        counts: {
          totalEvents: events.length,
          knopCustomerPhones: byName.size,
          newNameWithPhone: newNameCandidates.filter((n) => n.phone).length,
          newNameNoPhone: newNameCandidates.filter((n) => !n.phone).length,
        },
      });
    } catch (e) {
      handle(res, "GET calendar preview", e);
    }
  });

  // ── 문자→달력 자동등록 (연락처파싱 + 문자분석 + 상담이벤트 생성 + 이메일) ──
  // body: { contactName, phone, messages, dryRun(기본 true), sendEmail(기본 false) }
  app.post(`${P}/sms-intake`, requireAdmin, async (req, res) => {
    try {
      if (!calendarAvailable()) return res.status(400).json({ error: "calendar_key_missing" });
      const { contactName = "", phone = "", messages = "", dryRun = true, sendEmail = false } = req.body || {};
      const parsed = parseContact(String(contactName));
      const analysis = await analyzeThread(parsed, String(phone), String(messages));
      const date = analysis.consultDate || parsed.regDate || "";
      if (!date) {
        return res.json({ parsed, analysis, draft: null, written: false, note: "상담 날짜 미확정 — 등록하지 않음" });
      }
      const draft = buildConsultEventDraft({
        name: parsed.name,
        date,
        time: analysis.consultTime,
        phone: String(phone),
        hongik: parsed.hongik,
        summary: analysis.summary,
      });
      const { written, event } = await appendConsultEvent(draft, { dryRun: dryRun !== false });
      const calendarLink = `https://calendar-zeus1000.web.app/?date=${date}`;
      let emailed = false;
      if (sendEmail && dryRun === false) {
        await sendCalendarCheckNotification({
          name: parsed.name,
          date,
          time: analysis.consultTime,
          phone: String(phone),
          hongik: parsed.hongik,
          summary: analysis.summary,
          calendarLink,
        });
        emailed = true;
      }
      res.json({ parsed, analysis, draft: event, written, calendarLink, emailed });
    } catch (e) {
      handle(res, "POST sms-intake", e);
    }
  });

  // ── 안드로이드 문자전달 수신 웹훅 (비밀토큰 인증, 로그인 불필요) ──
  // 앱 payload: { contactName?, phone, body, direction?, receivedAt? } + 헤더 x-knop-secret 또는 ?secret=
  app.post(`${P}/sms-webhook`, async (req, res) => {
    try {
      const secret = process.env.KNOP_SMS_WEBHOOK_SECRET || "";
      const given = String(req.headers["x-knop-secret"] || req.query.secret || "");
      if (!secret || given !== secret) return res.status(401).json({ error: "unauthorized" });
      // MacroDroid 등: JSON 본문 또는 쿼리 파라미터 어느 쪽으로 와도 받음
      const q = (req.query || {}) as Record<string, any>;
      const b = (req.body || {}) as Record<string, any>;
      const pick = (k: string) => (b[k] !== undefined && b[k] !== "" ? b[k] : q[k]);
      const parsed = insertIncomingSmsSchema.parse({
        contactName: pick("contactName") ?? null,
        phone: pick("phone"),
        body: pick("body"),
        direction: pick("direction"),
        receivedAt: pick("receivedAt"),
      });
      const row = await intakeStore.add(parsed);
      // 자동처리(옵션): KNOP_INTAKE_AUTO=1 → 스레드 분석. 실제 기록/이메일은 KNOP_INTAKE_LIVE=1 일 때만
      let auto: any = null;
      if (process.env.KNOP_INTAKE_AUTO === "1") {
        const live = process.env.KNOP_INTAKE_LIVE === "1";
        auto = await processThread(row.phone, { dryRun: !live, sendEmail: live, requireHighConfidence: true }).catch((e) => ({
          ok: false,
          note: "자동처리 오류: " + e?.message,
        }));
      }
      res.json({ ok: true, id: row.id, auto });
    } catch (e) {
      handle(res, "POST sms-webhook", e);
    }
  });

  // 스레드(전화번호별) 목록 / 상세 / 처리
  app.get(`${P}/sms-threads`, requireAdmin, async (_req, res) => {
    try {
      res.json(await intakeStore.listThreads());
    } catch (e) {
      handle(res, "GET sms-threads", e);
    }
  });
  app.get(`${P}/sms-threads/:phone`, requireAdmin, async (req, res) => {
    try {
      res.json(await intakeStore.getThread(req.params.phone));
    } catch (e) {
      handle(res, "GET sms-thread", e);
    }
  });
  app.post(`${P}/sms-threads/:phone/process`, requireAdmin, async (req, res) => {
    try {
      const { dryRun = true, sendEmail = false } = req.body || {};
      res.json(await processThread(req.params.phone, { dryRun: dryRun !== false, sendEmail: !!sendEmail }));
    } catch (e) {
      handle(res, "POST sms-thread process", e);
    }
  });
  // 확인/병합: 애매·번호변경 스레드를 특정 고객으로 확정 (setPhone=이 번호를 현재번호로)
  app.post(`${P}/sms-threads/:phone/confirm`, requireAdmin, async (req, res) => {
    try {
      const { customerId, setPhone = false, dryRun = true, sendEmail = false } = req.body || {};
      if (!customerId) return res.status(400).json({ error: "customerId_required" });
      if (setPhone && dryRun === false) {
        await knopStore.updateCustomer(customerId, { phone: req.params.phone });
      }
      res.json(
        await processThread(req.params.phone, {
          dryRun: dryRun !== false,
          sendEmail: !!sendEmail,
          forceCustomerId: customerId,
        })
      );
    } catch (e) {
      handle(res, "POST sms-thread confirm", e);
    }
  });

  // ── 번호 되쓰기: 번호 없는 작명완료 일정에 같은 사람 번호 채우기 ──
  app.get(`${P}/phone-backfill/preview`, requireAdmin, async (_req, res) => {
    try {
      if (!calendarAvailable()) return res.status(400).json({ error: "calendar_key_missing" });
      res.json(await previewBackfill());
    } catch (e) {
      handle(res, "GET phone-backfill preview", e);
    }
  });
  app.post(`${P}/phone-backfill/apply`, requireAdmin, async (req, res) => {
    try {
      if (!calendarAvailable()) return res.status(400).json({ error: "calendar_key_missing" });
      const { dryRun = true } = req.body || {};
      res.json(await applyBackfill(dryRun !== false));
    } catch (e) {
      handle(res, "POST phone-backfill apply", e);
    }
  });

  // ── 이름분석표 PDF 연계 (로컬 폴더) ──
  // 특정 이름의 리포트 목록
  app.get(`${P}/reports`, requireAdmin, (req, res) => {
    try {
      if (!reportsAvailable()) return res.json({ available: false, reports: [] });
      const name = String(req.query.name || "");
      res.json({ available: true, reports: name ? reportsForName(name) : [] });
    } catch (e) {
      handle(res, "GET reports", e);
    }
  });
  // 이름분석 폴더 수동 동기화 (새 PDF → 이미지 → 고객 저장)
  app.post(`${P}/reports/sync`, requireAdmin, async (_req, res) => {
    try {
      res.json(await syncReports());
    } catch (e) {
      handle(res, "POST reports sync", e);
    }
  });
  // PDF 열기 (브라우저 새 탭 — 헤더 대신 ?token= 로 인증)
  app.get(`${P}/reports/file`, (req, res) => {
    try {
      const pw = process.env.ADMIN_PASSWORD?.trim();
      const expected = pw ? crypto.createHash("sha256").update(`admin_token_${pw}`).digest("hex") : null;
      if (!expected || String(req.query.token || "") !== expected) return res.status(401).send("Unauthorized");
      const full = resolveReportPath(String(req.query.name || ""));
      if (!full) return res.status(404).send("파일을 찾을 수 없습니다");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline");
      res.sendFile(full);
    } catch (e) {
      handle(res, "GET report file", e);
    }
  });

  // 샘플 문구 미리보기 (규칙 확인용)
  app.get(`${P}/calendar/sample`, requireAdmin, async (req, res) => {
    try {
      const people = parseInt((req.query.people as string) || "1", 10);
      res.json({ newNameNotice: buildNewNameNotice(people), duration: newNameDuration(people) });
    } catch (e) {
      handle(res, "GET calendar sample", e);
    }
  });

  // ── 문자 자동화: 예약/발송 ──
  app.get(`${P}/sms/messages`, requireAdmin, async (req, res) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      res.json(await smsStore.listMessages(status));
    } catch (e) {
      handle(res, "GET sms messages", e);
    }
  });
  app.post(`${P}/sms/messages`, requireAdmin, async (req, res) => {
    try {
      const input = insertScheduledMessageSchema.parse(req.body);
      res.json(await smsStore.createMessage(input));
    } catch (e) {
      handle(res, "POST sms message", e);
    }
  });
  app.post(`${P}/sms/messages/:id/cancel`, requireAdmin, async (req, res) => {
    try {
      res.json({ ok: await smsStore.cancelMessage(req.params.id) });
    } catch (e) {
      handle(res, "POST sms cancel", e);
    }
  });

  // ── Customers ──
  app.get(`${P}/customers`, requireAdmin, async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      res.json(await knopStore.listCustomers(q));
    } catch (e) {
      handle(res, "GET customers", e);
    }
  });

  // 파이프라인 보드 — :id 라우트보다 먼저 등록(경로 충돌 방지)
  app.get(`${P}/customers/board`, requireAdmin, async (_req, res) => {
    try {
      res.json(await knopStore.customerBoard());
    } catch (e) {
      handle(res, "GET customer board", e);
    }
  });

  app.get(`${P}/customers/:id`, requireAdmin, async (req, res) => {
    try {
      const customer = await knopStore.getCustomer(req.params.id);
      if (!customer) return res.status(404).json({ error: "not_found" });
      const [projects, timeline, files, events, calls] = await Promise.all([
        knopStore.listProjects(customer.id),
        knopStore.listTimeline(customer.id),
        knopStore.listFiles(customer.id),
        knopStore.listEventsForCustomer(customer.id),
        knopStore.listCalls(customer.id),
      ]);
      res.json({ customer, projects, timeline, files, events, calls });
    } catch (e) {
      handle(res, "GET customer detail", e);
    }
  });

  app.post(`${P}/customers`, requireAdmin, async (req, res) => {
    try {
      const input = insertCustomerSchema.parse(req.body);
      // 중복 방지: 동일 전화번호 존재 시 409 + 기존 고객 반환
      const existing = await knopStore.findCustomerByPhone(input.phone);
      if (existing) return res.status(409).json({ error: "duplicate_phone", customer: existing });
      res.json(await knopStore.createCustomer(input));
    } catch (e) {
      handle(res, "POST customer", e);
    }
  });

  // 이름분석 PDF 폴더 → 빠진 고객 파일 자동생성 (dryRun 미리보기)
  app.post(`${P}/customers/create-from-reports`, requireAdmin, async (req, res) => {
    try {
      const { dryRun = true } = req.body || {};
      res.json(await knopStore.createCustomersFromReports(dryRun !== false));
    } catch (e) {
      handle(res, "POST create from reports", e);
    }
  });

  // 상담신청 DB → KNOP 고객 일괄 등록 (dryRun 미리보기)
  app.post(`${P}/customers/import-consultations`, requireAdmin, async (req, res) => {
    try {
      const { dryRun = true } = req.body || {};
      res.json(await knopStore.importConsultations(dryRun !== false));
    } catch (e) {
      handle(res, "POST import consultations", e);
    }
  });

  // 등록일을 실제 신청일로 맞춤
  app.post(`${P}/customers/align-dates`, requireAdmin, async (_req, res) => {
    try {
      res.json(await knopStore.alignRegisteredDates());
    } catch (e) {
      handle(res, "POST align dates", e);
    }
  });
  // 고객번호를 신청일 순서로 재정렬
  app.post(`${P}/customers/renumber`, requireAdmin, async (_req, res) => {
    try {
      res.json(await knopStore.renumberCodes());
    } catch (e) {
      handle(res, "POST renumber", e);
    }
  });

  // 모든 고객에 케이스 보장
  app.post(`${P}/customers/ensure-cases`, requireAdmin, async (_req, res) => {
    try {
      res.json(await knopStore.ensureCasesForAll());
    } catch (e) {
      handle(res, "POST ensure cases", e);
    }
  });

  // 개명/상담 구분 자동판정 (작명완료 일정 기준)
  app.post(`${P}/customers/sync-kinds`, requireAdmin, async (_req, res) => {
    try {
      res.json(await knopStore.syncKinds());
    } catch (e) {
      handle(res, "POST sync kinds", e);
    }
  });

  // 기존 고객 고객번호 소급 부여
  app.post(`${P}/customers/backfill-codes`, requireAdmin, async (_req, res) => {
    try {
      res.json({ assigned: await knopStore.backfillCustomerCodes() });
    } catch (e) {
      handle(res, "POST backfill codes", e);
    }
  });

  // 신원 매칭 (번호/연락처명/고객번호 → 어느 고객인지 판정)
  app.post(`${P}/resolve`, requireAdmin, async (req, res) => {
    try {
      const { phone, contactName, customerCode } = req.body || {};
      res.json(await knopStore.resolveCustomer({ phone, contactName, customerCode }));
    } catch (e) {
      handle(res, "POST resolve", e);
    }
  });

  app.patch(`${P}/customers/:id`, requireAdmin, async (req, res) => {
    try {
      const input = insertCustomerSchema.partial().parse(req.body);
      const row = await knopStore.updateCustomer(req.params.id, input);
      if (!row) return res.status(404).json({ error: "not_found" });
      res.json(row);
    } catch (e) {
      handle(res, "PATCH customer", e);
    }
  });

  app.delete(`${P}/customers/:id`, requireAdmin, async (req, res) => {
    try {
      const ok = await knopStore.deleteCustomer(req.params.id); // 휴지통으로
      res.json({ ok });
    } catch (e) {
      handle(res, "DELETE customer", e);
    }
  });
  // 휴지통 목록
  app.get(`${P}/customers-trash`, requireAdmin, async (_req, res) => {
    try {
      res.json(await knopStore.listTrash());
    } catch (e) {
      handle(res, "GET trash", e);
    }
  });
  // 복원
  app.post(`${P}/customers/:id/restore`, requireAdmin, async (req, res) => {
    try {
      res.json({ ok: await knopStore.restoreCustomer(req.params.id) });
    } catch (e) {
      handle(res, "POST restore", e);
    }
  });
  // 완전삭제
  app.delete(`${P}/customers/:id/permanent`, requireAdmin, async (req, res) => {
    try {
      res.json({ ok: await knopStore.permanentDeleteCustomer(req.params.id) });
    } catch (e) {
      handle(res, "DELETE permanent", e);
    }
  });

  // ── Projects ──
  app.post(`${P}/projects`, requireAdmin, async (req, res) => {
    try {
      const input = insertProjectSchema.parse(req.body);
      res.json(await knopStore.createProject(input));
    } catch (e) {
      handle(res, "POST project", e);
    }
  });

  app.patch(`${P}/projects/:id`, requireAdmin, async (req, res) => {
    try {
      const input = insertProjectSchema.partial().parse(req.body);
      const row = await knopStore.updateProject(req.params.id, input);
      if (!row) return res.status(404).json({ error: "not_found" });
      res.json(row);
    } catch (e) {
      handle(res, "PATCH project", e);
    }
  });

  app.delete(`${P}/projects/:id`, requireAdmin, async (req, res) => {
    try {
      res.json({ ok: await knopStore.deleteProject(req.params.id) });
    } catch (e) {
      handle(res, "DELETE project", e);
    }
  });

  // ── 여정 상태기계 ──
  // 전체 여정 단계(순서) — UI 스텝퍼용
  app.get(`${P}/journey`, requireAdmin, (_req, res) => {
    res.json(JOURNEY.map((s, i) => ({ rank: i, status: s.status, followup: s.followup ?? null })));
  });
  // 상태 진행(앞으로만; force로 되돌리기/점프)
  app.post(`${P}/projects/:id/advance`, requireAdmin, async (req, res) => {
    try {
      const { toStatus, force = false } = req.body || {};
      if (!toStatus) return res.status(400).json({ error: "toStatus_required" });
      const out = await knopStore.advanceStatus(req.params.id, toStatus, { force: !!force });
      if (!out) return res.status(404).json({ error: "not_found" });
      if (out.ok === false) return res.status(409).json({ error: "blocked", reason: out.reason });
      res.json({ project: out.project, nextFollowup: out.nextFollowup, next: nextStage(out.project.status) });
    } catch (e) {
      handle(res, "POST advance status", e);
    }
  });

  // ── Timeline ──
  app.post(`${P}/timeline`, requireAdmin, async (req, res) => {
    try {
      const input = insertTimelineEventSchema.parse(req.body);
      res.json(await knopStore.addTimelineEvent(input));
    } catch (e) {
      handle(res, "POST timeline", e);
    }
  });

  app.delete(`${P}/timeline/:id`, requireAdmin, async (req, res) => {
    try {
      res.json({ ok: await knopStore.deleteTimelineEvent(req.params.id) });
    } catch (e) {
      handle(res, "DELETE timeline", e);
    }
  });

  // ── Files (업로드는 기존 /api/uploads 사용, 여기서는 메타 연결) ──
  app.post(`${P}/files`, requireAdmin, async (req, res) => {
    try {
      const input = insertCrmFileSchema.parse(req.body);
      res.json(await knopStore.addFile(input));
    } catch (e) {
      handle(res, "POST file", e);
    }
  });

  app.delete(`${P}/files/:id`, requireAdmin, async (req, res) => {
    try {
      res.json({ ok: await knopStore.deleteFile(req.params.id) });
    } catch (e) {
      handle(res, "DELETE file", e);
    }
  });

  // ── Calendar ──
  app.get(`${P}/calendar`, requireAdmin, async (req, res) => {
    try {
      const start = typeof req.query.start === "string" ? req.query.start : undefined;
      const end = typeof req.query.end === "string" ? req.query.end : undefined;
      if (!start || !end) return res.status(400).json({ error: "start_end_required" });
      res.json(await knopStore.listEventsInRange(start, end));
    } catch (e) {
      handle(res, "GET calendar", e);
    }
  });

  app.post(`${P}/calendar`, requireAdmin, async (req, res) => {
    try {
      const input = insertCalendarEventSchema.parse(req.body);
      res.json(await knopStore.createEvent(input));
    } catch (e) {
      handle(res, "POST calendar", e);
    }
  });

  app.patch(`${P}/calendar/:id`, requireAdmin, async (req, res) => {
    try {
      const input = insertCalendarEventSchema.partial().parse(req.body);
      const row = await knopStore.updateEvent(req.params.id, input);
      if (!row) return res.status(404).json({ error: "not_found" });
      res.json(row);
    } catch (e) {
      handle(res, "PATCH calendar", e);
    }
  });

  app.delete(`${P}/calendar/:id`, requireAdmin, async (req, res) => {
    try {
      res.json({ ok: await knopStore.deleteEvent(req.params.id) });
    } catch (e) {
      handle(res, "DELETE calendar", e);
    }
  });

  // ── 오늘 해야 할 일 (대시보드) ──
  app.get(`${P}/today`, requireAdmin, async (req, res) => {
    try {
      const date = typeof req.query.date === "string" ? req.query.date : undefined;
      const { start, end } = dayRange(date);
      res.json(await knopStore.getToday(start, end));
    } catch (e) {
      handle(res, "GET today", e);
    }
  });

  // ── AI Inbox (결제 문자 분석·매칭) ──
  // 공통: 원문 → Gemini 파싱 → 고객 매칭 → inbox 저장
  async function ingest(rawText: string, sender: string | null, source: string) {
    const parsed = await parsePaymentSms(rawText);
    const match = await matchPayment(parsed);
    return knopStore.createInboxItem({
      source,
      sender,
      rawText,
      parsed,
      suggestions: match.suggestions,
      suggestedCustomerId: match.suggestedCustomerId,
      suggestedProjectId: match.suggestedProjectId,
      confidence: match.confidence,
    });
  }

  // 관리자 수동/테스트 등록
  app.post(`${P}/inbox`, requireAdmin, async (req, res) => {
    try {
      const input = insertAiInboxSchema.parse(req.body);
      const item = await ingest(input.rawText, input.sender ?? null, input.source ?? "manual");
      res.json(item);
    } catch (e) {
      handle(res, "POST inbox", e);
    }
  });

  // 폰 SMS 전달 앱용 웹훅 (관리자 토큰 대신 공유 시크릿). 설정: env KNOP_INBOX_SECRET
  app.post(`${P}/inbox/ingest`, async (req: Request, res: Response) => {
    try {
      const secret = process.env.KNOP_INBOX_SECRET?.trim();
      const provided = (req.headers["x-inbox-secret"] as string) || (req.query.key as string) || "";
      if (!secret || provided !== secret) return res.status(401).json({ error: "unauthorized" });
      // 전달 앱마다 필드명이 다를 수 있어 관대하게 수용
      const rawText = (req.body?.rawText || req.body?.text || req.body?.message || req.body?.msg || "").toString();
      const sender = (req.body?.sender || req.body?.from || req.body?.address || null) as string | null;
      if (!rawText.trim()) return res.status(400).json({ error: "empty_text" });
      const item = await ingest(rawText, sender, "sms");
      res.json({ ok: true, id: item.id, confidence: item.confidence });
    } catch (e) {
      handle(res, "POST inbox/ingest", e);
    }
  });

  app.get(`${P}/inbox`, requireAdmin, async (req, res) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      res.json(await knopStore.listInbox(status));
    } catch (e) {
      handle(res, "GET inbox", e);
    }
  });

  app.post(`${P}/inbox/:id/approve`, requireAdmin, async (req, res) => {
    try {
      const { customerId, projectId, paymentLabel } = req.body || {};
      if (!customerId || !projectId) return res.status(400).json({ error: "customerId_projectId_required" });
      const result = await knopStore.approveInbox(req.params.id, customerId, projectId, paymentLabel || "결제");
      // 개명비 결제확인 → "개명의뢰 확인 대기"에 등록(즉시 발송 X). 원장님 최종점검 후 확정.
      let pending: any = null;
      if (paymentLabel === "개명비") {
        pending = await gm.flagPending(customerId, "gaemyeong_request", "개명비 결제확인").catch((e) => ({ ok: false, reason: e?.message }));
      }
      res.json({ ...result, pending });
    } catch (e) {
      handle(res, "POST inbox approve", e);
    }
  });

  app.post(`${P}/inbox/:id/dismiss`, requireAdmin, async (req, res) => {
    try {
      res.json({ ok: await knopStore.dismissInbox(req.params.id) });
    } catch (e) {
      handle(res, "POST inbox dismiss", e);
    }
  });

  // ── Calls (통화 녹음 업로드 → 전사·요약) ──
  const objectStore = new ObjectStorageService();

  // 비동기: 업로드 즉시 "처리 중" 반환 → 백그라운드에서 전사(로컬 large-v3 우선, 실패 시 Gemini) → 요약 → 갱신
  async function processCallInBackground(callId: string, audioFileUrl: string) {
    const key = audioFileUrl.replace("/objects/", "");
    const ext = (audioFileUrl.match(/\.([a-zA-Z0-9]{1,5})$/)?.[1] || "bin").toLowerCase();
    try {
      const { buffer } = await objectStore.getObjectBuffer(key);
      let transcript = "";
      let summary = "";
      let actionItems: string[] = [];
      let words: unknown[] = [];

      if (await localTranscribeAvailable()) {
        // 로컬 무료 전사 (faster-whisper large-v3 + 성명학 교정 + 화자구분) — 1~4시간 지원
        const r = await transcribeLocal(buffer, ext);
        transcript = r.text;
        words = r.words || [];
        // 요약은 전사 텍스트 기반(저렴). 실패해도 전사는 유지.
        try {
          const s = await summarizeTranscript(transcript);
          summary = s.summary;
          actionItems = s.actionItems;
        } catch (e: any) {
          console.error(`[KNOP] 통화 요약 실패(전사 유지): ${e?.message}`);
        }
      } else {
        // 폴백: Gemini 오디오 직접 전사(짧은 녹음용)
        console.warn("[KNOP] 로컬 전사 불가 → Gemini 폴백");
        const a = await transcribeCall(buffer, ext);
        transcript = a.transcript;
        summary = a.summary;
        actionItems = a.actionItems;
      }

      await knopStore.updateCall(callId, { transcriptText: transcript, summaryText: summary, actionItems, words, status: "done" });
      console.log(`[KNOP] 통화 전사 완료 callId=${callId} (${transcript.length}자)`);
    } catch (e: any) {
      console.error(`[KNOP] 통화 전사 실패 callId=${callId}: ${e?.message}`);
      await knopStore
        .updateCall(callId, { summaryText: `전사 실패: ${e?.message || "오류"}`, status: "failed" })
        .catch(() => {});
    }
  }

  app.post(`${P}/calls`, requireAdmin, async (req, res) => {
    try {
      const { customerId, projectId, audioFileUrl, phone, direction, callDate, memo } = req.body || {};
      if (!customerId || !audioFileUrl) return res.status(400).json({ error: "customerId_audioFileUrl_required" });
      if (typeof audioFileUrl !== "string" || !audioFileUrl.startsWith("/objects/")) {
        return res.status(400).json({ error: "invalid_audio_path" });
      }

      // 즉시 "처리 중" 레코드 생성 후 반환 (긴 녹음도 타임아웃 없이)
      const call = await knopStore.createCall({
        customerId,
        projectId: projectId ?? null,
        phone: phone ?? null,
        direction: direction ?? "수신",
        callDate: callDate ?? null,
        audioFileUrl,
        status: "processing",
        memo: memo ?? null,
      });

      // 백그라운드 처리 (await 하지 않음)
      processCallInBackground(call.id, audioFileUrl);

      res.json(call);
    } catch (e) {
      handle(res, "POST calls", e);
    }
  });

  // 전사문 편집 + 자동 학습 (원본↔수정본 diff → 공유 교정사전에 누적)
  app.patch(`${P}/calls/:id`, requireAdmin, async (req, res) => {
    try {
      const { transcriptText, resummarize, words } = req.body || {};
      if (typeof transcriptText !== "string") return res.status(400).json({ error: "transcriptText_required" });
      const old = await knopStore.getCall(req.params.id);
      if (!old) return res.status(404).json({ error: "not_found" });

      // 학습: 이전 전사문과 수정본 비교
      const learned = await learnFromEdit(old.transcriptText || "", transcriptText).catch((e) => {
        console.error(`[KNOP] 학습 실패: ${e?.message}`);
        return { learned: [], skipped: 0 };
      });

      // 재요약(선택)
      let summaryText: string | undefined;
      let actionItems: string[] | undefined;
      if (resummarize) {
        try {
          const s = await summarizeTranscript(transcriptText);
          summaryText = s.summary;
          actionItems = s.actionItems;
        } catch (e: any) {
          console.error(`[KNOP] 재요약 실패: ${e?.message}`);
        }
      }

      const call = await knopStore.updateCall(req.params.id, {
        transcriptText,
        summaryText,
        actionItems,
        words: Array.isArray(words) ? words : undefined, // 음성연동/화자 유지용 갱신
      });
      res.json({ call, learned });
    } catch (e) {
      handle(res, "PATCH calls", e);
    }
  });

  app.delete(`${P}/calls/:id`, requireAdmin, async (req, res) => {
    try {
      res.json({ ok: await knopStore.deleteCall(req.params.id) });
    } catch (e) {
      handle(res, "DELETE calls", e);
    }
  });

  // ── 상담녹음 폴더(.m4a) 자동 연결 + 자동 전사 ──
  // 매칭된 녹음을 오브젝트 스토리지로 넣고 통화(call)로 만들어 배경 전사(기존 파이프라인 재사용)
  async function attachRecordingsForCustomer(cust: {
    id: string;
    name: string;
    normalizedPhone: string;
  }): Promise<{ matched: number; attached: number }> {
    const recs = recordingsForCustomer(cust);
    if (!recs.length) return { matched: 0, attached: 0 };
    const calls = await knopStore.listCalls(cust.id);
    const done = new Set(
      calls
        .map((c) => (c.memo || "").match(/\[폴더녹음\]\s*(.+)$/)?.[1]?.trim())
        .filter((x): x is string => !!x)
    );
    let attached = 0;
    for (const r of recs) {
      if (done.has(r.file)) continue;
      const full = resolveRecordingPath(r.file);
      if (!full) continue;
      const buffer = fs.readFileSync(full);
      const key = `uploads/${crypto.randomUUID()}`;
      await objectStore.putObject(key, buffer, "audio/mp4");
      const audioFileUrl = `/objects/${key}`;
      const call = await knopStore.createCall({
        customerId: cust.id,
        audioFileUrl,
        status: "processing",
        memo: `[폴더녹음] ${r.file}`,
      });
      processCallInBackground(call.id, audioFileUrl); // 비동기 전사(직렬 큐)
      attached++;
    }
    return { matched: recs.length, attached };
  }

  // 고객의 매칭 녹음 목록(연결 여부 포함)
  app.get(`${P}/recordings`, requireAdmin, async (req, res) => {
    try {
      if (!recordingsAvailable()) return res.json({ available: false, recordings: [] });
      const cust = await knopStore.getCustomer(String(req.query.customerId || ""));
      if (!cust) return res.status(404).json({ error: "not_found" });
      const recs = recordingsForCustomer(cust);
      const calls = await knopStore.listCalls(cust.id);
      const done = new Set(
        calls.map((c) => (c.memo || "").match(/\[폴더녹음\]\s*(.+)$/)?.[1]?.trim()).filter(Boolean)
      );
      res.json({
        available: true,
        recordings: recs.map((r) => ({ file: r.file, label: r.label, attached: done.has(r.file) })),
      });
    } catch (e) {
      handle(res, "GET recordings", e);
    }
  });
  // 한 고객의 매칭 녹음 가져오기 + 전사
  app.post(`${P}/recordings/attach`, requireAdmin, async (req, res) => {
    try {
      const cust = await knopStore.getCustomer(String((req.body || {}).customerId || ""));
      if (!cust) return res.status(404).json({ error: "not_found" });
      res.json(await attachRecordingsForCustomer(cust));
    } catch (e) {
      handle(res, "POST recordings attach", e);
    }
  });
  // 전체 고객 매칭 녹음 자동 가져오기 + 전사
  app.post(`${P}/recordings/attach-all`, requireAdmin, async (_req, res) => {
    try {
      const custs = await knopStore.listCustomers();
      let attached = 0;
      let customers = 0;
      for (const c of custs) {
        const r = await attachRecordingsForCustomer(c);
        if (r.attached) {
          attached += r.attached;
          customers++;
        }
      }
      res.json({ attached, customers });
    } catch (e) {
      handle(res, "POST recordings attach-all", e);
    }
  });

  // ── 공유 학습 교정사전 관리 ──
  app.get(`${P}/corrections`, requireAdmin, async (_req, res) => {
    try {
      res.json(await listRules());
    } catch (e) {
      handle(res, "GET corrections", e);
    }
  });

  app.get(`${P}/corrections/analysis`, requireAdmin, async (_req, res) => {
    try {
      res.json(await analyzeRules());
    } catch (e) {
      handle(res, "GET corrections analysis", e);
    }
  });

  app.post(`${P}/corrections`, requireAdmin, async (req, res) => {
    try {
      const { wrong, right } = req.body || {};
      if (!wrong || !right) return res.status(400).json({ error: "wrong_right_required" });
      res.json(await upsertManualRule(String(wrong), String(right)));
    } catch (e) {
      handle(res, "POST corrections", e);
    }
  });

  app.patch(`${P}/corrections`, requireAdmin, async (req, res) => {
    try {
      const { wrong, enabled } = req.body || {};
      if (!wrong || typeof enabled !== "boolean") return res.status(400).json({ error: "wrong_enabled_required" });
      await setRuleEnabled(String(wrong), enabled);
      res.json({ ok: true });
    } catch (e) {
      handle(res, "PATCH corrections", e);
    }
  });

  app.delete(`${P}/corrections`, requireAdmin, async (req, res) => {
    try {
      const wrong = typeof req.query.wrong === "string" ? req.query.wrong : "";
      if (!wrong) return res.status(400).json({ error: "wrong_required" });
      await deleteRule(wrong);
      res.json({ ok: true });
    } catch (e) {
      handle(res, "DELETE corrections", e);
    }
  });

  // ── 상담신청 → 고객 전환 ──
  app.post(`${P}/convert-consultation/:id`, requireAdmin, async (req, res) => {
    try {
      res.json(await knopStore.convertConsultation(req.params.id));
    } catch (e) {
      handle(res, "POST convert-consultation", e);
    }
  });

  // ── 개명 자동관리 2세트 (미용감사 / 정화하기) ──
  app.get(`${P}/notice/:setKey`, requireAdmin, async (req, res) => {
    try {
      const setKey = req.params.setKey;
      if (!isSetKey(setKey)) return res.status(400).json({ error: "bad_set" });
      const [steps, assets] = await Promise.all([
        gm.getSteps(setKey),
        gm.NOTICE_SETS[setKey].hasAssets ? gm.assetsForSet(setKey) : Promise.resolve([]),
      ]);
      res.json({ setKey, label: gm.NOTICE_SETS[setKey].label, hasAssets: gm.NOTICE_SETS[setKey].hasAssets, steps, assets });
    } catch (e) {
      handle(res, "GET notice", e);
    }
  });

  app.patch(`${P}/notice/step/:id`, requireAdmin, async (req, res) => {
    try {
      const { name, body, offsetDays } = req.body || {};
      res.json(await gm.updateStep(req.params.id, { name, body, offsetDays }));
    } catch (e) {
      handle(res, "PATCH notice step", e);
    }
  });

  app.post(`${P}/notice/:setKey/image`, requireAdmin, async (req, res) => {
    try {
      const setKey = req.params.setKey;
      if (!isSetKey(setKey)) return res.status(400).json({ error: "bad_set" });
      const { title, base64, contentType } = req.body || {};
      if (!title || !base64) return res.status(400).json({ error: "title_base64_required" });
      res.json(await gm.addImageAsset(setKey, String(title), String(base64), String(contentType || "image/png")));
    } catch (e) {
      handle(res, "POST notice image", e);
    }
  });

  app.post(`${P}/notice/:setKey/video`, requireAdmin, async (req, res) => {
    try {
      const setKey = req.params.setKey;
      if (!isSetKey(setKey)) return res.status(400).json({ error: "bad_set" });
      const { title, url } = req.body || {};
      if (!title || !url) return res.status(400).json({ error: "title_url_required" });
      res.json(await gm.addVideoAsset(setKey, String(title), String(url)));
    } catch (e) {
      handle(res, "POST notice video", e);
    }
  });

  app.delete(`${P}/notice/asset/:id`, requireAdmin, async (req, res) => {
    try {
      res.json({ ok: await gm.deleteAsset(req.params.id) });
    } catch (e) {
      handle(res, "DELETE notice asset", e);
    }
  });

  app.get(`${P}/notice/:setKey/preview`, requireAdmin, async (req, res) => {
    try {
      const setKey = req.params.setKey;
      if (!isSetKey(setKey)) return res.status(400).json({ error: "bad_set" });
      const sample = typeof req.query.name === "string" && req.query.name ? req.query.name : "홍길동";
      res.json(await gm.preview(setKey, sample));
    } catch (e) {
      handle(res, "GET notice preview", e);
    }
  });

  // 내 번호로 테스트 발송 (전역 LIVE 무관, 직접 발송)
  app.post(`${P}/notice/:setKey/test`, requireAdmin, async (req, res) => {
    try {
      const setKey = req.params.setKey;
      if (!isSetKey(setKey)) return res.status(400).json({ error: "bad_set" });
      const { phone, step = 0, name = "홍길동" } = req.body || {};
      if (!phone) return res.status(400).json({ error: "phone_required" });
      res.json(await gm.testSend(setKey, Number(step), String(phone), String(name)));
    } catch (e) {
      handle(res, "POST notice test", e);
    }
  });

  // 고객에게 시퀀스 시작(4건 예약)
  app.post(`${P}/customers/:id/start-sequence`, requireAdmin, async (req, res) => {
    try {
      const { setKey } = req.body || {};
      if (!isSetKey(setKey)) return res.status(400).json({ error: "bad_set" });
      res.json(await gm.startSequence(req.params.id, setKey));
    } catch (e) {
      handle(res, "POST start-sequence", e);
    }
  });

  app.get(`${P}/customers/:id/sequences`, requireAdmin, async (req, res) => {
    try {
      res.json(await gm.sequenceStatus(req.params.id));
    } catch (e) {
      handle(res, "GET sequences", e);
    }
  });

  // 개명의뢰 확인 대기 (개명비 입금 자동감지분) — 최종점검
  app.get(`${P}/notice-pending`, requireAdmin, async (_req, res) => {
    try {
      res.json(await gm.listPending());
    } catch (e) {
      handle(res, "GET notice-pending", e);
    }
  });

  app.post(`${P}/notice-pending/:id/confirm`, requireAdmin, async (req, res) => {
    try {
      const { nameDate } = req.body || {};
      res.json(await gm.confirmPending(req.params.id, { nameDate }));
    } catch (e) {
      handle(res, "POST notice-pending confirm", e);
    }
  });

  app.post(`${P}/notice-pending/:id/cancel`, requireAdmin, async (req, res) => {
    try {
      res.json({ ok: await gm.cancelPending(req.params.id) });
    } catch (e) {
      handle(res, "POST notice-pending cancel", e);
    }
  });
}
