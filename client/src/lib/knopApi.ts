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

export type CorrectionRule = {
  wrong: string;
  right: string;
  count: number;
  enabled: boolean;
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
    throw new Error(`${res.status}: ${text}`);
  }
  // 204/empty 대응
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export const knopApi = {
  // Customers
  listCustomers: (q?: string) =>
    req<Customer[]>("GET", `/api/knop/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  getCustomer: (id: string) => req<CustomerDetail>("GET", `/api/knop/customers/${id}`),
  createCustomer: (data: {
    name: string;
    phone: string;
    email?: string | null;
    memo?: string | null;
    tags?: string[];
  }) => req<Customer>("POST", "/api/knop/customers", data),
  updateCustomer: (id: string, data: Record<string, unknown>) =>
    req<Customer>("PATCH", `/api/knop/customers/${id}`, data),
  deleteCustomer: (id: string) => req<{ ok: boolean }>("DELETE", `/api/knop/customers/${id}`),

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
  }) => req<Project>("POST", "/api/knop/projects", data),
  updateProject: (id: string, data: Record<string, unknown>) =>
    req<Project>("PATCH", `/api/knop/projects/${id}`, data),
  deleteProject: (id: string) => req<{ ok: boolean }>("DELETE", `/api/knop/projects/${id}`),

  // Timeline
  addNote: (data: { customerId: string; projectId?: string | null; title: string; content?: string }) =>
    req<TimelineEvent>("POST", "/api/knop/timeline", { type: "note", ...data }),
  deleteTimeline: (id: string) => req<{ ok: boolean }>("DELETE", `/api/knop/timeline/${id}`),

  // Files
  addFile: (data: {
    customerId: string;
    projectId?: string | null;
    fileName: string;
    fileType?: string | null;
    fileUrl: string;
    memo?: string | null;
  }) => req<CrmFile>("POST", "/api/knop/files", data),
  deleteFile: (id: string) => req<{ ok: boolean }>("DELETE", `/api/knop/files/${id}`),

  // Calendar
  listCalendar: (startISO: string, endISO: string) =>
    req<CalendarEvent[]>(
      "GET",
      `/api/knop/calendar?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`,
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
  }) => req<CalendarEvent>("POST", "/api/knop/calendar", data),
  updateEvent: (id: string, data: Record<string, unknown>) =>
    req<CalendarEvent>("PATCH", `/api/knop/calendar/${id}`, data),
  deleteEvent: (id: string) => req<{ ok: boolean }>("DELETE", `/api/knop/calendar/${id}`),

  // Calls (통화 녹음)
  createCall: (data: {
    customerId: string;
    projectId?: string | null;
    audioFileUrl: string;
    phone?: string | null;
    direction?: string;
    callDate?: string | null;
    memo?: string | null;
  }) => req<Call>("POST", "/api/knop/calls", data),
  deleteCall: (id: string) => req<{ ok: boolean }>("DELETE", `/api/knop/calls/${id}`),
  editCallTranscript: (
    id: string,
    transcriptText: string,
    resummarize = false,
    words?: unknown[],
  ) =>
    req<{ call: Call; learned: { learned: { wrong: string; right: string }[]; skipped: number } }>(
      "PATCH",
      `/api/knop/calls/${id}`,
      { transcriptText, resummarize, words },
    ),

  // 공유 학습 교정사전
  listCorrections: () => req<CorrectionRule[]>("GET", "/api/knop/corrections"),
  analyzeCorrections: () => req<CorrectionAnalysis>("GET", "/api/knop/corrections/analysis"),
  addCorrection: (wrong: string, right: string) =>
    req<CorrectionRule[]>("POST", "/api/knop/corrections", { wrong, right }),
  toggleCorrection: (wrong: string, enabled: boolean) =>
    req<{ ok: boolean }>("PATCH", "/api/knop/corrections", { wrong, enabled }),
  deleteCorrection: (wrong: string) =>
    req<{ ok: boolean }>("DELETE", `/api/knop/corrections?wrong=${encodeURIComponent(wrong)}`),

  // AI Inbox (결제 문자)
  submitInbox: (rawText: string, sender?: string) =>
    req<AiInbox>("POST", "/api/knop/inbox", { rawText, sender, source: "manual" }),
  listInbox: (status = "pending") =>
    req<AiInbox[]>("GET", `/api/knop/inbox?status=${encodeURIComponent(status)}`),
  approveInbox: (id: string, customerId: string, projectId: string, paymentLabel: string) =>
    req<{ inbox: AiInbox; project: Project }>("POST", `/api/knop/inbox/${id}/approve`, {
      customerId,
      projectId,
      paymentLabel,
    }),
  dismissInbox: (id: string) => req<{ ok: boolean }>("POST", `/api/knop/inbox/${id}/dismiss`),

  // 문자 자동화
  listSmsTemplates: () => req<SmsTemplate[]>("GET", "/api/knop/sms/templates"),
  createSmsTemplate: (name: string, category: string, content: string) =>
    req<SmsTemplate>("POST", "/api/knop/sms/templates", { name, category, content }),
  updateSmsTemplate: (id: string, data: Partial<{ name: string; category: string; content: string }>) =>
    req<SmsTemplate>("PATCH", `/api/knop/sms/templates/${id}`, data),
  deleteSmsTemplate: (id: string) => req<{ ok: boolean }>("DELETE", `/api/knop/sms/templates/${id}`),
  listSmsMessages: (status?: string) =>
    req<ScheduledMessage[]>("GET", `/api/knop/sms/messages${status ? `?status=${status}` : ""}`),
  createSmsMessage: (data: {
    customerId?: string | null;
    projectId?: string | null;
    phone: string;
    content: string;
    templateId?: string | null;
    scheduledAt?: string | null;
  }) => req<ScheduledMessage>("POST", "/api/knop/sms/messages", data),
  cancelSmsMessage: (id: string) => req<{ ok: boolean }>("POST", `/api/knop/sms/messages/${id}/cancel`),

  // 이름분석표 PDF 연계
  reportsForName: (name: string) =>
    req<{ available: boolean; reports: Array<{ file: string; name: string; label: string }> }>(
      "GET",
      `/api/knop/reports?name=${encodeURIComponent(name)}`,
    ),
  reportFileUrl: (file: string) => {
    const token = localStorage.getItem(ADMIN_TOKEN_KEY) || "";
    return `/api/knop/reports/file?name=${encodeURIComponent(file)}&token=${encodeURIComponent(token)}`;
  },

  // 상담녹음 폴더 자동 연결 + 전사
  listRecordings: (customerId: string) =>
    req<{ available: boolean; recordings: Array<{ file: string; label: string; attached: boolean }> }>(
      "GET",
      `/api/knop/recordings?customerId=${encodeURIComponent(customerId)}`,
    ),
  attachRecordings: (customerId: string) =>
    req<{ matched: number; attached: number }>("POST", "/api/knop/recordings/attach", { customerId }),
  attachAllRecordings: () => req<{ attached: number; customers: number }>("POST", "/api/knop/recordings/attach-all"),

  // 파이프라인 보드
  customerBoard: () => req<BoardCustomer[]>("GET", "/api/knop/customers/board"),
  ensureCases: () => req<{ created: number }>("POST", "/api/knop/customers/ensure-cases"),

  // 여정 상태기계
  listJourney: () =>
    req<Array<{ rank: number; status: string; followup: { template: string; days: number } | null }>>(
      "GET",
      "/api/knop/journey",
    ),
  advanceStatus: (projectId: string, toStatus: string, force = false) =>
    req<{
      project: Project;
      nextFollowup: { template: string; days: number } | null;
      next: { status: string } | null;
    }>("POST", `/api/knop/projects/${projectId}/advance`, { toStatus, force }),

  // 문자 수신 → 달력 자동등록 (스레드 목록/조회/처리/확인)
  listSmsThreads: () => req<SmsThread[]>("GET", "/api/knop/sms-threads"),
  getSmsThread: (phone: string) =>
    req<IncomingSmsMsg[]>("GET", `/api/knop/sms-threads/${encodeURIComponent(phone)}`),
  processSmsThread: (phone: string, opts: { dryRun: boolean; sendEmail: boolean }) =>
    req<ThreadProcessResult>("POST", `/api/knop/sms-threads/${encodeURIComponent(phone)}/process`, opts),
  confirmSmsThread: (
    phone: string,
    data: { customerId: string; setPhone: boolean; dryRun: boolean; sendEmail: boolean },
  ) => req<ThreadProcessResult>("POST", `/api/knop/sms-threads/${encodeURIComponent(phone)}/confirm`, data),

  // Dashboard / convert
  today: (dateISO?: string) =>
    req<TodayData>("GET", `/api/knop/today${dateISO ? `?date=${encodeURIComponent(dateISO)}` : ""}`),
  convertConsultation: (consultationId: string) =>
    req<{ customer: Customer; project: Project }>(
      "POST",
      `/api/knop/convert-consultation/${consultationId}`,
    ),
};
