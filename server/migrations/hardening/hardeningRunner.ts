// hardening 전용 러너(설계·프로토타입) — 일반 additive 러너와 분리.
// 이유: 일반 러너의 정적 안전 스캐너는 GRANT/REVOKE/UPDATE/DELETE/CREATE TRIGGER/ALTER OWNER 를 위험 SQL 로 거부.
//   hardening SQL 은 이들을 의도적으로 포함 → 키워드 스캔 대신 exact sha256 allowlist 로만 통과. 범용 스캐너는 불변.
//
// fail-closed(하나라도 불일치 → 미적용/ROLLBACK):
//   sha allowlist · host pin(호출부) · role 부재(pre)/5개(post) · trigger ≥15 & 전부 enabled · function 4 ·
//   6테이블 owner=orchestration_owner · PUBLIC table 권한 0 · PUBLIC function EXECUTE 0 ·
//   비-orchestration grantee(기존 app role) 6테이블 권한 0 · 신규 6테이블 행수 0 · already-applied 판정 ·
//   **function security assertion 9종**(정본 = functionSecurityAssertions.ts · 실패 시 aborted-function-fingerprint).
import { SIX_TABLES } from "./tables";
import { evaluateFunctionSecurityAssertions } from "./functionSecurityCheck";

// ── function security assertion 연동 ─────────────────────────────────────────
// ⚠️ 기대값은 이 파일에 두지 않는다. 단일 정본 = `functionSecurityAssertions.ts`.
//    러너는 평가기(`evaluateFunctionSecurityAssertions`)를 호출만 한다.
export { HARDENING_SECURITY_ASSERTIONS, ASSERTION_IDS, FUNCTION_SPECS, FUNCTION_SECURITY_POLICY, TOTAL_TRIGGER_CONNECTIONS } from "./functionSecurityAssertions";
export { evaluateFunctionSecurityAssertions, formatAssertionReport, probeFunctions, aclGrantees, type AssertionReport } from "./functionSecurityCheck";

export interface HardeningClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
  exec(sql: string): Promise<void>;
}
export interface HardeningDef {
  id: string; sqlFile: string; expectedSha256: string;
  expectedRoles: string[];
  expectedTriggerCount: number;
  expectedFunctions: string[];
  expectedTableOwner: string;
}

export const HARDENINGS: HardeningDef[] = [
  {
    id: "0001_orchestration_immutability_roles",
    sqlFile: "0001_orchestration_immutability_roles.sql",
    expectedSha256: "71c83e66ef896bb331b60c21a68f457bcdc09b04027f48225d2e1e2174bd3372",
    expectedRoles: ["orchestration_admin", "orchestration_deployer", "orchestration_owner", "orchestration_reader", "orchestration_writer"],
    expectedTriggerCount: 15,
    expectedFunctions: ["orch_deny_write", "orch_deny_delete", "orch_guard_business_update", "orch_deny_truncate"],
    expectedTableOwner: "orchestration_owner",
  },
];
export const findHardening = (id: string) => HARDENINGS.find((h) => h.id === id || h.sqlFile === id);

export type HardeningOutcome =
  | "applied" | "dry-run-verified" | "already-applied"
  | "aborted-sha-mismatch" | "aborted-postverify" | "aborted-owner-mismatch"
  | "aborted-public-privilege" | "aborted-app-privilege" | "aborted-function-public" | "aborted-function-fingerprint"
  | "aborted-trigger-disabled" | "aborted-rows-present" | "aborted-sql-error" | "aborted-partial";
export interface HardeningResult { outcome: HardeningOutcome; id: string; committed: boolean; detail: string; }

async function n(c: HardeningClient, sql: string, params?: unknown[]): Promise<number> { return (await c.query(sql, params)).rows[0].n; }
const rolesExist = (c: HardeningClient, roles: string[]) => n(c, `SELECT count(*)::int n FROM pg_roles WHERE rolname = ANY($1)`, [roles]);
const targetTriggers = (c: HardeningClient) => c.query(
  `SELECT t.tgname, t.tgenabled FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace ns ON ns.oid=r.relnamespace
     WHERE ns.nspname='public' AND NOT t.tgisinternal AND r.relname = ANY($1)`, [SIX_TABLES]);
const functionsExist = (c: HardeningClient, fns: string[]) => n(c, `SELECT count(DISTINCT proname)::int n FROM pg_proc WHERE proname = ANY($1)`, [fns]);
const publicTableGrants = (c: HardeningClient) => n(c,
  `SELECT count(*)::int n FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name = ANY($1) AND grantee='PUBLIC'`, [SIX_TABLES]);
const nonOrchGrants = (c: HardeningClient) => n(c,
  `SELECT count(*)::int n FROM information_schema.role_table_grants
     WHERE table_schema='public' AND table_name = ANY($1) AND grantee <> 'PUBLIC' AND grantee NOT LIKE 'orchestration\\_%'`, [SIX_TABLES]);
const publicFunctionExecute = (c: HardeningClient, fns: string[]) => n(c,
  `SELECT count(*)::int n FROM pg_proc p WHERE p.proname = ANY($1) AND has_function_privilege('public', p.oid, 'EXECUTE')`, [fns]);
const tablesOwnedBy = (c: HardeningClient, owner: string) => n(c,
  `SELECT count(*)::int n FROM pg_class r JOIN pg_namespace ns ON ns.oid=r.relnamespace
     WHERE ns.nspname='public' AND r.relname = ANY($1) AND pg_get_userbyid(r.relowner)=$2`, [SIX_TABLES, owner]);
const newRowsTotal = async (c: HardeningClient): Promise<number> => { let t = 0; for (const tbl of SIX_TABLES) t += await n(c, `SELECT count(*)::int n FROM "${tbl}"`); return t; };

// startup self-check(운영 앱 부팅 시): 기대 trigger 수 + 전부 enabled 여야 true. 하나라도 disabled/누락이면 false → writer 기동 거부.
export async function startupTriggerSelfCheck(c: HardeningClient, def: HardeningDef): Promise<{ ok: boolean; count: number; disabled: string[] }> {
  const rows = (await targetTriggers(c)).rows as { tgname: string; tgenabled: string }[];
  const disabled = rows.filter((r) => r.tgenabled === "D").map((r) => r.tgname);
  return { ok: rows.length >= def.expectedTriggerCount && disabled.length === 0, count: rows.length, disabled };
}

async function verify(c: HardeningClient, def: HardeningDef): Promise<{ ok: true } | { ok: false; outcome: HardeningOutcome; detail: string }> {
  const rc = await rolesExist(c, def.expectedRoles), fc = await functionsExist(c, def.expectedFunctions);
  const trg = (await targetTriggers(c)).rows as { tgname: string; tgenabled: string }[];
  if (rc !== def.expectedRoles.length || trg.length < def.expectedTriggerCount || fc !== def.expectedFunctions.length)
    return { ok: false, outcome: "aborted-postverify", detail: `roles=${rc}/${def.expectedRoles.length} triggers=${trg.length}/${def.expectedTriggerCount} fns=${fc}/${def.expectedFunctions.length}` };
  const disabled = trg.filter((t) => t.tgenabled === "D");
  if (disabled.length) return { ok: false, outcome: "aborted-trigger-disabled", detail: `disabled: ${disabled.map((t) => t.tgname).join(",")}` };
  if (await tablesOwnedBy(c, def.expectedTableOwner) !== SIX_TABLES.length) return { ok: false, outcome: "aborted-owner-mismatch", detail: `owner≠${def.expectedTableOwner}` };
  if (await publicTableGrants(c) !== 0) return { ok: false, outcome: "aborted-public-privilege", detail: "PUBLIC table 권한 잔존" };
  if (await nonOrchGrants(c) !== 0) return { ok: false, outcome: "aborted-app-privilege", detail: "비-orchestration grantee(기존 app role) 권한 잔존" };
  if (await publicFunctionExecute(c, def.expectedFunctions) !== 0) return { ok: false, outcome: "aborted-function-public", detail: "PUBLIC function EXECUTE 잔존" };
  const fnsec = await evaluateFunctionSecurityAssertions(c);
  if (!fnsec.gateOpen) return { ok: false, outcome: "aborted-function-fingerprint", detail: `function security assertion 실패: ${fnsec.failedIds.join(",")}` };
  return { ok: true };
}

export interface RunHardeningOpts { sqlText: string; actualSha256: string; apply: boolean; }

export async function runHardening(c: HardeningClient, def: HardeningDef, opts: RunHardeningOpts): Promise<HardeningResult> {
  const base = { id: def.id, committed: false };
  if (opts.actualSha256 !== def.expectedSha256)
    return { ...base, outcome: "aborted-sha-mismatch", detail: `sha 불일치(expected=${def.expectedSha256.slice(0, 8)}… actual=${opts.actualSha256.slice(0, 8)}…)` };

  const already = await rolesExist(c, def.expectedRoles);
  if (already === def.expectedRoles.length) {
    const v = await verify(c, def);
    return v.ok ? { ...base, outcome: "already-applied", detail: "role·trigger(enabled)·owner·PUBLIC·app·function 모두 기대치" }
                : { ...base, outcome: v.outcome, detail: "이미 적용 상태 검증 실패: " + v.detail };
  }
  if (already > 0) return { ...base, outcome: "aborted-partial", detail: `role 일부만 존재(${already}/${def.expectedRoles.length}) → 중단` };

  const rows = await newRowsTotal(c);
  if (rows !== 0) return { ...base, outcome: "aborted-rows-present", detail: `신규 6테이블 행수 ${rows}≠0 → 중단(fail-closed)` };

  await c.exec("BEGIN");
  try {
    await c.exec(opts.sqlText);
    const v = await verify(c, def);
    if (!v.ok) { await c.exec("ROLLBACK"); return { ...base, outcome: v.outcome, detail: v.detail }; }
    if (opts.apply) { await c.exec("COMMIT"); return { ...base, outcome: "applied", committed: true, detail: "적용·검증 통과(5 role·enabled trigger·owner·PUBLIC0·app0·fn0)" }; }
    await c.exec("ROLLBACK");
    return { ...base, outcome: "dry-run-verified", detail: "검증 통과(미적용)" };
  } catch (e: any) {
    await c.exec("ROLLBACK").catch(() => {});
    return { ...base, outcome: "aborted-sql-error", detail: e?.message ?? String(e) };
  }
}
