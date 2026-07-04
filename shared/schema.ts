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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  repliedAt: timestamp("replied_at"),
});

export const insertInquirySchema = createInsertSchema(inquiries).omit({
  id: true,
  createdAt: true,
});

export type InsertInquiry = z.infer<typeof insertInquirySchema>;
export type Inquiry = typeof inquiries.$inferSelect;

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
