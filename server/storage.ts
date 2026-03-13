import { type User, type InsertUser, type Consultation, type InsertConsultation, type NameStory, type InsertNameStory, nameStories, type Content, type InsertContent, type ContentCategory, contents } from "@shared/schema";
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
}

export class DatabaseStorage implements IStorage {
  private users: Map<string, User>;
  private consultations: Map<string, Consultation>;
  private db: any;
  private dbAvailable: boolean = false;
  private dbInitPromise: Promise<void>;
  private dbInitError: string | null = null;

  constructor() {
    this.users = new Map();
    this.consultations = new Map();
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
}

export const storage = new DatabaseStorage();
