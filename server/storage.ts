import { type User, type InsertUser, type Consultation, type InsertConsultation, type NameStory, type InsertNameStory, nameStories } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
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

export class DatabaseStorage implements IStorage {
  private users: Map<string, User>;
  private consultations: Map<string, Consultation>;

  constructor() {
    this.users = new Map();
    this.consultations = new Map();
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
    const [story] = await db.insert(nameStories).values({
      title: insertStory.title,
      thumbnail: insertStory.thumbnail,
      content: insertStory.content,
      videoUrl: insertStory.videoUrl,
      isVideo: insertStory.isVideo ?? false,
    }).returning();
    return story;
  }

  async getAllNameStories(): Promise<NameStory[]> {
    return await db.select().from(nameStories).orderBy(desc(nameStories.createdAt));
  }

  async getNameStory(id: string): Promise<NameStory | undefined> {
    const [story] = await db.select().from(nameStories).where(eq(nameStories.id, id));
    return story;
  }

  async updateNameStory(id: string, updateData: Partial<InsertNameStory>): Promise<NameStory | undefined> {
    const [updated] = await db.update(nameStories)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(nameStories.id, id))
      .returning();
    return updated;
  }

  async deleteNameStory(id: string): Promise<boolean> {
    const result = await db.delete(nameStories).where(eq(nameStories.id, id)).returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
