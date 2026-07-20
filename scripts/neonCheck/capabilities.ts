// capability 정본(single source of truth). 문서·report·tests 는 전부 여기서 파생한다.
// 개수(45)를 다른 파일에 하드코딩하지 말 것 — CAPABILITIES.length / countFor(profile) 사용.

export const PROFILES = ["embedded-direct", "pooled-mock", "neon-full"] as const;
export type Profile = (typeof PROFILES)[number];

export const CATEGORIES = ["role-lifecycle", "ownership", "privilege", "trigger-emergency", "direct-pooled"] as const;
export type Category = (typeof CATEGORIES)[number];

/** pass = 성공해야 함 · expected-denial = 반드시 거부되어야 함 */
export type Expectation = "pass" | "expected-denial";
/** 실행 결과 */
export type CapabilityOutcome = "pass" | "expected-denial" | "fail" | "skipped";

export interface CapabilityDef {
  id: string;
  category: Category;
  /** 이 capability 가 "실제 판정 가능한" profile 목록. 여기 없는 profile 에서는 실행계획에서 제외(not-applicable). */
  profiles: readonly Profile[];
  expectation: Expectation;
  /** neon-full 최종 성공에 필수인가(전부 true — 정본상 선택 capability 없음) */
  mandatory: boolean;
  description: string;
}

const D = "embedded-direct" as const, M = "pooled-mock" as const, N = "neon-full" as const;
const DN = [D, N] as const;   // direct 계열: embedded-direct + neon-full
const MN = [M, N] as const;   // pooled 계열: pooled-mock + neon-full

// ── 정본 45 (순서 = deterministic 실행 순서) ────────────────────────────────
export const CAPABILITIES: readonly CapabilityDef[] = Object.freeze([
  // Role lifecycle — 8
  { id: "create-nologin-role", category: "role-lifecycle", profiles: DN, expectation: "pass", mandatory: true, description: "NOLOGIN role 생성" },
  { id: "create-login-role", category: "role-lifecycle", profiles: DN, expectation: "pass", mandatory: true, description: "LOGIN role 생성(비밀번호 미출력)" },
  { id: "grant-membership", category: "role-lifecycle", profiles: DN, expectation: "pass", mandatory: true, description: "membership 부여" },
  { id: "revoke-membership", category: "role-lifecycle", profiles: DN, expectation: "pass", mandatory: true, description: "membership 회수" },
  { id: "set-role", category: "role-lifecycle", profiles: DN, expectation: "pass", mandatory: true, description: "SET ROLE 성공" },
  { id: "reset-role", category: "role-lifecycle", profiles: DN, expectation: "pass", mandatory: true, description: "RESET ROLE 성공" },
  { id: "set-role-denied-after-revoke", category: "role-lifecycle", profiles: DN, expectation: "expected-denial", mandatory: true, description: "membership 회수 후 SET ROLE 실패" },
  { id: "escalation-denied-for-runtime-roles", category: "role-lifecycle", profiles: DN, expectation: "expected-denial", mandatory: true, description: "writer/reader/app 의 admin·owner escalation 실패" },
  // Ownership — 6
  { id: "transfer-table-owner", category: "ownership", profiles: DN, expectation: "pass", mandatory: true, description: "table owner 이전" },
  { id: "transfer-function-owner", category: "ownership", profiles: DN, expectation: "pass", mandatory: true, description: "function owner 이전" },
  { id: "bootstrap-a-temporary-membership", category: "ownership", profiles: DN, expectation: "pass", mandatory: true, description: "bootstrap A 임시 membership 부여(현재 owner → synthetic owner)" },
  { id: "bootstrap-a-ownership-transfer", category: "ownership", profiles: DN, expectation: "pass", mandatory: true, description: "bootstrap A 소유권 이전" },
  { id: "bootstrap-a-membership-revoked", category: "ownership", profiles: DN, expectation: "pass", mandatory: true, description: "bootstrap A 임시 membership 즉시 회수" },
  { id: "bootstrap-a-residual-membership-zero", category: "ownership", profiles: DN, expectation: "pass", mandatory: true, description: "bootstrap A 잔여 membership 0" },
  // Privilege — 13
  { id: "public-table-privilege-zero", category: "privilege", profiles: DN, expectation: "pass", mandatory: true, description: "PUBLIC table 권한 0" },
  { id: "public-sequence-privilege-zero", category: "privilege", profiles: DN, expectation: "pass", mandatory: true, description: "PUBLIC sequence 권한 0" },
  { id: "public-function-execute-zero", category: "privilege", profiles: DN, expectation: "pass", mandatory: true, description: "PUBLIC function EXECUTE 0" },
  { id: "reader-select-success", category: "privilege", profiles: DN, expectation: "pass", mandatory: true, description: "reader SELECT 성공" },
  { id: "reader-write-denied", category: "privilege", profiles: DN, expectation: "expected-denial", mandatory: true, description: "reader write 실패" },
  { id: "writer-insert-success", category: "privilege", profiles: DN, expectation: "pass", mandatory: true, description: "writer 허용 INSERT 성공" },
  { id: "writer-update-denied", category: "privilege", profiles: DN, expectation: "expected-denial", mandatory: true, description: "writer UPDATE 실패" },
  { id: "writer-delete-denied", category: "privilege", profiles: DN, expectation: "expected-denial", mandatory: true, description: "writer DELETE 실패" },
  { id: "writer-truncate-denied", category: "privilege", profiles: DN, expectation: "expected-denial", mandatory: true, description: "writer TRUNCATE 실패" },
  { id: "writer-business-table-access-denied", category: "privilege", profiles: DN, expectation: "expected-denial", mandatory: true, description: "writer 의 business table 접근 실패" },
  { id: "app-simulation-orchestration-write-denied", category: "privilege", profiles: DN, expectation: "expected-denial", mandatory: true, description: "app simulation 의 orchestration write 실패" },
  { id: "trigger-function-direct-call-denied", category: "privilege", profiles: DN, expectation: "expected-denial", mandatory: true, description: "trigger function 직접 호출 실패" },
  { id: "default-privileges-secure", category: "privilege", profiles: DN, expectation: "pass", mandatory: true, description: "default privileges 로 미래 객체 PUBLIC 누수 0" },
  // Trigger and emergency boundary — 10
  { id: "immutable-update-denied", category: "trigger-emergency", profiles: DN, expectation: "expected-denial", mandatory: true, description: "immutable UPDATE 거부" },
  { id: "immutable-delete-denied", category: "trigger-emergency", profiles: DN, expectation: "expected-denial", mandatory: true, description: "immutable DELETE 거부" },
  { id: "identity-field-update-denied", category: "trigger-emergency", profiles: DN, expectation: "expected-denial", mandatory: true, description: "식별 컬럼 변경 거부" },
  { id: "truncate-trigger-or-fk-denied", category: "trigger-emergency", profiles: DN, expectation: "expected-denial", mandatory: true, description: "TRUNCATE 거부(trigger 또는 FK 참조)" },
  { id: "session-replication-role-denied", category: "trigger-emergency", profiles: DN, expectation: "expected-denial", mandatory: true, description: "비-superuser 의 session_replication_role 변경 실패" },
  { id: "runtime-trigger-disable-denied", category: "trigger-emergency", profiles: DN, expectation: "expected-denial", mandatory: true, description: "writer/reader/app 의 trigger disable 실패" },
  { id: "owner-trigger-disable-allowed", category: "trigger-emergency", profiles: DN, expectation: "pass", mandatory: true, description: "owner 경로 trigger disable 가능(긴급 절차)" },
  { id: "startup-check-fails-when-trigger-disabled", category: "trigger-emergency", profiles: DN, expectation: "pass", mandatory: true, description: "trigger disabled 상태에서 startup self-check 실패 감지" },
  { id: "startup-check-passes-after-reenable", category: "trigger-emergency", profiles: DN, expectation: "pass", mandatory: true, description: "재활성 후 startup self-check 성공" },
  { id: "final-trigger-enabled-count", category: "trigger-emergency", profiles: DN, expectation: "pass", mandatory: true, description: "최종 trigger 전부 enabled" },
  // Direct/pooled boundary — 8
  { id: "direct-reader-credential", category: "direct-pooled", profiles: DN, expectation: "pass", mandatory: true, description: "direct reader credential 연결·권한 경계" },
  { id: "direct-writer-credential", category: "direct-pooled", profiles: DN, expectation: "pass", mandatory: true, description: "direct writer credential 연결·권한 경계" },
  { id: "deployer-admin-owner-chain", category: "direct-pooled", profiles: DN, expectation: "pass", mandatory: true, description: "deployer→admin→owner SET ROLE 체인" },
  { id: "pooled-reader-writer-separation", category: "direct-pooled", profiles: MN, expectation: "pass", mandatory: true, description: "pooled reader/writer 권한 분리" },
  { id: "transaction-end-role-state-clean", category: "direct-pooled", profiles: MN, expectation: "pass", mandatory: true, description: "transaction 종료 후 role/session 상태 잔류 0" },
  { id: "no-set-role-dependency-in-runtime-pools", category: "direct-pooled", profiles: MN, expectation: "pass", mandatory: true, description: "runtime pool 이 SET ROLE 에 의존하지 않음" },
  { id: "prepared-statement-reuse-preserves-boundary", category: "direct-pooled", profiles: MN, expectation: "pass", mandatory: true, description: "prepared statement 재사용 후 권한 경계 유지" },
  { id: "reconnect-preserves-boundary", category: "direct-pooled", profiles: MN, expectation: "pass", mandatory: true, description: "reconnect(연결 재활용) 후 권한 경계 유지" },
]);

// ── 파생 헬퍼(숫자 하드코딩 금지) ───────────────────────────────────────────
export const CAPABILITY_IDS: readonly string[] = CAPABILITIES.map((c) => c.id);
export const applicableFor = (p: Profile): readonly CapabilityDef[] => CAPABILITIES.filter((c) => c.profiles.includes(p));
export const countFor = (p: Profile): number => applicableFor(p).length;
export const byCategory = (cat: Category): readonly CapabilityDef[] => CAPABILITIES.filter((c) => c.category === cat);
export const findCapability = (id: string): CapabilityDef | undefined => CAPABILITIES.find((c) => c.id === id);

/** 정본 무결성(중복/누락/순서/profile) — 테스트와 실행 진입 양쪽에서 사용. */
export function validateCatalog(): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const ids = CAPABILITIES.map((c) => c.id);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) problems.push(`중복 ID: ${[...new Set(dup)].join(", ")}`);
  for (const c of CAPABILITIES) {
    if (!/^[a-z][a-z0-9-]*$/.test(c.id)) problems.push(`ID 형식 오류: ${c.id}`);
    if (!c.profiles.length) problems.push(`profile 없음: ${c.id}`);
    if (!c.profiles.includes("neon-full")) problems.push(`neon-full 미포함: ${c.id}`); // 전부 neon-full 대상
    if (!c.mandatory) problems.push(`정본에는 선택 capability 없음: ${c.id}`);
  }
  // 모든 capability 는 embedded-direct 또는 pooled-mock 중 정확히 하나에서 판정 가능해야 한다(격리 검증 커버리지).
  for (const c of CAPABILITIES) {
    const isolated = (c.profiles.includes("embedded-direct") ? 1 : 0) + (c.profiles.includes("pooled-mock") ? 1 : 0);
    if (isolated !== 1) problems.push(`격리 profile 배정 오류(정확히 1개여야): ${c.id}`);
  }
  return { ok: problems.length === 0, problems };
}
