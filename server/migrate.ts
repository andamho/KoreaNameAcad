// 검토 가능한 additive 마이그레이션 적용기 (drizzle-kit push 사용 안 함).
// 레지스트리(server/migrations/registry.ts)에 등록된 마이그레이션만, 범용 러너로 안전하게 다룬다.
//
// 실행 모드(MIGRATION_MODE, 기본 inspect):
//   inspect  : 카탈로그 SELECT 만. DDL·트랜잭션 없음. 상태·개수·safety scan 만 보고(운영 DB 에도 안전).
//   dry-run  : 트랜잭션 안에서 실제 DDL 실행 후 ROLLBACK. 검증만, 반영 없음.
//   apply    : 실제 DDL 실행 후 COMMIT. CONFIRM_APPLY=true + EXPECTED_DATABASE_HOST_HASH 핀 둘 다 필수.
// (production 여부와 무관하게 apply=COMMIT 은 host 핀으로 대상 DB 를 못박아야만 가능 — 테스트/운영 동일 계약.)
//
// 무결성: 실행 전 SQL·fixture 파일 SHA-256(CRLF→LF 정규화)을 레지스트리 기대값과 대조, 불일치면 거부.
// 보안: 접속 URL·host 원문은 절대 로그에 남기지 않는다(host 는 sha256 8자만).
// SSL: 접속 문자열의 sslmode(또는 PGSSLMODE)로 결정. sslmode=disable 이 아니면 SSL(rejectUnauthorized:false).
//
// 사용:
//   node --import tsx/esm server/migrate.ts 0002_create_persistent_job_queue                 # inspect(기본)
//   MIGRATION_MODE=dry-run  node --import tsx/esm server/migrate.ts 0002_create_persistent_job_queue
//   MIGRATION_MODE=apply CONFIRM_APPLY=true EXPECTED_DATABASE_HOST_HASH=<sha256(host)> \
//     node --import tsx/esm server/migrate.ts 0002_create_persistent_job_queue
//   (기존 형식 `... migrations/0001_add_report_matches.sql` 하위호환)
import "dotenv/config";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import pg from "pg";
import { findMigration, MIGRATIONS } from "./migrations/registry";
import { runMigration, inspectMigration, isSuccessOutcome, type RunnerClient } from "./migrations/runner";
import { fileSha256Normalized } from "./migrations/checksum";
import type { FingerprintFixture } from "./migrations/catalogFingerprint";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
type Mode = "inspect" | "dry-run" | "apply";

// 접속 문자열에서 host 만 뽑아 sha256. URL/host 자체는 절대 로그에 남기지 않는다.
function hostHash(url: string): string {
  let h = "";
  try {
    h = new URL(url).host.toLowerCase();
  } catch {
    h = "";
  }
  return crypto.createHash("sha256").update(h).digest("hex");
}

// sslmode=disable 이면 SSL 끔. 그 외(require 등, Neon)엔 SSL. 운영 접속 동작을 약화시키지 않는다.
function sslFor(url: string): false | { rejectUnauthorized: false } {
  const inUrl = /[?&]sslmode=disable(&|$)/i.test(url);
  const inEnv = (process.env.PGSSLMODE || "").toLowerCase() === "disable";
  return inUrl || inEnv ? false : { rejectUnauthorized: false };
}

function fail(code: number, msg: string): never {
  console.error(msg);
  process.exit(code);
}

async function main() {
  const arg = process.argv[2];
  if (!arg) fail(2, `사용법: MIGRATION_MODE=inspect|dry-run|apply node --import tsx/esm server/migrate.ts <migration-id>\n등록: ${MIGRATIONS.map((m) => m.id).join(", ")}`);
  const def = findMigration(arg);
  if (!def) fail(2, `[migrate] 미등록 마이그레이션: ${arg}\n등록: ${MIGRATIONS.map((m) => m.id).join(", ")}`);

  const mode = (process.env.MIGRATION_MODE || "inspect").toLowerCase() as Mode;
  if (!["inspect", "dry-run", "apply"].includes(mode)) fail(2, `[migrate] 잘못된 MIGRATION_MODE: ${mode} (inspect|dry-run|apply)`);

  // ── 파일 무결성(체크섬) — 접속 전에 검증 ─────────────────────────────────────
  const sqlPath = path.join(repoRoot, "migrations", def.sqlFile);
  if (!fs.existsSync(sqlPath)) fail(2, `[migrate] SQL 파일 없음: migrations/${def.sqlFile}`);
  const sqlHash = fileSha256Normalized(sqlPath);
  if (sqlHash !== def.expectedSqlSha256) fail(4, `[migrate] ❌ SQL 체크섬 불일치(expected=${def.expectedSqlSha256.slice(0, 8)}… actual=${sqlHash.slice(0, 8)}…) → 커밋 이후 SQL 변경 감지, 거부`);
  const sqlText = fs.readFileSync(sqlPath, "utf-8");

  let fixture: FingerprintFixture | null = null;
  if (def.fingerprintFixture) {
    const fpPath = path.join(repoRoot, def.fingerprintFixture);
    if (!fs.existsSync(fpPath)) fail(2, `[migrate] fixture 없음: ${def.fingerprintFixture}`);
    const fpHash = fileSha256Normalized(fpPath);
    if (def.expectedFixtureSha256 && fpHash !== def.expectedFixtureSha256) fail(4, `[migrate] ❌ fixture 체크섬 불일치(expected=${def.expectedFixtureSha256.slice(0, 8)}… actual=${fpHash.slice(0, 8)}…) → 거부`);
    fixture = JSON.parse(fs.readFileSync(fpPath, "utf-8"));
  }

  const url = (process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "").trim();
  if (!url) fail(2, "[migrate] DATABASE_URL / NEON_DATABASE_URL 없음");

  // ── 대상 DB 핀 / apply 가드 ──────────────────────────────────────────────────
  const expectHostHash = (process.env.EXPECTED_DATABASE_HOST_HASH || "").trim().toLowerCase();
  const actualHostHash = hostHash(url);
  if (expectHostHash && actualHostHash !== expectHostHash) {
    fail(3, `[migrate] ❌ 대상 DB host 해시 불일치(expected=${expectHostHash.slice(0, 8)}… actual=${actualHostHash.slice(0, 8)}…) → 중단`);
  }
  if (mode === "apply") {
    if (process.env.CONFIRM_APPLY !== "true") fail(3, "[migrate] ❌ apply 에는 CONFIRM_APPLY=true 필수 → 중단");
    if (!expectHostHash) fail(3, "[migrate] ❌ apply 에는 EXPECTED_DATABASE_HOST_HASH 핀 필수(대상 DB 확정) → 중단");
  }

  const c = new pg.Client({ connectionString: url, ssl: sslFor(url), connectionTimeoutMillis: 20000 });
  await c.connect();
  console.log(`[migrate] 접속 완료(host#${actualHostHash.slice(0, 8)}…) · mode=${mode} · id=${def.id} · sql#${sqlHash.slice(0, 8)}…`);

  const client: RunnerClient = {
    query: (sql, params) => c.query(sql, params as any[]),
    exec: async (sql) => {
      await c.query(sql);
    },
  };

  let exit = 1;
  try {
    if (mode === "inspect") {
      const r = await inspectMigration(client, def, { sqlText, fixture });
      const scan = r.safetyScan === "pass" ? "pass" : `FAIL(${(r.safetyScan as any).reason})`;
      console.log(`[inspect] migration=${r.migrationId}`);
      console.log(`[inspect] 대상 DB host#=${actualHostHash.slice(0, 8)}…`);
      console.log(`[inspect] expected-created-tables=[${r.expectedNewTables.join(", ")}]`);
      console.log(`[inspect] state=${r.state}`);
      console.log(`[inspect] base-table-count=${r.baseTableCount} · fk-count=${r.fkCount}`);
      console.log(`[inspect] existing-tables=${r.existingTableCount} · existing-rows-total=${r.existingRowTotal}`);
      console.log(`[inspect] safety-scan=${scan}`);
      exit = r.state === "not-applied" || r.state === "already-applied" ? (r.safetyScan === "pass" ? 0 : 5) : 5;
    } else {
      const r = await runMigration(client, def, { sqlText, fixture, apply: mode === "apply" });
      const ok = isSuccessOutcome(r.outcome);
      console.log(`[migrate] ${ok ? "✅" : "❌"} outcome=${r.outcome} committed=${r.committed} 새테이블=[${r.createdTables.join(", ")}]`);
      console.log(`[migrate] ${r.detail}`);
      exit = ok ? 0 : 1;
    }
  } catch (e: any) {
    console.error(`[migrate] ❌ 예외: ${e?.message ?? e}`);
    exit = 1;
  } finally {
    await c.end();
  }
  process.exit(exit);
}

main().catch((e) => {
  console.error("[migrate] 오류:", e?.message);
  process.exit(1);
});
