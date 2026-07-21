// hardening 전용 러너(설계·프로토타입) — 일반 additive 러너와 분리.
// 이유: 일반 러너의 정적 안전 스캐너는 GRANT/REVOKE/UPDATE/DELETE/CREATE TRIGGER/ALTER OWNER 를 위험 SQL 로 거부.
//   hardening SQL 은 이들을 의도적으로 포함 → 키워드 스캔 대신 exact sha256 allowlist 로만 통과. 범용 스캐너는 불변.
//
// fail-closed(하나라도 불일치 → 미적용/ROLLBACK):
//   sha allowlist · host pin(호출부) · role 부재(pre)/5개(post) · trigger ≥15 & 전부 enabled · function 4 ·
//   6테이블 owner=orchestration_owner · PUBLIC table 권한 0 · PUBLIC function EXECUTE 0 ·
//   비-orchestration grantee(기존 app role) 6테이블 권한 0 · 신규 6테이블 행수 0 · already-applied 판정 ·
//   **function fingerprint 9 hard stop**(아래 FUNCTION_HARD_STOPS).
import { SIX_TABLES } from "./tables";

// ── function privilege fingerprint ──────────────────────────────────────────────
// 이 Gate 의 정정 대상: 미래 함수가 PUBLIC EXECUTE 를 그대로 갖는 결함.
// 근본 원인(PG 17.10 실측): `ALTER DEFAULT PRIVILEGES ... IN SCHEMA <s> REVOKE ... FROM PUBLIC` 는 빈 ACL 에서 시작 →
//   no-op 이며 pg_default_acl 행조차 만들지 않는다. **스키마 한정 없는 전역 형식**만 실효가 있다.
// 따라서 fingerprint 는 (a) 기존 함수의 실제 ACL 과 (b) 미래 함수를 막는 default ACL 행을 **둘 다** 검사한다.
export const FUNCTION_HARD_STOPS = [
  "fn-count",          // 1. orchestration 함수가 정확히 기대 집합(초과 = 미승인 함수 도입)
  "fn-signature",      // 2. identity arguments 가 기대 signature 와 일치(무인자)
  "fn-owner",          // 3. 소유자 = orchestration_owner
  "fn-shape",          // 4. 반환형 trigger + 언어 plpgsql
  "fn-secdef",         // 5. prosecdef=false (SECURITY DEFINER 무단 도입 차단)
  "fn-searchpath",     // 6. proconfig IS NULL (search_path 무단 고정/주입 차단)
  "fn-public-execute", // 7. PUBLIC EXECUTE = 0
  "fn-role-execute",   // 8. reader/writer EXECUTE = 0 이고 ACL grantee ⊆ {orchestration_owner}
  "fn-default-acl",    // 9. 전역 FUNCTIONS default ACL 행이 대상 role 전부 존재 & PUBLIC 미포함(미래 함수 누수 차단)
] as const;
export type FunctionHardStop = (typeof FUNCTION_HARD_STOPS)[number];

export interface FunctionFingerprint {
  names: string[];            // 기대 함수 이름(정렬)
  identityArgs: string;       // 기대 identity arguments(전부 동일: 무인자 "")
  owner: string;
  returnType: string;         // "trigger"
  language: string;           // "plpgsql"
  securityDefiner: boolean;   // false = SECURITY INVOKER 유지
  searchPathConfig: null;     // proconfig 기대값
  deniedExecuteRoles: string[];   // 직접 EXECUTE 가 없어야 하는 role (deployer/admin 은 owner membership 으로 상속 — 의도된 예외)
  allowedAclGrantees: string[];   // ACL 에 나타나도 되는 grantee
  defaultAclRoles: string[];      // 전역 FUNCTIONS default ACL 이 존재해야 하는 role
}

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
  functionFingerprint: FunctionFingerprint;
}

export const HARDENINGS: HardeningDef[] = [
  {
    id: "0001_orchestration_immutability_roles",
    sqlFile: "0001_orchestration_immutability_roles.sql",
    expectedSha256: "c5649f3fdf00c122ead2fc65b2c270786d13c7bf58a96a611edc08f73ee3e393",
    expectedRoles: ["orchestration_admin", "orchestration_deployer", "orchestration_owner", "orchestration_reader", "orchestration_writer"],
    expectedTriggerCount: 15,
    expectedFunctions: ["orch_deny_write", "orch_deny_delete", "orch_guard_business_update", "orch_deny_truncate"],
    expectedTableOwner: "orchestration_owner",
    functionFingerprint: {
      names: ["orch_deny_delete", "orch_deny_truncate", "orch_deny_write", "orch_guard_business_update"],
      identityArgs: "",
      owner: "orchestration_owner",
      returnType: "trigger",
      language: "plpgsql",
      securityDefiner: false,
      searchPathConfig: null,
      deniedExecuteRoles: ["orchestration_reader", "orchestration_writer"],
      allowedAclGrantees: ["orchestration_owner"],
      defaultAclRoles: ["orchestration_admin", "orchestration_deployer", "orchestration_owner"],
    },
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

// ── function fingerprint 검증(9 hard stop). 하나라도 위반 → 위반 목록 반환(fail-closed) ──
export interface FunctionProbeRow {
  proname: string; args: string; owner: string; ret: string; lang: string;
  secdef: boolean; cfg: string[] | null; acl: string | null; pub: boolean;
}
export async function probeFunctions(c: HardeningClient, names: string[]): Promise<FunctionProbeRow[]> {
  // ⚠️ 이름 prefix 로 조회한다(기대 목록이 아니라). 미승인 orch_* 함수가 추가되면 fn-count 로 잡히게 하기 위함.
  const { rows } = await c.query(
    `SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, pg_get_userbyid(p.proowner) AS owner,
            pg_get_function_result(p.oid) AS ret, l.lanname AS lang, p.prosecdef AS secdef,
            p.proconfig AS cfg, p.proacl::text AS acl, has_function_privilege('public', p.oid, 'EXECUTE') AS pub
       FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang JOIN pg_namespace ns ON ns.oid = p.pronamespace
      WHERE ns.nspname = 'public' AND (p.proname LIKE 'orch\\_%' OR p.proname = ANY($1))
      ORDER BY p.proname`, [names]);
  return rows as FunctionProbeRow[];
}
async function roleExecutes(c: HardeningClient, names: string[], roles: string[]): Promise<{ role: string; proname: string }[]> {
  if (!roles.length) return [];
  const { rows } = await c.query(
    `SELECT r.rolname AS role, p.proname FROM pg_proc p CROSS JOIN unnest($2::text[]) AS r(rolname)
       JOIN pg_namespace ns ON ns.oid = p.pronamespace
      WHERE ns.nspname = 'public' AND p.proname = ANY($1)
        AND EXISTS (SELECT 1 FROM pg_roles pr WHERE pr.rolname = r.rolname)
        AND has_function_privilege(r.rolname, p.oid, 'EXECUTE')`, [names, roles]);
  return rows as { role: string; proname: string }[];
}
async function functionDefaultAcls(c: HardeningClient): Promise<{ role: string; ns: number; acl: string | null }[]> {
  const { rows } = await c.query(
    `SELECT pg_get_userbyid(d.defaclrole) AS role, d.defaclnamespace::int AS ns, d.defaclacl::text AS acl
       FROM pg_default_acl d WHERE d.defaclobjtype = 'f'`);
  return rows as { role: string; ns: number; acl: string | null }[];
}
/** ACL 문자열에서 grantee 목록 추출. `{owner=X/owner,=X/owner}` → ["owner", "PUBLIC"] */
export function aclGrantees(acl: string | null): string[] {
  if (!acl) return []; // null = 내장 기본값(= PUBLIC 포함) — 호출부는 pub 플래그로 별도 판정
  return acl.replace(/^\{|\}$/g, "").split(",").filter(Boolean)
    .map((item) => { const g = item.split("=")[0]; return g === "" ? "PUBLIC" : g.replace(/^"|"$/g, ""); });
}

export async function verifyFunctionFingerprint(c: HardeningClient, fp: FunctionFingerprint): Promise<FunctionHardStop[]> {
  const violations = new Set<FunctionHardStop>();
  const expected = [...fp.names].sort();
  const rows = await probeFunctions(c, expected);
  const found = rows.map((r) => r.proname).sort();

  // 1. 집합 일치(초과 = 미승인 함수, 부족 = 누락)
  if (found.length !== expected.length || found.some((nm, i) => nm !== expected[i])) violations.add("fn-count");

  for (const r of rows) {
    if (r.args !== fp.identityArgs) violations.add("fn-signature");            // 2
    if (r.owner !== fp.owner) violations.add("fn-owner");                      // 3
    if (r.ret !== fp.returnType || r.lang !== fp.language) violations.add("fn-shape"); // 4
    if (r.secdef !== fp.securityDefiner) violations.add("fn-secdef");          // 5
    if (r.cfg !== null && r.cfg !== undefined) violations.add("fn-searchpath");// 6
    if (r.pub) violations.add("fn-public-execute");                            // 7
    const grantees = aclGrantees(r.acl);
    if (r.acl === null || grantees.includes("PUBLIC") || grantees.some((g) => !fp.allowedAclGrantees.includes(g)))
      violations.add("fn-role-execute");                                       // 8 (ACL 측면)
  }
  // 8. role 측면: reader/writer 는 직접·상속 어느 경로로도 EXECUTE 를 가지면 안 된다.
  if ((await roleExecutes(c, expected, fp.deniedExecuteRoles)).length > 0) violations.add("fn-role-execute");

  // 9. 미래 함수 차단: 전역(namespace 0) FUNCTIONS default ACL 이 대상 role 전부에 존재하고 PUBLIC 을 포함하지 않아야 한다.
  const dacl = await functionDefaultAcls(c);
  for (const role of fp.defaultAclRoles) {
    const row = dacl.find((d) => d.role === role && d.ns === 0);
    if (!row || aclGrantees(row.acl).includes("PUBLIC")) violations.add("fn-default-acl");
  }
  return FUNCTION_HARD_STOPS.filter((s) => violations.has(s));
}

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
  const fnViolations = await verifyFunctionFingerprint(c, def.functionFingerprint);
  if (fnViolations.length) return { ok: false, outcome: "aborted-function-fingerprint", detail: `function fingerprint 위반: ${fnViolations.join(",")}` };
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
