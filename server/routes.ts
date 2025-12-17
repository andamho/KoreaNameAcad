import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertConsultationSchema, insertNameStorySchema } from "@shared/schema";
import { sendConsultationNotification } from "./email";

export async function registerRoutes(app: Express): Promise<Server> {
  // Consultation routes
  app.post("/api/consultations", async (req, res, next) => {
    try {
      console.log("Received consultation data:", JSON.stringify(req.body, null, 2));
      const validatedData = insertConsultationSchema.parse(req.body);
      const consultation = await storage.createConsultation(validatedData);
      
      // 이메일 알림 전송 (비동기, 실패해도 상담 신청은 성공)
      sendConsultationNotification(consultation).catch(error => {
        console.error("이메일 전송 실패 (상담 신청은 저장됨):", error);
      });
      
      return res.json(consultation);
    } catch (error: any) {
      console.error("Error creating consultation:", error);
      console.error("Validation errors:", error?.errors || error?.message);
      return res.status(400).json({ error: "Invalid consultation data", details: error?.errors || error?.message });
    }
  });

  app.get("/api/consultations", async (req, res, next) => {
    try {
      const consultations = await storage.getAllConsultations();
      return res.json(consultations);
    } catch (error) {
      console.error("Error fetching consultations:", error);
      return res.status(500).json({ error: "Failed to fetch consultations" });
    }
  });

  app.get("/api/consultations/:id", async (req, res, next) => {
    try {
      const consultation = await storage.getConsultation(req.params.id);
      if (!consultation) {
        return res.status(404).json({ error: "Consultation not found" });
      }
      return res.json(consultation);
    } catch (error) {
      console.error("Error fetching consultation:", error);
      return res.status(500).json({ error: "Failed to fetch consultation" });
    }
  });

  // NameStory routes
  app.post("/api/name-stories", async (req, res, next) => {
    try {
      const validatedData = insertNameStorySchema.parse(req.body);
      const story = await storage.createNameStory(validatedData);
      return res.json(story);
    } catch (error) {
      console.error("Error creating name story:", error);
      return res.status(400).json({ error: "Invalid name story data" });
    }
  });

  app.get("/api/name-stories", async (req, res, next) => {
    try {
      const stories = await storage.getAllNameStories();
      return res.json(stories);
    } catch (error: any) {
      console.error("Error fetching name stories:", error);
      return res.status(500).json({ error: "Failed to fetch name stories", details: error?.message || String(error) });
    }
  });

  app.get("/api/name-stories/:id", async (req, res, next) => {
    try {
      const story = await storage.getNameStory(req.params.id);
      if (!story) {
        return res.status(404).json({ error: "Name story not found" });
      }
      return res.json(story);
    } catch (error) {
      console.error("Error fetching name story:", error);
      return res.status(500).json({ error: "Failed to fetch name story" });
    }
  });

  app.put("/api/name-stories/:id", async (req, res, next) => {
    try {
      const story = await storage.updateNameStory(req.params.id, req.body);
      if (!story) {
        return res.status(404).json({ error: "Name story not found" });
      }
      return res.json(story);
    } catch (error) {
      console.error("Error updating name story:", error);
      return res.status(500).json({ error: "Failed to update name story" });
    }
  });

  app.delete("/api/name-stories/:id", async (req, res, next) => {
    try {
      const deleted = await storage.deleteNameStory(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Name story not found" });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("Error deleting name story:", error);
      return res.status(500).json({ error: "Failed to delete name story" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
