import { type User, type InsertUser, type Consultation, type InsertConsultation, type NameStory, type InsertNameStory, nameStories, type Content, type InsertContent, type ContentCategory, contents, consultations, type ExperienceComment, type InsertExperienceComment, experienceComments, type Inquiry, type InsertInquiry, inquiries, type InquiryMessage, inquiryMessages, type ReviewDraft, type InsertReviewDraft, reviewDrafts, type BotPreference, botPreferences } from "@shared/schema";
import { randomUUID } from "crypto";
import { eq, desc, sql } from "drizzle-orm";

export class DatabaseError extends Error {
  public readonly code: string;
  constructor(message: string, code = "DATABASE_UNAVAILABLE") {
    super(message);
    this.name = "DatabaseError";
    this.code = code;
  }
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  createConsultation(consultation: InsertConsultation): Promise<Consultation>;
  getAllConsultations(): Promise<Consultation[]>;
  getConsultation(id: string): Promise<Consultation | undefined>;
  
  createNameStory(story: InsertNameStory): Promise<NameStory>;
  getAllNameStories(): Promise<NameStory[]>;
  getNameStory(id: string): Promise<NameStory | undefined>;
  updateNameStory(id: string, story: Partial<InsertNameStory>): Promise<NameStory | undefined>;
  deleteNameStory(id: string): Promise<boolean>;
  
  // Content CMS methods
  createContent(content: InsertContent): Promise<Content>;
  getAllContents(category?: ContentCategory): Promise<Content[]>;
  getContent(id: string): Promise<Content | undefined>;
  updateContent(id: string, content: Partial<InsertContent>): Promise<Content | undefined>;
  deleteContent(id: string): Promise<boolean>;

  getExperienceComments(pageId: string): Promise<ExperienceComment[]>;
  createExperienceComment(comment: InsertExperienceComment): Promise<ExperienceComment>;
  deleteExperienceComment(id: string): Promise<void>;
  replyToExperienceComment(id: string, reply: string): Promise<ExperienceComment>;
  editExperienceCommentReply(id: string, index: number, text: string): Promise<ExperienceComment>;
  deleteExperienceCommentReply(id: string, index: number): Promise<ExperienceComment>;

  createInquiry(inquiry: InsertInquiry): Promise<Inquiry>;
  getAllInquiries(): Promise<Inquiry[]>;
  getInquiry(id: string): Promise<Inquiry | undefined>;
  getInquiryByToken(token: string): Promise<Inquiry | undefined>;
  replyToInquiry(id: string, reply: string): Promise<Inquiry>;
  deleteInquiry(id: string): Promise<void>;
  addInquiryMessage(inquiryId: string, senderType: string, content: string): Promise<InquiryMessage>;
  getInquiryMessages(inquiryId: string): Promise<InquiryMessage[]>;
  editInquiryMessage(id: string, content: string): Promise<InquiryMessage>;
  deleteInquiryMessage(id: string): Promise<void>;

  // 후기 자동화 초안
  createReviewDraft(draft: InsertReviewDraft): Promise<ReviewDraft>;
  getReviewDraft(id: string): Promise<ReviewDraft | undefined>;
  updateReviewDraft(id: string, data: Partial<InsertReviewDraft>): Promise<ReviewDraft | undefined>;
  getLatestReviewDraftByChat(chatId: string): Promise<ReviewDraft | undefined>;

  // 채팅별 취향/지침 메모리
  getPreferences(chatId: string): Promise<BotPreference[]>;
  addPreference(chatId: string, instruction: string): Promise<BotPreference>;
  deletePreference(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private consultations: Map<string, Consultation>;
  private nameStoriesMap: Map<string, NameStory>;
  private contentsMap: Map<string, Content>;

  constructor() {
    this.users = new Map();
    this.consultations = new Map();
    this.nameStoriesMap = new Map();
    this.contentsMap = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async createConsultation(insertConsultation: InsertConsultation): Promise<Consultation> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const consultation: Consultation = { ...insertConsultation, id, createdAt };
    this.consultations.set(id, consultation);
    return consultation;
  }

  async getAllConsultations(): Promise<Consultation[]> {
    return Array.from(this.consultations.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getConsultation(id: string): Promise<Consultation | undefined> {
    return this.consultations.get(id);
  }

  async createNameStory(insertStory: InsertNameStory): Promise<NameStory> {
    const id = randomUUID();
    const now = new Date();
    const story: NameStory = {
      id,
      title: insertStory.title,
      thumbnail: insertStory.thumbnail ?? null,
      content: insertStory.content,
      videoUrl: insertStory.videoUrl ?? null,
      isVideo: insertStory.isVideo ?? false,
      createdAt: now,
      updatedAt: now,
    };
    this.nameStoriesMap.set(id, story);
    return story;
  }

  async getAllNameStories(): Promise<NameStory[]> {
    return Array.from(this.nameStoriesMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getNameStory(id: string): Promise<NameStory | undefined> {
    return this.nameStoriesMap.get(id);
  }

  async updateNameStory(id: string, updateData: Partial<InsertNameStory>): Promise<NameStory | undefined> {
    const existing = this.nameStoriesMap.get(id);
    if (!existing) return undefined;
    const updated: NameStory = {
      ...existing,
      ...updateData,
      updatedAt: new Date(),
    };
    this.nameStoriesMap.set(id, updated);
    return updated;
  }

  async deleteNameStory(id: string): Promise<boolean> {
    return this.nameStoriesMap.delete(id);
  }

  // Content CMS methods
  async createContent(insertContent: InsertContent): Promise<Content> {
    const id = randomUUID();
    const now = new Date();
    const content: Content = {
      id,
      category: insertContent.category,
      title: insertContent.title,
      thumbnail: insertContent.thumbnail ?? null,
      content: insertContent.content,
      videoUrl: insertContent.videoUrl ?? null,
      isVideo: insertContent.isVideo ?? false,
      isDraft: insertContent.isDraft ?? false,
      createdAt: now,
      updatedAt: now,
    };
    this.contentsMap.set(id, content);
    return content;
  }

  async getAllContents(category?: ContentCategory): Promise<Content[]> {
    let items = Array.from(this.contentsMap.values());
    if (category) {
      items = items.filter(c => c.category === category);
    }
    return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getContent(id: string): Promise<Content | undefined> {
    return this.contentsMap.get(id);
  }

  async updateContent(id: string, updateData: Partial<InsertContent>): Promise<Content | undefined> {
    const existing = this.contentsMap.get(id);
    if (!existing) return undefined;
    const updated: Content = {
      ...existing,
      ...updateData,
      updatedAt: new Date(),
    };
    this.contentsMap.set(id, updated);
    return updated;
  }

  async deleteContent(id: string): Promise<boolean> {
    return this.contentsMap.delete(id);
  }

  async getExperienceComments(_pageId: string): Promise<ExperienceComment[]> { return []; }
  async createExperienceComment(comment: InsertExperienceComment): Promise<ExperienceComment> {
    return { ...comment, id: randomUUID(), createdAt: new Date(), isPrivate: comment.isPrivate ?? false, totalStrokes: comment.totalStrokes ?? null, notifyContact: comment.notifyContact ?? null, notifyContactType: comment.notifyContactType ?? null, reply: null, repliedAt: null };
  }
  async deleteExperienceComment(_id: string): Promise<void> {}
  async replyToExperienceComment(_id: string, _reply: string): Promise<ExperienceComment> { throw new Error("Not implemented"); }
  async editExperienceCommentReply(_id: string, _index: number, _text: string): Promise<ExperienceComment> { throw new Error("Not implemented"); }
  async deleteExperienceCommentReply(_id: string, _index: number): Promise<ExperienceComment> { throw new Error("Not implemented"); }

  async createInquiry(_inquiry: InsertInquiry): Promise<Inquiry> { throw new Error("Not implemented"); }
  async getAllInquiries(): Promise<Inquiry[]> { return []; }
  async getInquiry(_id: string): Promise<Inquiry | undefined> { return undefined; }
  async getInquiryByToken(_token: string): Promise<Inquiry | undefined> { return undefined; }
  async replyToInquiry(_id: string, _reply: string): Promise<Inquiry> { throw new Error("Not implemented"); }
  async deleteInquiry(_id: string): Promise<void> {}
  async addInquiryMessage(_inquiryId: string, _senderType: string, _content: string): Promise<InquiryMessage> { throw new Error("Not implemented"); }
  async getInquiryMessages(_inquiryId: string): Promise<InquiryMessage[]> { return []; }
  async editInquiryMessage(_id: string, _content: string): Promise<InquiryMessage> { throw new Error("Not implemented"); }
  async deleteInquiryMessage(_id: string): Promise<void> { throw new Error("Not implemented"); }

  private reviewDraftsMap: Map<string, ReviewDraft> = new Map();
  async createReviewDraft(draft: InsertReviewDraft): Promise<ReviewDraft> {
    const id = randomUUID();
    const now = new Date();
    const row = { id, createdAt: now, updatedAt: now, ...draft } as unknown as ReviewDraft;
    this.reviewDraftsMap.set(id, row);
    return row;
  }
  async getReviewDraft(id: string): Promise<ReviewDraft | undefined> { return this.reviewDraftsMap.get(id); }
  async updateReviewDraft(id: string, data: Partial<InsertReviewDraft>): Promise<ReviewDraft | undefined> {
    const existing = this.reviewDraftsMap.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data, updatedAt: new Date() } as ReviewDraft;
    this.reviewDraftsMap.set(id, updated);
    return updated;
  }
  async getLatestReviewDraftByChat(chatId: string): Promise<ReviewDraft | undefined> {
    return Array.from(this.reviewDraftsMap.values())
      .filter(d => d.chatId === chatId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  }

  private preferencesMap: Map<string, BotPreference> = new Map();
  async getPreferences(chatId: string): Promise<BotPreference[]> {
    return Array.from(this.preferencesMap.values())
      .filter(p => p.chatId === chatId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  async addPreference(chatId: string, instruction: string): Promise<BotPreference> {
    const row: BotPreference = { id: randomUUID(), chatId, instruction, createdAt: new Date() };
    this.preferencesMap.set(row.id, row);
    return row;
  }
  async deletePreference(id: string): Promise<boolean> {
    return this.preferencesMap.delete(id);
  }
}

// DB row → Consultation type 변환 헬퍼
function rowToConsultation(row: typeof consultations.$inferSelect): Consultation {
  return {
    id: row.id,
    type: row.type as "analysis" | "naming",
    numPeople: row.numPeople,
    peopleData: JSON.parse(row.peopleData),
    phone: row.phone,
    hasNameChange: row.hasNameChange,
    numNameChanges: row.numNameChanges ?? undefined,
    nameChangeData: row.nameChangeData ? JSON.parse(row.nameChangeData) : undefined,
    evaluationKoreanName: row.evaluationKoreanName ?? undefined,
    evaluationChineseName: row.evaluationChineseName ?? undefined,
    reason: row.reason,
    referralSource: row.referralSource ?? undefined,
    referrerName: row.referrerName ?? undefined,
    depositorName: row.depositorName,
    consultationTime: row.consultationTime,
    fileName: row.fileName ?? undefined,
    fileData: row.fileData ?? undefined,
    fileType: row.fileType ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

export class DatabaseStorage implements IStorage {
  private users: Map<string, User>;
  private db: any;
  private dbAvailable: boolean = false;
  private dbInitPromise: Promise<void>;
  private dbInitError: string | null = null;

  constructor() {
    this.users = new Map();
    this.dbInitPromise = this.initDatabase();
  }

  // Expose DB status for health check
  async getDbStatus(): Promise<{ available: boolean; error: string | null }> {
    await this.dbInitPromise;
    return { available: this.dbAvailable, error: this.dbInitError };
  }

  private async initDatabase() {
    const MAX_RETRIES = 5;
    const RETRY_DELAY_MS = 2000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`📦 DB 연결 시도 ${attempt}/${MAX_RETRIES}...`);
        const { db } = await import("./db");
        if (!db) {
          this.dbInitError = "Database module returned null - DATABASE_URL may be missing";
          console.error("❌", this.dbInitError);
          this.dbAvailable = false;
          return;
        }
        this.db = db;
        console.log("🔍 Testing database connection with SELECT 1...");
        await db.execute(sql`SELECT 1`);
        this.dbAvailable = true;
        this.dbInitError = null;
        console.log(`✅ Database connection established successfully (attempt ${attempt})`);
        return;
      } catch (error: any) {
        this.dbInitError = `${error?.name}: ${error?.message}`;
        console.error(`❌ DB init failed (attempt ${attempt}/${MAX_RETRIES}):`);
        console.error("   Error:", error?.message);
        if (attempt < MAX_RETRIES) {
          console.log(`⏳ Retrying in ${RETRY_DELAY_MS}ms...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
    }
    console.error(`❌ DB connection failed after ${MAX_RETRIES} attempts. Running without database.`);
    this.dbAvailable = false;
  }

  // Ensure database is ready before any operation — throws DatabaseError if not
  private async ensureDbReady(): Promise<void> {
    await this.dbInitPromise;
    if (!this.dbAvailable || !this.db) {
      throw new DatabaseError(
        `DB 사용 불가: ${this.dbInitError || "unknown error"}`,
        "DATABASE_UNAVAILABLE"
      );
    }
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async createConsultation(insertConsultation: InsertConsultation): Promise<Consultation> {
    await this.ensureDbReady();
    try {
      const [row] = await this.db.insert(consultations).values({
        type: insertConsultation.type,
        numPeople: insertConsultation.numPeople,
        peopleData: JSON.stringify(insertConsultation.peopleData),
        phone: insertConsultation.phone,
        hasNameChange: insertConsultation.hasNameChange,
        numNameChanges: insertConsultation.numNameChanges ?? null,
        nameChangeData: insertConsultation.nameChangeData ? JSON.stringify(insertConsultation.nameChangeData) : null,
        evaluationKoreanName: insertConsultation.evaluationKoreanName ?? null,
        evaluationChineseName: insertConsultation.evaluationChineseName ?? null,
        reason: insertConsultation.reason,
        referralSource: insertConsultation.referralSource ?? null,
        referrerName: insertConsultation.referrerName ?? null,
        depositorName: insertConsultation.depositorName,
        consultationTime: insertConsultation.consultationTime,
        fileName: insertConsultation.fileName ?? null,
        fileData: insertConsultation.fileData ?? null,
        fileType: insertConsultation.fileType ?? null,
      }).returning();
      console.log(`[DB] createConsultation 성공: ${row.id}`);
      return rowToConsultation(row);
    } catch (error: any) {
      console.error(`[DB ERROR] createConsultation: ${error?.message}`, { timestamp: new Date().toISOString() });
      throw new DatabaseError(`상담 저장 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async getAllConsultations(): Promise<Consultation[]> {
    await this.ensureDbReady();
    try {
      const rows = await this.db.select().from(consultations).orderBy(desc(consultations.createdAt));
      return rows.map(rowToConsultation);
    } catch (error: any) {
      console.error(`[DB ERROR] getAllConsultations: ${error?.message}`, { timestamp: new Date().toISOString() });
      throw new DatabaseError(`조회 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async getConsultation(id: string): Promise<Consultation | undefined> {
    await this.ensureDbReady();
    try {
      const [row] = await this.db.select().from(consultations).where(eq(consultations.id, id));
      return row ? rowToConsultation(row) : undefined;
    } catch (error: any) {
      console.error(`[DB ERROR] getConsultation(${id}): ${error?.message}`, { timestamp: new Date().toISOString() });
      throw new DatabaseError(`조회 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async createNameStory(insertStory: InsertNameStory): Promise<NameStory> {
    await this.ensureDbReady();
    try {
      const [story] = await this.db.insert(nameStories).values({
        title: insertStory.title,
        thumbnail: insertStory.thumbnail,
        content: insertStory.content,
        videoUrl: insertStory.videoUrl,
        isVideo: insertStory.isVideo ?? false,
      }).returning();
      return story;
    } catch (error: any) {
      console.error(`[DB ERROR] createNameStory: ${error?.message}`, { timestamp: new Date().toISOString() });
      throw new DatabaseError(`삽입 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async getAllNameStories(): Promise<NameStory[]> {
    await this.ensureDbReady();
    try {
      return await this.db.select().from(nameStories).orderBy(desc(nameStories.createdAt));
    } catch (error: any) {
      console.error(`[DB ERROR] getAllNameStories: ${error?.message}`, { timestamp: new Date().toISOString() });
      throw new DatabaseError(`쿼리 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async getNameStory(id: string): Promise<NameStory | undefined> {
    await this.ensureDbReady();
    try {
      const [story] = await this.db.select().from(nameStories).where(eq(nameStories.id, id));
      return story;
    } catch (error: any) {
      console.error(`[DB ERROR] getNameStory(${id}): ${error?.message}`, { timestamp: new Date().toISOString() });
      throw new DatabaseError(`쿼리 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async updateNameStory(id: string, updateData: Partial<InsertNameStory>): Promise<NameStory | undefined> {
    await this.ensureDbReady();
    try {
      const [updated] = await this.db.update(nameStories)
        .set({ ...updateData, updatedAt: new Date() })
        .where(eq(nameStories.id, id))
        .returning();
      return updated;
    } catch (error: any) {
      console.error(`[DB ERROR] updateNameStory(${id}): ${error?.message}`, { timestamp: new Date().toISOString() });
      throw new DatabaseError(`업데이트 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async deleteNameStory(id: string): Promise<boolean> {
    await this.ensureDbReady();
    try {
      const result = await this.db.delete(nameStories).where(eq(nameStories.id, id)).returning();
      return result.length > 0;
    } catch (error: any) {
      console.error(`[DB ERROR] deleteNameStory(${id}): ${error?.message}`, { timestamp: new Date().toISOString() });
      throw new DatabaseError(`삭제 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  // Content CMS methods
  async createContent(insertContent: InsertContent): Promise<Content> {
    await this.ensureDbReady();
    try {
      const [content] = await this.db.insert(contents).values({
        category: insertContent.category,
        title: insertContent.title,
        thumbnail: insertContent.thumbnail,
        content: insertContent.content,
        videoUrl: insertContent.videoUrl,
        isVideo: insertContent.isVideo ?? false,
        isDraft: insertContent.isDraft ?? false,
      }).returning();
      console.log(`[DB] createContent 성공: ${content.id}`);
      return content;
    } catch (error: any) {
      console.error(`[DB ERROR] createContent: ${error?.message}`, { timestamp: new Date().toISOString() });
      throw new DatabaseError(`삽입 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async getAllContents(category?: ContentCategory): Promise<Content[]> {
    await this.ensureDbReady();
    try {
      const result = category
        ? await this.db.select().from(contents).where(eq(contents.category, category)).orderBy(desc(contents.createdAt))
        : await this.db.select().from(contents).orderBy(desc(contents.createdAt));
      console.log(`[DB] getAllContents(${category ?? "all"}) → ${result.length}건`);
      return result;
    } catch (error: any) {
      console.error(`[DB ERROR] getAllContents(${category}): ${error?.message}`, { timestamp: new Date().toISOString() });
      throw new DatabaseError(`쿼리 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async getContent(id: string): Promise<Content | undefined> {
    await this.ensureDbReady();
    try {
      const [content] = await this.db.select().from(contents).where(eq(contents.id, id));
      return content;
    } catch (error: any) {
      console.error(`[DB ERROR] getContent(${id}): ${error?.message}`, { timestamp: new Date().toISOString() });
      throw new DatabaseError(`쿼리 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async updateContent(id: string, updateData: Partial<InsertContent>): Promise<Content | undefined> {
    await this.ensureDbReady();
    try {
      const [updated] = await this.db.update(contents)
        .set({ ...updateData, updatedAt: new Date() })
        .where(eq(contents.id, id))
        .returning();
      return updated;
    } catch (error: any) {
      console.error(`[DB ERROR] updateContent(${id}): ${error?.message}`, { timestamp: new Date().toISOString() });
      throw new DatabaseError(`업데이트 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async deleteContent(id: string): Promise<boolean> {
    await this.ensureDbReady();
    try {
      const result = await this.db.delete(contents).where(eq(contents.id, id)).returning();
      return result.length > 0;
    } catch (error: any) {
      console.error(`[DB ERROR] deleteContent(${id}): ${error?.message}`, { timestamp: new Date().toISOString() });
      throw new DatabaseError(`삭제 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async getExperienceComments(pageId: string): Promise<ExperienceComment[]> {
    await this.ensureDbReady();
    try {
      return await this.db.select().from(experienceComments)
        .where(eq(experienceComments.pageId, pageId))
        .orderBy(desc(experienceComments.createdAt));
    } catch (error: any) {
      throw new DatabaseError(`댓글 조회 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async createExperienceComment(comment: InsertExperienceComment): Promise<ExperienceComment> {
    await this.ensureDbReady();
    try {
      const [result] = await this.db.insert(experienceComments).values(comment).returning();
      return result;
    } catch (error: any) {
      throw new DatabaseError(`댓글 저장 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async deleteExperienceComment(id: string): Promise<void> {
    await this.ensureDbReady();
    try {
      await this.db.delete(experienceComments).where(eq(experienceComments.id, id));
    } catch (error: any) {
      throw new DatabaseError(`댓글 삭제 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async editExperienceCommentReply(id: string, index: number, text: string): Promise<ExperienceComment> {
    await this.ensureDbReady();
    try {
      const [existing] = await this.db.select().from(experienceComments).where(eq(experienceComments.id, id));
      let replies: Array<{ text: string; createdAt: string }> = [];
      if (existing?.reply) {
        try {
          const parsed = JSON.parse(existing.reply);
          replies = Array.isArray(parsed) ? parsed : [{ text: existing.reply, createdAt: existing.repliedAt?.toISOString() ?? new Date().toISOString() }];
        } catch {
          replies = [{ text: existing.reply, createdAt: existing.repliedAt?.toISOString() ?? new Date().toISOString() }];
        }
      }
      if (index < 0 || index >= replies.length) throw new Error("Invalid reply index");
      replies[index] = { ...replies[index], text };
      const [result] = await this.db.update(experienceComments)
        .set({ reply: JSON.stringify(replies) })
        .where(eq(experienceComments.id, id))
        .returning();
      return result;
    } catch (error: any) {
      throw new DatabaseError(`답글 수정 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async deleteExperienceCommentReply(id: string, index: number): Promise<ExperienceComment> {
    await this.ensureDbReady();
    try {
      const [existing] = await this.db.select().from(experienceComments).where(eq(experienceComments.id, id));
      let replies: Array<{ text: string; createdAt: string }> = [];
      if (existing?.reply) {
        try {
          const parsed = JSON.parse(existing.reply);
          replies = Array.isArray(parsed) ? parsed : [{ text: existing.reply, createdAt: existing.repliedAt?.toISOString() ?? new Date().toISOString() }];
        } catch {
          replies = [{ text: existing.reply, createdAt: existing.repliedAt?.toISOString() ?? new Date().toISOString() }];
        }
      }
      if (index < 0 || index >= replies.length) throw new Error("Invalid reply index");
      replies.splice(index, 1); // 해당 답글만 제거
      const [result] = await this.db.update(experienceComments)
        .set({ reply: replies.length ? JSON.stringify(replies) : null })
        .where(eq(experienceComments.id, id))
        .returning();
      return result;
    } catch (error: any) {
      throw new DatabaseError(`답글 삭제 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async createInquiry(insertInquiry: InsertInquiry): Promise<Inquiry> {
    await this.ensureDbReady();
    try {
      const [row] = await this.db.insert(inquiries).values({
        name: insertInquiry.name,
        contact: insertInquiry.contact,
        contactType: insertInquiry.contactType,
        content: insertInquiry.content,
        status: "접수완료",
        accessToken: insertInquiry.accessToken ?? null,
      }).returning();
      return row;
    } catch (error: any) {
      throw new DatabaseError(`문의 저장 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async getAllInquiries(): Promise<Inquiry[]> {
    await this.ensureDbReady();
    try {
      return await this.db.select().from(inquiries).orderBy(desc(inquiries.createdAt));
    } catch (error: any) {
      throw new DatabaseError(`문의 조회 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async getInquiry(id: string): Promise<Inquiry | undefined> {
    await this.ensureDbReady();
    try {
      const [row] = await this.db.select().from(inquiries).where(eq(inquiries.id, id));
      return row;
    } catch (error: any) {
      throw new DatabaseError(`문의 조회 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async getInquiryByToken(token: string): Promise<Inquiry | undefined> {
    await this.ensureDbReady();
    try {
      const [row] = await this.db.select().from(inquiries).where(eq(inquiries.accessToken, token));
      return row;
    } catch (error: any) {
      throw new DatabaseError(`문의 토큰 조회 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async replyToInquiry(id: string, reply: string): Promise<Inquiry> {
    await this.ensureDbReady();
    try {
      const [row] = await this.db.update(inquiries)
        .set({ adminReply: reply, status: "답변완료", repliedAt: new Date() })
        .where(eq(inquiries.id, id))
        .returning();
      return row;
    } catch (error: any) {
      throw new DatabaseError(`문의 답변 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async deleteInquiry(id: string): Promise<void> {
    await this.ensureDbReady();
    try {
      await this.db.delete(inquiries).where(eq(inquiries.id, id));
    } catch (error: any) {
      throw new DatabaseError(`문의 삭제 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async addInquiryMessage(inquiryId: string, senderType: string, content: string): Promise<InquiryMessage> {
    await this.ensureDbReady();
    try {
      const [row] = await this.db.insert(inquiryMessages).values({ inquiryId, senderType, content }).returning();
      return row;
    } catch (error: any) {
      throw new DatabaseError(`문의 메시지 저장 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async getInquiryMessages(inquiryId: string): Promise<InquiryMessage[]> {
    await this.ensureDbReady();
    try {
      return await this.db.select().from(inquiryMessages)
        .where(eq(inquiryMessages.inquiryId, inquiryId))
        .orderBy(inquiryMessages.createdAt);
    } catch (error: any) {
      throw new DatabaseError(`문의 메시지 조회 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async editInquiryMessage(id: string, content: string): Promise<InquiryMessage> {
    await this.ensureDbReady();
    try {
      const [row] = await this.db.update(inquiryMessages).set({ content })
        .where(eq(inquiryMessages.id, id)).returning();
      if (!row) throw new Error("메시지를 찾을 수 없습니다.");
      return row;
    } catch (error: any) {
      throw new DatabaseError(`문의 메시지 수정 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async deleteInquiryMessage(id: string): Promise<void> {
    await this.ensureDbReady();
    try {
      await this.db.delete(inquiryMessages).where(eq(inquiryMessages.id, id));
    } catch (error: any) {
      throw new DatabaseError(`문의 메시지 삭제 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async createReviewDraft(draft: InsertReviewDraft): Promise<ReviewDraft> {
    await this.ensureDbReady();
    try {
      const [row] = await this.db.insert(reviewDrafts).values(draft).returning();
      console.log(`[DB] createReviewDraft 성공: ${row.id}`);
      return row;
    } catch (error: any) {
      throw new DatabaseError(`후기 초안 저장 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async getReviewDraft(id: string): Promise<ReviewDraft | undefined> {
    await this.ensureDbReady();
    try {
      const [row] = await this.db.select().from(reviewDrafts).where(eq(reviewDrafts.id, id));
      return row;
    } catch (error: any) {
      throw new DatabaseError(`후기 초안 조회 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async updateReviewDraft(id: string, data: Partial<InsertReviewDraft>): Promise<ReviewDraft | undefined> {
    await this.ensureDbReady();
    try {
      const [row] = await this.db.update(reviewDrafts)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(reviewDrafts.id, id))
        .returning();
      return row;
    } catch (error: any) {
      throw new DatabaseError(`후기 초안 수정 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async getLatestReviewDraftByChat(chatId: string): Promise<ReviewDraft | undefined> {
    await this.ensureDbReady();
    try {
      const [row] = await this.db.select().from(reviewDrafts)
        .where(eq(reviewDrafts.chatId, chatId))
        .orderBy(desc(reviewDrafts.createdAt))
        .limit(1);
      return row;
    } catch (error: any) {
      throw new DatabaseError(`후기 초안 조회 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async getPreferences(chatId: string): Promise<BotPreference[]> {
    await this.ensureDbReady();
    try {
      return await this.db.select().from(botPreferences)
        .where(eq(botPreferences.chatId, chatId))
        .orderBy(botPreferences.createdAt);
    } catch (error: any) {
      throw new DatabaseError(`취향 조회 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async addPreference(chatId: string, instruction: string): Promise<BotPreference> {
    await this.ensureDbReady();
    try {
      const [row] = await this.db.insert(botPreferences).values({ chatId, instruction }).returning();
      return row;
    } catch (error: any) {
      throw new DatabaseError(`취향 저장 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async deletePreference(id: string): Promise<boolean> {
    await this.ensureDbReady();
    try {
      const result = await this.db.delete(botPreferences).where(eq(botPreferences.id, id)).returning();
      return result.length > 0;
    } catch (error: any) {
      throw new DatabaseError(`취향 삭제 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }

  async replyToExperienceComment(id: string, reply: string): Promise<ExperienceComment> {
    await this.ensureDbReady();
    try {
      const [existing] = await this.db.select().from(experienceComments).where(eq(experienceComments.id, id));
      let replies: Array<{ text: string; createdAt: string }> = [];
      if (existing?.reply) {
        try {
          const parsed = JSON.parse(existing.reply);
          replies = Array.isArray(parsed) ? parsed : [{ text: existing.reply, createdAt: existing.repliedAt?.toISOString() ?? new Date().toISOString() }];
        } catch {
          replies = [{ text: existing.reply, createdAt: existing.repliedAt?.toISOString() ?? new Date().toISOString() }];
        }
      }
      replies.push({ text: reply, createdAt: new Date().toISOString() });
      const [result] = await this.db.update(experienceComments)
        .set({ reply: JSON.stringify(replies), repliedAt: new Date() })
        .where(eq(experienceComments.id, id))
        .returning();
      return result;
    } catch (error: any) {
      throw new DatabaseError(`답글 저장 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
    }
  }
}

export const storage = new DatabaseStorage();
