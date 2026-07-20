// disposable Neon orchestration role/pooler capability 검증 하네스 (CLI).
// ⚠️ 운영자가 미리 만든 disposable Neon branch 에서만 실행. 이 저장소 Gate 에서는 Neon 에 접속하지 않았다.
//    PGlite / embedded PG17 / pooled mock 결과를 **actual Neon 실측으로 표현하지 않는다.**
import { parseHarnessEnv, DISPOSABLE_TOKEN, type HarnessEnv, type HarnessConfig } from "./neonCheck/guards";
import { scopedNames } from "./neonCheck/identifiers";
import { buildCleanupPlan } from "./neonCheck/cleanup";
import { maskUrl, type MemorySecret } from "./neonCheck/secrets";
import { CAPABILITIES, countFor, validateCatalog } from "./neonCheck/capabilities";
import { createDirectAdapter, type DbAdapter } from "./neonCheck/adapters";
import { executeDirectProfile, executePooledProfile, rollupNeonFull, assertNoNeonPromotion, formatProfileReport, formatNeonFull } from "./neonCheck/executor";

export { DISPOSABLE_TOKEN };

/** dry-run plan — DB 연결 0 · write 0. execute 와 동일한 guard/이름/cleanup plan 공유. */
export function buildDryRunPlan(cfg: HarnessConfig): string[] {
  const n = scopedNames(cfg.runId);
  const cleanup = buildCleanupPlan(n);
  return [
    `[plan] target=${maskUrl(cfg.directUrl)} pooled=${cfg.pooledUrl ? maskUrl(cfg.pooledUrl) : "none"} runId=${cfg.runId}`,
    `[plan] CREATE SCHEMA ${n.schema} (synthetic 전용 — public 에는 아무것도 만들지 않음)`,
    `[plan] CREATE ROLE ${Object.values(n.roles).join(", ")}`,
    `[plan] capability catalog=${CAPABILITIES.length} · actual-neon-direct applicable=${countFor("actual-neon-direct")} · actual-neon-pooled applicable=${countFor("actual-neon-pooled")}`,
    `[plan] cleanup statements=${cleanup.length} (run-id 범위 한정)`,
    `[plan] DB connection 0 · DB write 0 (dry-run). 실제 실행은 CONFIRM_EXECUTE=true 필요.`,
  ];
}

export async function main(env: HarnessEnv = process.env as HarnessEnv): Promise<number> {
  const catalog = validateCatalog();
  if (!catalog.ok) { console.error("[neon-check] ❌ capability 정본 무결성 실패:"); for (const p of catalog.problems) console.error("  - " + p); return 2; }

  const parsed = parseHarnessEnv(env);
  if (!parsed.ok) { console.error("[neon-check] ❌ 실행 거부(fail-closed):"); for (const r of parsed.refusals) console.error("  - " + r); return 2; }
  const cfg = parsed.config;

  for (const line of buildDryRunPlan(cfg)) console.log(line);
  if (!cfg.execute) { console.log("[neon-check] dry-run 종료(DB 연결 0 · DB write 0). 실행하려면 CONFIRM_EXECUTE=true."); return 0; }

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
