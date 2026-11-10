// 작명장 만들기 주문 창구 (2026-11-10 대표님 '관리자페이지에서 이름·한자 숫자 세 개 → 작명장 자동')
//   관리자 화면 ──(주문)──▶ 이 창구(서버 메모리) ◀──(가져가기·보고)── PC 워커(kop-report-sync)
//   한글 획수 계산·성씨 시트·수리 문단·PDF 는 전부 PC 에서 한다(Desktop\작명장\만들기\작명장만들기.mjs).
//   DB 를 쓰지 않는다: 주문은 몇 분짜리라 메모리로 충분하고, Neon 을 깨우지 않는다. 서버가 다시 켜지면 진행 중 주문만 사라진다.
import crypto from "crypto";
import type { Express, Request, Response, NextFunction, RequestHandler } from "express";

type Step = "plan" | "make";
type Job = {
  id: string; step: Step; order: Record<string, any>; overwrite: boolean;
  status: "queued" | "working" | "done" | "error";
  plan?: unknown; pdf?: string; url?: string; error?: string;
  createdAt: number; updatedAt: number;
};

const jobs = new Map<string, Job>();
const waiters: Array<(j: Job | null) => void> = [];
let workerSeenAt = 0;
const KEEP_MS = 60 * 60 * 1000;      // 끝난 주문 보관 1시간
const STUCK_MS = 5 * 60 * 1000;      // PC 가 5분 넘게 답이 없으면 실패 처리

/** PC 워커와 나누는 열쇠. 따로 정하지 않으면 양쪽에 이미 있는 알림봇 토큰에서 만들어 낸다(새 환경변수 불필요). */
export function namingCertWorkerToken(): string {
  const own = (process.env.NAMING_CERT_WORKER_TOKEN || "").trim();
  if (own.length >= 32) return own;
  const base = (process.env.KOP_ALERT_BOT_TOKEN || "").trim();
  return base ? crypto.createHash("sha256").update("kop-naming-cert:" + base).digest("hex") : "";
}

function requireWorker(req: Request, res: Response, next: NextFunction) {
  const expected = namingCertWorkerToken();
  if (!expected) return res.status(503).json({ error: "disabled" });
  const got = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const a = crypto.createHash("sha256").update(got).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  if (!got || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: "unauthorized" });
  workerSeenAt = Date.now();
  next();
}

function sweep() {
  const now = Date.now();
  jobs.forEach((j, id) => {
    if (j.status === "working" && now - j.updatedAt > STUCK_MS) { j.status = "error"; j.error = "PC에서 5분 넘게 답이 없습니다. PC와 워커가 켜져 있는지 확인해 주세요."; j.updatedAt = now; }
    if ((j.status === "done" || j.status === "error") && now - j.updatedAt > KEEP_MS) jobs.delete(id);
  });
}

function enqueue(step: Step, order: Record<string, any>, overwrite = false): Job {
  sweep();
  const now = Date.now();
  const j: Job = { id: crypto.randomUUID(), step, order, overwrite, status: "queued", createdAt: now, updatedAt: now };
  jobs.set(j.id, j);
  const w = waiters.shift();
  if (w) { j.status = "working"; w(j); }
  return j;
}

function takeNext(waitMs: number, signal: AbortSignal): Promise<Job | null> {
  sweep();
  const first = Array.from(jobs.values()).find((j) => j.status === "queued");
  if (first) { first.status = "working"; first.updatedAt = Date.now(); return Promise.resolve(first); }
  if (waitMs <= 0) return Promise.resolve(null);
  return new Promise((resolve) => {
    const done = (j: Job | null) => { clearTimeout(t); const i = waiters.indexOf(done); if (i >= 0) waiters.splice(i, 1); resolve(j); };
    const t = setTimeout(() => done(null), waitMs);
    signal.addEventListener("abort", () => done(null), { once: true });
    waiters.push(done);
  });
}

// ── 입력 검사 ──
const HANGUL = /^[가-힣]{2,5}$/;
const strokes = (v: unknown): number[] | null => {
  const a = Array.isArray(v) ? v.map(Number) : [];
  return a.length === 3 && a.every((n) => Number.isInteger(n) && n >= 1 && n <= 40) ? a : null;
};
function cleanOrder(b: Record<string, any>, withChoice: boolean): { order?: Record<string, any>; error?: string } {
  const name = String(b.이름 || "").replace(/\s+/g, "");
  if (!HANGUL.test(name)) return { error: "이름을 한글로 넣어 주세요." };
  const hj = strokes(b.한자);
  if (!hj) return { error: "한자 획수 세 개를 숫자로 넣어 주세요." };
  const fam = Array.isArray(b.가족) ? b.가족.slice(0, 6) : [];
  const 가족: Array<{ 이름: string; 한자: number[] }> = [];
  for (const f of fam) {
    const n = String(f?.이름 || "").replace(/\s+/g, ""); const s = strokes(f?.한자);
    if (!n && !f?.한자?.some?.((x: unknown) => x)) continue;
    if (!HANGUL.test(n) || !s) return { error: "가족 이름과 한자 획수 세 개를 확인해 주세요." };
    가족.push({ 이름: n, 한자: s });
  }
  const order: Record<string, any> = { 이름: name, 한자: hj, 가족 };
  const one = (v: unknown) => { const s = String(v || "").trim(); return s && Array.from(s).length <= 2 ? s : undefined; };
  if (b.성한자) order.성한자 = one(b.성한자);
  if (b.대상 === "아이" || b.대상 === "성인") order.대상 = b.대상;
  if (withChoice) {
    order.둘째 = one(b.둘째); order.셋째 = one(b.셋째);
    const three = (v: unknown) => (Array.isArray(v) && v.length >= 1 && v.length <= 3 && v.every((n) => Number.isInteger(Number(n)) && Number(n) >= 1 && Number(n) <= 81) ? v.map(Number) : null);
    const hg = three(b.한글문단), hn = three(b.한자문단);
    if (!order.둘째 || !order.셋째) return { error: "한자 두 글자를 골라 주세요." };
    if (!hg || !hn) return { error: "한글·한문 문단을 골라 주세요." };
    order.한글문단 = hg; order.한자문단 = hn;
    const 판: Record<string, number> = {};
    for (const [k, v] of Object.entries(b.판 || {})) if (/^\d{1,2}$/.test(k) && Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) < 10) 판[k] = Number(v);
    order.판 = 판;
  }
  return { order };
}

const view = (j: Job) => ({ id: j.id, step: j.step, status: j.status, plan: j.plan, pdf: j.pdf, url: j.url, error: j.error });

export function registerNamingCertRoutes(app: Express, requireAdmin: RequestHandler) {
  const P = "/api/knop/naming-cert";

  // ── 관리자 화면 ──
  app.get(`${P}/worker`, requireAdmin, (_req, res) => {
    res.json({ online: Date.now() - workerSeenAt < 100_000, seenAt: workerSeenAt || null, enabled: !!namingCertWorkerToken() });
  });
  app.post(`${P}/plan`, requireAdmin, (req, res) => {
    const c = cleanOrder(req.body ?? {}, false);
    if (c.error) return res.status(400).json({ error: c.error });
    res.json({ id: enqueue("plan", c.order!).id });
  });
  app.post(`${P}/make`, requireAdmin, (req, res) => {
    const c = cleanOrder(req.body ?? {}, true);
    if (c.error) return res.status(400).json({ error: c.error });
    res.json({ id: enqueue("make", c.order!, req.body?.덮어쓰기 === true).id });
  });
  app.get(`${P}/job/:id`, requireAdmin, (req, res) => {
    sweep();
    const j = jobs.get(String(req.params.id));
    if (!j) return res.status(404).json({ error: "주문을 찾을 수 없습니다. 다시 시작해 주세요." });
    res.json(view(j));
  });

  // ── PC 워커 ──
  app.get(`${P}/worker/next`, requireWorker, async (req, res) => {
    const waitSec = Math.min(Math.max(Number(req.query.wait) || 0, 0), 55);
    const ac = new AbortController();
    res.on("close", () => { if (!res.writableEnded) ac.abort(); });
    const j = await takeNext(waitSec * 1000, ac.signal);
    if (ac.signal.aborted) { if (j && j.status === "working") j.status = "queued"; return; }   // 워커가 끊겼으면 되돌려 놓음
    workerSeenAt = Date.now();
    if (!j) return res.status(204).end();
    res.json({ job: { id: j.id, step: j.step, order: j.order, overwrite: j.overwrite } });
  });
  app.post(`${P}/worker/:id/report`, requireWorker, (req, res) => {
    const j = jobs.get(String(req.params.id));
    if (!j) return res.status(404).json({ error: "gone" });
    const b = (req.body ?? {}) as Record<string, any>;
    j.updatedAt = Date.now();
    if (b.ok === true) { j.status = "done"; j.plan = b.plan; j.pdf = b.pdf ? String(b.pdf) : undefined; j.url = b.url ? String(b.url) : undefined; }
    else { j.status = "error"; j.error = String(b.error || "PC에서 만들지 못했습니다.").slice(0, 600); j.plan = b.plan; }
    res.json({ ok: true });
  });
}
