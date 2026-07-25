// 작업큐 런타임 **실제 PostgreSQL(embedded PG17 non-superuser)** 전체 E2E. PGlite 가 아니라 실 role 분리로 검증.
//   0002/0004 → hardening 0001(role 생성·소유권) → 0005/0005b(cancel 컬럼·grants) →
//   **orchestration_writer** 로 job 생성·claim·adapter(internalReportComputeAdapter, heartbeat)·complete →
//   **orchestration_reader** 로 관리자 조회. **소유자(neondb_owner 모사) credential 없이** 전체 경로 통과.
// ⚠️ embedded-postgres 는 저장소 의존성 아님. NEON_ISO_MODULES 로 격리 설치본 지정.
import crypto from "crypto";
import os from "os";
import path from "path";
import fs from "fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { runHardening, findHardening } from "../server/migrations/hardening/hardeningRunner";
import { sha256Normalized } from "../server/migrations/checksum";
import { createJob } from "../server/jobQueue/createJob";
import { processNextJob } from "../server/jobQueue/worker";
import { listJobs, getJobDetail, requestJobCancel } from "../server/jobQueue/adminApi";
import { internalReportComputeAdapter } from "../server/jobQueue/adapters/internalReport";
import { sha256Hex } from "../server/jobQueue/idempotency";
import type { QueueClient } from "../server/jobQueue/types";
import type { RequestVersionSnapshot } from "../shared/jobQueueContract";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1"), "..");
const wrap = (client: any): QueueClient => ({ query: (sql, params) => client.query(sql, params as any[]), exec: async (sql) => { await client.query(sql); } });

export async function runQueueE2E(): Promise<{ ran: boolean; exitCode: number }> {
  let EmbeddedPostgres: any, pg: any;
  try {
    const iso = (process.env.NEON_ISO_MODULES ?? "").trim();
    const req = iso ? createRequire(path.join(iso, "package.json")) : null;
    EmbeddedPostgres = (await import(req ? pathToFileURL(req.resolve("embedded-postgres")).href : ("embedded-postgres" as string))).default;
    pg = (await import(req ? pathToFileURL(req.resolve("pg")).href : ("pg" as string))).default;
  } catch { console.log("[q-e2e] not-run: embedded-postgres 미설치. NEON_ISO_MODULES 로 지정."); return { ran: false, exitCode: 0 }; }

  const root = fs.existsSync(path.join(REPO, "migrations")) ? REPO : "C:/Users/iimoo/koreanameacad/kna-orchmig-wt";
  const rd = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
  const S2 = rd("migrations/0002_create_persistent_job_queue.sql"), S4 = rd("migrations/0004_cross_agent_orchestration.sql");
  const S5 = rd("migrations/0005_job_cancel_request.sql"), S5B = rd("migrations/0005b_queue_runtime_grants.sql");
  const S5C = rd("migrations/0005c_name_report_processor_grants.sql"), S1 = rd("migrations/0001_add_report_matches.sql");
  // name-report 업무 테이블(최소권한 검증용) — 소유자 소유.
  const BIZ = `
    CREATE TABLE IF NOT EXISTS customers (id varchar PRIMARY KEY DEFAULT gen_random_uuid(), name text, created_at timestamptz, source_consultation_id varchar, deleted_at timestamptz);
    CREATE TABLE IF NOT EXISTS consultations (id varchar PRIMARY KEY DEFAULT gen_random_uuid(), people_data text, num_people int, created_at timestamptz);
    CREATE TABLE IF NOT EXISTS crm_files (id varchar PRIMARY KEY DEFAULT gen_random_uuid(), customer_id varchar, file_name text, file_type text, file_url text, memo text, created_at timestamptz DEFAULT now());`;
  const HARD = rd("migrations/hardening/0001_orchestration_immutability_roles.sql");
  const DEF = findHardening("0001_orchestration_immutability_roles")!;

  const dbDir = path.join(os.tmpdir(), `q-e2e-${Date.now()}`), port = 58000 + Math.floor(Math.random() * 300);
  const epg = new EmbeddedPostgres({ databaseDir: dbDir, user: "pgsuper", password: "pgsuper", port, persistent: false });
  await epg.initialise(); await epg.start();

  const results: { name: string; ok: boolean; detail?: string }[] = [];
  const add = (n: string, ok: boolean, d?: string) => results.push({ name: n, ok, detail: d });

  const su = new pg.Client({ host: "localhost", port, user: "pgsuper", password: "pgsuper", database: "postgres" }); await su.connect();
  await su.query(`CREATE ROLE appowner WITH LOGIN PASSWORD 'ow' CREATEROLE NOSUPERUSER NOBYPASSRLS`);
  await su.query(`GRANT CREATE, USAGE ON SCHEMA public TO appowner`); await su.query(`GRANT CREATE ON DATABASE postgres TO appowner`);
  await su.query(`ALTER SCHEMA public OWNER TO appowner`); await su.end();

  // 소유자(appowner) 로 스키마·hardening·큐 migration 적용
  const ao = new pg.Client({ host: "localhost", port, user: "appowner", password: "ow", database: "postgres" }); await ao.connect();
  await ao.query(S2); await ao.query(S4);
  const hardClient = { query: (sql: string, params?: unknown[]) => ao.query(sql, params as any[]), exec: async (sql: string) => { await ao.query(sql); } };
  const hr = await runHardening(hardClient, DEF, { sqlText: HARD, actualSha256: sha256Normalized(HARD), apply: true });
  add("hardening 0001 applied(role 생성·소유권)", hr.outcome === "applied", hr.outcome);
  await ao.query(S5); await ao.query(S5B); // cancel 컬럼 + writer/queue_admin/reader grants(0005b 가 queue_admin role 생성)
  // 운영 credential 모사: 각 role 비밀번호 설정(embedded 로컬 전용 — production 아님). CONNECT 는 0005b DO 블록이 부여.
  await ao.query(`ALTER ROLE orchestration_writer LOGIN PASSWORD 'wpw'`);
  await ao.query(`ALTER ROLE orchestration_queue_admin LOGIN PASSWORD 'apw'`);
  await ao.query(`ALTER ROLE orchestration_reader LOGIN PASSWORD 'rpw'`);
  await ao.query(`ALTER ROLE orchestration_enqueuer LOGIN PASSWORD 'eqpw'`);
  // name-report 업무 테이블 + 0001(report_matches) + 0005c(최소권한 role) 적용.
  await ao.query(BIZ); await ao.query(S1); await ao.query(S5C);
  await ao.query(`ALTER ROLE orchestration_report_processor LOGIN PASSWORD 'rppw'`);
  add("0005b: queue_admin role 생성됨(role 분리)", (await ao.query(`SELECT count(*)::int n FROM pg_roles WHERE rolname='orchestration_queue_admin'`)).rows[0].n === 1);
  add("0005b: enqueuer role 생성됨(최소권한 분리)", (await ao.query(`SELECT count(*)::int n FROM pg_roles WHERE rolname='orchestration_enqueuer'`)).rows[0].n === 1);
  add("0005c: report_processor role 생성됨(업무 최소권한)", (await ao.query(`SELECT count(*)::int n FROM pg_roles WHERE rolname='orchestration_report_processor'`)).rows[0].n === 1);
  await ao.end();

  // ── writer 연결(소유자 아님)로 전체 런타임 경로 ──
  const snap: RequestVersionSnapshot = {
    schemaVersion: 1, pipelineVersion: "p1", transcriptionEngineVersion: null, transcriptionEngineHash: null,
    dictionaryVersion: null, normalizationVersion: null, correctionEngineVersion: null, correctionEngineHash: null,
    executorRequirement: null,
  };
  const jobInput = {
    ownerScope: "korea-name-acad", projectId: null, jobType: "internal-report",
    inputIdentity: { sourceAssetHash: sha256Hex("asset-bytes"), reportType: "individual", rendererVersion: "r1" },
    requestVersionSnapshot: snap, executionOptions: null, payloadHash: sha256Hex("payload"),
  };

  const wc = new pg.Client({ host: "localhost", port, user: "orchestration_writer", password: "wpw", database: "postgres" }); await wc.connect();
  const wq = wrap(wc);
  let jobId = "";
  try {
    const created = await createJob(wq, jobInput as any);
    jobId = created.job.id;
    add("writer 가 소유자 없이 job 생성", created.created === true && created.job.status === "queued");
    const adapters = new Map([[internalReportComputeAdapter().jobType, internalReportComputeAdapter()]]);
    const r = await processNextJob(wq, "e2e-writer", adapters, { heartbeat: true, heartbeatIntervalSec: 1 });
    add("writer worker: claim→adapter(heartbeat)→complete → succeeded", r.outcome === "succeeded", r.detail);
    const st = (await wq.query(`SELECT status FROM jobs WHERE id=$1`, [jobId])).rows[0]?.status;
    add("job=succeeded", st === "succeeded", `status=${st}`);
    const exArtifact = (await wq.query(`SELECT artifact_snapshot->>'resultArtifactHash' h, status FROM job_executions WHERE job_id=$1`, [jobId])).rows[0];
    add("execution=succeeded + 결과 아티팩트 해시 기록(실제 adapter 계산)", exArtifact?.status === "succeeded" && !!exArtifact?.h, exArtifact?.h?.slice(0, 8));
  } catch (e: any) { add("writer 경로", false, String(e?.message ?? e).slice(0, 120)); }
  finally { await wc.end().catch(() => {}); }

  // ── enqueuer(orchestration_enqueuer) 연결: job 생성 전용. claim·execution·reaper 전부 거부(최소권한) ──
  const eqc = new pg.Client({ host: "localhost", port, user: "orchestration_enqueuer", password: "eqpw", database: "postgres" }); await eqc.connect();
  try {
    const eq = wrap(eqc);
    const eqCreated = await createJob(eq, { ...(jobInput as any), inputIdentity: { ...(jobInput as any).inputIdentity, inputAssetHash: sha256Hex("enqueue-asset"), sourceAssetHash: sha256Hex("enqueue-asset") } });
    add("enqueuer 가 job 생성 가능(SELECT+INSERT)", eqCreated.created === true && eqCreated.job.status === "queued");
    const denyUpdateJobs = await (async () => { try { await eq.query(`UPDATE jobs SET status='claimed' WHERE id=$1`, [eqCreated.job.id]); return false; } catch { return true; } })();
    add("enqueuer 는 jobs UPDATE(claim) 불가", denyUpdateJobs);
    const denyExecSelect = await (async () => { try { await eq.query(`SELECT 1 FROM job_executions LIMIT 1`); return false; } catch { return true; } })();
    add("enqueuer 는 job_executions SELECT 불가", denyExecSelect);
    const denyExecInsert = await (async () => { try { await eq.query(`INSERT INTO job_executions (job_id,attempt_number,worker_id,status,execution_reason) VALUES ($1,1,'x','claimed','normal')`, [eqCreated.job.id]); return false; } catch { return true; } })();
    add("enqueuer 는 job_executions INSERT(claim/heartbeat) 불가", denyExecInsert);
    const denyExecUpdate = await (async () => { try { await eq.query(`UPDATE job_executions SET status='failed'`); return false; } catch { return true; } })();
    add("enqueuer 는 job_executions UPDATE(reaper/complete/fail) 불가", denyExecUpdate);
  } catch (e: any) { add("enqueuer 경로", false, String(e?.message ?? e).slice(0, 120)); }
  finally { await eqc.end().catch(() => {}); }

  // ── report_processor 연결: 업무 테이블 최소권한(허용 연산 + 초과 거부) ──
  const rpc = new pg.Client({ host: "localhost", port, user: "orchestration_report_processor", password: "rppw", database: "postgres" }); await rpc.connect();
  try {
    const q = wrap(rpc);
    const allow = async (label: string, sql: string, params?: any[]) => { try { await q.query(sql, params); add(label, true); } catch (e: any) { add(label, false, String(e?.message ?? e).slice(0, 80)); } };
    const deny  = async (label: string, sql: string, params?: any[]) => { let d = false; try { await q.query(sql, params); } catch { d = true; } add(label, d); };
    await allow("report_processor: customers SELECT 가능", `SELECT id FROM customers LIMIT 1`);
    await allow("report_processor: consultations SELECT 가능", `SELECT id FROM consultations LIMIT 1`);
    // report_matches INSERT→UPDATE→SELECT (실제 processFile 연산)
    await allow("report_processor: report_matches INSERT 가능", `INSERT INTO report_matches (id, file_name, file_path, file_hash, first_seen_at, extracted_name, report_type, status) VALUES ('rp-1','x.pdf','/x','h1',now(),'홍','individual','processing')`);
    await allow("report_processor: report_matches UPDATE 가능", `UPDATE report_matches SET status='needs_review', updated_at=now() WHERE id='rp-1'`);
    // crm_files SELECT+INSERT (자동첨부)
    await allow("report_processor: crm_files INSERT 가능", `INSERT INTO crm_files (customer_id, file_name, file_type, file_url, memo) VALUES ('c1','f','image/png','/o','이름분석표:x.pdf')`);
    // 초과 거부
    await deny("report_processor: customers UPDATE 거부", `UPDATE customers SET name='x'`);
    await deny("report_processor: crm_files DELETE 거부", `DELETE FROM crm_files`);
    await deny("report_processor: report_matches DELETE 거부", `DELETE FROM report_matches`);
    await deny("report_processor: jobs 접근 거부(큐 테이블 분리)", `SELECT 1 FROM jobs LIMIT 1`);
  } catch (e: any) { add("report_processor 경로", false, String(e?.message ?? e).slice(0, 120)); }
  finally { await rpc.end().catch(() => {}); }

  // ── admin(queue_admin) 연결: 목록·상세·취소 요청(cancel 컬럼 UPDATE) — INSERT 불가(최소권한) ──
  const adc = new pg.Client({ host: "localhost", port, user: "orchestration_queue_admin", password: "apw", database: "postgres" }); await adc.connect();
  try {
    const aq = wrap(adc);
    const items = await listJobs(aq, { limit: 10 });
    add("admin(queue_admin) 목록 조회", items.length >= 1 && items.some((j) => j.id === jobId && j.status === "succeeded"));
    add("admin 단건 상세(execution 이력)", (await getJobDetail(aq, jobId))?.executions.some((e) => e.status === "succeeded") === true);
    // 취소 요청: writer 로 새 queued job 만들고 admin 이 cancel 요청(cancel_requested_at UPDATE 최소권한)
    const wc2 = new pg.Client({ host: "localhost", port, user: "orchestration_writer", password: "wpw", database: "postgres" }); await wc2.connect();
    const c2 = await createJob(wrap(wc2), { ...(jobInput as any), projectId: "cancel-target" }); await wc2.end();
    const rc2 = await requestJobCancel(aq, c2.job.id, "admin#ref");
    add("admin 이 cancel 요청 성공(cancel 컬럼 UPDATE 최소권한)", rc2.requested === true);
    add("admin 은 INSERT 불가(최소권한 — job 직접 생성 거부)", await (async () => { try { await aq.query(`INSERT INTO jobs (owner_scope,job_type,input_identity,request_version_snapshot,execution_options_hash,payload_hash,idempotency_key) VALUES ('x','internal-report','{}','{}',$1,$1,'zz')`, [sha256Hex("z")]); return false; } catch { return true; } })());
  } catch (e: any) { add("admin 경로", false, String(e?.message ?? e).slice(0, 120)); }
  finally { await adc.end().catch(() => {}); }

  // ── reader 연결(SELECT 전용): 조회 가능, write 거부 ──
  const rc = new pg.Client({ host: "localhost", port, user: "orchestration_reader", password: "rpw", database: "postgres" }); await rc.connect();
  try {
    const rq = wrap(rc);
    add("reader 목록 조회 가능", (await listJobs(rq, { limit: 5 })).length >= 1);
    let denied = false; try { await rq.query(`UPDATE jobs SET status='failed' WHERE id=$1`, [jobId]); } catch { denied = true; }
    add("reader 는 write 거부(SELECT 전용)", denied);
  } catch (e: any) { add("reader 경로", false, String(e?.message ?? e).slice(0, 120)); }
  finally { await rc.end().catch(() => {}); }

  // ── 실제 smoke CLI 를 서브프로세스로 실행(create→worker inline→heartbeat→succeeded→admin 조회 재검증) ──
  try {
    const wurl = `postgresql://orchestration_writer:wpw@localhost:${port}/postgres?sslmode=disable`;
    const aurl = `postgresql://orchestration_queue_admin:apw@localhost:${port}/postgres?sslmode=disable`;
    const out = execFileSync("node", ["--import", "tsx/esm", "scripts/createQueueSmokeJob.ts"], {
      cwd: root, encoding: "utf8",
      env: { ...process.env, CONFIRM_QUEUE_SMOKE: "true", SMOKE_WORKER_INLINE: "true", ORCHESTRATION_WORKER_URL: wurl, ORCHESTRATION_ADMIN_URL: aurl, SMOKE_TIMEOUT_MS: "8000" },
    });
    add("smoke CLI: create→inline worker(heartbeat)→succeeded→admin 조회", /status=succeeded/.test(out) && /admin 조회: status=succeeded/.test(out));
    add("smoke CLI 출력에 credential/DSN 원문 없음", !/orchestration_writer:wpw@|postgresql:\/\/orchestration/.test(out));
  } catch (e: any) { add("smoke CLI", false, String(e?.stdout ?? e?.message ?? e).replace(/\s+/g, " ").slice(0, 200)); }
  finally { await epg.stop().catch(() => {}); }

  const fail = results.filter((r) => !r.ok);
  for (const r of results) console.log(`[q-e2e] ${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? " :: " + r.detail : ""}`);
  console.log(`[q-e2e] total=${results.length} pass=${results.length - fail.length} fail=${fail.length}`);
  return { ran: true, exitCode: fail.length ? 1 : 0 };
}

const isDirect = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("runQueueRuntimeE2E.ts");
if (isDirect) { runQueueE2E().then((r) => process.exit(r.exitCode)); }
