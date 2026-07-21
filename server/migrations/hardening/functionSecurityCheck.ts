// function security assertion **평가기**. 기대값은 전부 `functionSecurityAssertions.ts` 정본에서 파생한다.
// ⚠️ 결과는 Neon capability 결과와 섞지 않는다(별도 catalog·별도 집계·별도 보고 줄).
import {
  HARDENING_SECURITY_ASSERTIONS, FUNCTION_SPECS, FUNCTION_SECURITY_POLICY,
  TOTAL_TRIGGER_CONNECTIONS, type FunctionSecurityAssertion,
} from "./functionSecurityAssertions";

export interface AssertionClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
}
export interface AssertionResult {
  id: string;
  ok: boolean;
  detail: string;
  authoritativeEvidenceProfile: FunctionSecurityAssertion["authoritativeEvidenceProfile"];
}
export interface AssertionReport {
  total: number; passed: number; failed: number;
  results: AssertionResult[];
  failedIds: string[];
  /** 하나라도 실패하면 actual Neon execute 를 **진행하면 안 된다**(fail-closed 관문) */
  gateOpen: boolean;
}

export interface FunctionRow {
  proname: string; args: string; owner: string; ret: string; lang: string;
  secdef: boolean; cfg: string[] | null; acl: string | null; pub: boolean; trg: number;
}

/** `{owner=X/owner,=X/owner}` → ["owner", "PUBLIC"] · null = 내장 기본값(PUBLIC 포함) */
export function aclGrantees(acl: string | null): string[] {
  if (!acl) return [];
  return acl.replace(/^\{|\}$/g, "").split(",").filter(Boolean)
    .map((item) => { const g = item.split("=")[0]; return g === "" ? "PUBLIC" : g.replace(/^"|"$/g, ""); });
}

/** 이름 prefix 로 조회한다(기대 목록이 아니라) — 미승인 orch_* 함수가 fnsec-function-count 로 드러나게. */
export async function probeFunctions(c: AssertionClient, schema = FUNCTION_SECURITY_POLICY.schema): Promise<FunctionRow[]> {
  const { rows } = await c.query(
    `SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, pg_get_userbyid(p.proowner) AS owner,
            pg_get_function_result(p.oid) AS ret, l.lanname AS lang, p.prosecdef AS secdef,
            p.proconfig AS cfg, p.proacl::text AS acl,
            has_function_privilege('public', p.oid, 'EXECUTE') AS pub,
            (SELECT count(*)::int FROM pg_trigger t WHERE t.tgfoid = p.oid AND NOT t.tgisinternal) AS trg
       FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang JOIN pg_namespace ns ON ns.oid = p.pronamespace
      WHERE ns.nspname = $1 AND p.proname LIKE 'orch\\_%'
      ORDER BY p.proname`, [schema]);
  return rows as FunctionRow[];
}

async function roleHasExecute(c: AssertionClient, roles: readonly string[], schema: string): Promise<string[]> {
  if (!roles.length) return [];
  const { rows } = await c.query(
    `SELECT DISTINCT r.rolname AS role
       FROM pg_proc p CROSS JOIN unnest($1::text[]) AS r(rolname)
       JOIN pg_namespace ns ON ns.oid = p.pronamespace
      WHERE ns.nspname = $2 AND p.proname LIKE 'orch\\_%'
        AND EXISTS (SELECT 1 FROM pg_roles pr WHERE pr.rolname = r.rolname)
        AND has_function_privilege(r.rolname, p.oid, 'EXECUTE')`, [roles as unknown as string[], schema]);
  return (rows as { role: string }[]).map((x) => x.role);
}

async function globalFunctionDefaultAcls(c: AssertionClient): Promise<{ role: string; acl: string | null }[]> {
  const { rows } = await c.query(
    `SELECT pg_get_userbyid(defaclrole) AS role, defaclacl::text AS acl
       FROM pg_default_acl WHERE defaclobjtype = 'f' AND defaclnamespace = 0`);
  return rows as { role: string; acl: string | null }[];
}

/**
 * public schema 의 CREATE 권한 보유 role 조사(전략 A 의 임시 GRANT 잔여 탐지).
 * 정상 상태에서는 orchestration_* role 전부 false 여야 한다.
 */
export async function schemaCreatePrivileges(c: AssertionClient, schema: string): Promise<{ role: string; can: boolean }[]> {
  const { rows } = await c.query(
    `SELECT rolname AS role, has_schema_privilege(rolname, $1, 'CREATE') AS can
       FROM pg_roles WHERE rolname LIKE 'orchestration\\_%' ORDER BY rolname`, [schema]);
  return rows as { role: string; can: boolean }[];
}

/**
 * assertion 을 평가한다. `appRole` 을 주면 app EXECUTE 0 도 함께 검사한다
 * (정적 SQL 은 기존 app role 이름을 모르므로 호출부가 알고 있을 때만 전달).
 */
export async function evaluateFunctionSecurityAssertions(
  c: AssertionClient, opts: { appRole?: string } = {},
): Promise<AssertionReport> {
  const P = FUNCTION_SECURITY_POLICY;
  const rows = await probeFunctions(c, P.schema);
  const byName = new Map(rows.map((r) => [r.proname, r]));
  const expectedNames = FUNCTION_SPECS.map((f) => f.name).sort();
  const foundNames = rows.map((r) => r.proname).sort();

  const deniedExecute = [...P.runtimeRolesDeniedExecute, ...(opts.appRole ? [opts.appRole] : [])];
  const executeLeaks = await roleHasExecute(c, deniedExecute, P.schema);
  const dacl = await globalFunctionDefaultAcls(c);
  const schemaCreate = await schemaCreatePrivileges(c, P.schema);

  const check: Record<string, () => { ok: boolean; detail: string }> = {
    "fnsec-function-count": () => ({
      ok: foundNames.length === expectedNames.length && foundNames.every((n, i) => n === expectedNames[i]),
      detail: `found=[${foundNames.join(",")}] expected=[${expectedNames.join(",")}]`,
    }),
    "fnsec-signatures": () => {
      const bad = FUNCTION_SPECS.filter((s) => {
        const r = byName.get(s.name);
        return !r || r.args !== s.identityArguments || r.ret !== s.returnType || r.lang !== s.language;
      }).map((s) => s.name);
      return { ok: bad.length === 0, detail: bad.length ? `mismatch=[${bad.join(",")}]` : "all signatures match" };
    },
    "fnsec-owner": () => {
      const bad = rows.filter((r) => r.owner !== P.expectedOwner).map((r) => `${r.proname}→${r.owner}`);
      return { ok: bad.length === 0, detail: bad.length ? `owner mismatch=[${bad.join(",")}]` : `owner=${P.expectedOwner}` };
    },
    "fnsec-security-mode": () => {
      const bad = rows.filter((r) => r.secdef !== (P.securityMode === "definer")).map((r) => r.proname);
      return { ok: bad.length === 0, detail: bad.length ? `secdef mismatch=[${bad.join(",")}]` : `mode=${P.securityMode}` };
    },
    "fnsec-search-path": () => {
      const bad = rows.filter((r) => r.cfg !== null && r.cfg !== undefined).map((r) => r.proname);
      return { ok: bad.length === 0, detail: bad.length ? `proconfig set=[${bad.join(",")}]` : "proconfig unset" };
    },
    "fnsec-public-execute-zero": () => {
      const bad = rows.filter((r) => r.pub).map((r) => r.proname);
      return { ok: bad.length === 0, detail: bad.length ? `PUBLIC EXECUTE=[${bad.join(",")}]` : "public execute 0" };
    },
    "fnsec-runtime-role-execute-zero": () => {
      const aclBad = rows.filter((r) => {
        const g = aclGrantees(r.acl);
        return r.acl === null || g.includes("PUBLIC") || g.some((x) => !(P.allowedAclGrantees as readonly string[]).includes(x));
      }).map((r) => `${r.proname}:${r.acl}`);
      return {
        ok: executeLeaks.length === 0 && aclBad.length === 0,
        detail: executeLeaks.length || aclBad.length
          ? `leaks=[${executeLeaks.join(",")}] acl=[${aclBad.join(" | ")}]`
          : `denied=[${deniedExecute.join(",")}] acl⊆{${P.allowedAclGrantees.join(",")}}`,
      };
    },
    "fnsec-default-acl-policy": () => {
      const need = [P.defaultAclAuthoritativeRole, ...P.defaultAclDefenseInDepthRoles];
      const missing = need.filter((role) => {
        const row = dacl.find((d) => d.role === role);
        return !row || aclGrantees(row.acl).includes("PUBLIC");
      });
      return {
        ok: missing.length === 0,
        detail: missing.length
          ? `global default ACL missing/PUBLIC=[${missing.join(",")}]`
          : `authoritative=${P.defaultAclAuthoritativeRole} defense-in-depth=[${P.defaultAclDefenseInDepthRoles.join(",")}]`,
      };
    },
    "fnsec-trigger-connection-count": () => {
      const bad = FUNCTION_SPECS.filter((s) => (byName.get(s.name)?.trg ?? -1) !== s.triggerConnectionCount)
        .map((s) => `${s.name}:${byName.get(s.name)?.trg ?? "absent"}≠${s.triggerConnectionCount}`);
      const total = rows.reduce((n, r) => n + r.trg, 0);
      return { ok: bad.length === 0 && total === TOTAL_TRIGGER_CONNECTIONS, detail: bad.length ? bad.join(",") : `total=${total}` };
    },
    "fnsec-schema-create-privilege-zero": () => {
      const bad = schemaCreate.filter((x) => x.can).map((x) => x.role);
      return {
        ok: bad.length === 0,
        detail: bad.length ? `public CREATE 잔존=[${bad.join(",")}] (전략 A 임시 GRANT 미회수 가능성)` : "orchestration_* public CREATE 0",
      };
    },
  };

  const results: AssertionResult[] = HARDENING_SECURITY_ASSERTIONS.map((a) => {
    const r = check[a.id]?.() ?? { ok: false, detail: "no evaluator" };
    return { id: a.id, ok: r.ok, detail: r.detail, authoritativeEvidenceProfile: a.authoritativeEvidenceProfile };
  });
  const failedIds = results.filter((r) => !r.ok).map((r) => r.id);
  return {
    total: results.length, passed: results.length - failedIds.length, failed: failedIds.length,
    results, failedIds, gateOpen: failedIds.length === 0,
  };
}

/** 보고 줄 — Neon capability 줄과 **분리**해서 출력한다. */
export function formatAssertionReport(r: AssertionReport): string[] {
  return [
    `[hardening-assertions] total=${r.total} passed=${r.passed} failed=${r.failed} gate=${r.gateOpen ? "open" : "CLOSED"}`,
    ...r.results.filter((x) => !x.ok).map((x) => `[hardening-assertions] FAIL ${x.id}: ${x.detail}`),
  ];
}
