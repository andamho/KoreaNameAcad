// 인스타 자동화 라우트: 웹훅 수신(공개) + 연결/진단(관리자)
import type { Express, RequestHandler, Request, Response } from "express";
import { desc } from "drizzle-orm";
import { db } from "../db";
import { igEvents } from "@shared/schema";
import { getIgToken, igAppId, igAppSecret, refreshIfNeeded, startIgTokenRefresh } from "./tokens";
import { getMe, getSubscribedFields, subscribeWebhooks, IgApiError } from "./client";
import { authorizeUrl, completeOAuth, redirectUri, verifyState, IG_SCOPES } from "./oauth";
import { verifySignature, normalizeWebhook, storeEvents } from "./webhook";

function handle(res: Response, route: string, e: any) {
  if (e instanceof IgApiError) {
    console.error(`[IG ${e.status}] ${route} :: code=${e.code} ${e.message}`);
    return res.status(e.isAuthError ? 401 : 502).json({ error: e.message, code: e.code });
  }
  console.error(`[IG 500] ${route} :: ${e?.message}`);
  return res.status(500).json({ error: e?.message || "internal_error" });
}

function verifyToken(): string | undefined {
  return process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN?.trim();
}

export function registerInstagramRoutes(app: Express, requireAdmin: RequestHandler) {
  startIgTokenRefresh();

  // ── 웹훅 검증 핸드셰이크 (Meta 대시보드에서 URL 저장할 때 1회 호출, 공개) ──
  app.get("/api/instagram/webhook", (req: Request, res: Response) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    const expected = verifyToken();

    if (!expected) {
      console.error("[IG WEBHOOK] INSTAGRAM_WEBHOOK_VERIFY_TOKEN 미설정");
      return res.sendStatus(500);
    }
    if (mode === "subscribe" && token === expected) {
      console.log("[IG WEBHOOK] 검증 성공");
      return res.status(200).type("text/plain").send(String(challenge ?? ""));
    }
    console.warn("[IG WEBHOOK] 검증 실패 — verify_token 불일치");
    return res.sendStatus(403);
  });

  // ── 웹훅 수신 (공개, 서명으로 인증) ──
  app.post("/api/instagram/webhook", async (req: Request, res: Response) => {
    const raw = (req as any).rawBody as Buffer | undefined;
    if (!verifySignature(raw, req.headers["x-hub-signature-256"] as string | undefined)) {
      console.warn("[IG WEBHOOK] 서명 불일치 — 요청 거부");
      return res.sendStatus(403);
    }

    // Meta는 빠른 200을 요구한다(느리면 재전송/구독 해제). 저장은 응답 후에 처리.
    res.sendStatus(200);

    try {
      const events = normalizeWebhook(req.body);
      if (events.length === 0) {
        console.log(`[IG WEBHOOK] 처리 대상 없는 이벤트: ${JSON.stringify(req.body).slice(0, 300)}`);
        return;
      }
      const stored = await storeEvents(events);
      for (const e of events) {
        console.log(
          `[IG WEBHOOK] ${e.kind} from=${e.fromUsername ?? e.fromId ?? "?"} ` +
            `${e.parentId ? "(대댓글) " : ""}${e.isEcho ? "(echo) " : ""}text=${(e.text ?? "").slice(0, 40)}`,
        );
      }
      if (stored < events.length) {
        console.log(`[IG WEBHOOK] ${events.length}건 중 ${events.length - stored}건은 중복이라 건너뜀`);
      }
    } catch (e: any) {
      console.error(`[IG WEBHOOK] 처리 오류: ${e?.message}`);
    }
  });

  // ── OAuth 시작: 관리자 UI가 이 URL을 받아 window.location으로 이동 ──
  app.get("/api/admin/instagram/connect-url", requireAdmin, (_req, res) => {
    try {
      res.json({ url: authorizeUrl(), redirectUri: redirectUri(), scopes: IG_SCOPES });
    } catch (e) {
      handle(res, "connect-url", e);
    }
  });

  // ── OAuth 콜백: 인스타가 브라우저를 여기로 되돌려보낸다 ──
  // 공개 경로일 수밖에 없다(Bearer 헤더를 붙일 수 없음). state 서명으로 우리가 시작한 요청임을 확인한다.
  app.get("/api/instagram/oauth/callback", async (req: Request, res: Response) => {
    const page = (title: string, body: string) =>
      res.status(200).type("html").send(
        `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
          `<div style="font-family:system-ui;padding:40px;max-width:640px;margin:0 auto">${body}` +
          `<p style="margin-top:24px"><a href="/admin">← 관리자 페이지로 돌아가기</a></p></div>`,
      );

    try {
      if (req.query.error) {
        return page("연결 취소됨", `<h2>인스타 연결이 취소되었습니다</h2><p>${String(req.query.error_description ?? req.query.error)}</p>`);
      }
      if (!verifyState(String(req.query.state ?? ""))) {
        console.warn("[IG OAuth] state 검증 실패");
        return page("연결 실패", "<h2>요청이 유효하지 않습니다</h2><p>10분이 지나 만료되었을 수 있습니다. 관리자 페이지에서 다시 시도해 주세요.</p>");
      }
      const code = String(req.query.code ?? "");
      if (!code) return page("연결 실패", "<h2>인증 코드가 없습니다</h2>");

      const r = await completeOAuth(code);
      return page(
        "연결 완료",
        `<h2>인스타그램 연결 완료</h2><p><b>@${r.username}</b> 계정이 연결되었습니다.</p>` +
          `<p>토큰 만료: ${r.expiresAt.toLocaleString("ko-KR")} (자동 갱신됨)</p>` +
          `<p style="color:#666;font-size:14px">승인된 권한: ${r.scopes || "-"}</p>`,
      );
    } catch (e: any) {
      console.error(`[IG OAuth] 콜백 실패: ${e?.message}`);
      return page("연결 실패", `<h2>연결에 실패했습니다</h2><pre style="white-space:pre-wrap;color:#b00">${e?.message}</pre>`);
    }
  });

  // ── 진단: 지금 무엇이 준비됐고 무엇이 빠졌는지 한눈에 ──
  app.get("/api/admin/instagram/diagnostics", requireAdmin, async (_req, res) => {
    try {
      const t = await getIgToken();
      const out: any = {
        env: {
          appId: !!igAppId(),
          appSecret: !!igAppSecret(),
          // 값이 "있다"와 "맞다"는 다르다. 대시보드에서 가려진 표시(••••)를 그대로 복사해
          // 넣는 실수가 흔한데, 그러면 서명 검증이 전부 조용히 실패한다.
          // 실제 앱 시크릿은 32자리 16진수 → 형식만 검사(값은 절대 노출하지 않음).
          appSecretLooksValid: /^[0-9a-f]{32}$/i.test(igAppSecret() ?? ""),
          webhookVerifyToken: !!verifyToken(),
          publicBaseUrl: process.env.PUBLIC_BASE_URL?.trim() || null,
        },
        token: t
          ? {
              source: t.source,
              account: t.accountLabel,
              scope: t.scope,
              expiresAt: t.expiresAt?.toISOString() ?? null,
              daysLeft: t.expiresAt ? Math.floor((t.expiresAt.getTime() - Date.now()) / 86_400_000) : null,
            }
          : null,
      };

      try {
        out.webhookUrl = `${redirectUri().replace("/oauth/callback", "/webhook")}`;
      } catch {
        out.webhookUrl = null; // PUBLIC_BASE_URL 미설정
      }

      if (t) {
        try {
          out.me = await getMe();
        } catch (e: any) {
          out.me = { error: e?.message };
        }
        try {
          out.subscribedFields = await getSubscribedFields();
        } catch (e: any) {
          out.subscribedFields = { error: e?.message };
        }
      }

      // 스코프 진단: 재인증이 필요한지 바로 알 수 있게
      const granted = (t?.scope ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      out.missingScopes = t?.source === "db" ? IG_SCOPES.filter((s) => !granted.includes(s)) : null;

      res.json(out);
    } catch (e) {
      handle(res, "diagnostics", e);
    }
  });

  // ── 웹훅 구독 (연결 후 1회) ──
  app.post("/api/admin/instagram/subscribe", requireAdmin, async (_req, res) => {
    try {
      await subscribeWebhooks(["comments", "messages"]);
      res.json({ ok: true, subscribedFields: await getSubscribedFields() });
    } catch (e) {
      handle(res, "subscribe", e);
    }
  });

  // ── 토큰 수동 갱신 ──
  app.post("/api/admin/instagram/refresh-token", requireAdmin, async (_req, res) => {
    try {
      res.json(await refreshIfNeeded());
    } catch (e) {
      handle(res, "refresh-token", e);
    }
  });

  // ── 수신된 웹훅 이벤트 최근 목록 (실제 페이로드 확인용) ──
  app.get("/api/admin/instagram/events", requireAdmin, async (req, res) => {
    try {
      if (!db) return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const rows = await db.select().from(igEvents).orderBy(desc(igEvents.receivedAt)).limit(limit);
      res.json(rows);
    } catch (e) {
      handle(res, "events", e);
    }
  });
}
