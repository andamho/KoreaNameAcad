// cleanup executor — 성공·실패·중단·예외 모든 경로에서 실행. run-id 범위 밖은 절대 건드리지 않는다(이중 검증).
import type { DbAdapter } from "./adapters";
import { assertRunScoped, qi, qq, type ScopedNames, allRoles } from "./identifiers";
import { sanitizeError } from "./secrets";

export interface CleanupStep {
  label: string; sql: string; target: string;
  /** 이 step 을 해당 role 로 `SET ROLE` 한 상태에서 실행한다(자기 소유물 정리용).
   *  SET ROLE 이 실패해도(멤버십 부재 등) fallback 으로 executor 로 직접 실행하며, 그래도 실패하면 기록만 하고 계속한다.
   *  ⚠️ cleanup 은 SET ROLE 성공 여부에 **의존하지 않는다** — 실패해도 DROP SCHEMA/DROP ROLE 등 나머지는 진행된다. */
  runAsRole?: string;
}
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
 * cleanup 계획(fix5 순서 — embedded PG17 non-superuser 검증).
 *  1) RESET ROLE(안전)
 *  2) trigger 재활성(비활성 잔존 방지)
 *  3) 각 role 자기 소유물 정리: SET ROLE <r> → DROP OWNED BY <r> CASCADE → RESET ROLE
 *     (owner 의 pg_default_acl 항목처럼 executor 로는 못 지우는 소유물을 각 role 자격으로 정리. SET ROLE 실패해도 계속)
 *  4) synthetic schema 제거(executor 소유이므로 SET ROLE 불요)
 *  5) membership revoke(체인)
 *  6) run-id role 제거
 * 모든 target(및 runAsRole)이 run-id 스코프인지 이중 검증한다.
 */
export function buildCleanupPlan(n: ScopedNames): CleanupStep[] {
  const runId = n.runId;
  const steps: CleanupStep[] = [];
  // 1) 안전: 이전 SET ROLE 상태 해제
  steps.push({ label: "reset-role", target: n.schema, sql: `RESET ROLE` });
  // 2) trigger 재활성 — schema 제거 전 안전망. 테이블은 owner 소유이므로 owner 로 수행.
  steps.push({ label: "enable-triggers", target: n.schema, runAsRole: n.roles.owner, sql: `DO $$DECLARE t record; BEGIN FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname=${lit(n.schema)} AND c.relkind='r' LOOP EXECUTE format('ALTER TABLE %I.%I ENABLE TRIGGER ALL', ${lit(n.schema)}, t.relname); END LOOP; END$$;` });
  // 3) synthetic schema 제거를 **먼저** 한다(executor = schema 소유자 → CASCADE 로 owner 소유 테이블·함수·그에 대한 GRANT·USAGE 를 일괄 제거).
  //    이렇게 해야 reader/writer/deployer 등에 부여된 schema 관련 privilege dependency 가 사라져 이후 DROP ROLE 이 막히지 않는다.
  //    (그 privilege 는 grantee 자신이 SET ROLE 로도 revoke 하지 못한다 — grantor 가 아니므로.)
  steps.push({ label: "drop-schema", target: n.schema, sql: `DROP SCHEMA IF EXISTS ${qi(n.schema)} CASCADE` });
  // 4) 각 role 의 **schema 밖** 자기 소유물 정리(SET ROLE 상태) — 전역 default-acl(pg_default_acl) 등. executor 로는 못 지운다.
  for (const r of allRoles(n)) steps.push({ label: `drop-owned-self:${r}`, target: r, runAsRole: r, sql: `DROP OWNED BY ${qi(r)} CASCADE` });
  // 5) database-level privilege 회수(예: onRolesCreated 의 GRANT CONNECT ON DATABASE). 이 privilege 는 schema 밖이라
  //    DROP SCHEMA/DROP OWNED(SET ROLE self)로 정리되지 않아 DROP ROLE 을 막는다("objects depend on it"). executor 가 grantor 이므로 revoke 가능.
  //    없는 privilege 는 예외 없이 넘어간다(멱등). current_database() 로 대상 DB 를 한정한다.
  for (const r of allRoles(n)) steps.push({ label: `revoke-db-privs:${r}`, target: r, sql: `DO $$ BEGIN EXECUTE format('REVOKE ALL ON DATABASE %I FROM %I', current_database(), ${lit(r)}); EXCEPTION WHEN OTHERS THEN NULL; END $$` });
  // 6) membership revoke(owner/admin/deployer 체인). executor↔role SET 멤버십은 DROP ROLE 이 자동 정리한다.
  steps.push({ label: "revoke-admin-from-deployer", target: n.roles.deployer, sql: `REVOKE ${qi(n.roles.admin)} FROM ${qi(n.roles.deployer)}` });
  steps.push({ label: "revoke-owner-from-admin", target: n.roles.admin, sql: `REVOKE ${qi(n.roles.owner)} FROM ${qi(n.roles.admin)}` });
  // 6) role 제거(잔여 dependency 가 없으므로 executor 로 가능). IF EXISTS 로 부분 생성·멱등 처리.
  for (const r of allRoles(n)) steps.push({ label: `drop-role:${r}`, target: r, sql: `DROP ROLE IF EXISTS ${qi(r)}` });
  // 이중 검증: 모든 target·runAsRole 이 run-id 스코프
  for (const s of steps) { assertRunScoped(s.target, runId); if (s.runAsRole) assertRunScoped(s.runAsRole, runId); }
  return steps;
}
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** cleanup 실행(실패해도 계속 진행). 1회 재시도 지원. */
export async function runCleanup(db: DbAdapter, n: ScopedNames, opts: { retry?: boolean } = {}): Promise<CleanupOutcome> {
  const plan = buildCleanupPlan(n);
  const failed: { label: string; error: string }[] = [];
  let retried = false;

  /** 한 step 실행. runAsRole 이 있으면 SET ROLE 상태에서 실행하고 성공·실패 무관 RESET ROLE 로 복귀한다.
   *  SET ROLE 자체가 실패하면 executor 로 직접(fallback) 실행한다 → cleanup 은 SET ROLE 성공에 의존하지 않는다. */
  const execStep = async (s: CleanupStep): Promise<void> => {
    if (!s.runAsRole) { await db.exec(s.sql); return; }
    let setOk = false;
    try { await db.exec(`SET ROLE ${qi(s.runAsRole)}`); setOk = true; } catch { /* 멤버십 부재 등 — fallback */ }
    try { await db.exec(s.sql); }
    finally { if (setOk) await db.exec(`RESET ROLE`).catch(() => {}); }
  };

  const pass = async (steps: CleanupStep[]) => {
    const stillFailing: CleanupStep[] = [];
    for (const s of steps) {
      try { await execStep(s); }
      catch (e) { stillFailing.push(s); failed.push({ label: s.label, error: sanitizeError(e).message }); }
    }
    // 어떤 경로로 끝나든 SET ROLE 상태가 남지 않도록 보장
    await db.exec(`RESET ROLE`).catch(() => {});
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
    if (s.runAsRole) assertRunScoped(s.runAsRole, runId);  // SET ROLE 대상도 run-id 스코프여야
    if (/\borchestration_(owner|admin|deployer|writer|reader)\b/.test(s.sql)) throw new Error(`cleanup 이 production role 참조: ${s.label}`);
    if (/\b(job_artifacts|orchestration_audit_log|automated_reviews|human_approvals|emergency_stops|job_dependencies|customers|calls|jobs)\b/.test(s.sql)) {
      throw new Error(`cleanup 이 production table 참조: ${s.label}`);
    }
  }
}
void qq;
