import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertConsultationSchema, insertNameStorySchema, insertContentSchema, contentCategoryEnum, type ContentCategory } from "@shared/schema";
import { sendConsultationNotification } from "./email";
import crypto from "crypto";

// 간단한 토큰 저장소 (메모리 기반)
const validTokens = new Set<string>();

// Admin verification middleware
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  
  if (!token || !validTokens.has(token)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check endpoint - shows DB status for debugging
  app.get("/api/health", async (req, res) => {
    try {
      // Check if storage has getDbStatus method (DatabaseStorage)
      if ('getDbStatus' in storage && typeof (storage as any).getDbStatus === 'function') {
        const dbStatus = await (storage as any).getDbStatus();
        return res.json({
          status: dbStatus.available ? "healthy" : "unhealthy",
          database: dbStatus,
          timestamp: new Date().toISOString(),
        });
      }
      // MemStorage fallback
      return res.json({
        status: "healthy",
        database: { available: false, error: "Using in-memory storage" },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      return res.status(500).json({
        status: "error",
        error: error?.message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // 관리자 인증 API
  app.post("/api/admin/login", async (req, res) => {
    try {
      const { password } = req.body;
      const adminPassword = process.env.ADMIN_PASSWORD?.trim();
      const inputPassword = password?.trim();
      
      console.log("Admin login attempt - password configured:", !!adminPassword, "input provided:", !!inputPassword);
      
      if (!adminPassword) {
        return res.status(500).json({ error: "Admin password not configured" });
      }
      
      if (inputPassword === adminPassword) {
        // 토큰 생성 및 저장
        const token = crypto.randomBytes(32).toString("hex");
        validTokens.add(token);
        return res.json({ success: true, token });
      }
      
      return res.status(401).json({ error: "Invalid password" });
    } catch (error) {
      console.error("Admin login error:", error);
      return res.status(500).json({ error: "Login failed" });
    }
  });
  
  // 토큰 검증 API
  app.post("/api/admin/verify", async (req, res) => {
    try {
      const { token } = req.body;
      if (token && validTokens.has(token)) {
        return res.json({ valid: true });
      }
      return res.json({ valid: false });
    } catch (error) {
      return res.json({ valid: false });
    }
  });
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

  // Content CMS routes (unified content management)
  // Legacy category mapping for cached frontend compatibility
  const legacyCategoryMap: Record<string, ContentCategory> = {
    "name-stories": "nameStory",
    "name-story": "nameStory",
    "namestory": "nameStory",
    "announcements": "announcement",
    "reviews": "review",
  };

  app.get("/api/contents", async (req, res) => {
    try {
      let category = req.query.category as string | undefined;
      
      // Map legacy category values to current format
      if (category && legacyCategoryMap[category.toLowerCase()]) {
        category = legacyCategoryMap[category.toLowerCase()];
      }
      
      console.log("GET /api/contents - category:", category);
      if (category && !contentCategoryEnum.safeParse(category).success) {
        console.log("Invalid category received:", category);
        return res.status(400).json({ error: "Invalid category", received: category });
      }
      const contents = await storage.getAllContents(category as ContentCategory | undefined);
      console.log("GET /api/contents - returned", contents.length, "items");
      return res.json(contents);
    } catch (error) {
      console.error("Error fetching contents:", error);
      return res.status(500).json({ error: "Failed to fetch contents" });
    }
  });

  app.get("/api/contents/:id", async (req, res) => {
    try {
      const content = await storage.getContent(req.params.id);
      if (!content) {
        return res.status(404).json({ error: "Content not found" });
      }
      return res.json(content);
    } catch (error) {
      console.error("Error fetching content:", error);
      return res.status(500).json({ error: "Failed to fetch content" });
    }
  });

  app.post("/api/contents", requireAdmin, async (req, res) => {
    try {
      console.log("Content create request body:", JSON.stringify(req.body, null, 2));
      const validatedData = insertContentSchema.parse(req.body);
      const content = await storage.createContent(validatedData);
      return res.json(content);
    } catch (error: any) {
      console.error("Error creating content:", error);
      console.error("Validation errors:", error?.errors || error?.issues);
      return res.status(400).json({ error: "Invalid content data", details: error?.errors || error?.issues || error?.message });
    }
  });

  app.put("/api/contents/:id", requireAdmin, async (req, res) => {
    try {
      const content = await storage.updateContent(req.params.id, req.body);
      if (!content) {
        return res.status(404).json({ error: "Content not found" });
      }
      return res.json(content);
    } catch (error) {
      console.error("Error updating content:", error);
      return res.status(500).json({ error: "Failed to update content" });
    }
  });

  app.delete("/api/contents/:id", requireAdmin, async (req, res) => {
    try {
      const deleted = await storage.deleteContent(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Content not found" });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("Error deleting content:", error);
      return res.status(500).json({ error: "Failed to delete content" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
