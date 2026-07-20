// capability 단일 정본(single source of truth). 문서·report·tests 는 전부 여기서 파생.
// 개수를 다른 파일에 하드코딩하지 말 것 — CAPABILITIES.length / countFor(profile) 사용.

/** 실제로 실행되어 evidence 를 만드는 profile */
export const EXECUTION_PROFILES = ["pglite", "embedded-direct", "pooled-mock", "actual-neon-direct", "actual-neon-pooled"] as const;
export type ExecutionProfile = (typeof EXECUTION_PROFILES)[number];
/** 집계(roll-up) 전용 — 직접 실행되지 않는다. actual-neon-* 결과로만 계산. */
export const AGGREGATE_PROFILE = "neon-full" as const;
export type AggregateProfile = typeof AGGREGATE_PROFILE;
export type AnyProfile = ExecutionProfile | AggregateProfile;

export const CATEGORIES = ["role-lifecycle", "ownership", "privilege", "trigger-emergency", "direct-pooled"] as const;
export type Category = (typeof CATEGORIES)[number];

export type Expectation = "pass" | "expected-denial";
/** skipped 제거 — 비적용은 not-applicable, 적용인데 실행 못 하면 fail */
export type CapabilityOutcome = "pass" | "expected-denial" | "fail" | "not-applicable";

export interface CapabilityDef {
  id: string;
  category: Category;
  /** 이 capability 를 실제로 판정할 수 있는 실행 profile (자동 상속 없음) */
  applicableProfiles: readonly ExecutionProfile[];
  expectation: Expectation;
  mandatory: boolean;
  /** 45개 전부 true — neon-full 성공에는 actual Neon evidence 필수 */
  requiredForNeonFull: boolean;
  /** 엔진 간 결과가 충돌할 때 우선하는 profile */
  authoritativeProfile: ExecutionProfile;
  description: string;
}

const PG = "pglite" as const, ED = "embedded-direct" as const, PM = "pooled-mock" as const;
const AND = "actual-neon-direct" as const, ANP = "actual-neon-pooled" as const;
/** PGlite 로도 판정 가능한 direct 계열 */
const DIRECT_PG = [PG, ED, AND] as const;
/** 실제 LOGIN connection/권한 경계가 필요해 PGlite 로는 판정 불가 */
const DIRECT_LOGIN = [ED, AND] as const;
/** PGlite 가 해당 PostgreSQL 기능을 지원하지 않아 판정 불가(TRUNCATE statement trigger, default ACL 기록 등) */
const DIRECT_FULL = [ED, AND] as const;
/** pooled 계열 */
const POOLED = [PM, ANP] as const;

const cap = (
  id: string, category: Category, applicableProfiles: readonly ExecutionProfile[],
  expectation: Expectation, authoritativeProfile: ExecutionProfile, description: string,
): CapabilityDef => ({ id, category, applicableProfiles, expectation, mandatory: true, requiredForNeonFull: true, authoritativeProfile, description });

// ── 정본 45 (배열 순서 = deterministic 실행 순서) ────────────────────────────
export const CAPABILITIES: readonly CapabilityDef[] = Object.freeze([
  // Role lifecycle — 8
  cap("create-nologin-role", "role-lifecycle", DIRECT_PG, "pass", ED, "NOLOGIN role 생성"),
  cap("create-login-role", "role-lifecycle", DIRECT_PG, "pass", ED, "LOGIN role 생성(CSPRNG password, 미출력)"),
  cap("grant-membership", "role-lifecycle", DIRECT_PG, "pass", ED, "membership 부여"),
  cap("revoke-membership", "role-lifecycle", DIRECT_PG, "pass", ED, "membership 회수"),
  cap("set-role", "role-lifecycle", DIRECT_PG, "pass", ED, "SET ROLE 성공"),
  cap("reset-role", "role-lifecycle", DIRECT_PG, "pass", ED, "RESET ROLE 성공"),
  cap("set-role-denied-after-revoke", "role-lifecycle", DIRECT_LOGIN, "expected-denial", ED, "membership 회수 후 실제 LOGIN 세션의 SET ROLE 실패"),
  cap("escalation-denied-for-runtime-roles", "role-lifecycle", DIRECT_LOGIN, "expected-denial", ED, "writer/reader/app LOGIN 의 admin·owner escalation 실패"),
  // Ownership — 6
  cap("transfer-table-owner", "ownership", DIRECT_PG, "pass", ED, "table owner 이전"),
  cap("transfer-function-owner", "ownership", DIRECT_PG, "pass", ED, "function owner 이전"),
  cap("bootstrap-a-temporary-membership", "ownership", DIRECT_PG, "pass", ED, "bootstrap A: 현재 owner 가 synthetic owner 의 임시 member"),
  cap("bootstrap-a-ownership-transfer", "ownership", DIRECT_PG, "pass", ED, "bootstrap A: 소유권 이전"),
  cap("bootstrap-a-membership-revoked", "ownership", DIRECT_PG, "pass", ED, "bootstrap A: 임시 membership 즉시 회수"),
  cap("bootstrap-a-residual-membership-zero", "ownership", DIRECT_PG, "pass", ED, "bootstrap A: 잔여 membership 0"),
  // Privilege — 13
  cap("public-table-privilege-zero", "privilege", DIRECT_PG, "pass", ED, "PUBLIC table 권한 0"),
  cap("public-sequence-privilege-zero", "privilege", DIRECT_PG, "pass", ED, "PUBLIC sequence 권한 0"),
  cap("public-function-execute-zero", "privilege", DIRECT_PG, "pass", ED, "PUBLIC function EXECUTE 0"),
  cap("reader-select-success", "privilege", DIRECT_LOGIN, "pass", ED, "reader LOGIN 의 SELECT 성공"),
  cap("reader-write-denied", "privilege", DIRECT_LOGIN, "expected-denial", ED, "reader LOGIN 의 write 실패"),
  cap("writer-insert-success", "privilege", DIRECT_LOGIN, "pass", ED, "writer LOGIN 의 허용 INSERT 성공"),
  cap("writer-update-denied", "privilege", DIRECT_LOGIN, "expected-denial", ED, "writer LOGIN 의 immutable UPDATE 실패"),
  cap("writer-delete-denied", "privilege", DIRECT_LOGIN, "expected-denial", ED, "writer LOGIN 의 DELETE 실패"),
  cap("writer-truncate-denied", "privilege", DIRECT_LOGIN, "expected-denial", ED, "writer LOGIN 의 TRUNCATE 실패"),
  cap("writer-business-table-access-denied", "privilege", DIRECT_LOGIN, "expected-denial", ED, "writer LOGIN 의 business table 접근 실패"),
  cap("app-simulation-orchestration-write-denied", "privilege", DIRECT_LOGIN, "expected-denial", ED, "app simulation LOGIN 의 orchestration write 실패"),
  cap("trigger-function-direct-call-denied", "privilege", DIRECT_LOGIN, "expected-denial", ED, "trigger function 직접 호출 실패"),
  cap("default-privileges-secure", "privilege", DIRECT_FULL, "pass", ED, "default privileges 로 미래 객체 PUBLIC 누수 0(PGlite 는 default ACL 미기록 → 판정 불가)"),
  // Trigger and emergency boundary — 10
  cap("immutable-update-denied", "trigger-emergency", DIRECT_PG, "expected-denial", ED, "immutable UPDATE 거부(trigger)"),
  cap("immutable-delete-denied", "trigger-emergency", DIRECT_PG, "expected-denial", ED, "immutable DELETE 거부(trigger)"),
  cap("identity-field-update-denied", "trigger-emergency", DIRECT_PG, "expected-denial", ED, "식별 컬럼 변경 거부"),
  cap("truncate-trigger-or-fk-denied", "trigger-emergency", DIRECT_FULL, "expected-denial", ED, "TRUNCATE 거부(PGlite 는 statement trigger 미지원 → embedded 가 authoritative)"),
  cap("session-replication-role-denied", "trigger-emergency", DIRECT_LOGIN, "expected-denial", ED, "비-superuser 의 session_replication_role 변경 실패"),
  cap("runtime-trigger-disable-denied", "trigger-emergency", DIRECT_LOGIN, "expected-denial", ED, "runtime role 의 trigger disable 실패"),
  cap("owner-trigger-disable-allowed", "trigger-emergency", DIRECT_PG, "pass", ED, "owner 경로 trigger disable 가능(긴급 절차)"),
  cap("startup-check-fails-when-trigger-disabled", "trigger-emergency", DIRECT_PG, "pass", ED, "trigger disabled 시 startup self-check 실패 감지"),
  cap("startup-check-passes-after-reenable", "trigger-emergency", DIRECT_PG, "pass", ED, "재활성 후 startup self-check 성공"),
  cap("final-trigger-enabled-count", "trigger-emergency", DIRECT_PG, "pass", ED, "최종 trigger 전부 enabled(기대값 일치)"),
  // Direct/pooled boundary — 8
  cap("direct-reader-credential", "direct-pooled", DIRECT_LOGIN, "pass", ED, "direct reader credential 연결 경계"),
  cap("direct-writer-credential", "direct-pooled", DIRECT_LOGIN, "pass", ED, "direct writer credential 연결 경계"),
  cap("deployer-admin-owner-chain", "direct-pooled", DIRECT_LOGIN, "pass", ED, "deployer→admin→owner 실제 LOGIN 체인"),
  cap("pooled-reader-writer-separation", "direct-pooled", POOLED, "pass", ANP, "pooled reader/writer 권한 분리"),
  cap("transaction-end-role-state-clean", "direct-pooled", POOLED, "pass", ANP, "transaction 종료 후 role/session 상태 잔류 0"),
  cap("no-set-role-dependency-in-runtime-pools", "direct-pooled", POOLED, "pass", ANP, "runtime pool 이 SET ROLE 에 의존하지 않음"),
  cap("prepared-statement-reuse-preserves-boundary", "direct-pooled", POOLED, "pass", ANP, "prepared statement 재사용 후 권한 경계 유지"),
  cap("reconnect-preserves-boundary", "direct-pooled", POOLED, "pass", ANP, "reconnect 후 권한 경계 유지"),
]);

// ── 파생 헬퍼 ───────────────────────────────────────────────────────────────
export const CAPABILITY_IDS: readonly string[] = CAPABILITIES.map((c) => c.id);
export const applicableFor = (p: ExecutionProfile): readonly CapabilityDef[] => CAPABILITIES.filter((c) => c.applicableProfiles.includes(p));
export const countFor = (p: ExecutionProfile): number => applicableFor(p).length;
export const authoritativeFor = (p: ExecutionProfile): readonly CapabilityDef[] => CAPABILITIES.filter((c) => c.authoritativeProfile === p);
export const findCapability = (id: string): CapabilityDef | undefined => CAPABILITIES.find((c) => c.id === id);
export const isApplicable = (id: string, p: ExecutionProfile): boolean => !!findCapability(id)?.applicableProfiles.includes(p);

/** 정본 무결성. */
export function validateCatalog(): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const ids = CAPABILITIES.map((c) => c.id);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) problems.push(`중복 ID: ${[...new Set(dup)].join(", ")}`);
  for (const c of CAPABILITIES) {
    if (!/^[a-z][a-z0-9-]*$/.test(c.id)) problems.push(`ID 형식 오류: ${c.id}`);
    if (!c.applicableProfiles.length) problems.push(`applicableProfiles 비어있음: ${c.id}`);
    if (!c.authoritativeProfile) problems.push(`authoritativeProfile 누락: ${c.id}`);
    if (!c.expectation) problems.push(`expectation 누락: ${c.id}`);
    if (!c.requiredForNeonFull) problems.push(`requiredForNeonFull=false 금지: ${c.id}`);
    if (!c.mandatory) problems.push(`mandatory=false 금지: ${c.id}`);
    if (!c.applicableProfiles.includes(c.authoritativeProfile)) problems.push(`authoritativeProfile 이 applicable 에 없음: ${c.id}`);
    // neon 계열 커버리지: direct 는 actual-neon-direct, pooled 는 actual-neon-pooled 를 반드시 포함
    const hasNeon = c.applicableProfiles.includes("actual-neon-direct") || c.applicableProfiles.includes("actual-neon-pooled");
    if (!hasNeon) problems.push(`actual-neon-* profile 미포함(neon-full 판정 불가): ${c.id}`);
  }
  return { ok: problems.length === 0, problems };
}
