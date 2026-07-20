// preflight catalog probe — 어떤 synthetic DDL 보다 먼저 read-only 로만 수행.
// 출력은 count/boolean/masked fingerprint 만. raw schema명·table명·username·host 미출력.
import type { DbAdapter } from "./adapters";
import type { CatalogProbe } from "./guards";

/** 운영 표식 테이블(있으면 disposable 아님) */
export const BUSINESS_MARKER_TABLES = [
  "customers", "consultations", "calls", "projects", "crm_files",
  "jobs", "job_executions", "job_shadow_previews",
  "job_artifacts", "job_dependencies", "automated_reviews", "human_approvals", "orchestration_audit_log", "emergency_stops",
] as const;
/** 허용되는 non-system schema(이 밖의 user schema 가 있으면 위험 신호) */
export const ALLOWED_SCHEMAS = ["public"] as const;

const num = async (db: DbAdapter, sql: string, params?: unknown[]): Promise<number> =>
  Number((await db.query(sql, params)).rows[0]?.n ?? 0);

export async function probeCatalog(db: DbAdapter, runId: string, opts: { pooledHostDistinct: boolean }): Promise<CatalogProbe> {
  const serverVersion = String((await db.query("SHOW server_version")).rows[0]?.server_version ?? "unknown");

  // public schema 의 '일반 사용자 테이블'(ordinary 'r' + partitioned 'p'), extension 소유 객체 제외
  const publicUserTableCount = await num(db,
    `SELECT count(*)::int AS n FROM pg_class c
       JOIN pg_namespace ns ON ns.oid = c.relnamespace
      WHERE ns.nspname = 'public' AND c.relkind IN ('r','p')
        AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')`);

  const businessTableCount = await num(db,
    `SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1)`, [BUSINESS_MARKER_TABLES as unknown as string[]]);

  // 존재하는 marker 테이블에 대해서만 행수 합(테이블명 자체는 출력하지 않음)
  let businessRowTotal = 0;
  if (businessTableCount > 0) {
    const present = (await db.query(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1)`, [BUSINESS_MARKER_TABLES as unknown as string[]])).rows.map((r: any) => r.tablename);
    for (const t of present) {
      if (!/^[a-z_][a-z0-9_]*$/.test(t)) continue; // 방어적: 식별자 형식만 허용
      businessRowTotal += await num(db, `SELECT count(*)::int AS n FROM public."${t}"`);
    }
  }

  const productionMigrationHistory = (await num(db,
    `SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public' AND tablename IN ('schema_migrations','drizzle_migrations','__drizzle_migrations','report_matches')`)) > 0;

  const productionOrchRoleCount = await num(db, `SELECT count(*)::int AS n FROM pg_roles WHERE rolname LIKE 'orchestration\\_%'`);

  const runScopedLeftoverCount =
    (await num(db, `SELECT count(*)::int AS n FROM pg_roles WHERE rolname LIKE $1`, [`%\\_${runId}`])) +
    (await num(db, `SELECT count(*)::int AS n FROM pg_namespace WHERE nspname LIKE $1`, [`%\\_${runId}`]));

  const unexpectedSchemaCount = await num(db,
    `SELECT count(*)::int AS n FROM pg_namespace
      WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema' AND nspname <> ALL($1)`, [ALLOWED_SCHEMAS as unknown as string[]]);

  const canCreateRole = Boolean((await db.query(
    `SELECT (rolsuper OR rolcreaterole) AS b FROM pg_roles WHERE rolname = current_user`)).rows[0]?.b);

  return {
    serverVersion,
    publicUserTableCount,
    businessTableCount,
    businessRowTotal,
    productionMigrationHistory,
    productionOrchRoleCount,
    runScopedLeftoverCount,
    unexpectedSchemaCount,
    endpointDistinguishable: opts.pooledHostDistinct,
    canCreateRole,
  };
}

/** 보고용 요약(원문 식별자 미포함) */
export const probeSummary = (p: CatalogProbe) => ({
  serverVersion: p.serverVersion,
  publicUserTables: p.publicUserTableCount,
  businessTables: p.businessTableCount,
  businessRows: p.businessRowTotal,
  productionMigrationHistory: p.productionMigrationHistory,
  productionOrchRoles: p.productionOrchRoleCount,
  runIdLeftovers: p.runScopedLeftoverCount,
  unexpectedSchemas: p.unexpectedSchemaCount,
  endpointDistinguishable: p.endpointDistinguishable,
  canCreateRole: p.canCreateRole,
});
