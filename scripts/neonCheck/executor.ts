// execute orchestration + failure injection + result classifier + masked reporter.
// Phase 1: 실행 골격(guard→preflight→smoke→cleanup→분류)만 실제 수행. 45 capability 본 구현은 Phase 2.
import type { DbAdapter } from "./adapters";
import { evaluatePreflight, type CatalogProbe, type HarnessConfig } from "./guards";
import { probeCatalog, probeSummary } from "./preflight";
import { runCleanup, buildCleanupPlan, assertCleanupScope, verifyResidual, type CleanupOutcome } from "./cleanup";
import { scopedNames, qi, qq, type ScopedNames } from "./identifiers";
import { generateSecret, maskUrl, sanitizeError, type MemorySecret } from "./secrets";
import { CAPABILITIES, applicableFor, countFor, validateCatalog, type CapabilityOutcome, type Profile } from "./capabilities";
import { createPooledMockAdapter, type PooledMockAdapter } from "./adapters";

// ── failure injection ───────────────────────────────────────────────────────
export const INJECTION_POINTS = [
  "after-two-roles", "after-schema", "after-ownership-transfer", "after-partial-triggers",
  "after-synthetic-insert", "after-trigger-disable", "before-membership-revoke",
  "during-pooled-mock", "cleanup-first-attempt",
] as const;
export type InjectionPoint = (typeof INJECTION_POINTS)[number];
export interface Injector { shouldFail(point: InjectionPoint): boolean }
export const noInjection: Injector = { shouldFail: () => false };
export const injectAt = (...points: InjectionPoint[]): Injector => ({ shouldFail: (p) => points.includes(p) });
export class InjectedFailure extends Error { constructor(p: InjectionPoint) { super(`injected failure at ${p}`); this.name = "InjectedFailure"; } }

/** cleanup 1차 시도를 강제 실패시키는 래퍼(재시도 경로 검증용). */
export function failFirstExec(db: DbAdapter, times: number): DbAdapter {
  let left = times;
  return {
    kind: db.kind,
    connect: () => db.connect(),
    query: (s, p) => db.query(s, p),
    exec: async (s) => { if (left > 0) { left--; throw new Error("injected cleanup failure"); } return db.exec(s); },
    close: () => db.close(),
  };
}

// ── 결과 ────────────────────────────────────────────────────────────────────
export type HarnessStatus = "passed-clean" | "passed-branch-disposal-required" | "failed-cleanup" | "aborted-safety-guard";
export interface CapabilityResult { id: string; outcome: CapabilityOutcome; detail?: string }
export interface HarnessReport {
  profile: Profile; status: HarnessStatus; runId: string;
  directFingerprint: string; pooledFingerprint: string; serverVersion: string;
  /** 이번 실행이 대상으로 삼은 capability 수(Phase 1 = smoke scope, Phase 2 = profile applicable) */
  totalApplicable: number;
  passed: number; expectedDenial: number; failed: number; skipped: number;
  cleanupStatements: number; residualObjects: number; residualRoles: number; disabledTriggers: number;
  elapsedMs: number; operatorNextAction: string;
  capabilityImplementation: "partial" | "complete";
  /** 정본 전체 대비 커버리지(투명성) */
  catalogTotal: number; profileApplicable: number;
  notes: string[];
}

/**
 * 최종 상태 분류(외부 상태는 4가지만). partial success 를 success 로 표현하지 않는다.
 * - guard 실패 → aborted-safety-guard
 * - cleanup 실패/잔여 존재/disabled trigger 잔존 → failed-cleanup
 * - capability 실패 또는 미실행(skipped) → failed-cleanup 으로 매핑(성공으로 표기 금지, note 로 사유 구분)
 * - 전부 통과 + 운영자 조치 남음 → passed-branch-disposal-required
 * - 전부 통과 + 남은 조치 없음 → passed-clean
 */
export function classifyResult(input: {
  guardsOk: boolean; results: CapabilityResult[]; applicable: number;
  cleanup: CleanupOutcome | null; operatorDisposalPending: boolean;
}): HarnessStatus {
  if (!input.guardsOk) return "aborted-safety-guard";
  if (!input.cleanup || !input.cleanup.ok) return "failed-cleanup";
  if (input.cleanup.residualRoles > 0 || input.cleanup.residualObjects > 0 || input.cleanup.disabledTriggers > 0) return "failed-cleanup";
  const failed = input.results.filter((r) => r.outcome === "fail").length;
  const skipped = input.results.filter((r) => r.outcome === "skipped").length;
  const missing = Math.max(0, input.applicable - input.results.length);
  if (failed > 0 || skipped > 0 || missing > 0) return "failed-cleanup";
  return input.operatorDisposalPending ? "passed-branch-disposal-required" : "passed-clean";
}

export function buildReport(args: {
  profile: Profile; status: HarnessStatus; cfg: HarnessConfig; probe: CatalogProbe | null;
  results: CapabilityResult[]; cleanup: CleanupOutcome | null; elapsedMs: number;
  applicable: number; capabilityImplementation: "partial" | "complete"; notes?: string[];
}): HarnessReport {
  const { profile, status, cfg, probe, results, cleanup } = args;
  const count = (o: CapabilityOutcome) => results.filter((r) => r.outcome === o).length;
  return {
    profile, status, runId: cfg.runId,
    directFingerprint: maskUrl(cfg.directUrl),
    pooledFingerprint: cfg.pooledUrl ? maskUrl(cfg.pooledUrl) : "url#none",
    serverVersion: probe?.serverVersion ?? "unknown",
    totalApplicable: args.applicable,
    passed: count("pass"), expectedDenial: count("expected-denial"), failed: count("fail"),
    skipped: count("skipped") + Math.max(0, args.applicable - results.length),
    cleanupStatements: cleanup?.attempted ?? 0,
    residualObjects: cleanup?.residualObjects ?? -1,
    residualRoles: cleanup?.residualRoles ?? -1,
    disabledTriggers: cleanup?.disabledTriggers ?? -1,
    elapsedMs: args.elapsedMs,
    operatorNextAction: nextAction(status),
    capabilityImplementation: args.capabilityImplementation,
    catalogTotal: CAPABILITIES.length,
    profileApplicable: countFor(profile),
    notes: args.notes ?? [],
  };
}
const nextAction = (s: HarnessStatus): string =>
  s === "passed-clean" ? "결과 저장 → env 제거 → credential 폐기 → disposable branch 삭제"
  : s === "passed-branch-disposal-required" ? "결과 저장 → branch 반드시 삭제 → 남은 운영자 조치 수행"
  : s === "failed-cleanup" ? "branch 삭제로 정리 → 실패/잔여 사유 보고(운영 반영 금지)"
  : "가드 사유 확인 → 대상이 disposable 인지 재점검 → 필요 시 새 branch";

/** 보고 문자열(마스킹된 항목만). URL/host/username/password/SQL 전문 미포함. */
export function formatReport(r: HarnessReport): string[] {
  return [
    `[neon-check] profile=${r.profile} status=${r.status} capability-implementation=${r.capabilityImplementation}`,
    `[neon-check] runId=${r.runId} direct=${r.directFingerprint} pooled=${r.pooledFingerprint} server=${r.serverVersion}`,
    `[neon-check] scope applicable=${r.totalApplicable} (catalog total=${r.catalogTotal}, profile applicable=${r.profileApplicable})`,
    `[neon-check] capabilities passed=${r.passed} expected-denial=${r.expectedDenial} failed=${r.failed} skipped=${r.skipped}`,
    `[neon-check] cleanup statements=${r.cleanupStatements} residual-objects=${r.residualObjects} residual-roles=${r.residualRoles} disabled-triggers=${r.disabledTriggers}`,
    `[neon-check] elapsed=${r.elapsedMs}ms`,
    ...r.notes.map((n) => `[neon-check] note: ${n}`),
    `[neon-check] next: ${r.operatorNextAction}`,
  ];
}

// ── Phase 1 smoke capabilities (실행 골격 검증용 최소 집합) ───────────────────
export const PHASE1_SMOKE_IDS = ["create-nologin-role", "create-login-role", "grant-membership", "revoke-membership"] as const;

export async function runSmokeCapabilities(db: DbAdapter, n: ScopedNames, inj: Injector): Promise<CapabilityResult[]> {
  const out: CapabilityResult[] = [];
  const secrets: MemorySecret[] = [];

  await db.exec(`CREATE SCHEMA ${qi(n.schema)}`);
  if (inj.shouldFail("after-schema")) throw new InjectedFailure("after-schema");

  await db.exec(`CREATE ROLE ${qi(n.roles.owner)} NOLOGIN`);
  await db.exec(`CREATE ROLE ${qi(n.roles.admin)} NOLOGIN`);
  out.push({ id: "create-nologin-role", outcome: "pass" });
  if (inj.shouldFail("after-two-roles")) throw new InjectedFailure("after-two-roles");

  // 하이브리드 B: synthetic LOGIN role password = CSPRNG, 메모리 전용, 로그/파일/argv 0
  for (const role of [n.roles.deployer, n.roles.writer, n.roles.reader, n.roles.appSim]) {
    const sec = generateSecret(); secrets.push(sec);
    const esc = sec.reveal().replace(/'/g, "''"); // CREATE ROLE 은 파라미터 바인딩 불가 → CSPRNG 값만 리터럴(출력 금지)
    await db.exec(`CREATE ROLE ${qi(role)} LOGIN PASSWORD '${esc}'`);
  }
  out.push({ id: "create-login-role", outcome: "pass" });

  await db.exec(`CREATE TABLE ${qq(n.schema, n.tables.artifact)} (id int PRIMARY KEY, v text)`);
  if (inj.shouldFail("after-partial-triggers")) throw new InjectedFailure("after-partial-triggers");
  await db.exec(`INSERT INTO ${qq(n.schema, n.tables.artifact)} VALUES (1,'x')`);
  if (inj.shouldFail("after-synthetic-insert")) throw new InjectedFailure("after-synthetic-insert");

  // bootstrap A 형태: 현재 owner 가 잠시 synthetic owner 의 member → 이전 → 즉시 회수
  await db.exec(`GRANT ${qi(n.roles.owner)} TO CURRENT_USER`);
  await db.exec(`ALTER TABLE ${qq(n.schema, n.tables.artifact)} OWNER TO ${qi(n.roles.owner)}`);
  if (inj.shouldFail("after-ownership-transfer")) throw new InjectedFailure("after-ownership-transfer");
  await db.exec(`REVOKE ${qi(n.roles.owner)} FROM CURRENT_USER`);

  await db.exec(`GRANT ${qi(n.roles.owner)} TO ${qi(n.roles.admin)}`);
  await db.exec(`GRANT ${qi(n.roles.admin)} TO ${qi(n.roles.deployer)}`);
  out.push({ id: "grant-membership", outcome: "pass" });
  if (inj.shouldFail("before-membership-revoke")) throw new InjectedFailure("before-membership-revoke");
  await db.exec(`REVOKE ${qi(n.roles.admin)} FROM ${qi(n.roles.deployer)}`);
  out.push({ id: "revoke-membership", outcome: "pass" });

  secrets.length = 0;
  return out;
}

/** pooled mock 골격 smoke(Phase 2 에서 41–45 로 확장). */
export async function runPooledMockSmoke(inj: Injector): Promise<{ leakDetected: boolean; txResetOk: boolean }> {
  const pool: PooledMockAdapter = createPooledMockAdapter("w", { w: "write", r: "select" }, { resetSessionStateOnTxEnd: true });
  await pool.connect();
  pool.beginTx(); await pool.exec("SET ROLE r"); pool.endTx();
  const txResetOk = pool.currentRole() === null;
  if (inj.shouldFail("during-pooled-mock")) throw new InjectedFailure("during-pooled-mock");
  const leaky: PooledMockAdapter = createPooledMockAdapter("w", { w: "write" }, { leakSessionStateOnRecycle: true });
  await leaky.exec("SET ROLE r"); leaky.recycle();
  const leakDetected = leaky.currentRole() !== null;
  await pool.close(); await leaky.close();
  return { leakDetected, txResetOk };
}

// ── orchestration ───────────────────────────────────────────────────────────
export interface ExecuteOptions {
  profile: Profile; cfg: HarnessConfig; db: DbAdapter;
  injector?: Injector; pooledHostDistinct?: boolean; operatorDisposalPending?: boolean;
}

/** execute 본체. guard 재검증 → preflight → smoke → cleanup(항상) → 잔여 검증 → 분류. */
export async function executeHarness(opts: ExecuteOptions): Promise<HarnessReport> {
  const started = Date.now();
  const { cfg, db, profile } = opts;
  const inj = opts.injector ?? noInjection;
  const notes: string[] = [];
  const applicable = PHASE1_SMOKE_IDS.length; // Phase 1 scope

  const catalog = validateCatalog();
  if (!catalog.ok) {
    return buildReport({ profile, status: "aborted-safety-guard", cfg, probe: null, results: [], cleanup: null, elapsedMs: Date.now() - started, applicable, capabilityImplementation: "partial", notes: catalog.problems.map((p) => `capability 정본 오류: ${p}`) });
  }

  const n = scopedNames(cfg.runId);
  assertCleanupScope(buildCleanupPlan(n), cfg.runId);

  let probe: CatalogProbe | null = null;
  let results: CapabilityResult[] = [];
  let cleanup: CleanupOutcome | null = null;
  let guardsOk = false;

  try {
    probe = await probeCatalog(db, cfg.runId, { pooledHostDistinct: opts.pooledHostDistinct ?? !!cfg.pooledUrl });
    const pf = evaluatePreflight(probe);
    guardsOk = pf.ok;
    if (!pf.ok) {
      notes.push(...pf.refusals.map((x) => `preflight 거부: ${x}`));
      return buildReport({ profile, status: "aborted-safety-guard", cfg, probe, results: [], cleanup: null, elapsedMs: Date.now() - started, applicable, capabilityImplementation: "partial", notes });
    }
    notes.push(`preflight ok: ${JSON.stringify(probeSummary(probe))}`);
    results = await runSmokeCapabilities(db, n, inj);
  } catch (e) {
    const se = sanitizeError(e);
    notes.push(`실행 중단: ${se.name}: ${se.message}`);
  } finally {
    if (guardsOk) {
      const target = inj.shouldFail("cleanup-first-attempt") ? failFirstExec(db, 1) : db;
      try {
        cleanup = await runCleanup(target, n, { retry: true });
        if (inj.shouldFail("cleanup-first-attempt")) notes.push(`cleanup 1차 실패 주입 → 재시도(${cleanup.retried ? "수행" : "미수행"}) 결과 ok=${cleanup.ok}`);
      } catch (e) {
        notes.push(`cleanup 예외: ${sanitizeError(e).message}`);
        cleanup = { ok: false, attempted: 0, failed: [{ label: "cleanup", error: sanitizeError(e).message }], residualRoles: -1, residualObjects: -1, disabledTriggers: -1, retried: false };
      }
    }
  }

  const status = classifyResult({ guardsOk, results, applicable, cleanup, operatorDisposalPending: opts.operatorDisposalPending ?? false });
  notes.push(`Phase 1: capability implementation=partial — 정본 ${CAPABILITIES.length}종 중 smoke ${applicable}종만 실행(전체 커버리지 아님). Neon 실측 아님.`);
  return buildReport({ profile, status, cfg, probe, results, cleanup, elapsedMs: Date.now() - started, applicable, capabilityImplementation: "partial", notes });
}

export { CAPABILITIES, applicableFor, countFor, verifyResidual };
