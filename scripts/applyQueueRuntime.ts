// 큐 런타임 migration 적용기 — 0005(cancel 컬럼) + 0005b(writer/reader grants). fail-closed·host-pin.
// ⚠️ applyHardening.ts(hardening 전용 registry)는 이 migration 을 지원하지 않아 **별도 최소 연결**로 만든다(hardening CLI 재사용 안 함).
// ⚠️ ALTER TABLE jobs + GRANT ON jobs/job_executions 는 테이블 owner 권한 필요 → **소유자 연결(NEON_DATABASE_URL)** 로 실행.
//    (런타임 writer 연결 ORCHESTRATION_QUEUE_URL 과 다르다. 이건 migration 적용 전용.)
//
// 실행 모드(QUEUE_MIGRATION_MODE, 기본 inspect):
//   inspect  : read-only. 컬럼·grant·role 존재만 조회(DDL/DML 0).
//   dry-run  : tx 안에서 실제 적용 후 ROLLBACK(잠금·일시 영향 가능, read-only 아님). CONFIRM_QUEUE_DRYRUN=true.
//   apply    : tx COMMIT. CONFIRM_QUEUE_APPLY=true + EXPECTED_DATABASE_HOST_HASH.
//   rollback : 컬럼 DROP + grant REVOKE(COMMIT). CONFIRM_QUEUE_ROLLBACK=true + host 핀.
//
// 사용:
//   QUEUE_MIGRATION_MODE=inspect NEON_DATABASE_URL=<owner> node --import tsx/esm scripts/applyQueueRuntime.ts
import "dotenv/config";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import pg from "pg";

type Mode = "inspect" | "dry-run" | "apply" | "rollback";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const die = (m: string): never => { console.error(`[queue-mig] ❌ ${m}`); process.exit(1); };
const hostHash = (url: string) => { let h = ""; try { h = new URL(url).host.toLowerCase(); } catch { h = ""; } return crypto.createHash("sha256").update(h).digest("hex"); };

function requireOwnerUrl(pinRequired: boolean): string {
  const url = (process.env.NEON_DATABASE_URL || "").trim();
  if (!url) die("NEON_DATABASE_URL(소유자) 미설정 — migration 은 테이블 owner 연결로만.");
  if (new URL(url).host.toLowerCase().includes("pooler")) die("pooled 엔드포인트 거부 — migration 은 direct 연결.");
  const pin = (process.env.EXPECTED_DATABASE_HOST_HASH || "").trim().toLowerCase();
  if (!pin) { if (pinRequired) die("EXPECTED_DATABASE_HOST_HASH 필수(dry-run/apply/rollback)."); console.log("[queue-mig] ⚠️ host 핀 미검증(inspect)."); }
  else { const a = hostHash(url); if (a !== pin) die(`host 핀 불일치(expected=${pin.slice(0,8)}… actual=${a.slice(0,8)}…).`); console.log(`[queue-mig] host 핀 통과(host#${a.slice(0,8)}… · direct).`); }
  return url;
}

const SQL_0005 = () => fs.readFileSync(path.join(repoRoot, "migrations", "0005_job_cancel_request.sql"), "utf8");
const SQL_0005B = () => fs.readFileSync(path.join(repoRoot, "migrations", "0005b_queue_runtime_grants.sql"), "utf8");
const SQL_0005C = () => fs.readFileSync(path.join(repoRoot, "migrations", "0005c_name_report_processor_grants.sql"), "utf8");
const ROLLBACK_SQL = `
  REVOKE ALL ON "jobs" FROM orchestration_writer, orchestration_reader;
  REVOKE ALL ON "job_executions" FROM orchestration_writer, orchestration_reader;
  DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='orchestration_report_processor') THEN
    EXECUTE 'REVOKE ALL ON "customers", "consultations", "crm_files", "report_matches" FROM orchestration_report_processor';
    EXECUTE 'REVOKE USAGE ON SCHEMA public FROM orchestration_report_processor';
    EXECUTE format('REVOKE ALL ON DATABASE %I FROM orchestration_report_processor', current_database());
    EXECUTE 'DROP ROLE orchestration_report_processor';
  END IF; END $$;
  DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='orchestration_enqueuer') THEN
    EXECUTE 'REVOKE ALL ON "jobs" FROM orchestration_enqueuer';
    EXECUTE 'REVOKE USAGE ON SCHEMA public FROM orchestration_enqueuer';
    EXECUTE format('REVOKE ALL ON DATABASE %I FROM orchestration_enqueuer', current_database());
    EXECUTE 'DROP ROLE orchestration_enqueuer';
  END IF; END $$;
  DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='orchestration_queue_admin') THEN
    EXECUTE 'REVOKE ALL ON "jobs" FROM orchestration_queue_admin';
    EXECUTE 'REVOKE ALL ON "job_executions" FROM orchestration_queue_admin';
    EXECUTE 'REVOKE USAGE ON SCHEMA public FROM orchestration_queue_admin';
    EXECUTE format('REVOKE ALL ON DATABASE %I FROM orchestration_queue_admin', current_database());
    EXECUTE 'DROP ROLE orchestration_queue_admin';
  END IF; END $$;
  DROP INDEX IF EXISTS "jobs_cancel_requested_idx";
  ALTER TABLE "jobs" DROP COLUMN IF EXISTS "cancel_requested_at";
  ALTER TABLE "jobs" DROP COLUMN IF EXISTS "cancel_requested_by_ref";`;

// 배포 전 준비 체크(새 Gate 아님 · inspect 에 편입). raw URL/host/password 미출력 — host#8자·불린만.
//   확인: worker/admin/owner host 일치 · worker 자격이 owner 아님 · 빌드 산출물(dist/queueWorker.js·queueSmoke.js) · feature flag 기본 off.
function parseUrlSafe(url: string): { hostHash: string; user: string } | null {
  try { const u = new URL(url); return { hostHash: hostHash(url), user: decodeURIComponent(u.username || "").toLowerCase() }; } catch { return null; }
}
export function deployReadiness(ownerUrl: string): { hardFail: boolean } {
  const OWNER_ROLE = "neondb_owner";
  const ownerParsed = parseUrlSafe(ownerUrl);
  const worker = (process.env.ORCHESTRATION_WORKER_URL || "").trim();
  const admin = (process.env.ORCHESTRATION_ADMIN_URL || "").trim();
  const lines: string[] = [];
  let hardFail = false;

  // 1) worker URL 이 owner 자격이 아님(writer 여야 함).
  if (worker) {
    const w = parseUrlSafe(worker);
    if (!w) { lines.push("worker URL 파싱 실패 → FAIL"); hardFail = true; }
    else {
      const isOwner = w.user === OWNER_ROLE || (ownerParsed && w.user === ownerParsed.user);
      lines.push(`worker 자격 ≠ owner: ${isOwner ? "FAIL(소유자 자격 사용 금지)" : "PASS"}`);
      if (isOwner) hardFail = true;
      // 2) worker host == owner host(같은 DB).
      const match = ownerParsed ? w.hostHash === ownerParsed.hostHash : false;
      lines.push(`worker host == owner host: ${match ? "PASS" : "FAIL"} (worker host#${w.hostHash.slice(0, 8)}…)`);
      if (!match) hardFail = true;
    }
  } else lines.push("worker URL: 미설정(배포 시점 제공) → WARN");

  // 2b) enqueue URL host == owner host + enqueue 자격이 owner/writer 아님(최소권한 분리).
  const enqueue = (process.env.ORCHESTRATION_ENQUEUE_URL || "").trim();
  if (enqueue) {
    const e = parseUrlSafe(enqueue);
    if (!e) { lines.push("enqueue URL 파싱 실패 → FAIL"); hardFail = true; }
    else {
      const match = ownerParsed ? e.hostHash === ownerParsed.hostHash : false;
      const isOwner = e.user === OWNER_ROLE || (ownerParsed && e.user === ownerParsed.user);
      lines.push(`enqueue host == owner host: ${match ? "PASS" : "FAIL"} · enqueue 자격 ≠ owner: ${isOwner ? "FAIL" : "PASS"}`);
      if (!match || isOwner) hardFail = true;
    }
  } else lines.push("enqueue URL: 미설정(이름분석표 큐 사용 시 필요) → WARN");

  // 2c) name-report 업무 DB URL(NAME_REPORT_DB_URL) — 로컬 워커 전용. host 일치 + 자격이 owner 아님.
  const nrdb = (process.env.NAME_REPORT_DB_URL || "").trim();
  if (nrdb) {
    const n = parseUrlSafe(nrdb);
    if (!n) { lines.push("NAME_REPORT_DB_URL 파싱 실패 → FAIL"); hardFail = true; }
    else {
      const match = ownerParsed ? n.hostHash === ownerParsed.hostHash : false;
      const isOwner = n.user === OWNER_ROLE || (ownerParsed && n.user === ownerParsed.user);
      lines.push(`name-report DB host == owner host: ${match ? "PASS" : "FAIL"} · 자격 ≠ owner: ${isOwner ? "FAIL" : "PASS"}`);
      if (!match || isOwner) hardFail = true;
    }
  } else lines.push("NAME_REPORT_DB_URL: 미설정(로컬 name-report 워커에서 필요) → WARN");

  // 3) admin URL host == worker/owner host + admin 자격이 owner 아님.
  if (admin) {
    const a = parseUrlSafe(admin);
    if (!a) { lines.push("admin URL 파싱 실패 → FAIL"); hardFail = true; }
    else {
      const match = ownerParsed ? a.hostHash === ownerParsed.hostHash : false;
      const isOwner = a.user === OWNER_ROLE || (ownerParsed && a.user === ownerParsed.user);
      lines.push(`admin host == owner host: ${match ? "PASS" : "FAIL"} · admin 자격 ≠ owner: ${isOwner ? "FAIL" : "PASS"}`);
      if (!match || isOwner) hardFail = true;
    }
  } else lines.push("admin URL: 미설정(선택) → WARN");

  // 4) 빌드 산출물(tsx 런타임 미의존 · start/worker/smoke 명령이 dist 사용).
  for (const rel of ["dist/queueWorker.js", "dist/queueSmoke.js"]) {
    const ok = fs.existsSync(path.join(repoRoot, rel));
    lines.push(`빌드 산출물 ${rel}: ${ok ? "PASS" : "FAIL(npm run build 필요)"}`);
    if (!ok) hardFail = true;
  }

  // 5) feature flag 기본 off — 코드 게이트(routes.ts) 존재 + 현재 env 가 강제 on 아님.
  const routes = (() => { try { return fs.readFileSync(path.join(repoRoot, "server", "knop", "routes.ts"), "utf8"); } catch { return ""; } })();
  const gated = /FEATURE_JOB_QUEUE[^\n]*===\s*"true"/.test(routes);
  const envOn = (process.env.FEATURE_JOB_QUEUE || "").trim() === "true";
  lines.push(`feature flag 기본 off: 코드게이트=${gated ? "PASS" : "FAIL"} · 현재 env on=${envOn ? "⚠️ ON(배포 전 확인)" : "off PASS"}`);
  if (!gated) hardFail = true;

  console.log("[queue-mig] 배포 준비 체크:");
  for (const l of lines) console.log(`  - ${l}`);
  console.log(`[queue-mig] 배포 준비: ${hardFail ? "❌ 미충족(위 FAIL 해결 필요)" : "✅ 충족"}`);
  return { hardFail };
}

async function inspect(c: pg.Client) {
  const col = (await c.query(`SELECT count(*)::int n FROM information_schema.columns WHERE table_name='jobs' AND column_name IN ('cancel_requested_at','cancel_requested_by_ref')`)).rows[0].n;
  const wr = (await c.query(`SELECT count(*)::int n FROM pg_roles WHERE rolname IN ('orchestration_writer','orchestration_reader')`)).rows[0].n;
  const qa = (await c.query(`SELECT count(*)::int n FROM pg_roles WHERE rolname='orchestration_queue_admin'`)).rows[0].n;
  const eq = (await c.query(`SELECT count(*)::int n FROM pg_roles WHERE rolname='orchestration_enqueuer'`)).rows[0].n;
  const wIns = wr === 2 ? (await c.query(`SELECT has_table_privilege('orchestration_writer','jobs','INSERT') AND has_table_privilege('orchestration_writer','job_executions','UPDATE') AS ok`)).rows[0].ok : false;
  const rSel = wr === 2 ? (await c.query(`SELECT has_table_privilege('orchestration_reader','jobs','SELECT') AS ok`)).rows[0].ok : false;
  // admin: SELECT jobs + UPDATE(cancel_requested_at) + INSERT 불가(최소권한 검증)
  const aOk = qa === 1 && col === 2 ? (await c.query(`SELECT has_table_privilege('orchestration_queue_admin','jobs','SELECT') AND has_column_privilege('orchestration_queue_admin','jobs','cancel_requested_at','UPDATE') AND NOT has_table_privilege('orchestration_queue_admin','jobs','INSERT') AS ok`)).rows[0].ok : false;
  // enqueuer: jobs SELECT+INSERT 만. UPDATE(claim/heartbeat/complete) 불가 · job_executions 권한 전무(reaper/execution 변경 불가).
  const eOk = eq === 1 ? (await c.query(
    `SELECT has_table_privilege('orchestration_enqueuer','jobs','SELECT')
        AND has_table_privilege('orchestration_enqueuer','jobs','INSERT')
        AND NOT has_table_privilege('orchestration_enqueuer','jobs','UPDATE')
        AND NOT has_table_privilege('orchestration_enqueuer','jobs','DELETE')
        AND NOT has_table_privilege('orchestration_enqueuer','job_executions','SELECT')
        AND NOT has_table_privilege('orchestration_enqueuer','job_executions','INSERT')
        AND NOT has_table_privilege('orchestration_enqueuer','job_executions','UPDATE') AS ok`,
  )).rows[0].ok : false;
  // report_processor: 업무 테이블 최소권한(customers/consultations SELECT · crm_files SELECT,INSERT · report_matches SELECT,INSERT,UPDATE).
  //   초과 금지: customers UPDATE·crm_files UPDATE·모든 DELETE·jobs 접근 없음. (업무 테이블 존재 시에만 검사)
  const rp = (await c.query(`SELECT count(*)::int n FROM pg_roles WHERE rolname='orchestration_report_processor'`)).rows[0].n;
  const bizTables = (await c.query(`SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('customers','consultations','crm_files','report_matches')`)).rows[0].n;
  const rpOk = rp === 1 && bizTables === 4 ? (await c.query(
    `SELECT has_table_privilege('orchestration_report_processor','customers','SELECT')
        AND has_table_privilege('orchestration_report_processor','consultations','SELECT')
        AND has_table_privilege('orchestration_report_processor','crm_files','SELECT')
        AND has_table_privilege('orchestration_report_processor','crm_files','INSERT')
        AND has_table_privilege('orchestration_report_processor','report_matches','SELECT')
        AND has_table_privilege('orchestration_report_processor','report_matches','INSERT')
        AND has_table_privilege('orchestration_report_processor','report_matches','UPDATE')
        AND NOT has_table_privilege('orchestration_report_processor','customers','UPDATE')
        AND NOT has_table_privilege('orchestration_report_processor','crm_files','UPDATE')
        AND NOT has_table_privilege('orchestration_report_processor','crm_files','DELETE')
        AND NOT has_table_privilege('orchestration_report_processor','jobs','SELECT') AS ok`,
  )).rows[0].ok : false;
  console.log(`[queue-mig] inspect: cancelColumns=${col}/2 · writer/reader=${wr}/2 · queueAdmin=${qa}/1 · enqueuer=${eq}/1 · reportProcessor=${rp}/1 · writerInsert&ExecUpdate=${wIns} · readerSelect=${rSel} · adminSelect&CancelUpdate&NoInsert=${aOk} · enqueuerSelect&Insert&NoUpdate&NoExec=${eOk} · reportProcMinPriv=${rpOk}`);
  return { columnsApplied: col === 2, rolesPresent: wr === 2 && qa === 1 && eq === 1 && rp === 1, grantsApplied: wIns === true && rSel === true && aOk === true && eOk === true && rpOk === true };
}

export async function main(): Promise<number> {
  const mode = (process.env.QUEUE_MIGRATION_MODE || "inspect").trim() as Mode;
  const url = requireOwnerUrl(mode !== "inspect");
  const c = new pg.Client({ connectionString: url, ssl: url.includes("sslmode=disable") ? undefined : { rejectUnauthorized: false } });
  await c.connect();
  try {
    if (mode === "inspect") {
      const s = await inspect(c);
      const dbOk = s.columnsApplied && s.grantsApplied;
      const rd = deployReadiness(url); // 배포 전 준비(호스트 일치·자격·빌드·flag) — inspect 에 편입(새 Gate 아님)
      return dbOk && !rd.hardFail ? 0 : 1;
    }

    if (mode === "rollback") {
      if ((process.env.CONFIRM_QUEUE_ROLLBACK || "").trim() !== "true") die("rollback 거부 — CONFIRM_QUEUE_ROLLBACK=true 필수.");
      await c.query("BEGIN"); try { await c.query(ROLLBACK_SQL); await c.query("COMMIT"); console.log("[queue-mig] rollback 완료(컬럼 DROP·grant REVOKE)."); return 0; }
      catch (e: any) { await c.query("ROLLBACK").catch(() => {}); return die(`rollback 실패: ${e?.message ?? e}`); }
    }

    // dry-run / apply
    const confirmKey = mode === "apply" ? "CONFIRM_QUEUE_APPLY" : "CONFIRM_QUEUE_DRYRUN";
    if ((process.env[confirmKey] || "").trim() !== "true") die(`${mode} 거부 — ${confirmKey}=true 필수(${mode === "dry-run" ? "실제 DDL 시도 후 ROLLBACK, read-only 아님" : "production COMMIT"}).`);
    if (mode === "dry-run") console.log("[queue-mig] ⚠️ dry-run: 실제 DDL·GRANT 를 tx 안에서 수행 후 ROLLBACK(잠금 가능).");
    await c.query("BEGIN");
    try {
      await c.query(SQL_0005());   // idempotent(ADD COLUMN/INDEX IF NOT EXISTS) — 이미 적용돼도 no-op
      await c.query(SQL_0005B());  // idempotent(CREATE ROLE IF NOT EXISTS + 멱등 GRANT)
      await c.query(SQL_0005C());  // idempotent — name-report 최소권한 role(orchestration_report_processor)
      const s = await inspect(c);
      if (!(s.columnsApplied && s.rolesPresent && s.grantsApplied)) { await c.query("ROLLBACK"); return die(`post-verify 실패(columns=${s.columnsApplied} roles=${s.rolesPresent} grants=${s.grantsApplied}) → ROLLBACK`); }
      if (mode === "apply") { await c.query("COMMIT"); console.log("[queue-mig] apply 완료(COMMIT) — cancel 컬럼 + writer/reader/enqueuer/report_processor grants."); return 0; }
      await c.query("ROLLBACK"); console.log("[queue-mig] dry-run 통과(post-verify OK, 미반영)."); return 0;
    } catch (e: any) { await c.query("ROLLBACK").catch(() => {}); return die(`${mode} 실패: ${e?.message ?? e}`); }
  } finally { await c.end().catch(() => {}); }
}

const isDirect = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("applyQueueRuntime.ts");
if (isDirect) { main().then((c) => process.exit(c)); }
