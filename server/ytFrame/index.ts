// 쇼츠 썸네일 장면 선택 — 서버 진입점(싱글턴·등록 훅·워커 API).
// 켜짐 조건: 환경변수 YT_FRAME_WORKER_TOKEN 이 있을 때만. 없으면 작업 등록도, 워커 API 도 꺼진다(fail-closed).
import crypto from "crypto";
import type { Express, Request, Response, NextFunction } from "express";
import { db } from "../db";
import { checkYoutubeProcessing } from "../youtube";
import { sendAlert, esc } from "../knop/alertBot";
import { createFrameService, type FrameService } from "./service";
import { type Q, VERIFY_RESULTS } from "./store";

const workerToken = () => (process.env.YT_FRAME_WORKER_TOKEN || "").trim();
export const ytFrameEnabled = () => workerToken().length >= 32;

let _svc: FrameService | null = null;
export function getFrameService(): FrameService | null {
  if (_svc) return _svc;
  if (!ytFrameEnabled() || !db) return null;
  {
    _svc = createFrameService({
      q: (db as any).$client as Q,
      checkProcessing: checkYoutubeProcessing,
      alert: sendAlert,
      esc,
    });
  }
  return _svc;
}

/** 시험용: 서비스 주입 */
export function _setFrameServiceForTest(s: FrameService | null) { _svc = s; }

/**
 * 유튜브 업로드 성공 직후 호출(배포 요청을 막지 않도록 실패는 삼키고 로그만).
 * 같은 영상 ID 로 두 번 불려도 작업은 1건만 생긴다.
 */
export async function enqueueShortsFrameTask(t: {
  videoJobId: string; videoId: string; title: string; r2Key: string; privacyStatus: string;
}): Promise<void> {
  const svc = getFrameService();
  if (!svc) return;
  try {
    await svc.enqueue({
      videoJobId: t.videoJobId, videoId: t.videoId, expectedTitle: t.title,
      sourceR2Key: t.r2Key, privacyStatus: t.privacyStatus, frameSec: 0,
    });
  } catch (e: any) {
    console.error(`[YT FRAME] 작업 등록 실패 ${t.videoId}: ${e?.message}`);
    try {
      await sendAlert(`🖼 <b>쇼츠 썸네일 작업 등록 실패</b>\n영상: ${esc(t.videoId)}\n이유: ${esc(e?.message)}`);
    } catch {}
  }
}

/** 워커 인증: Bearer 토큰, 시간차 공격 방지 비교. 토큰 미설정이면 503 */
export function requireFrameWorker(req: Request, res: Response, next: NextFunction) {
  const expected = workerToken();
  if (!ytFrameEnabled()) return res.status(503).json({ error: "disabled" });
  const got = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const a = crypto.createHash("sha256").update(got).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  if (!got || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: "unauthorized" });
  next();
}

const STAGES = new Set(["env", "identity", "navigate", "edit", "save", "verify", "worker"]);

export function registerYtFrameRoutes(app: Express, getSvc: () => FrameService | null = getFrameService) {
  const svcOr503 = (res: Response) => {
    const s = getSvc();
    if (!s) res.status(503).json({ error: "disabled" });
    return s;
  };

  // 롱폴링: 넘길 작업이 있으면 200 {task}, 대기 시간 안에 없으면 204
  app.get("/api/yt-frame/next", requireFrameWorker, async (req, res) => {
    const svc = svcOr503(res); if (!svc) return;
    const waitSec = Math.min(Math.max(Number(req.query.wait) || 0, 0), 55);
    const ac = new AbortController();
    res.on("close", () => { if (!res.writableEnded) ac.abort(); });
    try {
      const t = await svc.next(waitSec * 1000, ac.signal);
      if (ac.signal.aborted) return;
      if (!t) return res.status(204).end();
      res.json({
        task: {
          id: t.id, leaseToken: t.lease_token, videoId: t.video_id, expectedTitle: t.expected_title,
          liveTitle: t.live_title, privacyStatus: t.live_privacy ?? t.privacy_status,
          frameSec: t.frame_sec, attempts: t.attempts, sourceR2Key: t.source_r2_key,
        },
      });
    } catch (e: any) {
      console.error(`[YT FRAME] next 오류: ${e?.message}`);
      if (!res.headersSent) res.status(500).json({ error: "internal" });
    }
  });

  const body = (req: Request) => (req.body ?? {}) as Record<string, any>;
  const handle = (fn: (svc: FrameService, id: string, b: Record<string, any>) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      const svc = svcOr503(res); if (!svc) return;
      const b = body(req);
      if (typeof b.token !== "string" || !b.token) return res.status(400).json({ error: "token required" });
      try {
        const r = await fn(svc, String(req.params.id), b);
        const ok = typeof r === "boolean" ? r : (r as any)?.applied;
        // 리스를 잃었으면(다른 실행이 가져감·이미 종결) 409 — 워커는 즉시 손을 떼야 한다
        if (!ok) return res.status(409).json({ error: "lease lost" });
        res.json({ ok: true, result: r });
      } catch (e: any) {
        console.error(`[YT FRAME] 보고 오류: ${e?.message}`);
        res.status(500).json({ error: "internal" });
      }
    };

  app.post("/api/yt-frame/:id/heartbeat", requireFrameWorker, handle((s, id, b) => s.heartbeat(id, b.token)));
  app.post("/api/yt-frame/:id/saved", requireFrameWorker, handle((s, id, b) => s.saved(id, b.token)));
  app.post("/api/yt-frame/:id/verified", requireFrameWorker, handle((s, id, b) => {
    const result = b.result;
    if (!VERIFY_RESULTS.includes(result)) throw new Error("bad result");
    return s.verified(id, b.token, result, String(b.detail ?? ""));
  }));
  app.post("/api/yt-frame/:id/failed", requireFrameWorker, handle((s, id, b) => {
    const stage = STAGES.has(b.stage) ? b.stage : "worker";
    return s.failed(id, b.token, stage, String(b.reason ?? "이유 없음"), b.retryable === true);
  }));
}

/** server/index.ts listen 콜백에서 1회 호출: 힌트 복원 + 매일 점검 등록 */
let _booted = false;
export async function startYtFrameService(scheduleDaily: (name: string, fn: () => Promise<void>, bootDelayMs?: number) => void) {
  if (_booted) return;
  const svc = getFrameService();
  if (!svc) { console.log("[YT FRAME] 꺼짐(YT_FRAME_WORKER_TOKEN 없음)"); return; }
  _booted = true;
  try { await svc.init(); } catch (e: any) { console.error(`[YT FRAME] 부팅 복원 실패: ${e?.message}`); }
  scheduleDaily("쇼츠 썸네일 대기 점검", async () => { await svc.dailyCheck(); }, 60_000);
}
