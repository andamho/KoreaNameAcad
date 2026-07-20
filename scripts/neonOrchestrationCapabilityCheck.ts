// disposable Neon orchestration role/pooler capability 검증 하네스 (CLI).
// ⚠️ 운영자가 미리 만든 disposable Neon branch 에서만 실행. 이 저장소 Gate 에서는 Neon 에 접속하지 않았다.
//    embedded PostgreSQL / PGlite / pooled mock 결과를 **Neon 실측으로 표현하지 않는다.**
//
// 원칙: .env 미읽음(dotenv import 없음) · 명시 env 계약만 · URL/username/password 원문 출력 0 ·
//       run-id 스코프 강제 · synthetic namespace 한정 · 기본 dry-run(DB 연결 0) · CONFIRM_EXECUTE=true 에서만 실행.
import { parseHarnessEnv, DISPOSABLE_TOKEN, type HarnessEnv, type HarnessConfig } from "./neonCheck/guards";
import { scopedNames } from "./neonCheck/identifiers";
import { buildCleanupPlan } from "./neonCheck/cleanup";
import { maskUrl } from "./neonCheck/secrets";
import { CAPABILITIES, countFor, validateCatalog, type Profile } from "./neonCheck/capabilities";
import { createDirectAdapter } from "./neonCheck/adapters";
import { executeHarness, formatReport, PHASE1_SMOKE_IDS } from "./neonCheck/executor";

export { DISPOSABLE_TOKEN };

/** dry-run plan — DB 연결 0 · DB write 0. execute 와 동일한 guard/이름/cleanup plan 을 공유한다. */
export function buildDryRunPlan(cfg: HarnessConfig, profile: Profile): string[] {
  const n = scopedNames(cfg.runId);
  const cleanup = buildCleanupPlan(n);
  return [
    `[plan] profile=${profile} target=${maskUrl(cfg.directUrl)} pooled=${cfg.pooledUrl ? maskUrl(cfg.pooledUrl) : "none"} runId=${cfg.runId}`,
    `[plan] CREATE SCHEMA ${n.schema} (synthetic 전용 — public 에는 아무것도 만들지 않음)`,
    `[plan] CREATE ROLE ${Object.values(n.roles).join(", ")}`,
    `[plan] CREATE TABLE ${Object.values(n.tables).join(", ")} (in ${n.schema})`,
    `[plan] capability catalog=${CAPABILITIES.length} · profile applicable=${countFor(profile)} · Phase1 smoke scope=${PHASE1_SMOKE_IDS.length}`,
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
  // profile: pooled URL 제공 여부와 무관하게 실제 Neon 실행은 neon-full 로 표기(격리 프로파일은 테스트에서 지정).
  const profile: Profile = "neon-full";

  for (const line of buildDryRunPlan(cfg, profile)) console.log(line);
  if (!cfg.execute) { console.log("[neon-check] dry-run 종료(DB 연결 0 · DB write 0). 실행하려면 CONFIRM_EXECUTE=true."); return 0; }

  // ── execute: 실제 direct 연결 후 guard 재검증 → preflight → 실행 → cleanup ──
  const db = await createDirectAdapter(cfg.directUrl);
  try {
    await db.connect();
    const report = await executeHarness({
      profile, cfg, db,
      pooledHostDistinct: !!cfg.pooledUrl,
      operatorDisposalPending: true, // 연결 종료·branch 삭제는 운영자 조치로 남음
    });
    for (const line of formatReport(report)) console.log(line);
    return report.status === "passed-clean" || report.status === "passed-branch-disposal-required" ? 0 : 1;
  } finally {
    await db.close();
  }
}

const isDirect = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("neonOrchestrationCapabilityCheck.ts");
if (isDirect) { main().then((c) => process.exit(c)); }
