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
const ROLLBACK_SQL = `
  REVOKE ALL ON "jobs" FROM orchestration_writer, orchestration_reader;
  REVOKE ALL ON "job_executions" FROM orchestration_writer, orchestration_reader;
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

async function inspect(c: pg.Client) {
  const col = (await c.query(`SELECT count(*)::int n FROM information_schema.columns WHERE table_name='jobs' AND column_name IN ('cancel_requested_at','cancel_requested_by_ref')`)).rows[0].n;
  const wr = (await c.query(`SELECT count(*)::int n FROM pg_roles WHERE rolname IN ('orchestration_writer','orchestration_reader')`)).rows[0].n;
  const qa = (await c.query(`SELECT count(*)::int n FROM pg_roles WHERE rolname='orchestration_queue_admin'`)).rows[0].n;
  const wIns = wr === 2 ? (await c.query(`SELECT has_table_privilege('orchestration_writer','jobs','INSERT') AND has_table_privilege('orchestration_writer','job_executions','UPDATE') AS ok`)).rows[0].ok : false;
  const rSel = wr === 2 ? (await c.query(`SELECT has_table_privilege('orchestration_reader','jobs','SELECT') AS ok`)).rows[0].ok : false;
  // admin: SELECT jobs + UPDATE(cancel_requested_at) + INSERT 불가(최소권한 검증)
  const aOk = qa === 1 && col === 2 ? (await c.query(`SELECT has_table_privilege('orchestration_queue_admin','jobs','SELECT') AND has_column_privilege('orchestration_queue_admin','jobs','cancel_requested_at','UPDATE') AND NOT has_table_privilege('orchestration_queue_admin','jobs','INSERT') AS ok`)).rows[0].ok : false;
  console.log(`[queue-mig] inspect: cancelColumns=${col}/2 · writer/reader=${wr}/2 · queueAdmin=${qa}/1 · writerInsert&ExecUpdate=${wIns} · readerSelect=${rSel} · adminSelect&CancelUpdate&NoInsert=${aOk}`);
  return { columnsApplied: col === 2, rolesPresent: wr === 2 && qa === 1, grantsApplied: wIns === true && rSel === true && aOk === true };
}

export async function main(): Promise<number> {
  const mode = (process.env.QUEUE_MIGRATION_MODE || "inspect").trim() as Mode;
  const url = requireOwnerUrl(mode !== "inspect");
  const c = new pg.Client({ connectionString: url, ssl: url.includes("sslmode=disable") ? undefined : { rejectUnauthorized: false } });
  await c.connect();
  try {
    if (mode === "inspect") { const s = await inspect(c); return s.columnsApplied && s.grantsApplied ? 0 : 1; }

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
      await c.query(SQL_0005());
      await c.query(SQL_0005B());
      const s = await inspect(c);
      if (!(s.columnsApplied && s.rolesPresent && s.grantsApplied)) { await c.query("ROLLBACK"); return die(`post-verify 실패(columns=${s.columnsApplied} roles=${s.rolesPresent} grants=${s.grantsApplied}) → ROLLBACK`); }
      if (mode === "apply") { await c.query("COMMIT"); console.log("[queue-mig] apply 완료(COMMIT) — cancel 컬럼 + writer/reader grants."); return 0; }
      await c.query("ROLLBACK"); console.log("[queue-mig] dry-run 통과(post-verify OK, 미반영)."); return 0;
    } catch (e: any) { await c.query("ROLLBACK").catch(() => {}); return die(`${mode} 실패: ${e?.message ?? e}`); }
  } finally { await c.end().catch(() => {}); }
}

const isDirect = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("applyQueueRuntime.ts");
if (isDirect) { main().then((c) => process.exit(c)); }
