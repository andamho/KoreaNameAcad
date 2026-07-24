// embedded PostgreSQL 17 을 **non-superuser + CREATEROLE**(Neon neondb_owner 모사) 로 돌려
// capability 하네스 40개 direct 를 **실측**하는 재현용 러너.
//
// ⚠️ 목적: 실제 Neon(non-superuser) 에서만 드러나는 PG16+ 소유권/멤버십 semantics 를 로컬에서 재현한다.
//    기존 runEmbeddedCapabilityCheck 는 embedded **superuser**(ocboot) 라 소유권 검사가 우회돼 버그를 숨긴다.
//    이 러너는 non-superuser neonowner 로 접속하므로 그 은폐가 사라진다.
// ⚠️ `embedded-postgres` 는 저장소 의존성이 아니다(package/lock 무변경). 없으면 **not-run** 으로 보고한다.
//    실행(scratchpad 격리 설치본을 NODE_PATH 로 지정):
//      NODE_PATH=<iso>/node_modules node --import tsx/esm scripts/runNonSuperuserCapabilityCheck.ts
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { parseHarnessEnv, DISPOSABLE_TOKEN } from "./neonCheck/guards";
import { createDirectAdapter, type DbAdapter } from "./neonCheck/adapters";
import { executeDirectProfile, formatProfileReport, formatUnexpectedFailures } from "./neonCheck/executor";
import { buildRoleUrl, hostHashOf, type MemorySecret } from "./neonCheck/secrets";
import { countFor } from "./neonCheck/capabilities";

export interface NonSuperCapResult { ran: boolean; reason?: string; exitCode: number; passed?: number; expectedDenial?: number; failed?: number; residualRoles?: number; residualObjects?: number }

export async function runNonSuperuserCapability(runId = process.env.NEON_CHECK_RUN_ID || `nsc${crypto.randomBytes(3).toString("hex")}`): Promise<NonSuperCapResult> {
  // embedded-postgres 는 저장소 의존성이 아니다. 격리 설치본(scratchpad)을 쓰려면 NEON_ISO_MODULES 로 그 디렉터리를 준다
  //   → createRequire 로 file URL 해석 후 import(전역 ESM 훅 없이 tsx 와 충돌하지 않게 한다).
  //   env 미지정이면 기본(bare) 해석을 시도하고, 없으면 not-run 으로 보고한다(package/lock 무변경).
  let EmbeddedPostgres: any, pg: any;
  try {
    const iso = (process.env.NEON_ISO_MODULES ?? "").trim();
    if (iso) {
      const req = createRequire(path.join(iso, "package.json"));
      EmbeddedPostgres = (await import(pathToFileURL(req.resolve("embedded-postgres")).href)).default;
      pg = (await import(pathToFileURL(req.resolve("pg")).href)).default;
    } else {
      EmbeddedPostgres = (await import("embedded-postgres" as string)).default;
      pg = (await import("pg" as string)).default;
    }
  } catch (e: any) {
    console.log(`[nsu-cap] not-run: embedded-postgres/pg 로드 실패(저장소 의존성 아님). NEON_ISO_MODULES 로 격리 설치본 지정 후 재실행. (${e?.code ?? e?.message ?? ""})`);
    return { ran: false, reason: "dependency-absent", exitCode: 0 };
  }

  const dbDir = path.join(os.tmpdir(), `nsu-cap-${Date.now()}`);
  const port = 55600 + Math.floor(Math.random() * 400);
  const epg = new EmbeddedPostgres({ databaseDir: dbDir, user: "pgsuper", password: "pgsuper", port, persistent: false });
  await epg.initialise(); await epg.start();

  // Neon neondb_owner 모사: CREATEROLE + LOGIN + NOSUPERUSER + NOBYPASSRLS. DB/스키마 최소 권한만.
  const su = new pg.Client({ host: "localhost", port, user: "pgsuper", password: "pgsuper", database: "postgres" });
  await su.connect();
  await su.query(`CREATE ROLE neonowner WITH LOGIN PASSWORD 'nsupw' CREATEROLE NOSUPERUSER NOBYPASSRLS`);
  await su.query(`GRANT CREATE, USAGE ON SCHEMA public TO neonowner`);
  await su.query(`GRANT CREATE ON DATABASE postgres TO neonowner`);
  await su.end();

  const directUrl = `postgresql://neonowner:nsupw@localhost:${port}/postgres?sslmode=disable`;
  const pooledUrl = `postgresql://neonowner:nsupw@127.0.0.1:${port}/postgres?sslmode=disable`; // host 다름(endpoint 구분 모사)
  const parsed = parseHarnessEnv({
    NEON_CHECK_DIRECT_URL: directUrl, NEON_CHECK_POOLED_URL: pooledUrl,
    NEON_CHECK_EXPECTED_DIRECT_HOST_HASH: hostHashOf(directUrl),
    NEON_CHECK_EXPECTED_POOLED_HOST_HASH: hostHashOf(pooledUrl),
    NEON_CHECK_FORBIDDEN_DIRECT_HOST_HASH: hostHashOf("postgresql://x@nsu-forbidden-direct.invalid/db"),
    NEON_CHECK_FORBIDDEN_POOLED_HOST_HASH: hostHashOf("postgresql://x@nsu-forbidden-pooled.invalid/db"),
    NEON_CHECK_DISPOSABLE_CONFIRM: DISPOSABLE_TOKEN, NEON_CHECK_RUN_ID: runId, CONFIRM_EXECUTE: "true",
  });
  if (!parsed.ok) { console.error("[nsu-cap] env 거부:", parsed.refusals.join(" | ")); await epg.stop().catch(() => {}); return { ran: false, reason: "env", exitCode: 2 }; }
  const cfg = parsed.config;

  const boot = await createDirectAdapter(directUrl);
  await boot.connect();
  const login = async (role: string, secret: MemorySecret): Promise<DbAdapter> => {
    const conn = await createDirectAdapter(buildRoleUrl(directUrl, role, secret));
    await conn.connect(); return conn;
  };

  let result: NonSuperCapResult = { ran: true, exitCode: 1 };
  try {
    const direct = await executeDirectProfile({
      profile: "embedded-direct", cfg, db: boot, login, pooledHostDistinct: true, operatorDisposalPending: false,
      onRolesCreated: async (roles) => { for (const r of roles) await boot.exec(`GRANT CONNECT ON DATABASE "postgres" TO "${r}"`).catch(() => {}); },
    });
    for (const l of formatProfileReport(direct)) console.log(l);
    for (const l of formatUnexpectedFailures([{ report: direct, endpoint: "direct" }])) console.log(l);

    const okStatus = direct.status === "passed-clean" || direct.status === "passed-branch-disposal-required";
    const expect = { passed: 25, expectedDenial: 15, failed: 0 };
    const numbersOk = direct.passed === expect.passed && direct.expectedDenial === expect.expectedDenial && direct.failed === expect.failed;
    const residualOk = direct.residualRoles === 0 && direct.residualObjects === 0;
    console.log(`[nsu-cap] expect passed=${expect.passed} expected-denial=${expect.expectedDenial} failed=${expect.failed} → got passed=${direct.passed} expected-denial=${direct.expectedDenial} failed=${direct.failed}`);
    console.log(`[nsu-cap] status=${direct.status} residual roles=${direct.residualRoles} objects=${direct.residualObjects} → ${okStatus && numbersOk && residualOk ? "PASS" : "FAIL"}`);
    console.log(`[nsu-cap] direct-applicable=${countFor("embedded-direct")}`);
    result = { ran: true, exitCode: okStatus && numbersOk && residualOk ? 0 : 1, passed: direct.passed, expectedDenial: direct.expectedDenial, failed: direct.failed, residualRoles: direct.residualRoles, residualObjects: direct.residualObjects };
  } finally {
    await boot.close();
    await epg.stop().catch(() => {});
  }
  return result;
}

const isDirect = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("runNonSuperuserCapabilityCheck.ts");
if (isDirect) { runNonSuperuserCapability().then((r) => process.exit(r.exitCode)); }
