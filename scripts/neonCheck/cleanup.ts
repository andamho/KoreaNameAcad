// cleanup executor — 성공·실패·중단·예외 모든 경로에서 실행. run-id 범위 밖은 절대 건드리지 않는다(이중 검증).
import type { DbAdapter } from "./adapters";
import { assertRunScoped, qi, qq, type ScopedNames, allRoles } from "./identifiers";
import { sanitizeError } from "./secrets";

export interface CleanupStep { label: string; sql: string; target: string }
export interface CleanupOutcome {
  ok: boolean;
  attempted: number;
  failed: { label: string; error: string }[];
  residualRoles: number;
  residualObjects: number;
  disabledTriggers: number;
  retried: boolean;
}

/**
 * cleanup 계획. 순서:
 *  trigger 재활성 → synthetic schema 제거 → membership revoke → DROP OWNED → LOGIN/NOLOGIN role 제거.
 * 모든 target 이 run-id 스코프인지 이중 검증한다.
 */
export function buildCleanupPlan(n: ScopedNames): CleanupStep[] {
  const runId = n.runId;
  const steps: CleanupStep[] = [];
  // 1) trigger 재활성(비활성 잔존 방지) — schema 통째 제거 전 안전망
  steps.push({ label: "enable-triggers", target: n.schema, sql: `DO $$DECLARE t record; BEGIN FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname=${lit(n.schema)} AND c.relkind='r' LOOP EXECUTE format('ALTER TABLE %I.%I ENABLE TRIGGER ALL', ${lit(n.schema)}, t.relname); END LOOP; END$$;` });
  // 2) synthetic schema 제거(테이블·함수·트리거 일괄)
  steps.push({ label: "drop-schema", target: n.schema, sql: `DROP SCHEMA IF EXISTS ${qi(n.schema)} CASCADE` });
  // 3) membership revoke (owner/admin/deployer 체인)
  steps.push({ label: "revoke-admin-from-deployer", target: n.roles.deployer, sql: `REVOKE ${qi(n.roles.admin)} FROM ${qi(n.roles.deployer)}` });
  steps.push({ label: "revoke-owner-from-admin", target: n.roles.admin, sql: `REVOKE ${qi(n.roles.owner)} FROM ${qi(n.roles.admin)}` });
  // 4) DROP OWNED(소유 객체 제거) → 5) role 제거
  for (const r of allRoles(n)) steps.push({ label: `drop-owned:${r}`, target: r, sql: `DROP OWNED BY ${qi(r)} CASCADE` });
  for (const r of allRoles(n)) steps.push({ label: `drop-role:${r}`, target: r, sql: `DROP ROLE IF EXISTS ${qi(r)}` });
  // 이중 검증: 모든 target 이 run-id 스코프
  for (const s of steps) assertRunScoped(s.target, runId);
  return steps;
}
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** cleanup 실행(실패해도 계속 진행). 1회 재시도 지원. */
export async function runCleanup(db: DbAdapter, n: ScopedNames, opts: { retry?: boolean } = {}): Promise<CleanupOutcome> {
  const plan = buildCleanupPlan(n);
  const failed: { label: string; error: string }[] = [];
  let retried = false;

  const pass = async (steps: CleanupStep[]) => {
    const stillFailing: CleanupStep[] = [];
    for (const s of steps) {
      try { await db.exec(s.sql); }
      catch (e) { stillFailing.push(s); failed.push({ label: s.label, error: sanitizeError(e).message }); }
    }
    return stillFailing;
  };

  let remaining = await pass(plan);
  if (remaining.length && opts.retry !== false) {
    retried = true;
    failed.length = 0; // 재시도 결과로 대체
    remaining = await pass(remaining);
  }

  const residual = await verifyResidual(db, n);
  return {
    ok: remaining.length === 0 && residual.roles === 0 && residual.objects === 0 && residual.disabledTriggers === 0,
    attempted: plan.length,
    failed,
    residualRoles: residual.roles,
    residualObjects: residual.objects,
    disabledTriggers: residual.disabledTriggers,
    retried,
  };
}

/** 잔여 검증 — run-id 스코프 role/object 및 비활성 trigger 가 0 이어야 한다. */
export async function verifyResidual(db: DbAdapter, n: ScopedNames): Promise<{ roles: number; objects: number; disabledTriggers: number }> {
  const num = async (sql: string, params?: unknown[]) => Number((await db.query(sql, params)).rows[0]?.n ?? 0);
  const like = `%\\_${n.runId}`;
  const roles = await num(`SELECT count(*)::int AS n FROM pg_roles WHERE rolname LIKE $1`, [like]);
  const schemas = await num(`SELECT count(*)::int AS n FROM pg_namespace WHERE nspname LIKE $1`, [like]);
  const rels = await num(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname LIKE $1 OR c.relname LIKE $1`, [like]);
  const fns = await num(`SELECT count(*)::int AS n FROM pg_proc WHERE proname LIKE $1`, [like]);
  const disabledTriggers = await num(
    `SELECT count(*)::int AS n FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace ns ON ns.oid=c.relnamespace
      WHERE NOT t.tgisinternal AND t.tgenabled='D' AND (ns.nspname LIKE $1 OR c.relname LIKE $1)`, [like]);
  return { roles, objects: schemas + rels + fns, disabledTriggers };
}

/** cleanup SQL 이 production 이름/run-id 밖을 참조하지 않는지 정적 검증(테스트·실행 공통). */
export function assertCleanupScope(plan: CleanupStep[], runId: string): void {
  for (const s of plan) {
    assertRunScoped(s.target, runId);
    if (/\borchestration_(owner|admin|deployer|writer|reader)\b/.test(s.sql)) throw new Error(`cleanup 이 production role 참조: ${s.label}`);
    if (/\b(job_artifacts|orchestration_audit_log|automated_reviews|human_approvals|emergency_stops|job_dependencies|customers|calls|jobs)\b/.test(s.sql)) {
      throw new Error(`cleanup 이 production table 참조: ${s.label}`);
    }
  }
}
void qq;
