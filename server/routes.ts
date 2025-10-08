import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertConsultationSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Consultation routes
  app.post("/api/consultations", async (req, res, next) => {
    try {
      const validatedData = insertConsultationSchema.parse(req.body);
      const consultation = await storage.createConsultation(validatedData);
      return res.json(consultation);
    } catch (error) {
      console.error("Error creating consultation:", error);
      return res.status(400).json({ error: "Invalid consultation data" });
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

  const httpServer = createServer(app);

  return httpServer;
}
