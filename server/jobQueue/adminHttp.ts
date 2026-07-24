// 관리자 작업목록 HTTP 배선 — 기존 requireAdmin 인증 사용. FEATURE_JOB_QUEUE=false 기본(routes 에서 게이트).
// ⚠️ 전용 연결(ORCHESTRATION_QUEUE_URL)로만 접근. raw lease token·credential·민감 payload 비노출(adminApi 가 이미 필터).
//   요청당 전용 pg.Client(트랜잭션 안전) — cancel 은 BEGIN/COMMIT 을 쓰므로 pool round-robin 금지.
import type { Express, RequestHandler } from "express";
import { acquireQueueClient, queueConnectionConfigured } from "./connection";
import { listJobs, getJobDetail, requestJobCancel } from "./adminApi";
import { isJobStatus, type JobStatus } from "../../shared/jobQueueContract";

async function withQueue<T>(fn: (q: import("./types").QueueClient) => Promise<T>): Promise<T> {
  const { queue, release } = await acquireQueueClient();
  try { return await fn(queue); } finally { await release().catch(() => {}); }
}

/** 관리자 작업목록 API 를 app 에 마운트. prefix 예: "/api/knop". */
export function mountJobQueueAdmin(app: Express, prefix: string, requireAdmin: RequestHandler): void {
  const base = `${prefix}/jobqueue`;
  const guard503: RequestHandler = (_req, res, next) => {
    if (!queueConnectionConfigured()) { res.status(503).json({ error: "queue-connection-unconfigured", detail: "ORCHESTRATION_QUEUE_URL 미설정" }); return; }
    next();
  };

  app.get(`${base}/jobs`, requireAdmin, guard503, async (req, res) => {
    try {
      const status = typeof req.query.status === "string" && isJobStatus(req.query.status) ? (req.query.status as JobStatus) : undefined;
      const jobType = typeof req.query.jobType === "string" ? req.query.jobType : undefined;
      const ownerScope = typeof req.query.ownerScope === "string" ? req.query.ownerScope : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const items = await withQueue((q) => listJobs(q, { status, jobType, ownerScope, limit }));
      res.json({ items });
    } catch (e: any) { res.status(500).json({ error: "list-failed", detail: String(e?.message ?? e).slice(0, 200) }); }
  });

  app.get(`${base}/jobs/:id`, requireAdmin, guard503, async (req, res) => {
    try {
      const detail = await withQueue((q) => getJobDetail(q, req.params.id));
      if (!detail) { res.status(404).json({ error: "not-found" }); return; }
      res.json(detail);
    } catch (e: any) { res.status(500).json({ error: "detail-failed", detail: String(e?.message ?? e).slice(0, 200) }); }
  });

  app.post(`${base}/jobs/:id/cancel`, requireAdmin, guard503, async (req, res) => {
    try {
      const adminRef = typeof (req as any).adminRef === "string" ? (req as any).adminRef : "admin";
      const r = await withQueue((q) => requestJobCancel(q, req.params.id, adminRef));
      if (!r.requested && !r.alreadyTerminal) { res.status(404).json({ error: "not-found" }); return; }
      res.json({ requested: r.requested, alreadyTerminal: r.alreadyTerminal });
    } catch (e: any) { res.status(500).json({ error: "cancel-failed", detail: String(e?.message ?? e).slice(0, 200) }); }
  });
}
