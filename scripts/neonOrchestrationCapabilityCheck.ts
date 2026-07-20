// disposable Neon orchestration role/pooler capability 검증 하네스.
// ⚠️ 이 파일은 "운영자가 미리 만든 disposable Neon branch"에서만 실행하도록 설계된 도구다.
//    이 저장소/이 Gate 에서는 **실행하지 않는다**(Neon 접근 없음). 아래 결과를 Neon 실측이라고 표현하지 말 것.
//
// 원칙:
//   · .env 를 읽거나 탐색하지 않는다(dotenv import 없음). 명시 프로세스 환경변수만 사용.
//   · URL/host/username/password 원문을 절대 출력하지 않는다(hash·masked capability 만).
//   · 모든 생성 object/role 이름에 run-id suffix 강제. production 과 동일한 이름(orchestration_*) 생성 금지.
//   · synthetic namespace(schema oc_chk_<runId>) 밖 DDL 금지. 고객/업무 데이터 미사용.
//   · 기본 dry-run(plan 출력, DB write 0). 실제 실행은 CONFIRM_EXECUTE=true 필요.
//   · production 여부를 완벽히 판정할 수 없으면 fail-closed.
import crypto from "node:crypto";

// ── 환경변수 계약(명시) ─────────────────────────────────────────────────────
export interface HarnessEnv {
  NEON_CHECK_DIRECT_URL?: string;
  NEON_CHECK_POOLED_URL?: string;
  NEON_CHECK_EXPECTED_HOST_HASH?: string;   // sha256(host) 전체 64hex
  NEON_CHECK_FORBIDDEN_HOST_HASH?: string;  // production host hash(있으면 일치 시 거부)
  NEON_CHECK_DISPOSABLE_CONFIRM?: string;   // 반드시 DISPOSABLE_TOKEN
  NEON_CHECK_RUN_ID?: string;               // [a-z0-9]{4,16}
  CONFIRM_EXECUTE?: string;                 // "true" 일 때만 실제 DDL
}
export const DISPOSABLE_TOKEN = "i-confirm-disposable-neon-branch";
export const RUN_ID_RE = /^[a-z0-9]{4,16}$/;

export interface HarnessConfig {
  directUrl: string; pooledUrl: string | null;
  expectedHostHash: string; forbiddenHostHash: string | null;
  runId: string; execute: boolean;
}
export interface GuardResult { ok: boolean; refusals: string[] }

export const hostHashOf = (url: string): string => {
  let h = ""; try { h = new URL(url).host.toLowerCase(); } catch { h = ""; }
  return crypto.createHash("sha256").update(h).digest("hex");
};
/** URL·secret 을 로그에 남기지 않기 위한 마스킹. 항상 hash 접두 8자만. */
export const maskUrl = (url: string): string => (url ? `url#${hostHashOf(url).slice(0, 8)}…` : "url#none");

/** 1단계: 환경변수 파싱 + 형식 가드(연결 전). 하나라도 실패 시 fail-closed. */
export function parseHarnessEnv(env: HarnessEnv): { ok: true; config: HarnessConfig } | { ok: false; refusals: string[] } {
  const r: string[] = [];
  const direct = (env.NEON_CHECK_DIRECT_URL ?? "").trim();
  const pooled = (env.NEON_CHECK_POOLED_URL ?? "").trim();
  const expect = (env.NEON_CHECK_EXPECTED_HOST_HASH ?? "").trim().toLowerCase();
  const forbid = (env.NEON_CHECK_FORBIDDEN_HOST_HASH ?? "").trim().toLowerCase();
  const token = (env.NEON_CHECK_DISPOSABLE_CONFIRM ?? "").trim();
  const runId = (env.NEON_CHECK_RUN_ID ?? "").trim();

  if (!direct) r.push("NEON_CHECK_DIRECT_URL 없음");
  if (token !== DISPOSABLE_TOKEN) r.push("disposable 확인 토큰 불일치/누락");
  if (!/^[0-9a-f]{64}$/.test(expect)) r.push("NEON_CHECK_EXPECTED_HOST_HASH 없음/형식오류");
  if (!RUN_ID_RE.test(runId)) r.push("NEON_CHECK_RUN_ID 없음/형식오류([a-z0-9]{4,16})");
  if (forbid && !/^[0-9a-f]{64}$/.test(forbid)) r.push("NEON_CHECK_FORBIDDEN_HOST_HASH 형식오류");
  if (direct && expect && /^[0-9a-f]{64}$/.test(expect) && hostHashOf(direct) !== expect) r.push("direct URL host hash ≠ expected pin");
  if (direct && forbid && hostHashOf(direct) === forbid) r.push("direct URL 이 production host hash 와 일치 → 거부");
  if (pooled && forbid && hostHashOf(pooled) === forbid) r.push("pooled URL 이 production host hash 와 일치 → 거부");
  if (pooled && direct && pooled === direct) r.push("direct/pooled URL 이 동일 → pooler 검증 불가(거부)");
  if (r.length) return { ok: false, refusals: r };
  return { ok: true, config: { directUrl: direct, pooledUrl: pooled || null, expectedHostHash: expect, forbiddenHostHash: forbid || null, runId, execute: (env.CONFIRM_EXECUTE ?? "") === "true" } };
}

// ── 2단계: 접속 후 카탈로그 관찰로 production 오접속 방지 ────────────────────
export interface CatalogProbe {
  businessTablesPresent: string[];   // customers/consultations/calls/jobs 등 발견된 운영 테이블
  businessRowTotal: number;          // 그 테이블들의 행수 합
  productionOrchRolesPresent: string[]; // orchestration_* (production 이름) role 존재
  runScopedLeftovers: string[];      // 이전 run 잔여(같은 runId) object
  baseTableCount: number;
}
export const PRODUCTION_MARKER_TABLES = ["customers", "consultations", "calls", "jobs", "job_executions", "job_shadow_previews", "job_artifacts", "orchestration_audit_log"];

/** 관찰된 카탈로그가 production 처럼 보이면 거부. 판정 불가 시에도 거부(fail-closed). */
export function evaluateSafetyGuards(cfg: HarnessConfig, probe: CatalogProbe): GuardResult {
  const r: string[] = [];
  if (probe.businessTablesPresent.length > 0) r.push(`운영/업무 테이블 발견(${probe.businessTablesPresent.length}종) → disposable 아님으로 판정, 거부`);
  if (probe.businessRowTotal > 0) r.push(`기존 데이터 행 발견(${probe.businessRowTotal}) → 거부`);
  if (probe.productionOrchRolesPresent.length > 0) r.push(`production 이름 orchestration_* role 존재(${probe.productionOrchRolesPresent.length}) → 거부(동일 이름 생성 금지)`);
  if (probe.runScopedLeftovers.length > 0) r.push(`이전 run 잔여 object(${probe.runScopedLeftovers.length}) → 거부(수동 cleanup 필요)`);
  return { ok: r.length === 0, refusals: r };
}

// ── run-id 스코프 이름 ──────────────────────────────────────────────────────
export interface ScopedNames {
  schema: string;
  roles: { owner: string; admin: string; deployer: string; writer: string; reader: string; appSim: string };
  tables: { artifact: string; audit: string; approval: string };
  functions: { denyWrite: string; denyDelete: string; guard: string; denyTruncate: string };
}
export function scopedNames(runId: string): ScopedNames {
  if (!RUN_ID_RE.test(runId)) throw new Error("invalid runId");
  const s = (b: string) => `oc_${b}_${runId}`; // production 의 orchestration_* 와 이름 충돌 없음
  return {
    schema: `oc_chk_${runId}`,
    roles: { owner: s("owner"), admin: s("admin"), deployer: s("deployer"), writer: s("writer"), reader: s("reader"), appSim: s("appsim") },
    tables: { artifact: s("artifact"), audit: s("audit"), approval: s("approval") },
    functions: { denyWrite: s("deny_write"), denyDelete: s("deny_delete"), guard: s("guard_update"), denyTruncate: s("deny_truncate") },
  };
}
/** 모든 생성/삭제 대상 이름은 반드시 run-id suffix 를 가져야 한다(production object 보호). */
export function assertRunScoped(name: string, runId: string): void {
  if (!name.endsWith(`_${runId}`)) throw new Error(`run-id 스코프 위반: ${name}`);
}

// ── cleanup 계획(run-id 범위만) ─────────────────────────────────────────────
export function buildCleanupPlan(names: ScopedNames, runId: string): string[] {
  const all = [names.schema, ...Object.values(names.roles)];
  for (const n of all) assertRunScoped(n, runId);
  const roles = Object.values(names.roles);
  return [
    `DROP SCHEMA IF EXISTS ${names.schema} CASCADE`,
    ...roles.map((r) => `DROP OWNED BY ${r} CASCADE`),
    ...roles.map((r) => `DROP ROLE IF EXISTS ${r}`),
  ];
}

export type HarnessOutcome = "passed-clean" | "passed-branch-disposal-required" | "failed-cleanup" | "aborted-safety-guard";
export function classifyOutcome(input: { guardsOk: boolean; checksOk: boolean; cleanupOk: boolean; residual: number; triggersAllEnabled: boolean }): HarnessOutcome {
  if (!input.guardsOk) return "aborted-safety-guard";
  if (!input.cleanupOk || input.residual > 0) return "failed-cleanup";
  if (!input.triggersAllEnabled) return "failed-cleanup"; // disabled trigger 잔존 시 전체 실패
  return input.checksOk ? "passed-clean" : "passed-branch-disposal-required";
}

// ── 검증 대상 capability 목록(문서/보고 동기화용) ────────────────────────────
export const CAPABILITY_CHECKS = [
  "role: CREATE ROLE NOLOGIN", "role: CREATE ROLE LOGIN", "role: GRANT membership", "role: REVOKE membership",
  "role: SET ROLE", "role: RESET ROLE", "role: membership 회수 후 SET ROLE 실패", "role: writer/reader/app escalation 실패",
  "ownership: current owner → NOLOGIN owner table transfer", "ownership: function owner transfer",
  "ownership: bootstrap A 임시 membership 부여", "ownership: transfer 후 membership 회수", "ownership: 잔여 membership 0",
  "privilege: PUBLIC table 0", "privilege: PUBLIC sequence 0", "privilege: PUBLIC function EXECUTE 0",
  "privilege: reader SELECT-only", "privilege: writer 허용 INSERT", "privilege: writer UPDATE/DELETE/TRUNCATE 거부",
  "privilege: writer business-table 접근 거부", "privilege: app simulation write 거부",
  "privilege: trigger function 직접 호출 거부", "privilege: default privileges",
  "direct: reader/writer/deployer 별도 LOGIN", "direct: deployer→admin→owner", "direct: escalation 실패",
  "direct: startup self-check enabled 성공", "direct: trigger disabled 시 self-check 실패", "direct: re-enable 후 성공",
  "pooled: reader/writer 별도 credential", "pooled: transaction 종료 후 role/session 상태", "pooled: SET ROLE 비의존",
  "pooled: prepared statement 재사용", "pooled: credential rotation 후 기존 connection", "pooled: pool 재연결 전후 권한",
  "pooled: 잘못된 credential/pool 사용 시 fail-closed",
  "emergency: session_replication_role 변경 실패", "emergency: owner 만 DISABLE TRIGGER", "emergency: 종료 후 전체 trigger enabled",
] as const;

// ── dry-run plan 출력(DB write 0) ───────────────────────────────────────────
export function buildDryRunPlan(cfg: HarnessConfig, names: ScopedNames): string[] {
  return [
    `[plan] target=${maskUrl(cfg.directUrl)} pooled=${cfg.pooledUrl ? maskUrl(cfg.pooledUrl) : "none"} runId=${cfg.runId}`,
    `[plan] CREATE SCHEMA ${names.schema}`,
    `[plan] CREATE ROLE ${Object.values(names.roles).join(", ")}`,
    `[plan] CREATE TABLE ${Object.values(names.tables).join(", ")} (synthetic, in ${names.schema})`,
    `[plan] CREATE FUNCTION/TRIGGER ${Object.values(names.functions).join(", ")}`,
    `[plan] capability checks: ${CAPABILITY_CHECKS.length}종`,
    `[plan] cleanup: ${buildCleanupPlan(names, cfg.runId).length} statements (run-id 범위 한정)`,
    `[plan] DB write 0 (dry-run). 실제 실행은 CONFIRM_EXECUTE=true 필요.`,
  ];
}

// ── CLI 진입점: 이 Gate 에서는 실행하지 않음(운영자가 disposable branch 에서 실행) ──
export async function main(env: HarnessEnv = process.env as HarnessEnv): Promise<number> {
  const parsed = parseHarnessEnv(env);
  if (!parsed.ok) { console.error("[neon-check] ❌ 실행 거부(fail-closed):"); for (const r of parsed.refusals) console.error("  - " + r); return 2; }
  const cfg = parsed.config;
  const names = scopedNames(cfg.runId);
  for (const line of buildDryRunPlan(cfg, names)) console.log(line);
  if (!cfg.execute) { console.log("[neon-check] dry-run 종료(DB write 0). 실행하려면 CONFIRM_EXECUTE=true."); return 0; }
  console.error("[neon-check] ❌ 실제 실행 경로는 운영자가 disposable Neon branch 에서만 사용. 이 저장소 Gate 에서는 미실행.");
  console.error("[neon-check] 실행 절차: docs/disposable-neon-orchestration-verification.md 참조.");
  return 3;
}

// 직접 실행 시에도 기본은 dry-run/거부. (import 시 부작용 없음)
const isDirect = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("neonOrchestrationCapabilityCheck.ts");
if (isDirect) { main().then((c) => process.exit(c)); }
