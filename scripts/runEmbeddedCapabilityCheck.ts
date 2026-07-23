// embedded PostgreSQL 17 에서 capability 하네스를 실행하는 재현용 러너.
// ⚠️ `embedded-postgres` 는 저장소 의존성이 아니다(package/lock 무변경). 설치돼 있지 않으면 **not-run** 으로 명확히 보고한다.
// ⚠️ 이 실행 결과는 profile=embedded-direct evidence 이며 **actual Neon 실측이 아니다.**
//
// 사용(예: scratchpad 에 embedded-postgres 설치 후):
//   node --import tsx/esm scripts/runEmbeddedCapabilityCheck.ts
//   NEON_CHECK_RUN_ID=<runid> 로 run-id 지정 가능(기본 자동 생성)
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { parseHarnessEnv, DISPOSABLE_TOKEN } from "./neonCheck/guards";
import { createDirectAdapter, wrapClientAsDirect, type DbAdapter } from "./neonCheck/adapters";
import { executeDirectProfile, executePooledProfile, rollupNeonFull, formatProfileReport, formatNeonFull } from "./neonCheck/executor";
import { buildRoleUrl, hostHashOf, type MemorySecret } from "./neonCheck/secrets";
import { countFor, CAPABILITIES } from "./neonCheck/capabilities";

export interface EmbeddedRunResult { ran: boolean; reason?: string; exitCode: number }

export async function runEmbedded(runId = process.env.NEON_CHECK_RUN_ID || `emb${crypto.randomBytes(4).toString("hex")}`): Promise<EmbeddedRunResult> {
  let EmbeddedPostgres: any;
  try { EmbeddedPostgres = (await import("embedded-postgres" as string)).default; }
  catch { console.log("[embedded] not-run: embedded-postgres 미설치(저장소 의존성 아님). scratchpad 에 설치 후 재실행."); return { ran: false, reason: "dependency-absent", exitCode: 0 }; }

  const dbDir = path.join(os.tmpdir(), `oc-emb-${Date.now()}`);
  const port = 56800 + Math.floor(Math.random() * 500);
  const pg = new EmbeddedPostgres({ databaseDir: dbDir, user: "ocboot", password: "ocboot", port, persistent: false });
  await pg.initialise(); await pg.start();

  const directUrl = `postgresql://ocboot:ocboot@localhost:${port}/postgres?sslmode=disable`;
  const pooledUrl = `postgresql://ocboot:ocboot@127.0.0.1:${port}/postgres?sslmode=disable`; // host 다름(endpoint 구분 모사)
  // forbidden(production) hash 는 embedded 에선 무의미하지만 계약상 2개 필수다 → disposable 과 겹치지 않는 더미 host 로 채운다.
  const parsed = parseHarnessEnv({
    NEON_CHECK_DIRECT_URL: directUrl, NEON_CHECK_POOLED_URL: pooledUrl,
    NEON_CHECK_EXPECTED_DIRECT_HOST_HASH: hostHashOf(directUrl),
    NEON_CHECK_EXPECTED_POOLED_HOST_HASH: hostHashOf(pooledUrl),
    NEON_CHECK_FORBIDDEN_DIRECT_HOST_HASH: hostHashOf("postgresql://x@embedded-forbidden-direct.invalid/db"),
    NEON_CHECK_FORBIDDEN_POOLED_HOST_HASH: hostHashOf("postgresql://x@embedded-forbidden-pooled.invalid/db"),
    NEON_CHECK_DISPOSABLE_CONFIRM: DISPOSABLE_TOKEN, NEON_CHECK_RUN_ID: runId, CONFIRM_EXECUTE: "true",
  });
  if (!parsed.ok) { console.error("[embedded] env 거부:", parsed.refusals.join(" | ")); await pg.stop(); return { ran: false, reason: "env", exitCode: 2 }; }
  const cfg = parsed.config;

  const boot = await createDirectAdapter(directUrl);
  await boot.connect();
  const login = async (role: string, secret: MemorySecret): Promise<DbAdapter> => {
    const conn = await createDirectAdapter(buildRoleUrl(directUrl, role, secret));
    await conn.connect(); return conn;
  };

  let exitCode = 0;
  try {
    const direct = await executeDirectProfile({
      profile: "embedded-direct", cfg, db: boot, login, pooledHostDistinct: true, operatorDisposalPending: false,
      onRolesCreated: async (roles) => { for (const r of roles) await boot.exec(`GRANT CONNECT ON DATABASE "postgres" TO "${r}"`).catch(() => {}); },
    });
    for (const l of formatProfileReport(direct)) console.log(l);
    for (const f of direct.results.filter((r) => r.outcome === "fail")) console.log(`[embedded] FAIL ${f.capabilityId}: ${f.detailCode ?? ""} ${f.sanitizedError ?? ""}`);
    const pooled = await executePooledProfile({ profile: "pooled-mock", cfg });
    for (const l of formatProfileReport(pooled)) console.log(l);
    for (const f of pooled.results.filter((r) => r.outcome === "fail")) console.log(`[embedded] FAIL ${f.capabilityId}: ${f.detailCode ?? ""} ${f.sanitizedError ?? ""}`);
    const rollup = rollupNeonFull([...direct.results, ...pooled.results]);
    console.log(formatNeonFull(rollup)); // 항상 unverified(actual Neon evidence 0)
    console.log(`[embedded] catalog=${CAPABILITIES.length} embedded-applicable=${countFor("embedded-direct")} pooled-mock-applicable=${countFor("pooled-mock")}`);
    const okStatus = (s: string) => s === "passed-clean" || s === "passed-branch-disposal-required";
    exitCode = okStatus(direct.status) && okStatus(pooled.status) ? 0 : 1;
  } finally {
    await boot.close();
    await pg.stop().catch(() => {});
  }
  return { ran: true, exitCode };
}

const isDirect = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("runEmbeddedCapabilityCheck.ts");
if (isDirect) { runEmbedded().then((r) => process.exit(r.exitCode)); }
