// 운영 smoke job — worker 가동 후 안전하게 큐 경로를 1회 검증. 두 모드:
//   SMOKE_MODE=preview  (기본) : internal-report **preview 계산** adapter. 고객 데이터·파일 변경 0(순수 계산). production 안전.
//   SMOKE_MODE=name-report      : ⚠️ **실제 업무** adapter(processFile). report_matches/crm_files 에 **업무 행을 기록**한다.
//                                 → production 금지. SMOKE_ALLOW_BUSINESS_WRITE=true + SMOKE_NONPROD_ACK=true 필수(비-prod 단언).
// ⚠️ 공통: raw payload·credential·lease token·고객 PII 출력 금지. job ID·상태·해시 존재여부만.
// ⚠️ CONFIRM_QUEUE_SMOKE=true 필수. idempotency 고정(중복 실행 = 같은 job, 새로 안 만듦).
//
// 사용(worker 가 별도로 가동 중):
//   CONFIRM_QUEUE_SMOKE=true ORCHESTRATION_WORKER_URL=<writer dsn> node dist/queueSmoke.js
//   (SMOKE_WORKER_INLINE=true 면 worker 없이 이 프로세스가 직접 처리 — 격리/자체 검증용)
//   (ORCHESTRATION_ADMIN_URL 있으면 admin 조회까지 확인)
import "dotenv/config";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { acquireQueueClient, queueConnectionConfigured } from "../server/jobQueue/connection";
import { createJob } from "../server/jobQueue/createJob";
import { processNextJob } from "../server/jobQueue/worker";
import { internalReportComputeAdapter } from "../server/jobQueue/adapters/internalReport";
import { makeNameReportAdapter, NAME_REPORT_JOB_TYPE, type NameReportDeps } from "../server/jobQueue/adapters/nameReport";
import type { ProcessInput } from "../server/knop/reportProcessor";
import { getJobDetail } from "../server/jobQueue/adminApi";
import { sha256Hex } from "../server/jobQueue/idempotency";
import type { JobAdapter } from "../server/jobQueue/adapters/types";
import type { RequestVersionSnapshot } from "../shared/jobQueueContract";
import type { QueueClient } from "../server/jobQueue/types";

const die = (m: string): never => { console.error(`[smoke] ❌ ${m}`); process.exit(1); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isTrue = (v: string | undefined) => (v || "").trim() === "true";

const snap: RequestVersionSnapshot = {
  schemaVersion: 1, pipelineVersion: "smoke-p1", transcriptionEngineVersion: null, transcriptionEngineHash: null,
  dictionaryVersion: null, normalizationVersion: null, correctionEngineVersion: null, correctionEngineHash: null,
  executorRequirement: null,
};

type Mode = "preview" | "name-report";

interface SmokePlan {
  jobType: string;
  input: unknown;
  adapter: JobAdapter;
  businessWrite: boolean; // true 면 실제 업무 행을 기록(비-prod 전용)
  note: string;
  // name-report 모드: 실행 전 합성 고객/상담 준비(멱등).
  prepare?: (c: QueueClient) => Promise<void>;
}

// ── preview(순수 계산) ──────────────────────────────────────────────────────
function previewPlan(): SmokePlan {
  const SMOKE_SOURCE_HASH = sha256Hex("queue-smoke-fixed-source");
  return {
    jobType: "internal-report", businessWrite: false, note: "preview 계산 adapter · 고객 데이터 변경 0",
    input: {
      ownerScope: "korea-name-acad", projectId: null, jobType: "internal-report",
      inputIdentity: { sourceAssetHash: SMOKE_SOURCE_HASH, reportType: "individual", rendererVersion: "smoke-r1" },
      requestVersionSnapshot: snap, executionOptions: null, payloadHash: sha256Hex("queue-smoke-payload"),
    },
    adapter: internalReportComputeAdapter(),
  };
}

// ── name-report(실제 업무 · 비-prod 전용) ────────────────────────────────────
// 합성 고객/상담 + test-double render/upload + REAL processFile. report_matches/crm_files 에 기록된다.
function nameReportPlan(): SmokePlan {
  const T = new Date("2026-07-01T00:00:00Z");
  const abs = path.join(os.tmpdir(), `smoke-nr-${crypto.randomBytes(4).toString("hex")}.pdf`);
  fs.writeFileSync(abs, "smoke-name-report-synthetic-content");
  const fileHash = crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
  const CUST = "smoke-cust-0001", CONS = "smoke-cons-0001";

  const deps: NameReportDeps = {
    db: null as any, // 실행 시점에 주입
    render: async () => Buffer.from("PNG-smoke-double"),          // TEST DOUBLE
    upload: async (key) => `/objects/${key}`,                     // TEST DOUBLE
    hashFile: (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"), // REAL
    now: () => T, uuid: () => crypto.randomUUID(),
    resolveInput: async (): Promise<ProcessInput> => ({          // TEST DOUBLE(합성)
      file: "SMOKE 합성 이름분석.pdf", absPath: abs, extractedName: "스모크", reportType: "individual", label: "스모크",
      candidates: [{
        customerId: CUST, customerName: "스모크", consultationId: CONS,
        applicationDate: T, applicationDateSource: "consultation", numPeople: 1, consultStatus: "완료", alreadyLinkedSameType: false,
      }],
    }),
  };

  return {
    jobType: NAME_REPORT_JOB_TYPE, businessWrite: true, note: "실제 업무 adapter(processFile) · report_matches/crm_files 기록 · 비-prod 전용",
    input: {
      ownerScope: "korea-name-acad", projectId: null, jobType: NAME_REPORT_JOB_TYPE,
      inputIdentity: { inputAssetHash: fileHash, fileContentHash: fileHash, locator: `smoke:${fileHash}` },
      requestVersionSnapshot: snap, executionOptions: null, payloadHash: sha256Hex("queue-smoke-nr-payload"),
    },
    prepare: async (c) => {
      await c.query(`INSERT INTO customers (id, name) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING`, [CUST, "스모크"]);
      await c.query(`INSERT INTO consultations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [CONS]);
    },
    adapter: makeNameReportAdapter(deps),
    // deps.db 는 실행 컨텍스트에서 주입 필요 → adapter 재생성 대신 아래 main 에서 처리.
  } as SmokePlan & { _deps: NameReportDeps };
}

function resolveMode(): Mode {
  const m = (process.env.SMOKE_MODE || (process.argv[2] ?? "") || "preview").trim().toLowerCase();
  if (m === "preview" || m === "internal-report" || m === "") return "preview";
  if (m === "name-report" || m === "namereport") return "name-report";
  return die(`알 수 없는 SMOKE_MODE: ${m} (preview | name-report)`);
}

export async function main(): Promise<number> {
  if (!isTrue(process.env.CONFIRM_QUEUE_SMOKE)) die("CONFIRM_QUEUE_SMOKE=true 필수(명시적 승인).");
  if (!queueConnectionConfigured("worker")) die("ORCHESTRATION_WORKER_URL 미설정(fail-closed).");

  const mode = resolveMode();
  const inline = isTrue(process.env.SMOKE_WORKER_INLINE);
  const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 30000);

  let plan: SmokePlan;
  if (mode === "preview") {
    plan = previewPlan();
  } else {
    // 실제 업무 smoke — production 금지. 두 개의 명시적 승인 + inline 필수.
    if (!isTrue(process.env.SMOKE_ALLOW_BUSINESS_WRITE)) die("name-report smoke 는 업무 행을 기록합니다. SMOKE_ALLOW_BUSINESS_WRITE=true 필수(비-prod 전용).");
    if (!isTrue(process.env.SMOKE_NONPROD_ACK)) die("SMOKE_NONPROD_ACK=true 필수 — 대상이 production 이 아님을 단언해야 합니다.");
    if (!inline) die("name-report smoke 는 SMOKE_WORKER_INLINE=true(자체 처리) 로만 실행합니다.");
    plan = nameReportPlan();
    console.log("[smoke] ⚠️ name-report(실제 업무) 모드 — report_matches/crm_files 에 합성 업무 행을 기록합니다. production 대상이면 즉시 중단하세요.");
  }
  console.log(`[smoke] mode=${mode} (${plan.note})`);

  const { queue, release } = await acquireQueueClient("worker");
  let jobId = "";
  try {
    // name-report: adapter deps.db 주입(실행 컨텍스트 = worker DB) + 합성 고객/상담 준비.
    let adapter = plan.adapter;
    if (mode === "name-report") {
      const p = plan as SmokePlan & { _deps: NameReportDeps };
      p._deps.db = queue as any;
      adapter = makeNameReportAdapter(p._deps);
      await plan.prepare?.(queue);
    }

    const { job, created } = await createJob(queue, plan.input as any);
    jobId = job.id;
    console.log(`[smoke] job=${jobId} created=${created} status=${job.status}`);

    if (inline) {
      // processNextJob 은 큐의 **다음** job 을 가져온다 → 자기 job 이 terminal 될 때까지 반복(최대 20회).
      const adapters = new Map<string, JobAdapter>([[adapter.jobType, adapter]]);
      for (let k = 0; k < 20; k++) {
        const r = await processNextJob(queue, "smoke-inline", adapters, { heartbeat: true, heartbeatIntervalSec: 1 });
        if (r.outcome === "idle") break;
        if (r.jobId === jobId) console.log(`[smoke] inline 처리(자기 job) → ${r.outcome}${r.detail ? " (" + r.detail + ")" : ""}`);
        const st = (await queue.query(`SELECT status FROM jobs WHERE id=$1`, [jobId])).rows[0]?.status;
        if (["succeeded", "failed", "cancelled"].includes(st)) break;
      }
    } else {
      console.log(`[smoke] worker(별도 프로세스) 처리 대기 — 최대 ${timeoutMs}ms polling…`);
    }

    const deadline = Date.now() + timeoutMs;
    let status = "";
    while (Date.now() < deadline) {
      status = (await queue.query(`SELECT status FROM jobs WHERE id=$1`, [jobId])).rows[0]?.status ?? "";
      if (["succeeded", "failed", "cancelled"].includes(status)) break;
      await sleep(1000);
    }
    console.log(`[smoke] 최종: job=${jobId} status=${status || "timeout"}`);

    if (queueConnectionConfigured("admin")) {
      const { queue: aq, release: ar } = await acquireQueueClient("admin");
      try { const d = await getJobDetail(aq, jobId); console.log(`[smoke] admin 조회: status=${d?.status} executions=${d?.executions.length} resultHash=${d?.executions[0]?.resultArtifactHash ? "present" : "none"}`); }
      finally { await ar().catch(() => {}); }
    }
    return status === "succeeded" ? 0 : 1;
  } catch (e: any) { return die(`smoke 실패: ${String(e?.message ?? e).slice(0, 200)}`); }
  finally { await release().catch(() => {}); }
}

const isDirect = process.argv[1] && /(createQueueSmokeJob|queueSmoke)\.(ts|js)$/.test(process.argv[1].replace(/\\/g, "/"));
if (isDirect) { main().then((c) => process.exit(c)); }
