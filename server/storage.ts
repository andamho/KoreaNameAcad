import { type User, type InsertUser, type Consultation, type InsertConsultation, type NameStory, type InsertNameStory } from "@shared/schema";
import { randomUUID } from "crypto";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Consultation methods
  createConsultation(consultation: InsertConsultation): Promise<Consultation>;
  getAllConsultations(): Promise<Consultation[]>;
  getConsultation(id: string): Promise<Consultation | undefined>;
  
  // NameStory methods
  createNameStory(story: InsertNameStory): Promise<NameStory>;
  getAllNameStories(): Promise<NameStory[]>;
  getNameStory(id: string): Promise<NameStory | undefined>;
  updateNameStory(id: string, story: Partial<InsertNameStory>): Promise<NameStory | undefined>;
  deleteNameStory(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private consultations: Map<string, Consultation>;
  private nameStories: Map<string, NameStory>;

  constructor() {
    this.users = new Map();
    this.consultations = new Map();
    this.nameStories = new Map();
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
    const now = new Date().toISOString();
    const story: NameStory = { 
      ...insertStory, 
      id, 
      createdAt: now, 
      updatedAt: now,
      isVideo: insertStory.isVideo ?? false
    };
    this.nameStories.set(id, story);
    return story;
  }

  async getAllNameStories(): Promise<NameStory[]> {
    return Array.from(this.nameStories.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getNameStory(id: string): Promise<NameStory | undefined> {
    return this.nameStories.get(id);
  }

  async updateNameStory(id: string, updateData: Partial<InsertNameStory>): Promise<NameStory | undefined> {
    const existing = this.nameStories.get(id);
    if (!existing) return undefined;
    
    const updated: NameStory = {
      ...existing,
      ...updateData,
      updatedAt: new Date().toISOString(),
    };
    this.nameStories.set(id, updated);
    return updated;
  }

  async deleteNameStory(id: string): Promise<boolean> {
    return this.nameStories.delete(id);
  }
}

export const storage = new MemStorage();
