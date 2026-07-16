import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Consultations table (Neon Postgres)
export const consultations = pgTable("consultations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(),
  numPeople: integer("num_people").notNull(),
  peopleData: text("people_data").notNull(),       // JSON string
  phone: text("phone").notNull(),
  hasNameChange: text("has_name_change").notNull(),
  numNameChanges: integer("num_name_changes"),
  nameChangeData: text("name_change_data"),         // JSON string (optional)
  evaluationKoreanName: text("evaluation_korean_name"),
  evaluationChineseName: text("evaluation_chinese_name"),
  reason: text("reason").notNull(),
  referralSource: text("referral_source"),
  referrerName: text("referrer_name"),
  depositorName: text("depositor_name").notNull(),
  consultationTime: text("consultation_time").notNull(),
  fileName: text("file_name"),
  fileData: text("file_data"),
  fileType: text("file_type"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Zod schema for API validation (keeps existing shape)
export const consultationSchema = z.object({
  id: z.string(),
  type: z.enum(["analysis", "naming"]),
  numPeople: z.number(),
  peopleData: z.array(z.object({
    name: z.string(),
    gender: z.string(),
    birthYear: z.string(),
    occupation: z.string(),
  })),
  phone: z.string(),
  hasNameChange: z.string(),
  numNameChanges: z.number().optional(),
  nameChangeData: z.array(z.object({
    previousName: z.string(),
    koreanName: z.string(),
    chineseName: z.string(),
    changeYear: z.string(),
  })).optional(),
  evaluationKoreanName: z.string().optional(),
  evaluationChineseName: z.string().optional(),
  reason: z.string(),
  referralSource: z.string().optional(),
  referrerName: z.string().optional(),
  depositorName: z.string(),
  consultationTime: z.string(),
  fileName: z.string().optional(),
  fileData: z.string().optional(),
  fileType: z.string().optional(),
  createdAt: z.string(),
});

export const insertConsultationSchema = consultationSchema.omit({ id: true, createdAt: true });

export type Consultation = z.infer<typeof consultationSchema>;
export type InsertConsultation = z.infer<typeof insertConsultationSchema>;

// NameStory table for blog-like content
export const nameStories = pgTable("name_stories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  thumbnail: text("thumbnail").notNull(),
  content: text("content").notNull(),
  videoUrl: text("video_url"),
  isVideo: boolean("is_video").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertNameStorySchema = createInsertSchema(nameStories).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export type InsertNameStory = z.infer<typeof insertNameStorySchema>;
export type NameStory = typeof nameStories.$inferSelect;

// Content categories for CMS
export const contentCategoryEnum = z.enum(["nameStory", "expert", "announcement", "review", "about"]);
export type ContentCategory = z.infer<typeof contentCategoryEnum>;

// Contents table for unified CMS
export const contents = pgTable("contents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  category: text("category").notNull(), // nameStory, expert, announcement, review
  title: text("title").notNull(),
  thumbnail: text("thumbnail"),
  content: text("content").notNull(),
  videoUrl: text("video_url"),
  isVideo: boolean("is_video").default(false).notNull(),
  isDraft: boolean("is_draft").default(false).notNull(), // 임시저장 여부
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertContentSchema = createInsertSchema(contents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertContent = z.infer<typeof insertContentSchema>;
export type Content = typeof contents.$inferSelect;

// ── 후기 자동화: 검수 대기 초안 (텔레그램 파이프라인) ──
// status 흐름: processing → review → publishing → published / failed
export const reviewDrafts = pgTable("review_drafts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  status: text("status").notNull().default("processing"),
  category: text("category").notNull().default("review"), // review | nameStory(이름이야기)
  source: text("source").notNull().default("telegram"), // telegram | web
  chatId: text("chat_id"),                               // 텔레그램 채팅 ID
  originalImagePath: text("original_image_path"),        // R2 /objects/... 원본(첫 장)
  maskedImagePath: text("masked_image_path"),            // R2 마스킹본(첫 장)
  originalImagePaths: text("original_image_paths"),      // JSON string[] 원본 여러 장
  maskedImagePaths: text("masked_image_paths"),          // JSON string[] 마스킹본 여러 장
  extractedText: text("extracted_text"),                 // OCR 원문
  polishedContent: text("polished_content"),             // 다듬은 본문(편집 가능)
  thumbnailLabel: text("thumbnail_label"),               // 썸네일 메인 제목 위 분류 라벨(예: 이름분석 상담후기 / 개명후기)
  redactionBoxes: text("redaction_boxes"),               // JSON: [{x,y,w,h,reason}] 정규화 0~1
  titleCandidates: text("title_candidates"),             // JSON: string[] (게시 제목 5)
  thumbnailTitleCandidates: text("thumbnail_title_candidates"), // JSON: string[] (썸네일 문구 5)
  thumbnailCandidates: text("thumbnail_candidates"),     // JSON: [{url,thumbUrl,source,photographer,sourceUrl}]
  thumbnailKeywords: text("thumbnail_keywords"),         // 현재 썸네일 검색 키워드(재검색용)
  thumbnailPage: integer("thumbnail_page").default(1).notNull(), // 다음 페이지 요청용
  selectedTitle: text("selected_title"),
  selectedThumbnailTitle: text("selected_thumbnail_title"),
  selectedThumbnailUrl: text("selected_thumbnail_url"),  // 고른 스톡 원본 URL
  composedThumbnailPath: text("composed_thumbnail_path"), // R2 합성 썸네일
  publishedContentId: varchar("published_content_id"),   // 게시 후 contents.id
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertReviewDraftSchema = createInsertSchema(reviewDrafts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertReviewDraft = z.infer<typeof insertReviewDraftSchema>;
export type ReviewDraft = typeof reviewDrafts.$inferSelect;

// ── 숏폼 영상 자동배포 잡 (유튜브 / 인스타 / 틱톡 / 홈페이지) ──
// 채널별 status 흐름(독립): queued → uploading → processing → published / failed / skipped
export const videoJobs = pgTable("video_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  videoR2Key: text("video_r2_key").notNull(),          // R2에 저장된 원본 세로영상 키
  title: text("title").notNull(),
  caption: text("caption"),                            // 공통 설명/캡션
  hashtags: text("hashtags"),                          // 쉼표/공백 구분 해시태그
  // 배포 대상 채널 선택
  targetYoutube: boolean("target_youtube").default(true).notNull(),
  targetInstagram: boolean("target_instagram").default(false).notNull(),
  targetTiktok: boolean("target_tiktok").default(false).notNull(),
  targetHomepage: boolean("target_homepage").default(true).notNull(),
  // 홈페이지 삽입: 게시할 카테고리 + 게시 후 연결된 글 id
  homepageCategory: text("homepage_category").default("nameStory").notNull(),
  targetContentId: varchar("target_content_id"),       // 배포 완료 후 contents.id
  // 채널별 상태
  ytStatus: text("yt_status").default("queued").notNull(),
  igStatus: text("ig_status").default("queued").notNull(),
  ttStatus: text("tt_status").default("queued").notNull(),
  hpStatus: text("hp_status").default("queued").notNull(),
  // 배포 성공 시 각 플랫폼이 반환한 식별자
  ytVideoId: text("yt_video_id"),
  igMediaId: text("ig_media_id"),
  ttPublishId: text("tt_publish_id"),
  errorLog: text("error_log"),                         // JSON: 채널별 실패 사유 + 재시도 이력
  igRetryCount: integer("ig_retry_count").default(0).notNull(), // 인스타 재시도 횟수
  igRetryStartedAt: timestamp("ig_retry_started_at"),  // 마지막 인스타 재시도 시작시각
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertVideoJobSchema = createInsertSchema(videoJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertVideoJob = z.infer<typeof insertVideoJobSchema>;
export type VideoJob = typeof videoJobs.$inferSelect;

// ── 소셜 OAuth 토큰 저장 (provider별 1행: youtube / instagram / tiktok) ──
export const oauthTokens = pgTable("oauth_tokens", {
  provider: varchar("provider").primaryKey(),          // "youtube" | "instagram" | "tiktok"
  refreshToken: text("refresh_token"),                 // 장기 리프레시 토큰
  accessToken: text("access_token"),                   // 단기 액세스 토큰(캐시)
  expiresAt: timestamp("expires_at"),                  // 액세스 토큰 만료시각
  scope: text("scope"),                                // 승인된 범위
  accountLabel: text("account_label"),                 // 연결된 계정 표시용(채널명 등)
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type OAuthToken = typeof oauthTokens.$inferSelect;

// ── transcode 진단(비게시) — 원본으로 변환만 돌려 자원/시간/종료를 기록. 게시 상태 안 건드림 ──
// 주의: 내구성 작업 큐가 아님. 같은 Node 프로세스의 비동기 작업이며, heartbeat/phase/abandoned로
//       "행이 영구 running으로 남는 문제"만 완화한다(컨테이너 사망 원인 완전 기록은 보장 못 함).
export const transcodeDiagnostics = pgTable("transcode_diagnostics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  r2Key: text("r2_key").notNull(),
  status: text("status").notNull().default("running"), // running | done | failed | abandoned
  phase: text("phase").default("queued"),              // queued|downloading|probing|transcoding|completed|failed|abandoned
  result: text("result"),        // JSON: 다운로드/변환/ffprobe/RSS피크/시간/code/signal/stderr
  pid: integer("pid"),                                  // 실행 프로세스 PID(로그 시간대조용)
  instanceId: text("instance_id"),                     // Railway replica/hostname(어느 인스턴스인지)
  startedAt: timestamp("started_at"),                  // 실제 변환 시작시각
  heartbeatAt: timestamp("heartbeat_at"),              // 마지막 생존신호(끊기면 stalled/abandoned)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type TranscodeDiagnostic = typeof transcodeDiagnostics.$inferSelect;

// 마스킹 박스 (정규화 좌표 0~1)
export type RedactionBox = { x: number; y: number; w: number; h: number; reason?: string; image?: number };
// 썸네일 후보
export type ThumbnailCandidate = {
  url: string;        // 원본(또는 large) 이미지 URL
  thumbUrl: string;   // 미리보기 URL
  source: string;     // "pexels" | "pixabay"
  photographer?: string;
  sourceUrl?: string; // 출처 페이지
};

// ── 후기 자동화: 채팅별 취향/지침 메모리 ──
// 매 후기 처리 때 Gemini 프롬프트에 주입되는 표준 지침
export const botPreferences = pgTable("bot_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chatId: text("chat_id").notNull(),
  instruction: text("instruction").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBotPreferenceSchema = createInsertSchema(botPreferences).omit({
  id: true,
  createdAt: true,
});

export type InsertBotPreference = z.infer<typeof insertBotPreferenceSchema>;
export type BotPreference = typeof botPreferences.$inferSelect;

// Inquiries table (문의 및 상담 신청)
export const inquiries = pgTable("inquiries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  contact: text("contact").notNull(),          // 전화번호 or 이메일
  contactType: text("contact_type").notNull(), // "sms" | "email"
  content: text("content").notNull(),
  status: text("status").notNull().default("접수완료"), // "접수완료" | "답변완료"
  adminReply: text("admin_reply"),
  accessToken: text("access_token").unique(), // 사용자 스레드 접근용 고유 토큰
  createdAt: timestamp("created_at").defaultNow().notNull(),
  repliedAt: timestamp("replied_at"),
});

export const insertInquirySchema = createInsertSchema(inquiries).omit({
  id: true,
  createdAt: true,
});

export type InsertInquiry = z.infer<typeof insertInquirySchema>;
export type Inquiry = typeof inquiries.$inferSelect;

// Inquiry Messages table (문의 스레드 메시지)
export const inquiryMessages = pgTable("inquiry_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  inquiryId: varchar("inquiry_id").notNull(),
  senderType: text("sender_type").notNull(), // "user" | "admin"
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertInquiryMessageSchema = createInsertSchema(inquiryMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertInquiryMessage = z.infer<typeof insertInquiryMessageSchema>;
export type InquiryMessage = typeof inquiryMessages.$inferSelect;

// Experience Zone 진단 로그 (댓글)
export const experienceComments = pgTable("experience_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pageId: text("page_id").notNull(),          // e.g. "alone-fate"
  nickname: text("nickname").notNull(),
  totalStrokes: integer("total_strokes"),     // 계산된 총운 (선택)
  content: text("content").notNull(),
  isPrivate: boolean("is_private").default(false).notNull(),
  notifyContact: text("notify_contact"),      // 답변 알림 연락처 (선택)
  notifyContactType: text("notify_contact_type"), // "sms" | "email"
  reply: text("reply"),                       // 원장님 답글
  repliedAt: timestamp("replied_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertExperienceCommentSchema = createInsertSchema(experienceComments).omit({
  id: true,
  createdAt: true,
});

export type InsertExperienceComment = z.infer<typeof insertExperienceCommentSchema>;
export type ExperienceComment = typeof experienceComments.$inferSelect;

// ============================================================================
// KNOP (Korea Name Operation Platform) — 운영 플랫폼 MVP1
// 구조: Customer → Project → Timeline / Files / Calendar
// ============================================================================

// 전화번호 정규화: 숫자만 남김 (010-1234-5678 == 01012345678)
export function normalizePhone(phone: string): string {
  return (phone || "").replace(/\D/g, "");
}

// 프로젝트 유형 (설계서 §Customer 예시)
export const KNOP_PROJECT_TYPES = [
  "이름분석",
  "개인 개명",
  "가족 개명",
  "전화번호 작명",
  "차량번호 분석",
  "사업자명",
  "자녀 작명",
  "교육",
] as const;

// 프로젝트/구성원 상태값 (설계서 §24)
export const KNOP_STATUSES = [
  "상담 신청",
  "상담비 결제대기",
  "상담비 결제확인 대기",
  "상담비 결제완료",
  "상담예약 완료",
  "이름분석 상담 완료",
  "개명의뢰 접수",
  "개명비 결제대기",
  "개명비 결제확인 대기",
  "개명비 결제완료",
  "이름작업 진행중",
  "새 이름 상담 예정",
  "새 이름 상담 완료",
  "전화번호 상담 예정",
  "전화번호 상담 완료",
  "개명 신청 안내 완료",
  "개명 신청 전",
  "개명 신청 완료",
  "법원 허가 대기",
  "법원 허가 완료",
  "생활정보 변경 확인 중",
  "변화 확인",
  "후기 요청",
  "장기관리",
  "보류",
  "연락 중지",
  "관리 완료",
] as const;

// 결제 상태
export const KNOP_PAYMENT_STATUSES = ["미결제", "결제확인중", "결제완료"] as const;

// 달력 일정 유형 (설계서 §20)
export const KNOP_EVENT_TYPES = [
  "상담예약",
  "이름분석 상담",
  "새 이름 상담",
  "전화번호 상담",
  "개명 신청 확인",
  "법원 허가 확인",
  "변화 확인",
  "후기 요청",
  "장기관리",
  "전화 약속",
  "문자 예약",
  "기타",
] as const;

// 달력 일정 상태
export const KNOP_EVENT_STATUSES = ["예정", "확정", "완료", "취소"] as const;

// ── customers: 고객 (최상위) ──
export const customers = pgTable("customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerCode: text("customer_code").unique(),          // 고객번호 K26-0102 (불변 앵커, 개명·번호변경에도 유지)
  kind: text("kind"),                                    // 개명 | 상담 (구분, 편집가능) — 작명완료 있으면 개명
  phoneNaming: boolean("phone_naming").default(false).notNull(), // 전화번호 작명 여부(선택 서비스, 새이름과 병렬). 나중에 문자로 자동감지
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  normalizedPhone: text("normalized_phone").notNull(),
  phoneHistory: text("phone_history"),                   // JSON [{phone,normalized,changedAt}] 옛 번호(번호변경 추적)
  nameHistory: text("name_history"),                     // JSON [{name,changedAt}] 옛 이름(개명 추적)
  email: text("email"),
  memo: text("memo"),
  tags: text("tags"),                                   // JSON string[] (선택)
  sourceConsultationId: varchar("source_consultation_id"), // 상담신청에서 전환된 경우 원본 id
  deletedAt: timestamp("deleted_at"),                    // 휴지통(soft delete). null=활성, 값 있으면 삭제됨
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCustomerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  kind: z.string().optional().nullable(),
  phoneNaming: z.boolean().optional(),
  email: z.string().optional().nullable(),
  memo: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  sourceConsultationId: z.string().optional().nullable(),
});
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;

// ── projects: 프로젝트/케이스 (업무 단위) ──
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull(),
  type: text("type").notNull(),                         // KNOP_PROJECT_TYPES
  title: text("title").notNull(),
  status: text("status").notNull().default("상담 신청"), // KNOP_STATUSES
  paymentStatus: text("payment_status").notNull().default("미결제"),
  consultDate: timestamp("consult_date"),
  nextActionDate: timestamp("next_action_date"),
  memo: text("memo"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProjectSchema = z.object({
  customerId: z.string().min(1),
  type: z.string().min(1),
  title: z.string().min(1),
  status: z.string().optional(),
  paymentStatus: z.string().optional(),
  consultDate: z.string().optional().nullable(),
  nextActionDate: z.string().optional().nullable(),
  memo: z.string().optional().nullable(),
});
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

// ── timeline_events: 통합 타임라인 (설계서 §17) ──
export const timelineEvents = pgTable("timeline_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull(),
  projectId: varchar("project_id"),
  type: text("type").notNull(),                         // note | status_change | file | call | message | event ...
  title: text("title").notNull(),
  content: text("content"),
  metadata: text("metadata"),                           // JSON string (선택)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTimelineEventSchema = z.object({
  customerId: z.string().min(1),
  projectId: z.string().optional().nullable(),
  type: z.string().min(1),
  title: z.string().min(1),
  content: z.string().optional().nullable(),
  metadata: z.record(z.any()).optional().nullable(),
});
export type InsertTimelineEvent = z.infer<typeof insertTimelineEventSchema>;
export type TimelineEvent = typeof timelineEvents.$inferSelect;

// ── crm_files: 파일 첨부 (기존 이름분석표/자료 연결, 설계서 §19) ──
export const crmFiles = pgTable("crm_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull(),
  projectId: varchar("project_id"),
  fileName: text("file_name").notNull(),
  fileType: text("file_type"),
  fileUrl: text("file_url").notNull(),                  // /objects/... 경로
  memo: text("memo"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export const insertCrmFileSchema = z.object({
  customerId: z.string().min(1),
  projectId: z.string().optional().nullable(),
  fileName: z.string().min(1),
  fileType: z.string().optional().nullable(),
  fileUrl: z.string().min(1),
  memo: z.string().optional().nullable(),
});
export type InsertCrmFile = z.infer<typeof insertCrmFileSchema>;
export type CrmFile = typeof crmFiles.$inferSelect;

// ── calendar_events: 전용 달력 (설계서 §20) ──
export const calendarEvents = pgTable("calendar_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id"),
  projectId: varchar("project_id"),
  title: text("title").notNull(),
  type: text("type").notNull().default("기타"),          // KNOP_EVENT_TYPES
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at"),
  status: text("status").notNull().default("예정"),      // KNOP_EVENT_STATUSES
  memo: text("memo"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCalendarEventSchema = z.object({
  customerId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  title: z.string().min(1),
  type: z.string().optional(),
  startAt: z.string().min(1),   // ISO
  endAt: z.string().optional().nullable(),
  status: z.string().optional(),
  memo: z.string().optional().nullable(),
});
export type InsertCalendarEvent = z.infer<typeof insertCalendarEventSchema>;
export type CalendarEvent = typeof calendarEvents.$inferSelect;

// ── ai_inbox: 결제 문자 AI 분석·매칭 (설계서 §4·16) ──
// status: pending(추천) → approved(승인) / dismissed(무시)
export const aiInbox = pgTable("ai_inbox", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  source: text("source").notNull().default("sms"),      // sms | manual | card
  sender: text("sender"),                               // 발신번호/발신처 (선택)
  rawText: text("raw_text").notNull(),                  // 원문 문자
  parsed: text("parsed"),                               // JSON: {isPayment,kind,depositorName,amount,method,institution,occurredAt}
  suggestions: text("suggestions"),                     // JSON: [{customerId,customerName,projectId,projectTitle,score}]
  suggestedCustomerId: varchar("suggested_customer_id"),
  suggestedProjectId: varchar("suggested_project_id"),
  confidence: integer("confidence").default(0).notNull(), // 0~100
  status: text("status").notNull().default("pending"),  // pending | approved | dismissed
  approvedCustomerId: varchar("approved_customer_id"),
  approvedProjectId: varchar("approved_project_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});

export const insertAiInboxSchema = z.object({
  source: z.string().optional(),
  sender: z.string().optional().nullable(),
  rawText: z.string().min(1),
});
export type InsertAiInbox = z.infer<typeof insertAiInboxSchema>;
export type AiInbox = typeof aiInbox.$inferSelect;

// AI가 파싱한 결제 정보
export type ParsedPayment = {
  isPayment: boolean;
  kind: string;          // 입금 | 카드결제 | 기타
  depositorName: string; // 입금자/결제자 (없으면 "")
  amount: number;        // 원 (없으면 0)
  method: string;        // 현금 | 카드 | 기타
  institution: string;   // 은행/카드사 (없으면 "")
  occurredAt: string;    // 원문의 시간 문자열 (없으면 "")
};

// 매칭 후보
export type InboxSuggestion = {
  customerId: string;
  customerName: string;
  projectId: string | null;
  projectTitle: string | null;
  score: number; // 0~100
};

// ── calls: 통화 녹음 + STT/AI 요약 (설계서 §18) ──
export const calls = pgTable("calls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull(),
  projectId: varchar("project_id"),
  phone: text("phone"),
  direction: text("direction").default("수신").notNull(), // 수신 | 발신
  callDate: timestamp("call_date"),
  durationSeconds: integer("duration_seconds"),
  audioFileUrl: text("audio_file_url"),                  // /objects/... 경로
  transcriptText: text("transcript_text"),               // 전사 원문(수정 반영 최신본)
  originalTranscript: text("original_transcript"),       // 최초 기계 전사(수정률 계산 기준, 불변)
  summaryText: text("summary_text"),                     // AI 요약
  actionItems: text("action_items"),                     // JSON string[]
  words: text("words"),                                  // JSON: [{word,start,end,speaker?}] 음성연동/화자구분용
  memo: text("memo"),
  status: text("status").default("done").notNull(),      // processing | done | failed
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 전사 단어 (음성 연동 + 화자 구분)
export type TranscriptWord = { word: string; start: number; end: number; speaker?: string };

// ── short_links: 긴 /objects/ 주소를 /s/{slug} 짧은 링크로 (문자 발송용) ──
export const shortLinks = pgTable("short_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar("slug").notNull().unique(),          // 짧은 코드 (예: a1B2c3)
  target: text("target").notNull(),                   // 실제 목적지 (/objects/... 또는 외부 URL)
  label: text("label"),                               // 관리용 이름
  kind: text("kind").default("other").notNull(),      // image | video | other
  clicks: integer("clicks").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── notice_steps: 개명 자동관리 2세트 × 4단계(안내+3주 점검) 문구 ──
// setKey: gaemyeong_request(개명의뢰/미용감사) | gaemyeong_approved(개명허가/정화하기)
export const noticeSteps = pgTable("notice_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  setKey: text("set_key").notNull(),
  step: integer("step").notNull(),                    // 0=안내, 1/2/3=주차 점검
  name: text("name").notNull(),                       // 예: "미용감사 안내"
  body: text("body").notNull().default(""),           // 문구(원장님 편집)
  offsetDays: integer("offset_days").notNull(),       // 트리거로부터 며칠 뒤 발송
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── notice_assets: 세트 안내문자에 붙는 이미지/영상(짧은 링크) — 개명의뢰 안내에만 사용 ──
export const noticeAssets = pgTable("notice_assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  setKey: text("set_key").notNull(),
  kind: text("kind").notNull(),                       // image | video
  title: text("title").notNull(),                     // 예: "이름분석표", "안내영상"
  shortLinkId: varchar("short_link_id").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── notice_runs: 고객별 시퀀스 상태(중복 방지) ──
// status: pending(개명의뢰 확인 대기) | active(예약 발송 시작됨)
export const noticeRuns = pgTable("notice_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull(),
  setKey: text("set_key").notNull(),
  status: text("status").default("active").notNull(),
  reason: text("reason"),                             // 감지 근거(예: "개명비 220만원 입금")
  nameDate: text("name_date"),                        // 새이름 내어주기 제안일(입금+2개월, YYYY-MM-DD)
  flaggedAt: timestamp("flagged_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),                 // active 전환(예약 생성) 시각
});

// ── correction_rules: 공유 학습 교정사전 (KNOP↔영상봇, 어디서 고치든 DB에 누적) ──
// 로컬 서버가 전사 직전 DB→<video-caption-bot>/learned_corrections.json 로 내려받아 correct.py 에 반영.
export const correctionRules = pgTable("correction_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  wrong: text("wrong").notNull().unique(),          // 틀린말
  right: text("right").notNull(),                    // 맞는말
  count: integer("count").default(0).notNull(),      // 누적 횟수
  enabled: boolean("enabled").default(true).notNull(),
  source: text("source").default("learned").notNull(), // learned | manual
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── sms_templates: 문자 템플릿 (설계서 §23) ──
export const smsTemplates = pgTable("sms_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),                    // 예: "상담 하루 전 안내"
  category: text("category").notNull().default("기타"),
  content: text("content").notNull(),              // {이름} {날짜} {시간} 등 변수 사용 가능
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSmsTemplateSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  content: z.string().min(1),
});
export type InsertSmsTemplate = z.infer<typeof insertSmsTemplateSchema>;
export type SmsTemplate = typeof smsTemplates.$inferSelect;

// ── scheduled_messages: 예약/발송 문자 (설계서 §5·17·25) ──
// status: scheduled(예약) → sent(발송완료) / failed(실패) / canceled(취소)
export const scheduledMessages = pgTable("scheduled_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id"),
  projectId: varchar("project_id"),
  phone: text("phone").notNull(),
  content: text("content").notNull(),
  templateId: varchar("template_id"),
  direction: text("direction").default("발신").notNull(),
  status: text("status").notNull().default("scheduled"),
  scheduledAt: timestamp("scheduled_at").notNull(),  // 예약 시각(즉시는 now)
  sentAt: timestamp("sent_at"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertScheduledMessageSchema = z.object({
  customerId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  phone: z.string().min(1),
  content: z.string().min(1),
  templateId: z.string().optional().nullable(),
  scheduledAt: z.string().optional().nullable(),     // ISO, 없으면 즉시
});
export type InsertScheduledMessage = z.infer<typeof insertScheduledMessageSchema>;
export type ScheduledMessage = typeof scheduledMessages.$inferSelect;

// 문자 템플릿 카테고리
export const SMS_TEMPLATE_CATEGORIES = [
  "상담 안내",
  "결제 안내",
  "새 이름 상담",
  "전화번호 상담",
  "개명 후속",
  "후기/장기관리",
  "기타",
] as const;

export const insertCallSchema = z.object({
  customerId: z.string().min(1),
  projectId: z.string().optional().nullable(),
  audioFileUrl: z.string().min(1),
  phone: z.string().optional().nullable(),
  direction: z.string().optional(),
  callDate: z.string().optional().nullable(),
  memo: z.string().optional().nullable(),
});
export type InsertCall = z.infer<typeof insertCallSchema>;
export type Call = typeof calls.$inferSelect;

// ── 문자→달력 자동등록: 안드로이드 문자전달 앱이 보내는 수신 문자 누적 ──
export const incomingSms = pgTable("incoming_sms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactName: text("contact_name"),                    // 연락처 저장명 "홍길동 260711 홍익" (앱이 보내주면)
  phone: text("phone").notNull(),                        // 발신번호 (스레드 키)
  body: text("body").notNull(),                          // 문자 본문
  direction: text("direction").default("수신").notNull(), // 수신 | 발신
  receivedAt: timestamp("received_at").defaultNow().notNull(),
  processed: boolean("processed").default(false).notNull(), // 이 스레드로 달력 이벤트 생성됨 여부
  createdEventDate: text("created_event_date"),          // 생성된 상담 이벤트 날짜(중복방지)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertIncomingSmsSchema = z.object({
  contactName: z.string().optional().nullable(),
  phone: z.string().min(1),
  body: z.string().min(1),
  direction: z.string().optional(),
  receivedAt: z.string().optional().nullable(),  // ISO, 없으면 now
});
export type InsertIncomingSms = z.infer<typeof insertIncomingSmsSchema>;
export type IncomingSms = typeof incomingSms.$inferSelect;

// ── 인스타 자동화: 웹훅 수신 원문 로그 ──
// Meta는 응답이 늦거나 실패하면 같은 이벤트를 재전송한다. dedupeKey 유니크 제약으로
// "댓글당 DM 1회" 정책을 앱 로직이 아닌 DB 레벨에서 강제한다(중복 발송 = 계정 제재 위험).
export const igEvents = pgTable("ig_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  kind: text("kind").notNull(),                        // comment | message | other
  dedupeKey: text("dedupe_key").notNull().unique(),    // 댓글=comment_id, DM=message.mid
  igAccountId: text("ig_account_id"),                  // 이벤트를 받은 내 IG 계정 id
  fromId: text("from_id"),                             // 보낸 사람 IGSID
  fromUsername: text("from_username"),                 // 댓글 웹훅에만 포함(DM 웹훅엔 없음)
  mediaId: text("media_id"),                           // 댓글이 달린 미디어
  parentId: text("parent_id"),                         // 값이 있으면 대댓글, 없으면 최상위 댓글
  text: text("text"),
  isEcho: boolean("is_echo").default(false).notNull(), // 내가 보낸 DM의 메아리 → 자동응답 금지
  raw: text("raw").notNull(),                          // 원문 JSON (실제 페이로드 형태 검증용)
  receivedAt: timestamp("received_at").defaultNow().notNull(),
});
export type IgEvent = typeof igEvents.$inferSelect;
