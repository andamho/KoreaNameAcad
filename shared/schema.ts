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
