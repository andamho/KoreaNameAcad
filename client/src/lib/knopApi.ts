// KNOP 운영 플랫폼 API 클라이언트 (관리자 토큰 자동 첨부)
import type {
  Customer,
  Project,
  TimelineEvent,
  CrmFile,
  CalendarEvent,
  AiInbox,
  ParsedPayment,
  InboxSuggestion,
  Call,
  SmsTemplate,
  ScheduledMessage,
} from "@shared/schema";

export type { AiInbox, ParsedPayment, InboxSuggestion, Call, SmsTemplate, ScheduledMessage };

export type PendingReport = {
  id: string;
  kind: "update" | "ambiguous";
  fileName: string;
  status: string;
  reportType: "family" | "individual";
  firstSeenAt: string;
  matchReason: string | null;
  renderedUrl: string | null;
  topScore: number | null; secondScore: number | null; scoreGap: number | null;
  candidates: Array<{ customerId: string; customerName: string; score: number; passedGate: boolean; autoEligible: boolean; parts: string[] }>;
  previous: { customerId: string; customerName: string | null; renderedUrl: string | null } | null;
  audit: Array<{ action: string; actor: string; at: string; reason?: string }>;
};

export type CorrectionRule = {
  id: string;
  wrong: string;
  right: string;
  count: number;
  enabled: boolean;
  status: "active" | "pending" | "disabled";
  blockReason: string | null;
  sample: string | null;
  source: "learned" | "manual";
  createdAt: string;
  updatedAt: string;
};

export type CorrectionAnalysis = {
  totalRules: number;
  totalHits: number;
  targets: Array<{ right: string; total: number; variants: Array<{ wrong: string; count: number }> }>;
  patterns: Array<{ from: string; to: string; count: number; single: boolean }>;
  top: Array<{ wrong: string; right: string; count: number }>;
};

export type SmsThread = {
  phone: string;
  contactName: string | null;
  messageCount: number;
  lastBody: string;
  lastAt: string;
  processed: boolean;
  createdEventDate: string | null;
};
export type IncomingSmsMsg = {
  id: string;
  contactName: string | null;
  phone: string;
  body: string;
  direction: string;
  receivedAt: string;
  processed: boolean;
};
export type ThreadProcessResult = {
  ok: boolean;
  note?: string;
  needsConfirmation?: boolean;
  resolution?: {
    match: string;
    customer?: Customer;
    candidates?: Customer[];
    note?: string;
    customerCode?: string | null;
  };
  parsed?: { name: string; regDate: string | null; hongik: boolean };
  analysis?: { consultDate: string; consultTime: string; summary: string; confidence: string };
  draft?: { title: string; date: string; clientPhone?: string; hongik?: boolean; memo?: string };
  written?: boolean;
  calendarLink?: string;
  emailed?: boolean;
  customerCode?: string | null;
};

export type BoardCustomer = Customer & {
  projectId: string | null;
  status: string | null;
  milestone: number;
};

const ADMIN_TOKEN_KEY = "kna_admin_token";

export interface CustomerDetail {
  customer: Customer;
  projects: Project[];
  timeline: TimelineEvent[];
  files: CrmFile[];
  events: CalendarEvent[];
  calls: Call[];
  referral?: { referralSource: string | null; referrerName: string | null } | null;
}

export interface TodayData {
  events: CalendarEvent[];
  actionProjects: Project[];
}

export class DuplicatePhoneError extends Error {
  customer: Customer;
  constructor(customer: Customer) {
    super("duplicate_phone");
    this.name = "DuplicatePhoneError";
    this.customer = customer;
  }
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  const res = await fetch(url, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 409) {
    const data = await res.json().catch(() => ({}));
    if (data?.error === "duplicate_phone" && data.customer) {
      throw new DuplicatePhoneError(data.customer);
    }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    // 서버가 사유를 주면(예: "안전 규칙 위반이라 강제 활성 불가") 그대로 보여준다
    let msg = "";
    try {
      msg = JSON.parse(text)?.error || "";
    } catch {}
    throw new Error(msg || `${res.status}: ${text}`);
  }
  // 204/empty 대응
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export const knopApi = {
  // Customers
  listCustomers: (q?: string) =>
    req<Customer[]>("GET", `/api/kop/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  getCustomer: (id: string) => req<CustomerDetail>("GET", `/api/kop/customers/${id}`),
  createCustomer: (data: {
    name: string;
    phone: string;
    email?: string | null;
    memo?: string | null;
    tags?: string[];
  }) => req<Customer>("POST", "/api/kop/customers", data),
  updateCustomer: (id: string, data: Record<string, unknown>) =>
    req<Customer>("PATCH", `/api/kop/customers/${id}`, data),
  deleteCustomer: (id: string) => req<{ ok: boolean }>("DELETE", `/api/kop/customers/${id}`), // 휴지통으로
  listTrash: () => req<Customer[]>("GET", "/api/kop/customers-trash"),
  restoreCustomer: (id: string) => req<{ ok: boolean }>("POST", `/api/kop/customers/${id}/restore`),
  permanentDeleteCustomer: (id: string) => req<{ ok: boolean }>("DELETE", `/api/kop/customers/${id}/permanent`),

  // Projects
  createProject: (data: {
    customerId: string;
    type: string;
    title: string;
    status?: string;
    paymentStatus?: string;
    consultDate?: string | null;
    nextActionDate?: string | null;
    memo?: string | null;
  }) => req<Project>("POST", "/api/kop/projects", data),
  updateProject: (id: string, data: Record<string, unknown>) =>
    req<Project>("PATCH", `/api/kop/projects/${id}`, data),
  deleteProject: (id: string) => req<{ ok: boolean }>("DELETE", `/api/kop/projects/${id}`),

  // Timeline
  addNote: (data: { customerId: string; projectId?: string | null; title: string; content?: string }) =>
    req<TimelineEvent>("POST", "/api/kop/timeline", { type: "note", ...data }),
  deleteTimeline: (id: string) => req<{ ok: boolean }>("DELETE", `/api/kop/timeline/${id}`),

  // Files
  addFile: (data: {
    customerId: string;
    projectId?: string | null;
    fileName: string;
    fileType?: string | null;
    fileUrl: string;
    memo?: string | null;
  }) => req<CrmFile>("POST", "/api/kop/files", data),
  deleteFile: (id: string) => req<{ ok: boolean }>("DELETE", `/api/kop/files/${id}`),

  // Calendar
  listCalendar: (startISO: string, endISO: string) =>
    req<CalendarEvent[]>(
      "GET",
      `/api/kop/calendar?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`,
    ),
  createEvent: (data: {
    customerId?: string | null;
    projectId?: string | null;
    title: string;
    type?: string;
    startAt: string;
    endAt?: string | null;
    status?: string;
    memo?: string | null;
  }) => req<CalendarEvent>("POST", "/api/kop/calendar", data),
  updateEvent: (id: string, data: Record<string, unknown>) =>
    req<CalendarEvent>("PATCH", `/api/kop/calendar/${id}`, data),
  deleteEvent: (id: string) => req<{ ok: boolean }>("DELETE", `/api/kop/calendar/${id}`),

  // Calls (통화 녹음)
  createCall: (data: {
    customerId: string;
    projectId?: string | null;
    audioFileUrl: string;
    phone?: string | null;
    direction?: string;
    callDate?: string | null;
    memo?: string | null;
  }) => req<Call>("POST", "/api/kop/calls", data),
  deleteCall: (id: string) => req<{ ok: boolean }>("DELETE", `/api/kop/calls/${id}`),
  // 응답은 가볍게(전사문/words 미포함) — 저장 속도용
  editCallTranscript: (
    id: string,
    transcriptText: string,
    resummarize = false,
    words?: unknown[],
  ) =>
    req<{ ok: boolean; id: string; summaryText: string | null }>("PATCH", `/api/kop/calls/${id}`, {
      transcriptText,
      resummarize,
      words,
    }),
  // 오타 수정 저장 가속: 바뀐 턴만 splice 로 전송(전체 words 업로드 회피)
  editCallTranscriptPatch: (
    id: string,
    wordPatch: { startIdx: number; delCount: number; words: unknown[] },
    resummarize = false,
  ) =>
    req<{ ok: boolean; id: string; summaryText: string | null }>("PATCH", `/api/kop/calls/${id}`, {
      wordPatch,
      resummarize,
    }),

  // 공유 학습 교정사전
  listCorrections: () => req<CorrectionRule[]>("GET", "/api/kop/corrections"),
  analyzeCorrections: () => req<CorrectionAnalysis>("GET", "/api/kop/corrections/analysis"),
  addCorrection: (wrong: string, right: string) =>
    req<CorrectionRule[]>("POST", "/api/kop/corrections", { wrong, right }),
  toggleCorrection: (wrong: string, enabled: boolean) =>
    req<{ ok: boolean }>("PATCH", "/api/kop/corrections", { wrong, enabled }),
  deleteCorrection: (id: string) =>
    req<{ ok: boolean }>("DELETE", `/api/kop/corrections?id=${encodeURIComponent(id)}`),
  revalidateCorrections: () =>
    req<{ checked: number; active: number; demoted: Array<{ wrong: string; right: string; reason: string }> }>(
      "POST",
      "/api/kop/corrections/revalidate",
    ),

  // 이름분석표 갱신 대기 (동명이인 확인 / 내용 갱신)
  listPendingReports: () => req<PendingReport[]>("GET", "/api/kop/reports/pending"),
  assignReport: (id: string, customerId: string, reason?: string) =>
    req<{ ok: boolean }>("POST", `/api/kop/reports/${id}/assign`, { customerId, actor: "원장님", reason }),
  replaceReport: (id: string, reason?: string) =>
    req<{ ok: boolean }>("POST", `/api/kop/reports/${id}/replace`, { actor: "원장님", reason }),
  ignoreReport: (id: string, reason?: string) =>
    req<{ ok: boolean }>("POST", `/api/kop/reports/${id}/ignore`, { actor: "원장님", reason }),

  // AI Inbox (결제 문자)
  submitInbox: (rawText: string, sender?: string) =>
    req<AiInbox>("POST", "/api/kop/inbox", { rawText, sender, source: "manual" }),
  listInbox: (status = "pending") =>
    req<AiInbox[]>("GET", `/api/kop/inbox?status=${encodeURIComponent(status)}`),
  approveInbox: (id: string, customerId: string, projectId: string, paymentLabel: string) =>
    req<{ inbox: AiInbox; project: Project }>("POST", `/api/kop/inbox/${id}/approve`, {
      customerId,
      projectId,
      paymentLabel,
    }),
  dismissInbox: (id: string) => req<{ ok: boolean }>("POST", `/api/kop/inbox/${id}/dismiss`),

  // 문자 자동화
  listSmsTemplates: () => req<SmsTemplate[]>("GET", "/api/kop/sms/templates"),
  createSmsTemplate: (name: string, category: string, content: string) =>
    req<SmsTemplate>("POST", "/api/kop/sms/templates", { name, category, content }),
  updateSmsTemplate: (id: string, data: Partial<{ name: string; category: string; content: string }>) =>
    req<SmsTemplate>("PATCH", `/api/kop/sms/templates/${id}`, data),
  deleteSmsTemplate: (id: string) => req<{ ok: boolean }>("DELETE", `/api/kop/sms/templates/${id}`),
  listSmsMessages: (status?: string) =>
    req<ScheduledMessage[]>("GET", `/api/kop/sms/messages${status ? `?status=${status}` : ""}`),
  createSmsMessage: (data: {
    customerId?: string | null;
    projectId?: string | null;
    phone: string;
    content: string;
    templateId?: string | null;
    scheduledAt?: string | null;
  }) => req<ScheduledMessage>("POST", "/api/kop/sms/messages", data),
  cancelSmsMessage: (id: string) => req<{ ok: boolean }>("POST", `/api/kop/sms/messages/${id}/cancel`),

  // 이름분석표 PDF 연계
  reportsForName: (name: string) =>
    req<{ available: boolean; reports: Array<{ file: string; name: string; label: string }> }>(
      "GET",
      `/api/kop/reports?name=${encodeURIComponent(name)}`,
    ),
  reportFileUrl: (file: string) => {
    const token = localStorage.getItem(ADMIN_TOKEN_KEY) || "";
    return `/api/kop/reports/file?name=${encodeURIComponent(file)}&token=${encodeURIComponent(token)}`;
  },

  // 상담녹음 폴더 자동 연결 + 전사
  listRecordings: (customerId: string) =>
    req<{ available: boolean; recordings: Array<{ file: string; label: string; attached: boolean }> }>(
      "GET",
      `/api/kop/recordings?customerId=${encodeURIComponent(customerId)}`,
    ),
  attachRecordings: (customerId: string) =>
    req<{ matched: number; attached: number }>("POST", "/api/kop/recordings/attach", { customerId }),
  attachAllRecordings: () => req<{ attached: number; customers: number }>("POST", "/api/kop/recordings/attach-all"),

  // 파이프라인 보드
  customerBoard: () => req<BoardCustomer[]>("GET", "/api/kop/customers/board"),
  ensureCases: () => req<{ created: number }>("POST", "/api/kop/customers/ensure-cases"),

  // 여정 상태기계
  listJourney: () =>
    req<Array<{ rank: number; status: string; followup: { template: string; days: number } | null }>>(
      "GET",
      "/api/kop/journey",
    ),
  advanceStatus: (projectId: string, toStatus: string, force = false) =>
    req<{
      project: Project;
      nextFollowup: { template: string; days: number } | null;
      next: { status: string } | null;
    }>("POST", `/api/kop/projects/${projectId}/advance`, { toStatus, force }),

  // 문자 수신 → 달력 자동등록 (스레드 목록/조회/처리/확인)
  listSmsThreads: () => req<SmsThread[]>("GET", "/api/kop/sms-threads"),
  getSmsThread: (phone: string) =>
    req<IncomingSmsMsg[]>("GET", `/api/kop/sms-threads/${encodeURIComponent(phone)}`),
  processSmsThread: (phone: string, opts: { dryRun: boolean; sendEmail: boolean }) =>
    req<ThreadProcessResult>("POST", `/api/kop/sms-threads/${encodeURIComponent(phone)}/process`, opts),
  confirmSmsThread: (
    phone: string,
    data: { customerId: string; setPhone: boolean; dryRun: boolean; sendEmail: boolean },
  ) => req<ThreadProcessResult>("POST", `/api/kop/sms-threads/${encodeURIComponent(phone)}/confirm`, data),

  // Dashboard / convert
  today: (dateISO?: string) =>
    req<TodayData>("GET", `/api/kop/today${dateISO ? `?date=${encodeURIComponent(dateISO)}` : ""}`),
  convertConsultation: (consultationId: string) =>
    req<{ customer: Customer; project: Project }>(
      "POST",
      `/api/kop/convert-consultation/${consultationId}`,
    ),

  // 개명 자동관리 2세트 (미용감사 / 정화하기)
  getNotice: (setKey: string) => req<NoticeConfig>("GET", `/api/kop/notice/${setKey}`),
  updateNoticeStep: (id: string, data: { name?: string; body?: string; offsetDays?: number }) =>
    req<NoticeStep>("PATCH", `/api/kop/notice/step/${id}`, data),
  addNoticeImage: (setKey: string, data: { title: string; base64: string; contentType: string }) =>
    req<NoticeAsset>("POST", `/api/kop/notice/${setKey}/image`, data),
  addNoticeVideo: (setKey: string, data: { title: string; url: string }) =>
    req<NoticeAsset>("POST", `/api/kop/notice/${setKey}/video`, data),
  addNoticeAssetFile: (setKey: string, data: { title: string; objectPath: string; kind: "image" | "video" }) =>
    req<NoticeAsset>("POST", `/api/kop/notice/${setKey}/asset-file`, data),
  deleteNoticeAsset: (id: string) => req<{ ok: boolean }>("DELETE", `/api/kop/notice/asset/${id}`),
  previewNotice: (setKey: string, name?: string) =>
    req<NoticePreview[]>("GET", `/api/kop/notice/${setKey}/preview${name ? `?name=${encodeURIComponent(name)}` : ""}`),
  testNotice: (setKey: string, data: { phone: string; step?: number; name?: string }) =>
    req<{ content: string }>("POST", `/api/kop/notice/${setKey}/test`, data),
  startSequence: (customerId: string, setKey: string) =>
    req<{ ok: boolean; scheduled: number; reason?: string; dates: string[] }>(
      "POST",
      `/api/kop/customers/${customerId}/start-sequence`,
      { setKey },
    ),
  getSequences: (customerId: string) =>
    req<Record<string, string>>("GET", `/api/kop/customers/${customerId}/sequences`),
  customerMessages: (customerId: string) =>
    req<CustomerMessage[]>("GET", `/api/kop/customers/${customerId}/messages`),
  calendarAgenda: () => req<CalendarAgendaItem[]>("GET", "/api/kop/calendar/agenda"),
  resolveCustomer: (phone: string, name: string) =>
    req<{ customerId: string | null }>(
      "GET",
      `/api/kop/customers-resolve?phone=${encodeURIComponent(phone)}&name=${encodeURIComponent(name)}`,
    ),
  hongikCustomerIds: () => req<string[]>("GET", "/api/kop/customers-hongik"),

  // 개명의뢰 확인 대기 (최종점검)
  listNoticePending: () => req<NoticePending[]>("GET", "/api/kop/notice-pending"),
  confirmNoticePending: (id: string, nameDate?: string) =>
    req<{ ok: boolean; scheduled: number; reason?: string; dates: string[]; calendar?: { date: string; title: string } }>(
      "POST",
      `/api/kop/notice-pending/${id}/confirm`,
      { nameDate },
    ),
  cancelNoticePending: (id: string) => req<{ ok: boolean }>("POST", `/api/kop/notice-pending/${id}/cancel`),
};

export type CalendarAgendaItem = {
  date: string | null;
  title: string;
  cat: string | null;
  phoneChange: boolean;
  customerId: string | null;
  customerName: string | null;
};

export type CustomerMessage = {
  id: string;
  direction: "받음" | "보냄";
  body: string;
  at: string | null;
  status?: string;
};

export type NoticePending = {
  id: string;
  customerId: string;
  customerName: string;
  phone: string;
  setKey: string;
  setLabel: string;
  reason: string | null;
  nameDate: string | null;
  flaggedAt: string;
};

export type NoticeStep = { id: string; setKey: string; step: number; name: string; body: string; offsetDays: number };
export type NoticeAsset = { id: string; kind: string; title: string; slug: string; url: string; target: string; sortOrder: number };
export type NoticeConfig = { setKey: string; label: string; hasAssets: boolean; steps: NoticeStep[]; assets: NoticeAsset[] };
export type NoticePreview = { step: number; name: string; offsetDays: number; content: string };
