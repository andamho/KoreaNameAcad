// hardening 전용 러너(설계·프로토타입) — 일반 additive 러너와 분리.
// 이유: 일반 러너의 정적 안전 스캐너는 GRANT/REVOKE/UPDATE/DELETE/CREATE TRIGGER 를 위험 SQL 로 거부한다.
//   hardening SQL 은 이들을 '의도적으로' 포함하므로, 키워드 스캔 대신 **exact sha256 allowlist**로만 통과시킨다.
//   범용 스캐너를 느슨하게 만들지 않는다(전 마이그레이션의 additive 보증 유지).
//
// 계약:
//   1) 등록된 hardening 항목만 실행(id → sqlFile + expectedSha256). 파일 sha 불일치면 거부.
//   2) 대상 DB host 핀(EXPECTED_DATABASE_HOST_HASH) + CONFIRM_APPLY=true 없으면 apply 금지(일반 러너와 동일 게이트).
//   3) 단일 트랜잭션. dry-run=ROLLBACK, apply=COMMIT.
//   4) 적용 후 post-verify: 기대 role·trigger·function 이 실제로 생겼는지 확인(개수/이름). 불일치면 실패.
//   5) 재실행은 pre-check(대상 role 존재)로 already-applied 판정 — CREATE ROLE 재실행 안 함.
// 이 파일은 프로토타입(설계 고정용). 실제 운영 적용은 별도 승인 Gate 에서.

export interface HardeningClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
  exec(sql: string): Promise<void>;
}
export interface HardeningDef {
  id: string;
  sqlFile: string;               // migrations/hardening/ 아래
  expectedSha256: string;        // CRLF→LF 정규화 sha256
  expectedRoles: string[];       // 적용 후 존재해야 할 role
  expectedTriggerCount: number;  // 적용 후 신규 trigger 수(대상 6테이블)
  expectedFunctions: string[];   // 적용 후 존재해야 할 trigger function
}

// 등록: exact allowlist. 파일 변경 시 sha 재고정 필요(승인 절차).
export const HARDENINGS: HardeningDef[] = [
  {
    id: "0001_orchestration_immutability_roles",
    sqlFile: "0001_orchestration_immutability_roles.sql",
    expectedSha256: "82d18efa2f385a36e38d17f4ef9ab1b4e2e63e58596faedff6f83ff9fd92f1df",
    expectedRoles: ["orchestration_admin", "orchestration_reader", "orchestration_writer"],
    expectedTriggerCount: 15, // immutable 3 + business no-delete 3 + business guard 3 + truncate 6
    expectedFunctions: ["orch_deny_write", "orch_deny_delete", "orch_guard_business_update", "orch_deny_truncate"],
  },
];
export const findHardening = (id: string) => HARDENINGS.find((h) => h.id === id || h.sqlFile === id);

export type HardeningOutcome =
  | "applied" | "dry-run-verified" | "already-applied"
  | "aborted-sha-mismatch" | "aborted-postverify" | "aborted-sql-error" | "aborted-partial";

export interface HardeningResult { outcome: HardeningOutcome; id: string; committed: boolean; detail: string; }

async function rolesExist(c: HardeningClient, roles: string[]): Promise<number> {
  return (await c.query(`SELECT count(*)::int n FROM pg_roles WHERE rolname = ANY($1)`, [roles])).rows[0].n;
}
async function triggerCount(c: HardeningClient): Promise<number> {
  return (await c.query(
    `SELECT count(*)::int n FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace ns ON ns.oid=r.relnamespace
       WHERE ns.nspname='public' AND NOT t.tgisinternal
         AND r.relname = ANY($1)`,
    [["job_artifacts", "job_dependencies", "automated_reviews", "human_approvals", "orchestration_audit_log", "emergency_stops"]],
  )).rows[0].n;
}
async function functionsExist(c: HardeningClient, fns: string[]): Promise<number> {
  return (await c.query(`SELECT count(DISTINCT proname)::int n FROM pg_proc WHERE proname = ANY($1)`, [fns])).rows[0].n;
}

export interface RunHardeningOpts { sqlText: string; actualSha256: string; apply: boolean; }

export async function runHardening(c: HardeningClient, def: HardeningDef, opts: RunHardeningOpts): Promise<HardeningResult> {
  const base = { id: def.id, committed: false };
  // 1) sha allowlist
  if (opts.actualSha256 !== def.expectedSha256) {
    return { ...base, outcome: "aborted-sha-mismatch", detail: `sha 불일치(expected=${def.expectedSha256.slice(0, 8)}… actual=${opts.actualSha256.slice(0, 8)}…)` };
  }
  // 2) pre-check: 이미 적용?
  const already = await rolesExist(c, def.expectedRoles);
  if (already === def.expectedRoles.length) {
    const tc = await triggerCount(c), fc = await functionsExist(c, def.expectedFunctions);
    if (tc >= def.expectedTriggerCount && fc === def.expectedFunctions.length) {
      return { ...base, outcome: "already-applied", detail: "role·trigger·function 모두 존재 → already-applied" };
    }
    return { ...base, outcome: "aborted-partial", detail: `일부만 존재(roles=${already}, triggers=${tc}, fns=${fc}) → 중단` };
  }
  if (already > 0) return { ...base, outcome: "aborted-partial", detail: `role 일부만 존재(${already}/${def.expectedRoles.length}) → 중단` };

  // 3) 트랜잭션 적용
  await c.exec("BEGIN");
  try {
    await c.exec(opts.sqlText);
    const rc = await rolesExist(c, def.expectedRoles), tc = await triggerCount(c), fc = await functionsExist(c, def.expectedFunctions);
    if (rc !== def.expectedRoles.length || tc < def.expectedTriggerCount || fc !== def.expectedFunctions.length) {
      await c.exec("ROLLBACK");
      return { ...base, outcome: "aborted-postverify", detail: `post-verify 실패(roles=${rc}/${def.expectedRoles.length}, triggers=${tc}/${def.expectedTriggerCount}, fns=${fc}/${def.expectedFunctions.length})` };
    }
    if (opts.apply) { await c.exec("COMMIT"); return { ...base, outcome: "applied", committed: true, detail: `적용 완료: roles=${rc}, triggers=${tc}, fns=${fc}` }; }
    await c.exec("ROLLBACK");
    return { ...base, outcome: "dry-run-verified", detail: `검증 통과(미적용): roles=${rc}, triggers=${tc}, fns=${fc}` };
  } catch (e: any) {
    await c.exec("ROLLBACK").catch(() => {});
    return { ...base, outcome: "aborted-sql-error", detail: e?.message ?? String(e) };
  }
}
