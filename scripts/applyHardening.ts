// production hardening(0001) 전용 apply CLI — fail-closed. 일반 migrate 러너(server/migrate.ts)와 분리.
// hardeningRunner(sha allowlist + post-verify + executor-escalation)를 실 DB 연결로 구동한다.
//
// 실행 모드(HARDENING_MODE, 기본 preflight):
//   preflight : **읽기 전용**. hardeningPreflight() 만(DDL/DML 0). sha·role 부재/부분·6테이블 행수 0·CREATE ROLE·owner 확인.
//   dry-run   : 트랜잭션 안에서 실제 apply 후 **ROLLBACK**. post-verify 통과 여부만 확인, 반영 0.
//   apply     : 실제 apply 후 **COMMIT**. CONFIRM_HARDENING_APPLY=true + EXPECTED_DATABASE_HOST_HASH 둘 다 필수.
//   rollback  : 0001 롤백 SQL 을 트랜잭션 안에서 실행 후 COMMIT. CONFIRM_HARDENING_ROLLBACK=true + host 핀 필수.
//
// 보안: 접속 URL·host·credential 원문을 절대 로그에 남기지 않는다(host 는 sha256 8자). 하드코딩 금지 → 환경변수만.
// 접속 role = 6테이블의 **현재 owner**(예: Neon neondb_owner). SQL 내부에서 orchestration_owner 로 소유권 이전.
//
// 사용:
//   HARDENING_MODE=preflight node --import tsx/esm scripts/applyHardening.ts 0001_orchestration_immutability_roles
//   HARDENING_MODE=dry-run   node --import tsx/esm scripts/applyHardening.ts 0001_orchestration_immutability_roles
//   HARDENING_MODE=apply CONFIRM_HARDENING_APPLY=true EXPECTED_DATABASE_HOST_HASH=<sha256(host)> \
//     node --import tsx/esm scripts/applyHardening.ts 0001_orchestration_immutability_roles
import "dotenv/config";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import pg from "pg";
import { findHardening, hardeningPreflight, runHardening, type HardeningClient } from "../server/migrations/hardening/hardeningRunner";
import { sha256Normalized } from "../server/migrations/checksum";

type Mode = "preflight" | "dry-run" | "apply" | "rollback";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function hostHash(url: string): string {
  let h = ""; try { h = new URL(url).host.toLowerCase(); } catch { h = ""; }
  return crypto.createHash("sha256").update(h).digest("hex");
}
function die(msg: string): never { console.error(`[harden] ❌ ${msg}`); process.exit(1); }

/** 접속 URL 을 fail-closed 로 얻고 host 핀을 검증. 원문 URL/host 는 반환만 하고 로그엔 sha 만. */
function requireUrl(pinRequired: boolean): string {
  const url = (process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "").trim();
  if (!url) die("NEON_DATABASE_URL(또는 DATABASE_URL) 미설정 — 하드코딩 금지, 환경변수로만 주입.");
  const pin = (process.env.EXPECTED_DATABASE_HOST_HASH || "").trim().toLowerCase();
  if (!pin) {
    if (pinRequired) die("EXPECTED_DATABASE_HOST_HASH 필수(apply/rollback 은 대상 DB host 핀 없이는 거부).");
    console.log("[harden] ⚠️ EXPECTED_DATABASE_HOST_HASH 미설정 — host 핀 미검증(preflight/dry-run 만 허용).");
  } else {
    const actual = hostHash(url);
    if (actual !== pin) die(`host 핀 불일치(expected=${pin.slice(0, 8)}… actual=${actual.slice(0, 8)}…) — 대상 DB 확인 필요.`);
    console.log(`[harden] host 핀 검증 통과(host#${actual.slice(0, 8)}…).`);
  }
  return url;
}

export async function main(): Promise<number> {
  const mode = ((process.env.HARDENING_MODE || "preflight").trim() as Mode);
  const id = (process.argv[2] || "0001_orchestration_immutability_roles").trim();
  const def = findHardening(id);
  if (!def) die(`알 수 없는 hardening id: ${id}`);
  const write = mode === "apply" || mode === "rollback";

  const sqlPath = path.join(repoRoot, "migrations", "hardening", def!.sqlFile);
  const sql = fs.readFileSync(sqlPath, "utf8");
  const sha = sha256Normalized(sql);
  console.log(`[harden] id=${def!.id} mode=${mode} sha=${sha.slice(0, 8)}… expected=${def!.expectedSha256.slice(0, 8)}…`);
  if (sha !== def!.expectedSha256) die(`SQL sha 불일치 → 실행 거부(파일이 커밋 이후 변경됨).`);

  const url = requireUrl(write);
  const client = new pg.Client({ connectionString: url, ssl: url.includes("sslmode=disable") ? undefined : { rejectUnauthorized: false } });
  await client.connect();
  const c: HardeningClient = { query: (s, p) => client.query(s, p as any[]), exec: (s) => client.query(s).then(() => undefined) };
  try {
    if (mode === "preflight") {
      const pf = await hardeningPreflight(c, def!, sha);
      for (const o of pf.observations) console.log(`[harden] · ${o}`);
      for (const b of pf.blockers) console.log(`[harden] ⛔ blocker: ${b}`);
      console.log(`[harden] preflight state=${pf.state} ok=${pf.ok} (읽기 전용 — DDL/DML 0)`);
      return pf.ok ? 0 : 1;
    }
    if (mode === "dry-run") {
      const r = await runHardening(c, def!, { sqlText: sql, actualSha256: sha, apply: false });
      console.log(`[harden] dry-run outcome=${r.outcome} committed=${r.committed} :: ${r.detail}`);
      return r.outcome === "dry-run-verified" || r.outcome === "already-applied" ? 0 : 1;
    }
    if (mode === "apply") {
      if ((process.env.CONFIRM_HARDENING_APPLY || "").trim() !== "true") die("apply 거부 — CONFIRM_HARDENING_APPLY=true 필수(명시적 승인).");
      const r = await runHardening(c, def!, { sqlText: sql, actualSha256: sha, apply: true });
      console.log(`[harden] apply outcome=${r.outcome} committed=${r.committed} :: ${r.detail}`);
      return r.outcome === "applied" || r.outcome === "already-applied" ? 0 : 1;
    }
    if (mode === "rollback") {
      if ((process.env.CONFIRM_HARDENING_ROLLBACK || "").trim() !== "true") die("rollback 거부 — CONFIRM_HARDENING_ROLLBACK=true 필수.");
      const rbPath = path.join(repoRoot, "migrations", "hardening", def!.sqlFile.replace(/\.sql$/, ".rollback.sql"));
      const rb = fs.readFileSync(rbPath, "utf8");
      await c.exec("BEGIN");
      try { await c.exec(rb); await c.exec("COMMIT"); console.log("[harden] rollback 완료(COMMIT). 6테이블 데이터 보존."); return 0; }
      catch (e: any) { await c.exec("ROLLBACK").catch(() => {}); die(`rollback 실패(ROLLBACK): ${e?.message ?? e}`); }
    }
    die(`알 수 없는 HARDENING_MODE: ${mode}`);
  } finally {
    await client.end().catch(() => {});
  }
}

const isDirect = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("applyHardening.ts");
if (isDirect) { main().then((code) => process.exit(code)); }
