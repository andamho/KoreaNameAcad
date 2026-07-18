// 검토 가능한 additive 마이그레이션 적용기 (drizzle-kit push 사용 안 함).
// 레지스트리(server/migrations/registry.ts)에 등록된 마이그레이션만, 범용 러너로 안전하게 적용한다.
//   - 기본은 dry-run: 트랜잭션 안에서 적용·검증 후 ROLLBACK(운영에 흔적 없음).
//   - 실제 COMMIT 은 ALLOW_PRODUCTION_MIGRATION=true + EXPECTED_DATABASE_HOST_HASH 핀이 모두 있을 때만.
//   - 러너가 SQL 정적 스캔 / 사전 catalog 검문 / 기존행 불변 / 구조 fingerprint 를 검증한다.
//
// 사용:  DATABASE_URL 또는 NEON_DATABASE_URL 설정 후
//        # dry-run(기본, 안전):
//        node --import tsx/esm server/migrate.ts 0002_create_persistent_job_queue
//        # 실제 적용(명시 opt-in):
//        EXPECTED_DATABASE_HOST_HASH=<sha256(host)> ALLOW_PRODUCTION_MIGRATION=true \
//          node --import tsx/esm server/migrate.ts 0002_create_persistent_job_queue
//   (기존 형식 `... server/migrate.ts migrations/0001_add_report_matches.sql` 도 하위호환)
import "dotenv/config";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import pg from "pg";
import { findMigration, MIGRATIONS } from "./migrations/registry";
import { runMigration, isSuccessOutcome, type RunnerClient } from "./migrations/runner";
import type { FingerprintFixture } from "./migrations/catalogFingerprint";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("사용법: node --import tsx/esm server/migrate.ts <migration-id>");
    console.error(`등록된 마이그레이션: ${MIGRATIONS.map((m) => m.id).join(", ")}`);
    process.exit(2);
  }
  const def = findMigration(arg);
  if (!def) {
    console.error(`[migrate] 미등록 마이그레이션: ${arg}`);
    console.error(`등록된 마이그레이션: ${MIGRATIONS.map((m) => m.id).join(", ")}`);
    process.exit(2);
  }

  const sqlPath = path.join(repoRoot, "migrations", def.sqlFile);
  if (!fs.existsSync(sqlPath)) {
    console.error(`[migrate] SQL 파일 없음: migrations/${def.sqlFile}`);
    process.exit(2);
  }
  const sqlText = fs.readFileSync(sqlPath, "utf-8");

  let fixture: FingerprintFixture | null = null;
  if (def.fingerprintFixture) {
    const fpPath = path.join(repoRoot, def.fingerprintFixture);
    if (!fs.existsSync(fpPath)) {
      console.error(`[migrate] fingerprint fixture 없음: ${def.fingerprintFixture}`);
      process.exit(2);
    }
    fixture = JSON.parse(fs.readFileSync(fpPath, "utf-8"));
  }

  const url = (process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "").trim();
  if (!url) {
    console.error("[migrate] DATABASE_URL / NEON_DATABASE_URL 없음");
    process.exit(2);
  }

  // ── 운영 적용 가드 ──────────────────────────────────────────────────────────
  const wantApply = process.env.ALLOW_PRODUCTION_MIGRATION === "true";
  const expectHostHash = (process.env.EXPECTED_DATABASE_HOST_HASH || "").trim().toLowerCase();
  const actualHostHash = hostHash(url);
  if (expectHostHash) {
    if (actualHostHash !== expectHostHash) {
      console.error(`[migrate] ❌ 대상 DB host 해시 불일치(expected=${expectHostHash.slice(0, 8)}… actual=${actualHostHash.slice(0, 8)}…) → 중단`);
      process.exit(3);
    }
  }
  if (wantApply && !expectHostHash) {
    console.error("[migrate] ❌ 실제 적용(ALLOW_PRODUCTION_MIGRATION=true)에는 EXPECTED_DATABASE_HOST_HASH 핀이 필수 → 중단");
    process.exit(3);
  }
  const apply = wantApply; // 기본 dry-run, opt-in 시에만 COMMIT

  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  await c.connect();
  console.log(`[migrate] 대상 DB 접속 완료(host#${actualHostHash.slice(0, 8)}…) · 모드=${apply ? "APPLY(COMMIT)" : "DRY-RUN(ROLLBACK)"} · id=${def.id}`);

  const client: RunnerClient = {
    query: (sql, params) => c.query(sql, params as any[]),
    exec: async (sql) => {
      await c.query(sql);
    },
  };

  let ok = false;
  try {
    const r = await runMigration(client, def, { sqlText, fixture, apply });
    ok = isSuccessOutcome(r.outcome);
    const mark = ok ? "✅" : "❌";
    console.log(`[migrate] ${mark} outcome=${r.outcome} committed=${r.committed} 새테이블=[${r.createdTables.join(", ")}]`);
    console.log(`[migrate] ${r.detail}`);
  } catch (e: any) {
    console.error(`[migrate] ❌ 예외: ${e?.message ?? e}`);
  } finally {
    await c.end();
  }
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("[migrate] 오류:", e?.message);
  process.exit(1);
});
