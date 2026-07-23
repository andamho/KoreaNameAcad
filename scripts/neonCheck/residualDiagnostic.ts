// 실패한 execute 가 남긴 residual role 을 **read-only** 로 진단하고, 삭제 **dry-run**(실행 SQL 순서)만 만든다.
// ⚠️ 실제 DROP 은 하지 않는다. 원문 role/schema/table 이름·URL·password 는 출력하지 않는다(hash·count 만).
import crypto from "node:crypto";
import { buildCleanupPlan } from "./cleanup";
import { scopedNames, RUN_ID_RE } from "./identifiers";
import { connectReadOnly, type RawDriver } from "./readOnlyAdapter";

const h8 = (s: string) => "role#" + crypto.createHash("sha256").update(s).digest("hex").slice(0, 8) + "…";

export interface ResidualRole {
  nameHash: string;          // 원문 대신 hash
  canLogin: boolean; createRole: boolean; superuser: boolean; bypassRls: boolean; inherit: boolean;
  memberOfCount: number;     // 다른 role 의 member 인 수
  ownedObjects: number;      // 소유한 relation/function/type/namespace 수
  defaultAcls: number;       // pg_default_acl 항목 수
  dbPrivileges: number;      // database-level privilege 보유 수
  dependentObjects: number;  // pg_shdepend 로 이 role 에 의존하는 object 수
}
export interface ResidualReport {
  runId: string;
  residualRoleCount: number;
  roles: ResidualRole[];
  runIdSchemaCount: number;
  runIdObjectCount: number;
  /** 삭제 dry-run: 실행 예정 SQL(순서). 실제 실행하지 않는다. */
  cleanupPlanLabels: string[];
  runIdScopeOk: boolean;     // 모든 대상이 run-id 스코프인가
  outOfScopeRefs: number;    // run-id 밖 참조 수(0이어야 함)
}

/** run-id 에 속한 residual role 을 read-only 로 조사한다. */
export async function diagnoseResidual(driver: RawDriver, runId: string): Promise<{ ok: true; report: ResidualReport } | { ok: false; error: string }> {
  if (!RUN_ID_RE.test(runId)) return { ok: false, error: "run-id 형식 오류" };
  const conn = await connectReadOnly(driver);
  if (!conn.ok) return { ok: false, error: `${conn.error.name}:${conn.error.code ?? ""}` };

  const n = scopedNames(runId);
  const like = `%\\_${runId}`;
  // 진단은 임의 카탈로그 SELECT 가 필요하므로(하네스 allowlist 밖) **자체 read-only 트랜잭션**을 연다.
  //   BEGIN → SET TRANSACTION READ ONLY → SELECT 만 → 항상 ROLLBACK. write/DDL 0.
  await driver.query("BEGIN");
  await driver.query("SET TRANSACTION READ ONLY");
  const run = (sql: string, params?: unknown[]) => driver.query(sql, params);
  try {
    {
      const roleRows = (await run(`SELECT rolname, rolcanlogin, rolcreaterole, rolsuper, rolbypassrls, rolinherit, oid FROM pg_roles WHERE rolname LIKE $1 ORDER BY rolname`, [like])).rows as any[];
      const roles: ResidualRole[] = [];
      for (const r of roleRows) {
        const memberOf = (await run(`SELECT count(*)::int n FROM pg_auth_members WHERE member=$1`, [r.oid])).rows[0]?.n ?? 0;
        const owned = (await run(`SELECT (SELECT count(*) FROM pg_class WHERE relowner=$1) + (SELECT count(*) FROM pg_proc WHERE proowner=$1) + (SELECT count(*) FROM pg_namespace WHERE nspowner=$1) + (SELECT count(*) FROM pg_type WHERE typowner=$1) AS n`, [r.oid])).rows[0]?.n ?? 0;
        const dacl = (await run(`SELECT count(*)::int n FROM pg_default_acl WHERE defaclrole=$1`, [r.oid])).rows[0]?.n ?? 0;
        const dbpriv = (await run(`SELECT count(*)::int n FROM pg_database WHERE has_database_privilege($1, oid, 'CONNECT') AND datname=current_database()`, [r.rolname])).rows[0]?.n ?? 0;
        const dep = (await run(`SELECT count(*)::int n FROM pg_shdepend WHERE refobjid=$1`, [r.oid])).rows[0]?.n ?? 0;
        roles.push({
          nameHash: h8(r.rolname), canLogin: r.rolcanlogin, createRole: r.rolcreaterole, superuser: r.rolsuper,
          bypassRls: r.rolbypassrls, inherit: r.rolinherit, memberOfCount: Number(memberOf), ownedObjects: Number(owned),
          defaultAcls: Number(dacl), dbPrivileges: Number(dbpriv), dependentObjects: Number(dep),
        });
      }
      const schemas = (await run(`SELECT count(*)::int n FROM pg_namespace WHERE nspname LIKE $1`, [like])).rows[0]?.n ?? 0;
      const objs = (await run(`SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname LIKE $1) + (SELECT count(*) FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname LIKE $1) AS n`, [like])).rows[0]?.n ?? 0;

      const plan = buildCleanupPlan(n);
      const outOfScope = plan.filter((s) => !s.target.includes(runId) || (s.runAsRole && !s.runAsRole.includes(runId))).length;

      return {
        ok: true as const,
        report: {
          runId, residualRoleCount: roles.length, roles,
          runIdSchemaCount: Number(schemas), runIdObjectCount: Number(objs),
          cleanupPlanLabels: plan.map((s) => s.label),
          runIdScopeOk: outOfScope === 0, outOfScopeRefs: outOfScope,
        },
      };
    }
  } catch (e: any) {
    return { ok: false, error: `${e?.name ?? "Error"}:${e?.code ?? ""}` };
  } finally {
    await driver.query("ROLLBACK").catch(() => {});
  }
}

export function formatResidualReport(r: ResidualReport): string[] {
  const lines = [
    `[residual] runId=${r.runId} residualRoles=${r.residualRoleCount} runIdSchemas=${r.runIdSchemaCount} runIdObjects=${r.runIdObjectCount}`,
  ];
  for (const role of r.roles) {
    lines.push(`[residual] ${role.nameHash} login=${role.canLogin} createRole=${role.createRole} super=${role.superuser} bypassRls=${role.bypassRls} inherit=${role.inherit}`);
    lines.push(`[residual]   memberOf=${role.memberOfCount} owned=${role.ownedObjects} defaultAcls=${role.defaultAcls} dbPrivs=${role.dbPrivileges} dependents=${role.dependentObjects}`);
  }
  lines.push(`[residual] cleanup dry-run 순서(${r.cleanupPlanLabels.length} step): ${r.cleanupPlanLabels.join(" → ")}`);
  lines.push(`[residual] run-id scope 검증: ${r.runIdScopeOk ? "OK (모든 대상 run-id 한정)" : `FAIL (run-id 밖 참조 ${r.outOfScopeRefs})`}`);
  lines.push(`[residual] ⚠️ 이 도구는 read-only. 실제 DROP 은 하지 않았다. 삭제는 별도 승인 후 cleanup 경로로만.`);
  return lines;
}

// CLI: NEON_CHECK_DIRECT_URL(보안 입력으로 주입) + NEON_DIAG_RUN_ID 로 read-only 진단.
//   운영자 실행: $env:NEON_CHECK_DIRECT_URL = (Read-Host); $env:NEON_DIAG_RUN_ID='voqon9136c'; node --import tsx/esm scripts/neonCheck/residualDiagnostic.ts
const isDirect = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("residualDiagnostic.ts");
if (isDirect) {
  (async () => {
    const url = (process.env.NEON_CHECK_DIRECT_URL ?? "").trim();
    const runId = (process.env.NEON_DIAG_RUN_ID ?? "").trim();
    if (!url || !runId) { console.error("[residual] NEON_CHECK_DIRECT_URL + NEON_DIAG_RUN_ID 필요(URL 은 보안 입력으로만)"); process.exit(2); }
    const pg = await import("pg" as string);
    const client = new pg.default.Client({ connectionString: url });
    const driver: RawDriver = { connect: () => client.connect(), query: (sql, params) => client.query(sql, params as any[]) as any, end: () => client.end() };
    try {
      const r = await diagnoseResidual(driver, runId);
      if (!r.ok) { console.error(`[residual] ❌ ${r.error}`); process.exit(3); }
      for (const l of formatResidualReport(r.report)) console.log(l);
    } finally { await client.end().catch(() => {}); }
  })();
}
