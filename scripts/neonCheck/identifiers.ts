// synthetic identifier builder + SQL identifier escaping.
// 원칙: 사용자 입력을 SQL 에 그대로 넣지 않는다. 모든 식별자는 정규식 검증 후 quote 한다.
// 모든 synthetic object 는 run-id suffix 를 갖고, production 이름(orchestration_*)과 절대 겹치지 않는다.

export const RUN_ID_RE = /^[a-z0-9]{4,16}$/;
/** PostgreSQL 식별자 허용 형식(소문자 시작, 소문자/숫자/밑줄). 생성 이름은 전부 이 형식. */
export const IDENT_RE = /^[a-z_][a-z0-9_]*$/;
/** production 예약 접두 — 이 이름으로는 절대 생성하지 않는다. */
export const FORBIDDEN_PREFIXES = ["orchestration_", "pg_", "information_schema"] as const;

export function assertRunId(runId: string): string {
  if (!RUN_ID_RE.test(runId)) throw new Error("invalid runId (expected ^[a-z0-9]{4,16}$)");
  return runId;
}

/** SQL identifier quoting. 형식 검증 실패 시 throw(문자열 직접 연결 금지). */
export function qi(name: string): string {
  if (!IDENT_RE.test(name)) throw new Error(`unsafe SQL identifier: ${JSON.stringify(name)}`);
  for (const p of FORBIDDEN_PREFIXES) {
    if (name.startsWith(p)) throw new Error(`forbidden identifier prefix (production reserved): ${name}`);
  }
  return `"${name}"`;
}
/** schema-qualified quoting */
export const qq = (schema: string, name: string): string => `${qi(schema)}.${qi(name)}`;

/** 모든 생성/삭제 대상은 run-id 스코프여야 한다(운영 객체 보호 이중 검증). */
export function assertRunScoped(name: string, runId: string): string {
  assertRunId(runId);
  if (!name.endsWith(`_${runId}`)) throw new Error(`run-id 스코프 위반: ${name}`);
  for (const p of FORBIDDEN_PREFIXES) {
    if (name.startsWith(p)) throw new Error(`production 예약 이름 사용 금지: ${name}`);
  }
  return name;
}

export interface ScopedNames {
  runId: string;
  schema: string;
  roles: { owner: string; admin: string; deployer: string; writer: string; reader: string; appSim: string };
  /** membership lifecycle 검증 **전용** role 쌍. 하네스 핵심(executor↔owner) 멤버십과 분리.
   *  GRANT/REVOKE 를 이 쌍에서만 수행해, capability 가 cleanup·setup 에 필요한 멤버십을 건드리지 않게 한다. */
  mlRoles: { parent: string; subject: string };
  tables: { artifact: string; audit: string; approval: string; business: string };
  functions: { denyWrite: string; denyDelete: string; guard: string; denyTruncate: string };
}

export function scopedNames(runId: string): ScopedNames {
  assertRunId(runId);
  const s = (base: string) => assertRunScoped(`oc_${base}_${runId}`, runId);
  return {
    runId,
    schema: assertRunScoped(`oc_chk_${runId}`, runId),
    roles: { owner: s("owner"), admin: s("admin"), deployer: s("deployer"), writer: s("writer"), reader: s("reader"), appSim: s("appsim") },
    mlRoles: { parent: s("mlt_parent"), subject: s("mlt_subject") },
    tables: { artifact: s("artifact"), audit: s("audit"), approval: s("approval"), business: s("business") },
    functions: { denyWrite: s("deny_write"), denyDelete: s("deny_delete"), guard: s("guard_update"), denyTruncate: s("deny_truncate") },
  };
}

/** 이 run 이 만들 모든 식별자(검증·cleanup 범위 산출용) */
export function allNames(n: ScopedNames): string[] {
  return [n.schema, ...Object.values(n.roles), ...Object.values(n.mlRoles), ...Object.values(n.tables), ...Object.values(n.functions)];
}
/** cleanup·잔여검증이 다뤄야 할 모든 role(오케스트레이션 6종 + membership lifecycle 전용 2종). */
export const allRoles = (n: ScopedNames): string[] => [...Object.values(n.roles), ...Object.values(n.mlRoles)];
