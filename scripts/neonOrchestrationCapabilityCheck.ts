// disposable Neon orchestration role/pooler capability 검증 하네스 (CLI).
// ⚠️ 운영자가 미리 만든 disposable Neon branch 에서만 실행. 이 저장소 Gate 에서는 Neon 에 접속하지 않았다.
//    PGlite / embedded PG17 / pooled mock 결과를 **actual Neon 실측으로 표현하지 않는다.**
import { parseHarnessEnv, DISPOSABLE_TOKEN, type HarnessEnv, type HarnessConfig } from "./neonCheck/guards";
import { scopedNames } from "./neonCheck/identifiers";
import { buildCleanupPlan } from "./neonCheck/cleanup";
import { maskUrl, type MemorySecret } from "./neonCheck/secrets";
import { CAPABILITIES, countFor, validateCatalog } from "./neonCheck/capabilities";
import { ASSERTION_IDS } from "../server/migrations/hardening/functionSecurityAssertions";
import { formatEnvContract } from "./neonCheck/envContract";
import { createDirectAdapter, type DbAdapter } from "./neonCheck/adapters";
import { executeDirectProfile, executePooledProfile, rollupNeonFull, assertNoNeonPromotion, formatProfileReport, formatNeonFull } from "./neonCheck/executor";

export { DISPOSABLE_TOKEN };

/**
 * dry-run = **offline contract validation**. DB 연결 0 · write 0.
 * ⚠️ 통과해도 "실행 준비 완료"가 아니다. credential 유효성·접속 가능성·CREATE ROLE capability·
 *    public user table 0·business row 0·migration history·기존 orchestration role·PgBouncer transaction mode 는
 *    **전부 미검증(actual DB safety remains unverified)** 이며 SELECT-only preflight 단계에서만 확인된다.
 */
export function buildDryRunPlan(cfg: HarnessConfig): string[] {
  const n = scopedNames(cfg.runId);
  const cleanup = buildCleanupPlan(n);
  return [
    `[plan] direct=${maskUrl(cfg.directUrl)} pooled=${maskUrl(cfg.pooledUrl)} runId=${cfg.runId}`,
    `[plan] endpoint pin: direct/pooled 각각 독립 expected hash 로 고정됨 · forbidden(production) hash 불일치 확인됨${cfg.forbiddenHostHash ? "" : " (forbidden 미설정 — 설정 권장)"}`,
    `[plan] CREATE SCHEMA ${n.schema} (synthetic 전용 — public 에는 아무것도 만들지 않음)`,
    `[plan] CREATE ROLE ${Object.values(n.roles).join(", ")}`,
    `[plan] capability catalog=${CAPABILITIES.length} · actual-neon-direct applicable=${countFor("actual-neon-direct")} · actual-neon-pooled applicable=${countFor("actual-neon-pooled")}`,
    `[plan] hardening security assertions=${ASSERTION_IDS.length} (capability 와 별도 catalog — 합산하지 않음)`,
    `[plan] cleanup statements=${cleanup.length} (run-id 범위 한정)`,
    `[plan] mode=${cfg.mode} · status=offline-contract-validation · DB connection 0 · DB write 0`,
    `[plan] 미검증(dry-run 범위 밖): credential 유효성 · 접속 가능성 · CREATE ROLE capability · public user table 0 ·`,
    `[plan]   business table/row 0 · migration history · 기존 orchestration role · PgBouncer transaction mode ·`,
    `[plan]   direct/pooled 실제 권한 차이 → **actual DB safety remains unverified**`,
    `[plan] 다음 단계는 SELECT-only preflight(읽기 전용 연결). 실제 DDL 은 그 이후 별도 승인 + CONFIRM_EXECUTE=true.`,
  ];
}

export async function main(env: HarnessEnv = process.env as HarnessEnv): Promise<number> {
  const catalog = validateCatalog();
  if (!catalog.ok) { console.error("[neon-check] ❌ capability 정본 무결성 실패:"); for (const p of catalog.problems) console.error("  - " + p); return 2; }

  const parsed = parseHarnessEnv(env);
  if (!parsed.ok) {
    console.error("[neon-check] ❌ 실행 거부(fail-closed):");
    for (const r of parsed.refusals) console.error("  - " + r);
    for (const l of formatEnvContract()) console.error("[neon-check] " + l);
    return 2;
  }
  const cfg = parsed.config;

  for (const line of buildDryRunPlan(cfg)) console.log(line);
  if (cfg.mode === "select-only-preflight") {
    console.log("[neon-check] mode=select-only-preflight — 읽기 전용 연결로 실제 DB 안전 조건을 확인합니다(DDL 0 · DML 0).");
    const { runSelectOnlyPreflight } = await import("./neonCheck/runPreflight");
    return runSelectOnlyPreflight(cfg);
  }

  if (!cfg.execute) {
    console.log(`[neon-check] mode=${cfg.mode} status=offline-contract-validation PASSED — DB 연결 0 · DB write 0.`);
    console.log("[neon-check] ⚠️ actual DB safety remains unverified. 다음은 SELECT-only preflight 이며, 실제 DDL 은 별도 승인 후 CONFIRM_EXECUTE=true 에서만 수행된다.");
    return 0;
  }

  // ── execute 진입 전 preflight evidence 검문(§13) ──
  // "통과했다"는 자기신고로는 열리지 않는다. run-id·expected/forbidden hash·status·freshness·integrity 를 전부 대조.
  const { assertExecuteAllowed } = await import("./neonCheck/selectOnlyPreflight");
  const { loadEvidence } = await import("./neonCheck/evidenceStore");
  const ev = assertExecuteAllowed(cfg, loadEvidence(), Date.now());
  if (!ev.ok) {
    console.error("[neon-check] ❌ execute 차단 — preflight evidence 검문 실패:");
    for (const x of ev.refusals) console.error("  - " + x);
    return 5;
  }

  // ── hardening security assertion 관문(연결 **전**, fail-closed) ──
  // Neon capability 와 별개 catalog. 하나라도 실패하면 Neon 접속 0 · DDL 0 으로 중단한다.
  const { runSecurityGate, formatSecurityGate } = await import("./neonCheck/securityGate");
  const gate = await runSecurityGate();
  for (const line of formatSecurityGate(gate)) console.log(line);
  if (!gate.gateOpen) { console.error("[neon-check] ❌ hardening security assertion 실패 → execute 중단"); return 4; }

  // ── execute: actual disposable Neon 대상 ──
  const db = await createDirectAdapter(cfg.directUrl);
  try {
    await db.connect();
    // 실제 LOGIN 연결 팩토리: bootstrap URL 에 synthetic role credential 을 끼워 새 연결(값 미출력)
    const login = async (role: string, secret: MemorySecret): Promise<DbAdapter> => {
      const { buildRoleUrl } = await import("./neonCheck/secrets");
      const conn = await createDirectAdapter(buildRoleUrl(cfg.directUrl, role, secret));
      await conn.connect(); return conn;
    };
    const dbName = String((await db.query("SELECT current_database() AS d")).rows[0]?.d ?? "");
    const quoted = (s: string) => `"${s.replace(/"/g, '""')}"`; // 임의 식별자 안전 인용
    const direct = await executeDirectProfile({
      profile: "actual-neon-direct", cfg, db, login,
      pooledHostDistinct: !!cfg.pooledUrl, operatorDisposalPending: true,
      onRolesCreated: async (roles) => {
        for (const r of roles) await db.exec(`GRANT CONNECT ON DATABASE ${quoted(dbName)} TO ${quoted(r)}`).catch(() => {});
      },
    });
    for (const l of formatProfileReport(direct)) console.log(l);

    const pooled = await executePooledProfile({ profile: "actual-neon-pooled", cfg });
    for (const l of formatProfileReport(pooled)) console.log(l);

    const rollup = rollupNeonFull([...direct.results, ...pooled.results]);
    assertNoNeonPromotion(rollup, [...direct.results, ...pooled.results]);
    console.log(formatNeonFull(rollup));

    const okStatus = (s: string) => s === "passed-clean" || s === "passed-branch-disposal-required";
    return okStatus(direct.status) && okStatus(pooled.status) ? 0 : 1;
  } finally {
    await db.close();
  }
}

const isDirect = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("neonOrchestrationCapabilityCheck.ts");
if (isDirect) { main().then((c) => process.exit(c)); }
