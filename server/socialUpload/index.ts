// 틱톡·네이버 클립 자동 업로드 — 서버 쪽(작업 등록·PC 워커 API·알림).
// 켜짐 조건: 워커 토큰(SOCIAL_WORKER_TOKEN, 없으면 YT_FRAME_WORKER_TOKEN)이 있을 때. 없으면 등록·API 모두 꺼짐.
// DB 조회 최소화: 쇼츠 썸네일 워커와 같은 방식 — 다음 일이 생기는 시각을 메모리에 들고, 그 전에는 롱폴링이 DB 를 안 건드린다.
import crypto from "crypto";
import type { Express, Request, Response, NextFunction } from "express";
import { db } from "../db";
import { sendAlert, esc } from "../knop/alertBot";
import {
  type Q, type Platform, type SocialTask, PLATFORMS, MAX_ATTEMPTS,
  enqueueSocial, claimSocial, heartbeatSocial, markPosting, markPosted, markSocialFailed,
  parkStalePosting, secondsUntilNextSocial, getSocialTask,
} from "./store";

const token = () => (process.env.SOCIAL_WORKER_TOKEN || process.env.YT_FRAME_WORKER_TOKEN || "").trim();
export const socialEnabled = () => token().length >= 32 && !!db;
const q = (): Q => (db as any).$client as Q;
const PNAME: Record<Platform, string> = { tiktok: "틱톡", naver_clip: "네이버 클립" };

// ── 메모리 힌트 + 롱폴링 ──
let nextAtMs: number | null = null;
let timer: NodeJS.Timeout | null = null;
const waiters = new Set<() => void>();
const wakeAll = () => Array.from(waiters).forEach((w) => w());
function setHint(sec: number | null) {
  if (timer) { clearTimeout(timer); timer = null; }
  nextAtMs = sec === null ? null : Date.now() + sec * 1000;
  if (nextAtMs === null) return;
  const d = Math.max(0, nextAtMs - Date.now());
  if (d === 0) return wakeAll();
  timer = setTimeout(wakeAll, Math.min(d, 2 ** 31 - 1));
  timer.unref?.();
}
async function alertTask(t: Pick<SocialTask, "video_job_id" | "platform" | "attempts">, head: string, reason: string) {
  try {
    const r = await q().query(`select title, yt_video_id from video_jobs where id = $1`, [t.video_job_id]);
    const job = r.rows[0] ?? {};
    await sendAlert(
      `📤 <b>${esc(PNAME[t.platform])} 자동 업로드 ${esc(head)}</b>\n` +
      `영상: ${esc(String(job.title ?? "").replace(/\s#.*$/, ""))}` + (job.yt_video_id ? ` (youtu.be/${esc(job.yt_video_id)})` : "") + `\n` +
      `이유: ${esc(reason)}\n시도: ${t.attempts}/${MAX_ATTEMPTS}`,
    );
  } catch (e: any) { console.error(`[SOCIAL] 알림 실패: ${e?.message}`); }
}
async function refreshHint(minSec = 0) {
  for (const t of await parkStalePosting(q())) await alertTask(t, "확인 필요", "게시 버튼을 누른 뒤 결과 보고가 없음 — 게시됐는지 직접 확인해 주세요(자동 재시도 안 함)");
  const s = await secondsUntilNextSocial(q());
  setHint(s === null ? null : Math.max(s, minSec));
}
let serial: Promise<unknown> = Promise.resolve();
const serialized = <T>(fn: () => Promise<T>) => { const p = serial.then(fn, fn); serial = p.catch(() => {}); return p; };

async function next(waitMs: number, signal: AbortSignal): Promise<SocialTask | null> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    if (signal.aborted) return null;
    if (nextAtMs !== null && nextAtMs <= Date.now()) {
      const t = await serialized(async () => { const c = await claimSocial(q()); if (!c) await refreshHint(1); return c; });
      if (t) return t;
    }
    const remain = deadline - Date.now();
    if (remain <= 0) return null;
    await new Promise<void>((res) => {
      const done = () => { clearTimeout(to); waiters.delete(done); signal.removeEventListener("abort", done); res(); };
      const to = setTimeout(done, remain);
      waiters.add(done);
      signal.addEventListener("abort", done);
    });
  }
}

/** 배포 직후 호출: 틱톡·네이버 클립 작업 등록(영상 배포 기록당 플랫폼별 1건) */
export async function enqueueSocialUploads(videoJobId: string): Promise<void> {
  if (!socialEnabled()) return;
  try {
    let any = false;
    for (const p of PLATFORMS) any = (await enqueueSocial(q(), videoJobId, p)).created || any;
    if (any) { console.log(`[SOCIAL] 등록 ${videoJobId}`); setHint(0); }
  } catch (e: any) {
    console.error(`[SOCIAL] 등록 실패 ${videoJobId}: ${e?.message}`);
    try { await sendAlert(`📤 <b>틱톡·클립 자동 업로드 등록 실패</b>\n배포 기록: ${esc(videoJobId)}\n이유: ${esc(e?.message)}`); } catch {}
  }
}

function requireWorker(req: Request, res: Response, nextFn: NextFunction) {
  if (!socialEnabled()) return res.status(503).json({ error: "disabled" });
  const got = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const a = crypto.createHash("sha256").update(got).digest();
  const b = crypto.createHash("sha256").update(token()).digest();
  if (!got || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: "unauthorized" });
  nextFn();
}

export type Materials = {
  title: string; videoUrl: string; fileName: string;
  tiktokCaption: string; naverDescription: string; coverSec: number;
};

/** 워커 API. 자료(영상 주소·본문)는 routes.ts 가 만든다(고정 문구가 거기 있음) */
export function registerSocialUploadRoutes(app: Express, buildMaterials: (videoJobId: string, platform: Platform) => Promise<Materials>) {
  app.get("/api/social-upload/next", requireWorker, async (req, res) => {
    const ac = new AbortController();
    res.on("close", () => { if (!res.writableEnded) ac.abort(); });
    try {
      const waitSec = Math.min(Math.max(Number(req.query.wait) || 0, 0), 55);
      const t = await next(waitSec * 1000, ac.signal);
      if (ac.signal.aborted) return;
      if (!t) return res.status(204).end();
      res.json({ task: { id: t.id, videoJobId: t.video_job_id, platform: t.platform, attempts: t.attempts, leaseToken: t.lease_token } });
    } catch (e: any) {
      console.error(`[SOCIAL] next 오류: ${e?.message}`);
      if (!res.headersSent) res.status(500).json({ error: "internal" });
    }
  });

  const withLease = (fn: (t: SocialTask, b: any) => Promise<unknown>) => async (req: Request, res: Response) => {
    try {
      const b = req.body ?? {};
      const t = await getSocialTask(q(), String(req.params.id));
      if (!t || typeof b.token !== "string" || t.lease_token !== b.token) return res.status(409).json({ error: "lease lost" });
      const r = await fn(t, b);
      if (r === false || (r as any)?.applied === false) return res.status(409).json({ error: "lease lost" });
      res.json({ ok: true, result: r });
    } catch (e: any) {
      console.error(`[SOCIAL] 보고 오류: ${e?.message}`);
      res.status(500).json({ error: e?.message || "internal" });
    }
  };

  app.post("/api/social-upload/:id/materials", requireWorker, withLease((t) => buildMaterials(t.video_job_id, t.platform)));
  app.post("/api/social-upload/:id/heartbeat", requireWorker, withLease((t, b) => heartbeatSocial(q(), t.id, b.token)));
  app.post("/api/social-upload/:id/posting", requireWorker, withLease((t, b) => markPosting(q(), t.id, b.token)));
  app.post("/api/social-upload/:id/posted", requireWorker, withLease(async (t, b) => {
    const ok = await markPosted(q(), t.id, b.token, typeof b.url === "string" ? b.url.slice(0, 500) : null);
    if (ok) console.log(`[SOCIAL] 게시 완료 ${t.platform} ${t.video_job_id}`);
    return ok;
  }));
  app.post("/api/social-upload/:id/failed", requireWorker, withLease(async (t, b) => {
    const r = await markSocialFailed(q(), t.id, b.token, String(b.stage || "worker").slice(0, 40), String(b.reason || "이유 없음"), b.retryable === true);
    if (r.applied && r.state !== "queued") await alertTask({ ...t, attempts: r.attempts }, r.state === "needs_review" ? "확인 필요" : "실패", String(b.reason || ""));
    await refreshHint();
    return r;
  }));
}

/** server/index.ts listen 콜백에서 1회: 힌트 복원 + 매일 점검 */
let booted = false;
export async function startSocialUpload(scheduleDaily: (name: string, fn: () => Promise<void>, bootDelayMs?: number) => void) {
  if (booted) return;
  if (!socialEnabled()) { console.log("[SOCIAL] 꺼짐(워커 토큰 없음)"); return; }
  booted = true;
  try { await refreshHint(); } catch (e: any) { console.error(`[SOCIAL] 부팅 복원 실패: ${e?.message}`); }
  scheduleDaily("틱톡·클립 업로드 대기 점검", async () => {
    await refreshHint();
    const r = await q().query(`select video_job_id, platform, state from social_upload_tasks where state in ('queued','running') and created_at < now() - interval '6 hours' limit 10`);
    if (r.rows.length) {
      await sendAlert(`📤 <b>틱톡·클립 자동 업로드 ${r.rows.length}건이 6시간 넘게 남아 있음</b>\n이 PC 의 업로드 워커가 꺼져 있는지 확인하세요.\n` +
        r.rows.map((x: any) => `• ${esc(PNAME[x.platform as Platform])} ${esc(x.video_job_id)} — ${esc(x.state)}`).join("\n"));
    }
  }, 75_000);
}
