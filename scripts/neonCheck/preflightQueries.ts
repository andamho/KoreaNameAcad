// SELECT-only preflight **query ID allowlist** — 단일 정본.
//
// 설계 원칙(§4·§5):
//  - adapter 는 **임의 SQL 을 실행하는 API 를 제공하지 않는다.** 호출부는 query **ID** 만 지정한다.
//  - 각 query 는 **코드에 고정된 SQL** 과 **고정 parameter shape** 를 가진다.
//    사용자/환경 입력이 SQL identifier 로 삽입되는 경로가 없다(파라미터 바인딩만).
//  - keyword 문자열 검사는 **보조**일 뿐이다. 보안 주장은 **ID allowlist** 에 둔다
//    (PostgreSQL 은 `SELECT side_effect_fn()` 처럼 SELECT 로도 부수효과가 가능하므로
//     "SELECT 로 시작하면 안전"은 성립하지 않는다).
//  - 여기 등록된 SQL 은 **system catalog / system 함수만** 호출한다. 사용자 schema 함수 호출 0.

/** 파라미터 형태 — 고정 shape 로만 허용한다. */
export type ParamShape = "none" | "text[]" | "text";

export interface PreflightQuery {
  id: string;
  /** 고정 SQL. 문자열 결합·식별자 삽입 금지. */
  sql: string;
  params: ParamShape;
  /** 어떤 endpoint 에서 쓰는가(문서·테스트용) */
  scope: "direct" | "pooled" | "both";
  description: string;
}

/** 호출이 허용된 system 함수 목록(감사용). 이 밖의 함수 호출이 SQL 에 있으면 정본 무결성 검사에서 걸린다. */
export const ALLOWED_SYSTEM_FUNCTIONS = [
  "current_setting", "current_database", "current_user", "session_user", "version",
  "count", "sum", "bool_or", "coalesce", "md5", "pg_get_userbyid", "has_schema_privilege",
  "current_schema", "txid_current_if_assigned", "inet_server_port", "to_regclass",
] as const;

const q = (id: string, scope: PreflightQuery["scope"], params: ParamShape, description: string, sql: string): PreflightQuery =>
  ({ id, sql: sql.trim(), params, scope, description });

/**
 * ⚠️ 반환값에 **원문 식별자를 넣지 않는다**. 이름이 필요한 곳은 `md5(...)` 로 해시하거나 개수만 센다.
 *    (report sanitizer 가 마지막 방어선이지만, 애초에 가져오지 않는 것이 우선이다.)
 */
export const PREFLIGHT_QUERIES: readonly PreflightQuery[] = [
  q("server-version", "both", "none", "PostgreSQL 서버 버전", `
    SELECT current_setting('server_version') AS server_version`),

  q("readonly-state", "both", "none", "현재 트랜잭션이 read-only 인지", `
    SELECT current_setting('transaction_read_only') AS transaction_read_only,
           current_setting('default_transaction_read_only') AS default_transaction_read_only`),

  q("identity-fingerprint", "both", "none", "DB identity 지문(원문 없음) — direct/pooled 동일 대상 판정용", `
    SELECT md5(current_database()) AS database_hash,
           md5(current_user) AS current_user_hash,
           (SELECT md5(string_agg(d.oid::text, ',' ORDER BY d.oid))
              FROM pg_database d WHERE d.datname = current_database()) AS database_oid_hash,
           (SELECT md5(string_agg(n.oid::text, ',' ORDER BY n.oid))
              FROM pg_namespace n WHERE n.nspname NOT LIKE 'pg\\_%' AND n.nspname <> 'information_schema') AS schema_oid_hash,
           current_setting('server_version') AS server_version`),

  q("role-attributes", "direct", "none", "현재 role 의 속성(CREATE ROLE capability 추론)", `
    SELECT r.rolsuper AS is_super, r.rolcreaterole AS can_create_role, r.rolcreatedb AS can_create_db,
           r.rolcanlogin AS can_login, r.rolbypassrls AS bypass_rls
      FROM pg_roles r WHERE r.rolname = current_user`),

  q("public-user-tables", "direct", "none", "public schema 의 ordinary/partitioned 사용자 테이블 수(extension 소유 제외)", `
    SELECT count(*)::int AS n
      FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE ns.nspname = 'public' AND c.relkind IN ('r','p')
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')`),

  q("user-schemas", "direct", "text[]", "허용 목록 밖 non-system user schema 수", `
    SELECT count(*)::int AS n
      FROM pg_namespace n
     WHERE n.nspname NOT LIKE 'pg\\_%' AND n.nspname <> 'information_schema'
       AND NOT (n.nspname = ANY($1))`),

  q("business-tables", "direct", "text[]", "업무/운영 표식 테이블 존재 수(이름 원문 미반환)", `
    SELECT count(*)::int AS n
      FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE ns.nspname = 'public' AND c.relkind IN ('r','p') AND c.relname = ANY($1)`),

  q("business-rows-present", "direct", "text[]", "업무 테이블에 행이 있는지(정확한 행수 대신 존재 여부)", `
    SELECT bool_or(c.reltuples > 0) AS rows_likely_present, count(*)::int AS matched
      FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE ns.nspname = 'public' AND c.relkind IN ('r','p') AND c.relname = ANY($1)`),

  q("migration-history", "direct", "text[]", "migration history 테이블 존재 수(이름 원문 미반환)", `
    SELECT count(*)::int AS n
      FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE c.relkind IN ('r','p') AND c.relname = ANY($1)`),

  q("orchestration-roles", "direct", "none", "production 이름 orchestration_* role 수", `
    SELECT count(*)::int AS n FROM pg_roles WHERE rolname LIKE 'orchestration\\_%'`),

  q("run-scoped-residue", "direct", "text", "동일 run-id 잔여 schema/role/object 수", `
    SELECT (SELECT count(*)::int FROM pg_namespace WHERE nspname LIKE $1)
         + (SELECT count(*)::int FROM pg_roles WHERE rolname LIKE $1)
         + (SELECT count(*)::int FROM pg_class WHERE relname LIKE $1) AS n`),

  q("synthetic-name-conflict", "direct", "text", "생성 예정 synthetic 이름과 충돌하는 object 수", `
    SELECT (SELECT count(*)::int FROM pg_namespace WHERE nspname = $1)
         + (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = $1) AS n`),

  q("pooler-signals", "pooled", "none", "pooler 판정 보조 신호(확정 신호 아님)", `
    SELECT current_setting('server_version') AS server_version,
           current_setting('transaction_read_only') AS transaction_read_only,
           to_regclass('pg_stat_activity') IS NOT NULL AS catalog_visible`),

  q("session-marker-probe", "pooled", "none", "이전 트랜잭션의 session 설정이 남아 있는지(SET LOCAL 소멸 확인)", `
    SELECT current_setting('application_name') AS application_name`),
];

export const PREFLIGHT_QUERY_IDS = PREFLIGHT_QUERIES.map((x) => x.id);
export const findPreflightQuery = (id: string) => PREFLIGHT_QUERIES.find((x) => x.id === id);

/** 정본 무결성 — 중복 ID·다중 statement·금지 keyword·미허용 함수 호출을 정적으로 검사한다. */
export const FORBIDDEN_SQL_KEYWORDS = [
  "CREATE", "ALTER", "DROP", "GRANT", "REVOKE", "INSERT", "UPDATE", "DELETE",
  "TRUNCATE", "COPY", "CALL", "DO", "VACUUM", "ANALYZE", "REFRESH", "COMMIT",
  "SET ROLE", "LOCK", "NOTIFY", "PREPARE", "EXECUTE",
] as const;

export function validateQueryCatalog(): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const x of PREFLIGHT_QUERIES) {
    if (seen.has(x.id)) problems.push(`중복 query ID: ${x.id}`);
    seen.add(x.id);
    const stripped = x.sql.replace(/--[^\n]*/g, "");
    if (stripped.includes(";")) problems.push(`${x.id}: semicolon 포함(다중 statement 금지)`);
    if (!/^\s*SELECT\b/i.test(stripped)) problems.push(`${x.id}: SELECT 로 시작하지 않음`);
    const upper = stripped.toUpperCase();
    for (const kw of FORBIDDEN_SQL_KEYWORDS) {
      // 단어 경계 기반 — 'UPDATE' 가 'transaction_read_only' 같은 식별자에 섞이지 않도록
      if (new RegExp(`(^|[^A-Z_])${kw}([^A-Z_]|$)`).test(upper)) problems.push(`${x.id}: 금지 keyword ${kw}`);
    }
    // 함수 호출 감사: `이름(` 패턴을 뽑아 allowlist 와 대조
    for (const m of stripped.matchAll(/([a-z_][a-z0-9_]*)\s*\(/gi)) {
      const fn = m[1].toLowerCase();
      if (["select", "from", "where", "and", "or", "not", "in", "on", "as", "by", "order", "string_agg", "any", "exists"].includes(fn)) continue;
      if (!(ALLOWED_SYSTEM_FUNCTIONS as readonly string[]).includes(fn)) problems.push(`${x.id}: 미허용 함수 호출 ${fn}()`);
    }
  }
  return { ok: problems.length === 0, problems };
}
