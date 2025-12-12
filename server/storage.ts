import { type User, type InsertUser, type Consultation, type InsertConsultation, type NameStory, type InsertNameStory, nameStories } from "@shared/schema";
import { randomUUID } from "crypto";
import { eq, desc } from "drizzle-orm";

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
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private consultations: Map<string, Consultation>;
  private nameStoriesMap: Map<string, NameStory>;

  constructor() {
    this.users = new Map();
    this.consultations = new Map();
    this.nameStoriesMap = new Map();
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
}

export class DatabaseStorage implements IStorage {
  private users: Map<string, User>;
  private consultations: Map<string, Consultation>;
  private db: any;
  private dbAvailable: boolean = false;

  constructor() {
    this.users = new Map();
    this.consultations = new Map();
    this.initDatabase();
  }

  private async initDatabase() {
    try {
      const { db } = await import("./db");
      if (!db) {
        console.warn("Database not initialized, using memory storage");
        this.dbAvailable = false;
        return;
      }
      this.db = db;
      await db.select().from(nameStories).limit(1);
      this.dbAvailable = true;
      console.log("Database connection established successfully");
    } catch (error) {
      console.error("Database connection failed, using memory storage for name stories:", error);
      this.dbAvailable = false;
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
    if (this.dbAvailable && this.db) {
      try {
        const [story] = await this.db.insert(nameStories).values({
          title: insertStory.title,
          thumbnail: insertStory.thumbnail,
          content: insertStory.content,
          videoUrl: insertStory.videoUrl,
          isVideo: insertStory.isVideo ?? false,
        }).returning();
        return story;
      } catch (error) {
        console.error("Database insert failed:", error);
        throw error;
      }
    }
    throw new Error("Database not available");
  }

  async getAllNameStories(): Promise<NameStory[]> {
    if (this.dbAvailable && this.db) {
      try {
        return await this.db.select().from(nameStories).orderBy(desc(nameStories.createdAt));
      } catch (error) {
        console.error("Database query failed:", error);
        return [];
      }
    }
    return [];
  }

  async getNameStory(id: string): Promise<NameStory | undefined> {
    if (this.dbAvailable && this.db) {
      try {
        const [story] = await this.db.select().from(nameStories).where(eq(nameStories.id, id));
        return story;
      } catch (error) {
        console.error("Database query failed:", error);
        return undefined;
      }
    }
    return undefined;
  }

  async updateNameStory(id: string, updateData: Partial<InsertNameStory>): Promise<NameStory | undefined> {
    if (this.dbAvailable && this.db) {
      try {
        const [updated] = await this.db.update(nameStories)
          .set({ ...updateData, updatedAt: new Date() })
          .where(eq(nameStories.id, id))
          .returning();
        return updated;
      } catch (error) {
        console.error("Database update failed:", error);
        return undefined;
      }
    }
    return undefined;
  }

  async deleteNameStory(id: string): Promise<boolean> {
    if (this.dbAvailable && this.db) {
      try {
        const result = await this.db.delete(nameStories).where(eq(nameStories.id, id)).returning();
        return result.length > 0;
      } catch (error) {
        console.error("Database delete failed:", error);
        return false;
      }
    }
    return false;
  }
}

export const storage = new DatabaseStorage();
