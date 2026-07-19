// hardening 전용 러너(설계·프로토타입) — 일반 additive 러너와 분리.
// 이유: 일반 러너의 정적 안전 스캐너는 GRANT/REVOKE/UPDATE/DELETE/CREATE TRIGGER/ALTER OWNER 를 위험 SQL 로 거부한다.
//   hardening SQL 은 이들을 '의도적으로' 포함하므로, 키워드 스캔 대신 **exact sha256 allowlist**로만 통과시킨다.
//   범용 스캐너는 그대로 엄격 유지(전 마이그레이션 additive 보증). 이 파일은 프로토타입(설계 고정용).
//
// fail-closed 계약(하나라도 불일치 → 적용 안 함/ROLLBACK):
//   sha allowlist · host pin(호출부) · 신규 role 부재(pre)/존재(post) · trigger·function 존재 · PUBLIC 권한 0 ·
//   6테이블 소유자 = orchestration_owner(post) · 신규 6테이블 행수 0 · already-applied 판정.
import { SIX_TABLES } from "./tables";

export interface HardeningClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
  exec(sql: string): Promise<void>;
}
export interface HardeningDef {
  id: string;
  sqlFile: string;                 // migrations/hardening/ 아래
  expectedSha256: string;          // CRLF→LF 정규화 sha256
  expectedRoles: string[];         // 적용 후 존재해야 할 role
  expectedTriggerCount: number;    // 적용 후 신규 trigger 수(대상 6테이블)
  expectedFunctions: string[];     // 적용 후 존재해야 할 trigger function
  expectedTableOwner: string;      // 적용 후 6테이블 소유자
}

export const HARDENINGS: HardeningDef[] = [
  {
    id: "0001_orchestration_immutability_roles",
    sqlFile: "0001_orchestration_immutability_roles.sql",
    expectedSha256: "adde601080616c4b6dbe358b81bccc9fd8d3ff94f2be4c9944ab110bdfc4b8ba",
    expectedRoles: ["orchestration_admin", "orchestration_owner", "orchestration_reader", "orchestration_writer"],
    expectedTriggerCount: 15, // immutable 3(UPDATE|DELETE) + business no-delete 3 + business guard 3 + truncate 6
    expectedFunctions: ["orch_deny_write", "orch_deny_delete", "orch_guard_business_update", "orch_deny_truncate"],
    expectedTableOwner: "orchestration_owner",
  },
];
export const findHardening = (id: string) => HARDENINGS.find((h) => h.id === id || h.sqlFile === id);

export type HardeningOutcome =
  | "applied" | "dry-run-verified" | "already-applied"
  | "aborted-sha-mismatch" | "aborted-postverify" | "aborted-owner-mismatch"
  | "aborted-public-privilege" | "aborted-rows-present" | "aborted-sql-error" | "aborted-partial";
export interface HardeningResult { outcome: HardeningOutcome; id: string; committed: boolean; detail: string; }

async function n(c: HardeningClient, sql: string, params?: unknown[]): Promise<number> { return (await c.query(sql, params)).rows[0].n; }
const rolesExist = (c: HardeningClient, roles: string[]) => n(c, `SELECT count(*)::int n FROM pg_roles WHERE rolname = ANY($1)`, [roles]);
const triggerCount = (c: HardeningClient) => n(c,
  `SELECT count(*)::int n FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace ns ON ns.oid=r.relnamespace
     WHERE ns.nspname='public' AND NOT t.tgisinternal AND r.relname = ANY($1)`, [SIX_TABLES]);
const functionsExist = (c: HardeningClient, fns: string[]) => n(c, `SELECT count(DISTINCT proname)::int n FROM pg_proc WHERE proname = ANY($1)`, [fns]);
const publicGrantCount = (c: HardeningClient) => n(c,
  `SELECT count(*)::int n FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name = ANY($1) AND grantee='PUBLIC'`, [SIX_TABLES]);
const tablesOwnedBy = (c: HardeningClient, owner: string) => n(c,
  `SELECT count(*)::int n FROM pg_class r JOIN pg_namespace ns ON ns.oid=r.relnamespace
     WHERE ns.nspname='public' AND r.relname = ANY($1) AND pg_get_userbyid(r.relowner)=$2`, [SIX_TABLES, owner]);
const newRowsTotal = async (c: HardeningClient): Promise<number> => {
  let t = 0; for (const tbl of SIX_TABLES) t += await n(c, `SELECT count(*)::int n FROM "${tbl}"`); return t;
};

export interface RunHardeningOpts { sqlText: string; actualSha256: string; apply: boolean; }

// post-verify: fail-closed 조건 일괄 확인.
async function verify(c: HardeningClient, def: HardeningDef): Promise<{ ok: true } | { ok: false; outcome: HardeningOutcome; detail: string }> {
  const rc = await rolesExist(c, def.expectedRoles), tc = await triggerCount(c), fc = await functionsExist(c, def.expectedFunctions);
  if (rc !== def.expectedRoles.length || tc < def.expectedTriggerCount || fc !== def.expectedFunctions.length)
    return { ok: false, outcome: "aborted-postverify", detail: `roles=${rc}/${def.expectedRoles.length} triggers=${tc}/${def.expectedTriggerCount} fns=${fc}/${def.expectedFunctions.length}` };
  const owned = await tablesOwnedBy(c, def.expectedTableOwner);
  if (owned !== SIX_TABLES.length) return { ok: false, outcome: "aborted-owner-mismatch", detail: `owner=${def.expectedTableOwner} 소유 테이블 ${owned}/${SIX_TABLES.length}` };
  const pub = await publicGrantCount(c);
  if (pub !== 0) return { ok: false, outcome: "aborted-public-privilege", detail: `PUBLIC 권한 잔존 ${pub}` };
  return { ok: true };
}

export async function runHardening(c: HardeningClient, def: HardeningDef, opts: RunHardeningOpts): Promise<HardeningResult> {
  const base = { id: def.id, committed: false };
  if (opts.actualSha256 !== def.expectedSha256)
    return { ...base, outcome: "aborted-sha-mismatch", detail: `sha 불일치(expected=${def.expectedSha256.slice(0, 8)}… actual=${opts.actualSha256.slice(0, 8)}…)` };

  // pre: 신규 role 존재 → already-applied 판정(재실행 0)
  const already = await rolesExist(c, def.expectedRoles);
  if (already === def.expectedRoles.length) {
    const v = await verify(c, def);
    return v.ok ? { ...base, outcome: "already-applied", detail: "role·trigger·owner·PUBLIC 모두 기대치 → already-applied" }
                : { ...base, outcome: v.outcome, detail: "이미 일부 적용 상태에서 검증 실패: " + v.detail };
  }
  if (already > 0) return { ...base, outcome: "aborted-partial", detail: `role 일부만 존재(${already}/${def.expectedRoles.length}) → 중단` };

  // 신규 6테이블 행수 0 이어야 적용(불변성/append-only 를 빈 테이블에서 시작)
  const rows = await newRowsTotal(c);
  if (rows !== 0) return { ...base, outcome: "aborted-rows-present", detail: `신규 6테이블 행수 ${rows}≠0 → 중단(fail-closed)` };

  await c.exec("BEGIN");
  try {
    await c.exec(opts.sqlText);
    const v = await verify(c, def);
    if (!v.ok) { await c.exec("ROLLBACK"); return { ...base, outcome: v.outcome, detail: v.detail }; }
    if (opts.apply) { await c.exec("COMMIT"); return { ...base, outcome: "applied", committed: true, detail: "적용·검증 통과" }; }
    await c.exec("ROLLBACK");
    return { ...base, outcome: "dry-run-verified", detail: "검증 통과(미적용)" };
  } catch (e: any) {
    await c.exec("ROLLBACK").catch(() => {});
    return { ...base, outcome: "aborted-sql-error", detail: e?.message ?? String(e) };
  }
}
