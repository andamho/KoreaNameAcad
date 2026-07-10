import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage, DatabaseError } from "./storage";
import { insertConsultationSchema, insertNameStorySchema, insertContentSchema, contentCategoryEnum, type ContentCategory } from "@shared/schema";
import { sendConsultationNotification, sendCommentNotification, sendInquiryNotification, sendInquiryReplyToUser } from "./email";
import { sendSMS } from "./sms";
import crypto from "crypto";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { youtubeConfigured, getYoutubeAuthUrl, handleYoutubeCallback, getYoutubeStatus, uploadYoutubeVideo, setYoutubeThumbnail } from "./youtube";
import { instagramConfigured, getInstagramStatus, publishInstagramReel } from "./instagram";
import { tiktokConfigured, getTiktokAuthUrl, handleTiktokCallback, getTiktokStatus, uploadTiktokDraft } from "./tiktok";
import { transcodeToH264, extractFrameJpeg } from "./videoTools";
import { ObjectStorageService } from "./replit_integrations/object_storage/objectStorage";
import { db } from "./db";
import { videoJobs, reviewDrafts, contents } from "@shared/schema";
import { desc as drizzleDesc, eq } from "drizzle-orm";

// 공개 문의 목록 인메모리 캐시 (60초 TTL)
let _publicInquiriesCache: any[] | null = null;
let _publicInquiriesCacheAt = 0;
const PUBLIC_INQUIRIES_TTL = 60_000;
function invalidatePublicInquiriesCache() { _publicInquiriesCache = null; }

function handleDbError(error: any, res: Response, route: string): Response {
  if (error instanceof DatabaseError) {
    console.error(`[503] DB 장애 | route=${route} code=${error.code} msg=${error.message} ts=${new Date().toISOString()}`);
    return res.status(503).json({ ok: false, error: error.code });
  }
  console.error(`[500] 서버 오류 | route=${route} msg=${error?.message} ts=${new Date().toISOString()}`);
  return res.status(500).json({ error: "Internal server error" });
}

// 관리자 비밀번호 기반 영구 토큰 생성 (서버 재시작 후에도 유효)
function getValidAdminToken(): string | null {
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();
  if (!adminPassword) return null;
  // 비밀번호 해시 기반 토큰 생성 (항상 동일한 토큰 생성)
  return crypto.createHash("sha256").update(`admin_token_${adminPassword}`).digest("hex");
}

// Admin verification middleware
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const validToken = getValidAdminToken();
  
  if (!token || !validToken || token !== validToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  // TikTok 도메인 소유 확인용 서명 파일 (URL prefix 검증)
  app.get("/tiktokQsb2NwuHJYh9gxVv6wWxl8KGZ1hm9UDd.txt", (_req, res) => {
    res.type("text/plain").send("tiktok-developers-site-verification=Qsb2NwuHJYh9gxVv6wWxl8KGZ1hm9UDd\n");
  });

  // Health check endpoint
  app.get("/api/health", async (req, res) => {
    try {
      if ('getDbStatus' in storage && typeof (storage as any).getDbStatus === 'function') {
        const dbStatus = await (storage as any).getDbStatus();
        const status = dbStatus.available ? "healthy" : "unhealthy";
        return res.status(dbStatus.available ? 200 : 503).json({
          status,
          database: dbStatus,
          timestamp: new Date().toISOString(),
        });
      }
      return res.json({ status: "healthy", database: { available: true }, timestamp: new Date().toISOString() });
    } catch (error: any) {
      return res.status(503).json({ status: "error", error: error?.message, timestamp: new Date().toISOString() });
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
        // 영구 토큰 반환 (비밀번호 해시 기반)
        const token = getValidAdminToken();
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
      const validToken = getValidAdminToken();
      if (token && validToken && token === validToken) {
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
    } catch (error: any) {
      return handleDbError(error, res, "GET /api/consultations");
    }
  });

  app.get("/api/consultations/:id", async (req, res, next) => {
    try {
      const consultation = await storage.getConsultation(req.params.id);
      if (!consultation) return res.status(404).json({ error: "Consultation not found" });
      return res.json(consultation);
    } catch (error: any) {
      return handleDbError(error, res, `GET /api/consultations/${req.params.id}`);
    }
  });

  // NameStory routes
  app.post("/api/name-stories", async (req, res, next) => {
    try {
      const validatedData = insertNameStorySchema.parse(req.body);
      const story = await storage.createNameStory(validatedData);
      return res.json(story);
    } catch (error: any) {
      if (error instanceof DatabaseError) return handleDbError(error, res, "POST /api/name-stories");
      return res.status(400).json({ error: "Invalid name story data" });
    }
  });

  app.get("/api/name-stories", async (req, res, next) => {
    try {
      const stories = await storage.getAllNameStories();
      return res.json(stories);
    } catch (error: any) {
      return handleDbError(error, res, "GET /api/name-stories");
    }
  });

  app.get("/api/name-stories/:id", async (req, res, next) => {
    try {
      const story = await storage.getNameStory(req.params.id);
      if (!story) return res.status(404).json({ error: "Name story not found" });
      return res.json(story);
    } catch (error: any) {
      return handleDbError(error, res, `GET /api/name-stories/${req.params.id}`);
    }
  });

  app.put("/api/name-stories/:id", async (req, res, next) => {
    try {
      const story = await storage.updateNameStory(req.params.id, req.body);
      if (!story) return res.status(404).json({ error: "Name story not found" });
      return res.json(story);
    } catch (error: any) {
      return handleDbError(error, res, `PUT /api/name-stories/${req.params.id}`);
    }
  });

  app.delete("/api/name-stories/:id", async (req, res, next) => {
    try {
      const deleted = await storage.deleteNameStory(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Name story not found" });
      return res.json({ success: true });
    } catch (error: any) {
      return handleDbError(error, res, `DELETE /api/name-stories/${req.params.id}`);
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
      const includeDrafts = req.query.includeDrafts === "true";
      
      // Check if user is admin (for showing drafts)
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      const validToken = getValidAdminToken();
      const isAdmin = token && validToken && token === validToken;
      
      // Map legacy category values to current format
      if (category && legacyCategoryMap[category.toLowerCase()]) {
        category = legacyCategoryMap[category.toLowerCase()];
      }
      
      console.log("GET /api/contents - category:", category, "isAdmin:", isAdmin);
      if (category && !contentCategoryEnum.safeParse(category).success) {
        console.log("Invalid category received:", category);
        return res.status(400).json({ error: "Invalid category", received: category });
      }
      let contentList = await storage.getAllContents(category as ContentCategory | undefined);

      // Filter out drafts for non-admin users
      if (!isAdmin || !includeDrafts) {
        contentList = contentList.filter(c => !c.isDraft);
      }

      console.log(`[DB] GET /api/contents(${category}) → ${contentList.length}건 (isAdmin=${isAdmin})`);
      return res.json(contentList);
    } catch (error: any) {
      return handleDbError(error, res, `GET /api/contents?category=${req.query.category}`);
    }
  });

  app.get("/api/contents/:id", async (req, res) => {
    try {
      const content = await storage.getContent(req.params.id);
      if (!content) return res.status(404).json({ error: "Content not found" });
      return res.json(content);
    } catch (error: any) {
      return handleDbError(error, res, `GET /api/contents/${req.params.id}`);
    }
  });

  app.post("/api/contents", requireAdmin, async (req, res) => {
    try {
      const cleanedData = {
        ...req.body,
        thumbnail: req.body.thumbnail?.trim() || null,
        videoUrl: req.body.videoUrl?.trim() || null,
      };
      const validatedData = insertContentSchema.parse(cleanedData);
      const content = await storage.createContent(validatedData);
      return res.json(content);
    } catch (error: any) {
      if (error instanceof DatabaseError) return handleDbError(error, res, "POST /api/contents");
      console.error("Validation errors:", error?.errors || error?.issues);
      return res.status(400).json({ error: "Invalid content data", details: error?.errors || error?.issues || error?.message });
    }
  });

  app.put("/api/contents/:id", requireAdmin, async (req, res) => {
    try {
      const content = await storage.updateContent(req.params.id, req.body);
      if (!content) return res.status(404).json({ error: "Content not found" });
      return res.json(content);
    } catch (error: any) {
      return handleDbError(error, res, `PUT /api/contents/${req.params.id}`);
    }
  });

  app.delete("/api/contents/:id", requireAdmin, async (req, res) => {
    try {
      const deleted = await storage.deleteContent(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Content not found" });
      return res.json({ success: true });
    } catch (error: any) {
      return handleDbError(error, res, `DELETE /api/contents/${req.params.id}`);
    }
  });

  // ── 체험존 진단 로그 (댓글) ──
  app.get("/api/experience-comments/:pageId", async (req, res) => {
    try {
      const comments = await storage.getExperienceComments(req.params.pageId);
      return res.json(comments);
    } catch (error: any) {
      return handleDbError(error, res, "GET /api/experience-comments");
    }
  });

  const BLOCKED_WORDS = [
    '씨발','시발','씨팔','시팔','ㅅㅂ','개새끼','개새','새끼','쌍년','쌍놈',
    '병신','ㅂㅅ','미친놈','미친년','미친새끼','지랄','존나','ㅈㄴ','좆','보지','자지',
    '창녀','걸레','찐따','빡대가리','등신','바보새끼','죽어','꺼져','닥쳐','개소리',
    '썅','개같','개년','개놈','ㄱㅅㄲ','ㅁㅊ','혐오','차별',
  ];
  const hasBadWord = (text: string) => BLOCKED_WORDS.some(w => text.replace(/\s/g,'').toLowerCase().includes(w));

  app.post("/api/experience-comments", async (req, res) => {
    try {
      const { pageId, nickname, totalStrokes, content, isPrivate, notifyContact, notifyContactType } = req.body;
      if (!pageId || !nickname?.trim() || !content?.trim()) {
        return res.status(400).json({ error: "필수 항목을 입력해주세요." });
      }
      if (hasBadWord(nickname) || hasBadWord(content)) {
        return res.status(400).json({ error: "부적절한 표현이 포함되어 있습니다." });
      }
      const comment = await storage.createExperienceComment({
        pageId,
        nickname: nickname.trim(),
        totalStrokes: totalStrokes ?? null,
        content: content.trim(),
        isPrivate: !!isPrivate,
        notifyContact: notifyContact?.trim() || null,
        notifyContactType: notifyContact?.trim() ? (notifyContactType || "sms") : null,
      });
      sendCommentNotification({
        id: comment.id,
        pageId: comment.pageId,
        nickname: comment.nickname,
        content: comment.content,
        totalStrokes: comment.totalStrokes,
        isPrivate: comment.isPrivate,
      });
      return res.json(comment);
    } catch (error: any) {
      return handleDbError(error, res, "POST /api/experience-comments");
    }
  });

  app.delete("/api/experience-comments/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteExperienceComment(req.params.id);
      return res.json({ success: true });
    } catch (error: any) {
      return handleDbError(error, res, "DELETE /api/experience-comments");
    }
  });

  app.put("/api/experience-comments/:id/reply/:index", requireAdmin, async (req, res) => {
    try {
      const index = parseInt(req.params.index, 10);
      const { text } = req.body;
      if (!text?.trim()) return res.status(400).json({ error: "내용을 입력해주세요." });
      if (isNaN(index)) return res.status(400).json({ error: "잘못된 인덱스입니다." });
      const comment = await storage.editExperienceCommentReply(req.params.id, index, text.trim());
      return res.json(comment);
    } catch (error: any) {
      return handleDbError(error, res, "PUT /api/experience-comments/:id/reply/:index");
    }
  });

  app.put("/api/experience-comments/:id/reply", requireAdmin, async (req, res) => {
    try {
      const { reply } = req.body;
      if (!reply?.trim()) return res.status(400).json({ error: "답글 내용을 입력해주세요." });
      const comment = await storage.replyToExperienceComment(req.params.id, reply.trim());
      // 답변 알림 발송 (연락처 등록한 경우)
      if (comment.notifyContact) {
        if (comment.notifyContactType === "sms") {
          const smsText = `[한국이름학교] 체험존 댓글에 이름의신이 답글을 달았습니다.\n\n${reply.trim()}`;
          sendSMS(comment.notifyContact, smsText).catch(err => console.error("[SMS] 체험존 답글 알림 실패:", err));
        } else {
          sendInquiryReplyToUser({
            contact: comment.notifyContact,
            contactType: "email",
            name: comment.nickname,
            adminReply: reply.trim(),
          } as any).catch(err => console.error("[이메일] 체험존 답글 알림 실패:", err));
        }
      }
      return res.json(comment);
    } catch (error: any) {
      return handleDbError(error, res, "PUT /api/experience-comments/:id/reply");
    }
  });

  // ── 문의 관리 ────────────────────────────────────────────────
  app.post("/api/inquiries", async (req, res) => {
    try {
      const { name, contact, contactType, content } = req.body;
      if (!name?.trim() || !contact?.trim() || !contactType || !content?.trim()) {
        return res.status(400).json({ error: "필수 항목을 입력해주세요." });
      }
      if (!["sms", "email"].includes(contactType)) {
        return res.status(400).json({ error: "연락 방법을 선택해주세요." });
      }
      const accessToken = crypto.randomBytes(10).toString("hex"); // 20자 고유 토큰
      const inquiry = await storage.createInquiry({
        name: name.trim(),
        contact: contact.trim(),
        contactType,
        content: content.trim(),
        accessToken,
      });
      sendInquiryNotification(inquiry).catch(err => console.error("[이메일] 문의 알림 실패:", err));
      invalidatePublicInquiriesCache();
      return res.json(inquiry);
    } catch (error: any) {
      return handleDbError(error, res, "POST /api/inquiries");
    }
  });

  // 사용자용 스레드 조회 (토큰 기반)
  app.get("/api/inquiry/thread/:token", async (req, res) => {
    try {
      const inquiry = await storage.getInquiryByToken(req.params.token);
      if (!inquiry) return res.status(404).json({ error: "문의를 찾을 수 없습니다." });
      const messages = await storage.getInquiryMessages(inquiry.id);
      // 기존 adminReply가 있고 메시지가 없으면 호환성을 위해 가상 메시지 추가
      if (inquiry.adminReply && messages.length === 0) {
        messages.push({
          id: "__legacy__",
          inquiryId: inquiry.id,
          senderType: "admin",
          content: inquiry.adminReply,
          createdAt: inquiry.repliedAt ?? inquiry.createdAt,
        });
      }
      return res.json({
        inquiry: {
          id: inquiry.id,
          name: inquiry.name,
          content: inquiry.content,
          status: inquiry.status,
          createdAt: inquiry.createdAt,
        },
        messages,
      });
    } catch (error: any) {
      return handleDbError(error, res, "GET /api/inquiry/thread/:token");
    }
  });

  // 사용자 답글 등록 (토큰 기반, 인증 불필요)
  app.post("/api/inquiry/thread/:token", async (req, res) => {
    try {
      const inquiry = await storage.getInquiryByToken(req.params.token);
      if (!inquiry) return res.status(404).json({ error: "문의를 찾을 수 없습니다." });
      const { content } = req.body;
      if (!content?.trim()) return res.status(400).json({ error: "내용을 입력해주세요." });
      const message = await storage.addInquiryMessage(inquiry.id, "user", content.trim());
      // 어드민에게 새 메시지 알림 이메일
      sendInquiryNotification({ ...inquiry, content: `[추가 문의]\n${content.trim()}` }).catch(() => {});
      return res.json(message);
    } catch (error: any) {
      return handleDbError(error, res, "POST /api/inquiry/thread/:token");
    }
  });

  // 공개용 - 마스킹된 목록만 반환 (내용/연락처 제외) — 인메모리 캐시 적용
  app.get("/api/inquiries/public", async (req, res) => {
    try {
      const now = Date.now();
      if (_publicInquiriesCache && now - _publicInquiriesCacheAt < PUBLIC_INQUIRIES_TTL) {
        return res.json(_publicInquiriesCache);
      }
      const list = await storage.getAllInquiries();
      const masked = list.map(inq => ({
        id: inq.id,
        maskedName: (inq.name[0] ?? "?") + "**",
        status: inq.status,
        createdAt: inq.createdAt,
      }));
      _publicInquiriesCache = masked;
      _publicInquiriesCacheAt = now;
      return res.json(masked);
    } catch (error: any) {
      return handleDbError(error, res, "GET /api/inquiries/public");
    }
  });

  app.get("/api/inquiries", requireAdmin, async (req, res) => {
    try {
      const list = await storage.getAllInquiries();
      return res.json(list);
    } catch (error: any) {
      return handleDbError(error, res, "GET /api/inquiries");
    }
  });

  app.put("/api/inquiries/:id/reply", requireAdmin, async (req, res) => {
    try {
      const { reply } = req.body;
      if (!reply?.trim()) return res.status(400).json({ error: "답변 내용을 입력해주세요." });
      const inquiry = await storage.getInquiry(req.params.id);
      if (!inquiry) return res.status(404).json({ error: "문의를 찾을 수 없습니다." });
      const isFirstReply = !inquiry.adminReply;
      const updated = await storage.replyToInquiry(req.params.id, reply.trim());
      // 스레드 메시지 저장
      await storage.addInquiryMessage(req.params.id, "admin", reply.trim());
      invalidatePublicInquiriesCache();
      // 첫 번째 답변만 문자/이메일 알림 발송
      if (isFirstReply) {
        if (updated.contactType === "sms") {
          const smsText = `[한국이름학교] 문의하신 내용에 답변드렸습니다.\n\n${reply.trim()}`;
          sendSMS(updated.contact, smsText).catch(err => console.error("[SMS] 문의 답변 발송 실패:", err));
        } else {
          sendInquiryReplyToUser(updated).catch(err => console.error("[이메일] 문의 답변 발송 실패:", err));
        }
      }
      return res.json({ ...updated, isFirstReply });
    } catch (error: any) {
      return handleDbError(error, res, "PUT /api/inquiries/:id/reply");
    }
  });

  // 어드민 추가 메시지 (SMS/이메일 발송 없이 스레드에만 추가)
  app.post("/api/inquiries/:id/thread", requireAdmin, async (req, res) => {
    try {
      const { content } = req.body;
      if (!content?.trim()) return res.status(400).json({ error: "내용을 입력해주세요." });
      const inquiry = await storage.getInquiry(req.params.id);
      if (!inquiry) return res.status(404).json({ error: "문의를 찾을 수 없습니다." });
      const message = await storage.addInquiryMessage(req.params.id, "admin", content.trim());
      return res.json(message);
    } catch (error: any) {
      return handleDbError(error, res, "POST /api/inquiries/:id/thread");
    }
  });

  // 어드민용 스레드 메시지 목록 조회
  app.get("/api/inquiries/:id/thread", requireAdmin, async (req, res) => {
    try {
      const inquiry = await storage.getInquiry(req.params.id);
      if (!inquiry) return res.status(404).json({ error: "문의를 찾을 수 없습니다." });
      const messages = await storage.getInquiryMessages(req.params.id);
      if (inquiry.adminReply && messages.length === 0) {
        messages.push({
          id: "__legacy__",
          inquiryId: inquiry.id,
          senderType: "admin",
          content: inquiry.adminReply,
          createdAt: inquiry.repliedAt ?? inquiry.createdAt,
        });
      }
      return res.json(messages);
    } catch (error: any) {
      return handleDbError(error, res, "GET /api/inquiries/:id/thread");
    }
  });

  app.delete("/api/inquiries/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteInquiry(req.params.id);
      invalidatePublicInquiriesCache();
      return res.json({ success: true });
    } catch (error: any) {
      return handleDbError(error, res, "DELETE /api/inquiries/:id");
    }
  });

  // ── YouTube OAuth 연결 (숏폼 자동배포) ──
  // 브라우저 리디렉션 흐름이라 연결 시작은 ?token= 쿼리로 관리자 인증, CSRF는 state로 방지
  const ytPendingStates = new Map<string, number>(); // state -> 만료 timestamp
  const cleanYtStates = () => {
    const now = Date.now();
    ytPendingStates.forEach((exp, s) => {
      if (exp < now) ytPendingStates.delete(s);
    });
  };
  const escapeHtml = (s: string) =>
    s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

  // 연결 상태 조회 (관리자 UI용)
  app.get("/api/admin/youtube/status", requireAdmin, async (_req, res) => {
    try {
      const st = await getYoutubeStatus();
      res.json({ configured: youtubeConfigured(), ...st });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || "status error" });
    }
  });

  // 연결 시작 → 구글 동의 화면으로 리디렉션
  app.get("/api/auth/youtube", (req, res) => {
    const token = (req.query.token as string) || "";
    const valid = getValidAdminToken();
    if (!valid || token !== valid) return res.status(401).send("Unauthorized");
    if (!youtubeConfigured()) return res.status(400).send("YOUTUBE_CLIENT_ID / SECRET 미설정");
    cleanYtStates();
    const state = crypto.randomBytes(16).toString("hex");
    ytPendingStates.set(state, Date.now() + 10 * 60 * 1000);
    res.redirect(getYoutubeAuthUrl(state));
  });

  // 구글 콜백 → code 교환 → 토큰 저장
  app.get("/api/auth/youtube/callback", async (req, res) => {
    try {
      const { code, state, error } = req.query as Record<string, string>;
      if (error) return res.status(400).send(`인증 취소/오류: ${escapeHtml(error)}`);
      cleanYtStates();
      if (!state || !ytPendingStates.has(state)) {
        return res.status(400).send("state 불일치 — 연결을 처음부터 다시 시도하세요.");
      }
      ytPendingStates.delete(state);
      if (!code) return res.status(400).send("code가 없습니다.");
      const { channelTitle } = await handleYoutubeCallback(code);
      res.send(
        `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>YouTube 연결 완료</title></head>` +
          `<body style="font-family:system-ui,sans-serif;max-width:520px;margin:60px auto;padding:0 20px;line-height:1.6">` +
          `<h2 style="color:#1f8a5b">✅ YouTube 연결 완료</h2>` +
          `<p>연결된 채널: <b>${escapeHtml(channelTitle ?? "(채널명 조회 실패)")}</b></p>` +
          `<p><a href="/admin" style="display:inline-block;margin-top:12px;padding:10px 18px;background:#111;color:#fff;border-radius:8px;text-decoration:none">관리자 페이지로 돌아가기</a></p></body></html>`,
      );
    } catch (error: any) {
      console.error("[youtube callback]", error);
      res.status(500).send("YouTube 연결 실패: " + escapeHtml(error?.message || "unknown"));
    }
  });

  // ── TikTok OAuth 연결 ──
  const ttPendingStates = new Map<string, number>();
  const cleanTtStates = () => {
    const now = Date.now();
    ttPendingStates.forEach((exp, s) => {
      if (exp < now) ttPendingStates.delete(s);
    });
  };

  app.get("/api/auth/tiktok", (req, res) => {
    const token = (req.query.token as string) || "";
    const valid = getValidAdminToken();
    if (!valid || token !== valid) return res.status(401).send("Unauthorized");
    if (!tiktokConfigured()) return res.status(400).send("TIKTOK_CLIENT_KEY / SECRET 미설정");
    cleanTtStates();
    const state = crypto.randomBytes(16).toString("hex");
    ttPendingStates.set(state, Date.now() + 10 * 60 * 1000);
    res.redirect(getTiktokAuthUrl(state));
  });

  app.get("/api/auth/tiktok/callback", async (req, res) => {
    try {
      const { code, state, error } = req.query as Record<string, string>;
      if (error) return res.status(400).send(`인증 취소/오류: ${escapeHtml(error)}`);
      cleanTtStates();
      if (!state || !ttPendingStates.has(state)) {
        return res.status(400).send("state 불일치 — 연결을 처음부터 다시 시도하세요.");
      }
      ttPendingStates.delete(state);
      if (!code) return res.status(400).send("code가 없습니다.");
      const { displayName } = await handleTiktokCallback(code);
      res.send(
        `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TikTok 연결 완료</title></head>` +
          `<body style="font-family:system-ui,sans-serif;max-width:520px;margin:60px auto;padding:0 20px;line-height:1.6">` +
          `<h2 style="color:#1f8a5b">✅ TikTok 연결 완료</h2>` +
          `<p>연결된 계정: <b>${escapeHtml(displayName ?? "(이름 조회 실패)")}</b></p>` +
          `<p><a href="/admin" style="display:inline-block;margin-top:12px;padding:10px 18px;background:#111;color:#fff;border-radius:8px;text-decoration:none">관리자 페이지로 돌아가기</a></p></body></html>`,
      );
    } catch (error: any) {
      console.error("[tiktok callback]", error);
      res.status(500).send("TikTok 연결 실패: " + escapeHtml(error?.message || "unknown"));
    }
  });

  // 유튜브/소셜 제목 뒤에 붙는 고정 해시태그
  const FIXED_HASHTAGS = "#한국이름학교 #와츠유어네임이름연구협회 #작명 #개명 #이름분석 #이름풀이";

  // 인스타 캡션 맨 아래 항상 붙는 고정 문구 (사용자 지정)
  const INSTAGRAM_CAPTION_FOOTER = `😩고달픈 인생,
이름 하나로 이유와 해결책을!

🔍한글.한자이름만으로 운명상담
[정확도 80%👆]

🌸운이 술술 풀리는 이름으로
인생역전!

🔮이름상담 및 작명 [신청방법]
프로필 링크통해
진행해주시면 됩니다~

@whats_ur_name.777
@whats_ur_name.777
@whats_ur_name.777

📊 18년간 45만명 임상`;

  // 인스타 캡션 맨 아래 고정 해시태그
  const INSTAGRAM_HASHTAGS = "#한국이름학교 #와츠유어네임이름연구협회 #이름분석 #작명 #개명";

  // 인스타 연결 상태 (관리자 UI용)
  app.get("/api/admin/instagram/status", requireAdmin, async (_req, res) => {
    try {
      const st = await getInstagramStatus();
      res.json({ configured: instagramConfigured(), ...st });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || "status error" });
    }
  });

  // 틱톡 연결 상태 (관리자 UI용)
  app.get("/api/admin/tiktok/status", requireAdmin, async (_req, res) => {
    try {
      const st = await getTiktokStatus();
      res.json({ configured: tiktokConfigured(), ...st });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || "status error" });
    }
  });

  // 인스타/페북 등 외부가 접근할 미디어 공개 베이스 URL (R2 객체를 실서버 /objects/로 서빙)
  const PUBLIC_MEDIA_BASE_URL = (process.env.PUBLIC_MEDIA_BASE_URL || "https://korea-name-acad.com").replace(/\/$/, "");

  // 영상 안 올라간 최근 글 10개 (배포 폼의 '연결할 글' 선택용)
  app.get("/api/admin/video/candidates", requireAdmin, async (_req, res) => {
    try {
      if (!db) return res.json([]);
      const rows = await db
        .select({ id: contents.id, title: contents.title, category: contents.category, createdAt: contents.createdAt })
        .from(contents)
        .where(eq(contents.isVideo, false))
        .orderBy(drizzleDesc(contents.createdAt))
        .limit(10);
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || "candidates error" });
    }
  });

  // ── 숏폼 영상 배포 (업로드 → 유튜브 게시 → 선택한 기존 글에 링크 삽입) ──
  app.post("/api/admin/video/deploy", requireAdmin, async (req, res) => {
    try {
      if (!db) return res.status(503).json({ error: "DB 사용 불가" });
      const { objectPath, contentId, titleOverride, privacyStatus = "public", thumbnailObjectPath, targetInstagram = false, instagramCaption, targetTiktok = false } = req.body || {};

      if (!objectPath || typeof objectPath !== "string" || !objectPath.startsWith("/objects/")) {
        return res.status(400).json({ error: "유효한 영상 objectPath가 필요합니다." });
      }
      const r2Key = objectPath.replace("/objects/", "");

      // 제목 결정: 선택한 글의 '썸네일 제목'(review_drafts.selectedThumbnailTitle) 우선, 없으면 글 제목
      let content: any = null;
      let thumbnailTitle = "";
      if (contentId) {
        content = await storage.getContent(contentId);
        if (!content) return res.status(404).json({ error: "선택한 글을 찾을 수 없습니다." });
        const drafts = await db
          .select()
          .from(reviewDrafts)
          .where(eq(reviewDrafts.publishedContentId, contentId))
          .limit(1);
        thumbnailTitle = drafts[0]?.selectedThumbnailTitle || content.title;
      } else {
        thumbnailTitle = String(titleOverride || "").trim();
      }
      if (!thumbnailTitle) {
        return res.status(400).json({ error: "제목을 정할 수 없습니다. 글을 선택하거나 제목을 입력하세요." });
      }

      // 유튜브 제목 = 썸네일 제목 + 고정 해시태그 (100자 제한 보정: 해시태그는 보존)
      let ytTitle = `${thumbnailTitle} ${FIXED_HASHTAGS}`;
      if (ytTitle.length > 100) {
        const room = Math.max(0, 100 - FIXED_HASHTAGS.length - 1);
        ytTitle = `${thumbnailTitle.slice(0, room)} ${FIXED_HASHTAGS}`.trim();
      }
      const tags = FIXED_HASHTAGS.split(/\s+/).map((t) => t.replace(/^#/, "")).filter(Boolean);
      const willInsertHomepage = !!contentId;

      const [job] = await db
        .insert(videoJobs)
        .values({
          videoR2Key: r2Key,
          title: ytTitle,
          caption: null,
          hashtags: FIXED_HASHTAGS,
          targetYoutube: true,
          targetInstagram: !!targetInstagram,
          targetTiktok: !!targetTiktok,
          targetHomepage: willInsertHomepage,
          homepageCategory: content?.category || "nameStory",
          targetContentId: contentId || null,
          ytStatus: "queued",
          igStatus: targetInstagram ? "queued" : "skipped",
          ttStatus: targetTiktok ? "queued" : "skipped",
          hpStatus: willInsertHomepage ? "queued" : "skipped",
        })
        .returning();

      const errors: Record<string, string> = {};
      let ytVideoId: string | null = null;

      // 원본 영상 1회 로드 (유튜브 업로드 / 썸네일 추출 / 인스타 변환에 재사용)
      const objectStorage = new ObjectStorageService();
      let videoBuffer: Buffer | null = null;
      let videoContentType = "video/mp4";
      try {
        const g = await objectStorage.getObjectBuffer(r2Key);
        videoBuffer = g.buffer;
        videoContentType = g.contentType;
      } catch (e: any) {
        errors.youtube = "영상 로드 실패: " + (e?.message || "");
      }

      // 1) YouTube 업로드 (원본 그대로 — 유튜브는 HEVC도 허용)
      if (videoBuffer) {
        try {
          await db.update(videoJobs).set({ ytStatus: "uploading", updatedAt: new Date() }).where(eq(videoJobs.id, job.id));
          const result = await uploadYoutubeVideo({
            video: videoBuffer,
            mimeType: videoContentType,
            title: ytTitle,
            description: FIXED_HASHTAGS,
            tags,
            privacyStatus: (["public", "private", "unlisted"].includes(privacyStatus) ? privacyStatus : "public") as any,
          });
          ytVideoId = result.videoId;
          await db.update(videoJobs).set({ ytStatus: "published", ytVideoId, updatedAt: new Date() }).where(eq(videoJobs.id, job.id));
        } catch (e: any) {
          errors.youtube = e?.message || "youtube upload failed";
          await db.update(videoJobs).set({ ytStatus: "failed", updatedAt: new Date() }).where(eq(videoJobs.id, job.id));
        }
      }

      // 1-b) 커스텀 썸네일: 영상 맨 앞(0.25초) 프레임을 ffmpeg로 추출해 설정
      let thumbnailSet = false;
      if (ytVideoId && videoBuffer) {
        try {
          const frame = await extractFrameJpeg(videoBuffer, 0.25);
          await setYoutubeThumbnail(ytVideoId, frame, "image/jpeg");
          thumbnailSet = true;
        } catch (e: any) {
          errors.thumbnail = e?.message || "thumbnail set failed";
        }
      }

      // 2) 선택한 기존 글에 유튜브 링크 삽입 (새 글 생성 아님 — videoUrl만 채움)
      if (willInsertHomepage) {
        try {
          if (!ytVideoId) throw new Error("YouTube 업로드가 실패하여 링크를 넣을 수 없습니다.");
          const videoUrl = `https://youtu.be/${ytVideoId}`;
          await storage.updateContent(contentId, { videoUrl, isVideo: true } as any);
          await db.update(videoJobs).set({ hpStatus: "published", updatedAt: new Date() }).where(eq(videoJobs.id, job.id));
        } catch (e: any) {
          errors.homepage = e?.message || "homepage update failed";
          await db.update(videoJobs).set({ hpStatus: "failed", updatedAt: new Date() }).where(eq(videoJobs.id, job.id));
        }
      }

      // 3) 인스타/틱톡: 둘 다 HEVC 거부 → H.264로 1회만 변환해 재사용
      let h264: Buffer | null = null;
      if ((targetInstagram || targetTiktok) && videoBuffer) {
        try {
          h264 = await transcodeToH264(videoBuffer);
        } catch (e: any) {
          const msg = "H.264 변환 실패: " + (e?.message || "");
          if (targetInstagram) errors.instagram = msg;
          if (targetTiktok) errors.tiktok = msg;
        }
      }

      // 3-a) 인스타그램 릴스 게시 (변환본을 R2 공개 URL로 전달)
      let igMediaId: string | null = null;
      if (targetInstagram) {
        try {
          if (!h264) throw new Error(errors.instagram || "변환 영상 없음");
          await db.update(videoJobs).set({ igStatus: "uploading", updatedAt: new Date() }).where(eq(videoJobs.id, job.id));
          const igKey = `uploads/ig-${crypto.randomUUID()}.mp4`;
          await objectStorage.putObject(igKey, h264, "video/mp4");
          const publicVideoUrl = `${PUBLIC_MEDIA_BASE_URL}/objects/${igKey}`;
          // 캡션 = 직접 입력한 본문 + 항상 붙는 고정 문구 + 고정 해시태그
          const igCaption = [String(instagramCaption || "").trim(), INSTAGRAM_CAPTION_FOOTER, INSTAGRAM_HASHTAGS]
            .filter(Boolean)
            .join("\n\n");
          const result = await publishInstagramReel({ videoUrl: publicVideoUrl, caption: igCaption });
          igMediaId = result.mediaId;
          await db.update(videoJobs).set({ igStatus: "published", igMediaId, updatedAt: new Date() }).where(eq(videoJobs.id, job.id));
        } catch (e: any) {
          errors.instagram = e?.message || "instagram publish failed";
          await db.update(videoJobs).set({ igStatus: "failed", updatedAt: new Date() }).where(eq(videoJobs.id, job.id));
        }
      }

      // 3-b) 틱톡 초안(inbox) 업로드 — 바이트 직접 전송. 사용자가 틱톡 앱에서 탭 한 번으로 게시
      let ttPublishId: string | null = null;
      if (targetTiktok) {
        try {
          if (!h264) throw new Error(errors.tiktok || "변환 영상 없음");
          await db.update(videoJobs).set({ ttStatus: "uploading", updatedAt: new Date() }).where(eq(videoJobs.id, job.id));
          const result = await uploadTiktokDraft(h264);
          ttPublishId = result.publishId;
          await db.update(videoJobs).set({ ttStatus: "draft", ttPublishId, updatedAt: new Date() }).where(eq(videoJobs.id, job.id));
        } catch (e: any) {
          errors.tiktok = e?.message || "tiktok upload failed";
          await db.update(videoJobs).set({ ttStatus: "failed", updatedAt: new Date() }).where(eq(videoJobs.id, job.id));
        }
      }

      if (Object.keys(errors).length) {
        await db.update(videoJobs).set({ errorLog: JSON.stringify(errors), updatedAt: new Date() }).where(eq(videoJobs.id, job.id));
      }

      res.json({
        jobId: job.id,
        youtubeTitle: ytTitle,
        youtube: ytVideoId ? { ok: true, videoId: ytVideoId, url: `https://youtu.be/${ytVideoId}` } : { ok: false, error: errors.youtube },
        thumbnail: ytVideoId ? (thumbnailSet ? { ok: true } : { ok: false, error: errors.thumbnail || "설정 안됨" }) : null,
        instagram: targetInstagram ? (igMediaId ? { ok: true, mediaId: igMediaId } : { ok: false, error: errors.instagram }) : null,
        tiktok: targetTiktok ? (ttPublishId ? { ok: true, draft: true, publishId: ttPublishId } : { ok: false, error: errors.tiktok }) : null,
        homepage: willInsertHomepage ? (errors.homepage ? { ok: false, error: errors.homepage } : { ok: true, contentId }) : null,
      });
    } catch (error: any) {
      console.error("[video deploy]", error);
      res.status(500).json({ error: error?.message || "deploy failed" });
    }
  });

  // 최근 배포 잡 목록 (관리자 UI용)
  app.get("/api/admin/video/jobs", requireAdmin, async (_req, res) => {
    try {
      if (!db) return res.json([]);
      const rows = await db.select().from(videoJobs).orderBy(drizzleDesc(videoJobs.createdAt)).limit(20);
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || "jobs error" });
    }
  });

  // Register object storage routes for file uploads
  registerObjectStorageRoutes(app);

  const httpServer = createServer(app);

  return httpServer;
}
