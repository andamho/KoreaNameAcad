// 작업큐 worker entrypoint — Railway 등에서 단일 명령으로 실행. 반복 claim → 처리, 빈 큐 대기, 주기적 reaper, graceful shutdown.
// ⚠️ 소유자 연결(NEON_DATABASE_URL) 미사용. 전용 ORCHESTRATION_QUEUE_URL(=orchestration_writer credential)만.
// ⚠️ raw lease token·credential 을 로그에 남기지 않는다(worker id·outcome·개수만).
// 동시 worker 안전: claim=FOR UPDATE SKIP LOCKED, reaper=FOR UPDATE OF e SKIP LOCKED → 여러 worker 동시 실행 안전.
//
// 실행:
//   ORCHESTRATION_QUEUE_URL=<writer dsn> node --import tsx/esm scripts/queueWorker.ts
//   (환경: WORKER_IDLE_MS 기본 2000 · REAPER_EVERY_MS 기본 30000 · WORKER_HEARTBEAT=true 로 장시간 heartbeat)
import crypto from "crypto";
import os from "os";
import { acquireQueueClient, queueConnectionConfigured, queueHostHash } from "../server/jobQueue/connection";
import { processNextJob } from "../server/jobQueue/worker";
import { reapExpired } from "../server/jobQueue/reaper";
import { internalReportComputeAdapter } from "../server/jobQueue/adapters/internalReport";
import type { JobAdapter } from "../server/jobQueue/adapters/types";

const IDLE_MS = Number(process.env.WORKER_IDLE_MS ?? 2000);
const REAPER_EVERY_MS = Number(process.env.REAPER_EVERY_MS ?? 30000);
const USE_HEARTBEAT = (process.env.WORKER_HEARTBEAT ?? "").trim() === "true";

// 운영 adapter 등록(실제 처리 코드 호출). echo/test adapter 는 등록하지 않는다.
function buildAdapters(): Map<string, JobAdapter> {
  const list: JobAdapter[] = [internalReportComputeAdapter()];
  return new Map(list.map((a) => [a.jobType, a]));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runWorker(signal?: { stopped: boolean }): Promise<void> {
  if (!queueConnectionConfigured("worker")) {
    console.error("[worker] ❌ ORCHESTRATION_WORKER_URL 미설정 — fail-closed(소유자 연결 비의존).");
    process.exit(1);
  }
  const workerId = `${os.hostname()}#${process.pid}#${crypto.randomBytes(3).toString("hex")}`;
  const adapters = buildAdapters();
  const { queue, release } = await acquireQueueClient("worker");
  console.log(`[worker] start id=${workerId} ${queueHostHash("worker")} adapters=[${[...adapters.keys()].join(",")}] heartbeat=${USE_HEARTBEAT}`);

  const stop = signal ?? { stopped: false };
  let lastReap = 0;
  let processed = 0;
  try {
    while (!stop.stopped) {
      // 주기적 reaper(다중 worker 동시 실행 안전 — SKIP LOCKED).
      if (Date.now() - lastReap >= REAPER_EVERY_MS) {
        lastReap = Date.now();
        try { const s = await reapExpired(queue, { batch: 20 }); if (s.reaped) console.log(`[worker] reaper reaped=${s.reaped} requeued=${s.requeued} needsReview=${s.needsReview}`); }
        catch (e: any) { console.error(`[worker] reaper error: ${String(e?.message ?? e).slice(0, 200)}`); }
      }
      let r;
      try { r = await processNextJob(queue, workerId, adapters, { heartbeat: USE_HEARTBEAT }); }
      catch (e: any) { console.error(`[worker] tick error: ${String(e?.message ?? e).slice(0, 200)}`); await sleep(IDLE_MS); continue; }
      if (r.outcome === "idle") { await sleep(IDLE_MS); continue; }
      processed++;
      console.log(`[worker] job=${r.jobId} → ${r.outcome}${r.detail ? " (" + r.detail + ")" : ""}`); // token 미포함
    }
  } finally {
    await release().catch(() => {});
    console.log(`[worker] stopped id=${workerId} processed=${processed}`);
  }
}

// 직접 실행 판정: tsx(.ts) 와 번들(dist/queueWorker.js) 둘 다 지원.
const entry = (process.argv[1] || "").replace(/\\/g, "/");
const isDirect = entry.endsWith("queueWorker.ts") || entry.endsWith("queueWorker.js");
if (isDirect) {
  const stop = { stopped: false };
  const shutdown = (sig: string) => { console.log(`[worker] ${sig} → graceful shutdown(현재 tick 완료 후 종료)`); stop.stopped = true; };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  runWorker(stop).then(() => process.exit(0)).catch((e) => { console.error("[worker] fatal:", String(e?.message ?? e).slice(0, 200)); process.exit(1); });
}
