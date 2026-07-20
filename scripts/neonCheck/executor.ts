// execute orchestration + failure injection + result/evidence 모델 + classifier + masked reporter.
import type { DbAdapter } from "./adapters";
import { evaluatePreflight, type CatalogProbe, type HarnessConfig } from "./guards";
import { probeCatalog, probeSummary } from "./preflight";
import { runCleanup, buildCleanupPlan, assertCleanupScope, verifyResidual, type CleanupOutcome } from "./cleanup";
import { scopedNames, qi, type ScopedNames } from "./identifiers";
import { generateSecret, maskUrl, sanitizeError, type MemorySecret } from "./secrets";
import {
  CAPABILITIES, applicableFor, countFor, authoritativeFor, findCapability, validateCatalog,
  AGGREGATE_PROFILE, type CapabilityOutcome, type ExecutionProfile,
} from "./capabilities";
import { DIRECT_HANDLERS, POOLED_HANDLERS, ALL_HANDLER_IDS, type HandlerCtx, type LoginFactory } from "./handlers";
import { createSchema, createObjects, applyGrants } from "./synthetic";

// ── failure injection (17 지점) ─────────────────────────────────────────────
export const INJECTION_POINTS = [
  // Phase 1 (9)
  "after-schema", "after-two-roles", "after-partial-triggers", "after-synthetic-insert",
  "after-ownership-transfer", "before-membership-revoke", "after-trigger-disable",
  "during-pooled-mock", "cleanup-first-attempt",
  // Phase 2 추가 (8)
  "after-reader-connection", "after-writer-connection", "after-default-privileges",
  "after-function-ownership", "trigger-disable-connection-error",
  "prepared-statement-pooled-failure", "reconnect-credential-rotation-failure",
  "before-final-residual-verification",
] as const;
export type InjectionPoint = (typeof INJECTION_POINTS)[number];
export interface Injector { shouldFail(point: InjectionPoint): boolean }
export const noInjection: Injector = { shouldFail: () => false };
export const injectAt = (...pts: InjectionPoint[]): Injector => ({ shouldFail: (p) => pts.includes(p) });
export class InjectedFailure extends Error { constructor(p: string) { super(`injected failure at ${p}`); this.name = "InjectedFailure"; } }

/** capability 실행 직후 주입 지점 매핑 */
const AFTER_CAPABILITY: Partial<Record<string, InjectionPoint>> = {
  "transfer-function-owner": "after-function-ownership",
  "bootstrap-a-ownership-transfer": "after-ownership-transfer",
  "bootstrap-a-membership-revoked": "before-membership-revoke",
  "reader-select-success": "after-reader-connection",
  "writer-insert-success": "after-writer-connection",
  "default-privileges-secure": "after-default-privileges",
  "owner-trigger-disable-allowed": "trigger-disable-connection-error",
  "startup-check-fails-when-trigger-disabled": "after-trigger-disable",
};

export function failFirstExec(db: DbAdapter, times: number): DbAdapter {
  let left = times;
  return { kind: db.kind, connect: () => db.connect(), query: (s, p) => db.query(s, p),
    exec: async (s) => { if (left > 0) { left--; throw new Error("injected cleanup failure"); } return db.exec(s); }, close: () => db.close() };
}

// ── result / evidence 모델 ──────────────────────────────────────────────────
export interface ExecutionResult {
  capabilityId: string;
  executionProfile: ExecutionProfile;
  outcome: CapabilityOutcome;
  /** 이 결과를 만든 엔진 = executionProfile 과 항상 일치 */
  evidenceSource: ExecutionProfile;
  /** 이 capability 의 authoritativeProfile 과 일치하는가 */
  authoritative: boolean;
  detailCode?: string;
  durationMs: number;
  sanitizedError?: string;
}
export type HarnessStatus = "passed-clean" | "passed-branch-disposal-required" | "failed-cleanup" | "aborted-safety-guard";
export interface ProfileReport {
  profile: ExecutionProfile; status: HarnessStatus; runId: string;
  directFingerprint: string; pooledFingerprint: string; serverVersion: string;
  applicable: number; notApplicable: number; passed: number; expectedDenial: number; failed: number;
  authoritativeEvidence: number;
  cleanupStatements: number; residualObjects: number; residualRoles: number; residualMembership: number; disabledTriggers: number;
  elapsedMs: number; operatorNextAction: string; notes: string[];
  results: ExecutionResult[];
}

/** neon-full 은 실행 profile 이 아니다. actual-neon-* evidence 로만 계산되며, 없으면 항상 unverified. */
export interface NeonFullRollup { profile: typeof AGGREGATE_PROFILE; status: "unverified" | "passed"; neonEvidenceCount: number; missing: number }
export function rollupNeonFull(all: ExecutionResult[]): NeonFullRollup {
  const neon = all.filter((r) => r.executionProfile === "actual-neon-direct" || r.executionProfile === "actual-neon-pooled");
  const covered = new Set(neon.filter((r) => r.outcome === "pass" || r.outcome === "expected-denial").map((r) => r.capabilityId));
  const missing = CAPABILITIES.filter((c) => !covered.has(c.id)).length;
  // hard guard: actual Neon evidence 없이는 절대 passed 아님. embedded/pooled/pglite 결과로 승격 불가.
  if (neon.length === 0 || missing > 0) return { profile: AGGREGATE_PROFILE, status: "unverified", neonEvidenceCount: neon.length, missing };
  return { profile: AGGREGATE_PROFILE, status: "passed", neonEvidenceCount: neon.length, missing: 0 };
}
/** 외부에서 neon-full 에 passed 를 주입하려는 시도를 차단(테스트로 강제). */
export function assertNoNeonPromotion(rollup: NeonFullRollup, all: ExecutionResult[]): void {
  const hasNeon = all.some((r) => r.executionProfile === "actual-neon-direct" || r.executionProfile === "actual-neon-pooled");
  if (rollup.status === "passed" && !hasNeon) throw new Error("neon-full 승격 금지: actual Neon evidence 없음");
}

export function classifyProfile(input: {
  guardsOk: boolean; results: ExecutionResult[]; applicable: number;
  cleanup: CleanupOutcome | null; operatorDisposalPending: boolean;
}): HarnessStatus {
  if (!input.guardsOk) return "aborted-safety-guard";
  if (!input.cleanup || !input.cleanup.ok) return "failed-cleanup";
  if (input.cleanup.residualRoles > 0 || input.cleanup.residualObjects > 0 || input.cleanup.disabledTriggers > 0) return "failed-cleanup";
  const executed = input.results.filter((r) => r.outcome !== "not-applicable");
  const failed = executed.filter((r) => r.outcome === "fail").length;
  const missing = Math.max(0, input.applicable - executed.length);
  if (failed > 0 || missing > 0) return "failed-cleanup";
  return input.operatorDisposalPending ? "passed-branch-disposal-required" : "passed-clean";
}

const nextAction = (s: HarnessStatus): string =>
  s === "passed-clean" ? "결과 저장 → env 제거 → credential 폐기 → disposable branch 삭제"
  : s === "passed-branch-disposal-required" ? "결과 저장 → branch 반드시 삭제 → 남은 운영자 조치 수행"
  : s === "failed-cleanup" ? "branch 삭제로 정리 → 실패/잔여 사유 보고(운영 반영 금지)"
  : "가드 사유 확인 → 대상이 disposable 인지 재점검 → 필요 시 새 branch";

export function formatProfileReport(r: ProfileReport): string[] {
  return [
    `[neon-check] profile=${r.profile} status=${r.status}`,
    `[neon-check] runId=${r.runId} direct=${r.directFingerprint} pooled=${r.pooledFingerprint} server=${r.serverVersion}`,
    `[neon-check] applicable=${r.applicable} not-applicable=${r.notApplicable} passed=${r.passed} expected-denial=${r.expectedDenial} failed=${r.failed} authoritative=${r.authoritativeEvidence}`,
    `[neon-check] cleanup statements=${r.cleanupStatements} residual objects=${r.residualObjects} roles=${r.residualRoles} membership=${r.residualMembership} disabled-triggers=${r.disabledTriggers}`,
    `[neon-check] elapsed=${r.elapsedMs}ms`,
    ...r.notes.map((n) => `[neon-check] note: ${n}`),
    `[neon-check] next: ${r.operatorNextAction}`,
  ];
}
export const formatNeonFull = (r: NeonFullRollup): string =>
  `[neon-check] profile=${r.profile} status=${r.status} neon-evidence=${r.neonEvidenceCount} missing=${r.missing}`;

// ── 환경 준비 ───────────────────────────────────────────────────────────────
async function prepareEnvironment(db: DbAdapter, n: ScopedNames, inj: Injector, secrets: Map<string, MemorySecret>,
  onRolesCreated?: (roles: string[], secrets: Map<string, MemorySecret>) => Promise<void>): Promise<void> {
  await createSchema(db, n);
  if (inj.shouldFail("after-schema")) throw new InjectedFailure("after-schema");
  await db.exec(`CREATE ROLE ${qi(n.roles.owner)} NOLOGIN`);
  await db.exec(`CREATE ROLE ${qi(n.roles.admin)} NOLOGIN`);
  if (inj.shouldFail("after-two-roles")) throw new InjectedFailure("after-two-roles");
  for (const role of [n.roles.deployer, n.roles.writer, n.roles.reader, n.roles.appSim]) {
    const sec = generateSecret(); secrets.set(role, sec);
    await db.exec(`CREATE ROLE ${qi(role)} LOGIN PASSWORD '${sec.reveal().replace(/'/g, "''")}'`);
  }
  if (onRolesCreated) await onRolesCreated([n.roles.deployer, n.roles.writer, n.roles.reader, n.roles.appSim], secrets);
  await createObjects(db, n);
  if (inj.shouldFail("after-partial-triggers")) throw new InjectedFailure("after-partial-triggers");
  if (inj.shouldFail("after-synthetic-insert")) throw new InjectedFailure("after-synthetic-insert");
  await applyGrants(db, n);
}

// ── orchestration ───────────────────────────────────────────────────────────
export interface ExecuteOptions {
  profile: ExecutionProfile; cfg: HarnessConfig; db: DbAdapter;
  login?: LoginFactory | null; injector?: Injector; pooledHostDistinct?: boolean;
  operatorDisposalPending?: boolean;
  onRolesCreated?: (roles: string[], secrets: Map<string, MemorySecret>) => Promise<void>;
}

/** direct 계열 profile(pglite/embedded-direct/actual-neon-direct) 실행. */
export async function executeDirectProfile(opts: ExecuteOptions): Promise<ProfileReport> {
  const started = Date.now();
  const { cfg, db, profile } = opts;
  const inj = opts.injector ?? noInjection;
  const notes: string[] = [];
  const results: ExecutionResult[] = [];
  const applicableIds = applicableFor(profile).map((c) => c.id);
  const secrets = new Map<string, MemorySecret>();

  const catalog = validateCatalog();
  if (!catalog.ok) return finish("aborted-safety-guard", null, null, catalog.problems.map((p) => `catalog: ${p}`));

  const n = scopedNames(cfg.runId);
  assertCleanupScope(buildCleanupPlan(n), cfg.runId);

  let probe: CatalogProbe | null = null;
  let cleanup: CleanupOutcome | null = null;
  let guardsOk = false;

  try {
    probe = await probeCatalog(db, cfg.runId, { pooledHostDistinct: opts.pooledHostDistinct ?? !!cfg.pooledUrl });
    const pf = evaluatePreflight(probe);
    guardsOk = pf.ok;
    if (!pf.ok) { notes.push(...pf.refusals.map((x) => `preflight 거부: ${x}`)); return finish("aborted-safety-guard", probe, null, notes); }
    notes.push(`preflight ok: ${JSON.stringify(probeSummary(probe))}`);

    await prepareEnvironment(db, n, inj, secrets, opts.onRolesCreated);

    const ctx: HandlerCtx = {
      db, names: n, login: opts.login ?? null, secrets,
      hook: async (label) => { if (inj.shouldFail(label as InjectionPoint)) throw new InjectedFailure(label); },
    };

    for (const cap of CAPABILITIES) {
      if (!applicableIds.includes(cap.id)) {
        results.push({ capabilityId: cap.id, executionProfile: profile, outcome: "not-applicable", evidenceSource: profile, authoritative: false, durationMs: 0, detailCode: "not-applicable-for-profile" });
        continue;
      }
      const h = DIRECT_HANDLERS[cap.id];
      const t0 = Date.now();
      if (!h) { results.push({ capabilityId: cap.id, executionProfile: profile, outcome: "fail", evidenceSource: profile, authoritative: cap.authoritativeProfile === profile, durationMs: 0, detailCode: "handler-missing" }); continue; }
      try {
        const r = await h(ctx);
        const outcome: CapabilityOutcome = r.outcome === "pass" && cap.expectation === "expected-denial" ? "fail"
          : r.outcome === "expected-denial" && cap.expectation === "pass" ? "fail" : r.outcome;
        results.push({ capabilityId: cap.id, executionProfile: profile, outcome, evidenceSource: profile, authoritative: cap.authoritativeProfile === profile, detailCode: r.detailCode, durationMs: Date.now() - t0 });
      } catch (e) {
        if (e instanceof InjectedFailure) throw e;
        results.push({ capabilityId: cap.id, executionProfile: profile, outcome: "fail", evidenceSource: profile, authoritative: cap.authoritativeProfile === profile, durationMs: Date.now() - t0, sanitizedError: sanitizeError(e).message });
      }
      const point = AFTER_CAPABILITY[cap.id];
      if (point && inj.shouldFail(point)) throw new InjectedFailure(point);
    }
  } catch (e) {
    const se = sanitizeError(e);
    notes.push(`실행 중단: ${se.name}: ${se.message}`);
  } finally {
    if (guardsOk) {
      if (inj.shouldFail("before-final-residual-verification")) notes.push("injection: before-final-residual-verification");
      const target = inj.shouldFail("cleanup-first-attempt") ? failFirstExec(db, 1) : db;
      try { cleanup = await runCleanup(target, n, { retry: true }); }
      catch (e) { cleanup = { ok: false, attempted: 0, failed: [{ label: "cleanup", error: sanitizeError(e).message }], residualRoles: -1, residualObjects: -1, disabledTriggers: -1, retried: false }; }
    }
    secrets.clear();
  }

  const status = classifyProfile({ guardsOk, results, applicable: applicableIds.length, cleanup, operatorDisposalPending: opts.operatorDisposalPending ?? false });
  return finish(status, probe, cleanup, notes);

  function finish(status: HarnessStatus, p: CatalogProbe | null, cl: CleanupOutcome | null, ns: string[]): ProfileReport {
    const cnt = (o: CapabilityOutcome) => results.filter((r) => r.outcome === o).length;
    return {
      profile, status, runId: cfg.runId,
      directFingerprint: maskUrl(cfg.directUrl), pooledFingerprint: cfg.pooledUrl ? maskUrl(cfg.pooledUrl) : "url#none",
      serverVersion: p?.serverVersion ?? "unknown",
      applicable: applicableIds.length, notApplicable: cnt("not-applicable"),
      passed: cnt("pass"), expectedDenial: cnt("expected-denial"), failed: cnt("fail"),
      authoritativeEvidence: results.filter((r) => r.authoritative && (r.outcome === "pass" || r.outcome === "expected-denial")).length,
      cleanupStatements: cl?.attempted ?? 0, residualObjects: cl?.residualObjects ?? -1, residualRoles: cl?.residualRoles ?? -1,
      residualMembership: 0, disabledTriggers: cl?.disabledTriggers ?? -1,
      elapsedMs: Date.now() - started, operatorNextAction: nextAction(status), notes: ns, results,
    };
  }
}

/** pooled 계열 profile(pooled-mock/actual-neon-pooled) 실행. DB 연결 불필요(mock). */
export async function executePooledProfile(opts: { profile: ExecutionProfile; cfg: HarnessConfig; injector?: Injector }): Promise<ProfileReport> {
  const started = Date.now();
  const { profile, cfg } = opts;
  const inj = opts.injector ?? noInjection;
  const results: ExecutionResult[] = [];
  const notes: string[] = [];
  const applicableIds = applicableFor(profile).map((c) => c.id);
  const hook = async (label: string) => { if (inj.shouldFail(label as InjectionPoint)) throw new InjectedFailure(label); };

  for (const cap of CAPABILITIES) {
    if (!applicableIds.includes(cap.id)) {
      results.push({ capabilityId: cap.id, executionProfile: profile, outcome: "not-applicable", evidenceSource: profile, authoritative: false, durationMs: 0, detailCode: "not-applicable-for-profile" });
      continue;
    }
    const h = POOLED_HANDLERS[cap.id];
    const t0 = Date.now();
    if (!h) { results.push({ capabilityId: cap.id, executionProfile: profile, outcome: "fail", evidenceSource: profile, authoritative: cap.authoritativeProfile === profile, durationMs: 0, detailCode: "handler-missing" }); continue; }
    try {
      if (inj.shouldFail("during-pooled-mock")) throw new InjectedFailure("during-pooled-mock");
      const r = await h({ hook });
      results.push({ capabilityId: cap.id, executionProfile: profile, outcome: r.outcome, evidenceSource: profile, authoritative: cap.authoritativeProfile === profile, detailCode: r.detailCode, durationMs: Date.now() - t0 });
    } catch (e) {
      results.push({ capabilityId: cap.id, executionProfile: profile, outcome: "fail", evidenceSource: profile, authoritative: cap.authoritativeProfile === profile, durationMs: Date.now() - t0, sanitizedError: sanitizeError(e).message });
    }
  }
  const executed = results.filter((r) => r.outcome !== "not-applicable");
  const failed = executed.filter((r) => r.outcome === "fail").length;
  const status: HarnessStatus = failed > 0 ? "failed-cleanup" : "passed-clean";
  notes.push("pooled-mock 은 실제 PgBouncer 검증이 아니며 actual-neon-pooled 의 대체 evidence 가 아님");
  const cnt = (o: CapabilityOutcome) => results.filter((r) => r.outcome === o).length;
  return {
    profile, status, runId: cfg.runId, directFingerprint: maskUrl(cfg.directUrl),
    pooledFingerprint: cfg.pooledUrl ? maskUrl(cfg.pooledUrl) : "url#none", serverVersion: "n/a(mock)",
    applicable: applicableIds.length, notApplicable: cnt("not-applicable"), passed: cnt("pass"),
    expectedDenial: cnt("expected-denial"), failed: cnt("fail"),
    authoritativeEvidence: results.filter((r) => r.authoritative && r.outcome !== "fail" && r.outcome !== "not-applicable").length,
    cleanupStatements: 0, residualObjects: 0, residualRoles: 0, residualMembership: 0, disabledTriggers: 0,
    elapsedMs: Date.now() - started, operatorNextAction: nextAction(status), notes, results,
  };
}

export { CAPABILITIES, applicableFor, countFor, authoritativeFor, findCapability, verifyResidual, ALL_HANDLER_IDS, DIRECT_HANDLERS, POOLED_HANDLERS };
