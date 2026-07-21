// orchestration **function security assertion** 단일 정본(single source of truth).
//
// ⚠️ 경계(중요): 이것은 **Neon capability 가 아니다.**
//   - `scripts/neonCheck/capabilities.ts` = **Neon capability 정본 45개**(disposable Neon 에서 실측할 항목). 변경 금지.
//   - 이 파일           = **hardening security assertion**(actual Neon 실행 *전에* 반드시 통과해야 하는 관문).
//   - `scripts/neonCheck/guards.ts` = **preflight assertion**(production-like DB·host·run-id 안전 검문).
//   세 결과를 하나의 숫자로 섞지 않는다. 보고는 항상 세 줄로 분리한다.
//
// 정본 evidence profile = `embedded-direct`(embedded PostgreSQL 17.x = 운영 Neon 과 동일 메이저).
// PGlite 는 PostgreSQL 18.x 라 보조 확인용이며 **정본이 아니다**.
import { SIX_TABLES } from "./tables";

export const ASSERTION_EVIDENCE_PROFILES = ["pglite", "embedded-direct", "actual-neon-direct"] as const;
export type AssertionEvidenceProfile = (typeof ASSERTION_EVIDENCE_PROFILES)[number];

export type SecurityMode = "invoker" | "definer";
export type SearchPathPolicy = "unset-no-schema-qualified-refs" | "pinned";
/** 함수 소유자의 **역할 등급**. 구체 role 이름이 아니라 정책 등급으로 표현한다. */
export type OwnerClass = "orchestration-owner" | "orchestration-admin" | "orchestration-deployer" | "app" | "other";

export interface FunctionSpec {
  name: string;
  /** `pg_get_function_identity_arguments()` 기대값. 무인자 = "" */
  identityArguments: string;
  returnType: string;
  language: string;
  /** 이 함수를 EXECUTE 로 연결한 trigger 개수(정확값) */
  triggerConnectionCount: number;
}

/** 4개 trigger function 의 정본 명세. 합계 trigger 연결 = 15. */
export const FUNCTION_SPECS: readonly FunctionSpec[] = [
  { name: "orch_deny_delete", identityArguments: "", returnType: "trigger", language: "plpgsql", triggerConnectionCount: 3 },
  { name: "orch_deny_truncate", identityArguments: "", returnType: "trigger", language: "plpgsql", triggerConnectionCount: 6 },
  { name: "orch_deny_write", identityArguments: "", returnType: "trigger", language: "plpgsql", triggerConnectionCount: 3 },
  { name: "orch_guard_business_update", identityArguments: "", returnType: "trigger", language: "plpgsql", triggerConnectionCount: 3 },
];
export const TOTAL_TRIGGER_CONNECTIONS = FUNCTION_SPECS.reduce((s, f) => s + f.triggerConnectionCount, 0); // 15

/** 함수 privilege 정책의 정본 값. assertion 은 전부 여기서 파생된다. */
export const FUNCTION_SECURITY_POLICY = {
  schema: "public",
  /** 최종 소유자는 **항상** orchestration_owner. admin/deployer 가 최종 owner 가 되면 위반. */
  expectedOwner: "orchestration_owner",
  expectedOwnerClass: "orchestration-owner" as OwnerClass,
  forbiddenOwnerClasses: ["orchestration-admin", "orchestration-deployer", "app", "other"] as OwnerClass[],
  securityMode: "invoker" as SecurityMode,
  searchPathPolicy: "unset-no-schema-qualified-refs" as SearchPathPolicy,
  /** 직접 EXECUTE 가 있으면 안 되는 런타임 role */
  runtimeRolesDeniedExecute: ["orchestration_reader", "orchestration_writer"] as const,
  /** ACL 에 나타나도 되는 grantee(= 소유자뿐) */
  allowedAclGrantees: ["orchestration_owner"] as const,
  /**
   * default ACL 정책.
   * - authoritative: orchestration_owner (owner-only creation 정책의 짝)
   * - defenseInDepth: admin/deployer (아래 근거 참고 — **함수 생성 권한을 허용한다는 의미가 아니다**)
   */
  defaultAclAuthoritativeRole: "orchestration_owner",
  defaultAclDefenseInDepthRoles: ["orchestration_admin", "orchestration_deployer"] as const,
  /** CREATE FUNCTION 이 불가능해야 하는 role */
  rolesDeniedCreateFunction: ["orchestration_reader", "orchestration_writer"] as const,
} as const;

export interface FunctionSecurityAssertion {
  id: string;
  /** 대상 함수 signature (`name(identityArguments)`) — 전체 집합이면 "*" */
  expectedFunctionSignature: string | "*";
  expectedOwnerClass: OwnerClass;
  securityMode: SecurityMode;
  searchPathPolicy: SearchPathPolicy;
  publicExecuteExpected: false;
  appExecuteExpected: false;
  writerExecuteExpected: false;
  readerExecuteExpected: false;
  /** "*" 인 경우 전체 합계(15), 개별이면 해당 함수의 연결 수 */
  expectedTriggerConnectionCount: number;
  authoritativeEvidenceProfile: AssertionEvidenceProfile;
  description: string;
}

const base = {
  expectedOwnerClass: FUNCTION_SECURITY_POLICY.expectedOwnerClass,
  securityMode: FUNCTION_SECURITY_POLICY.securityMode,
  searchPathPolicy: FUNCTION_SECURITY_POLICY.searchPathPolicy,
  publicExecuteExpected: false as const,
  appExecuteExpected: false as const,
  writerExecuteExpected: false as const,
  readerExecuteExpected: false as const,
  expectedTriggerConnectionCount: TOTAL_TRIGGER_CONNECTIONS,
  authoritativeEvidenceProfile: "embedded-direct" as const,
};

/**
 * hardening security assertion 정본.
 * ⚠️ id 는 Neon capability id 와 **절대 겹치지 않는다**(`fnsec-` prefix 강제).
 */
export const HARDENING_SECURITY_ASSERTIONS: readonly FunctionSecurityAssertion[] = [
  { ...base, id: "fnsec-function-count", expectedFunctionSignature: "*",
    description: `public 스키마의 orch_* 함수가 정확히 ${FUNCTION_SPECS.length}개(초과 = 미승인 함수 도입)` },
  { ...base, id: "fnsec-signatures", expectedFunctionSignature: "*",
    description: "각 함수의 identity arguments·반환형·언어가 정본 명세와 일치" },
  { ...base, id: "fnsec-owner", expectedFunctionSignature: "*",
    description: "최종 소유자가 항상 orchestration_owner (admin/deployer/app 소유는 위반)" },
  { ...base, id: "fnsec-security-mode", expectedFunctionSignature: "*",
    description: "SECURITY INVOKER 유지(prosecdef=false). DEFINER 무단 도입 차단" },
  { ...base, id: "fnsec-search-path", expectedFunctionSignature: "*",
    description: "proconfig 미설정. 본문이 스키마 미한정 객체·연산자를 참조하지 않아 search_path 의존 없음" },
  { ...base, id: "fnsec-public-execute-zero", expectedFunctionSignature: "*",
    description: "PUBLIC EXECUTE = 0 (exact-signature REVOKE 로 강제)" },
  { ...base, id: "fnsec-runtime-role-execute-zero", expectedFunctionSignature: "*",
    description: "app/writer/reader 직접 EXECUTE = 0 이며 ACL grantee ⊆ {orchestration_owner}" },
  { ...base, id: "fnsec-default-acl-policy", expectedFunctionSignature: "*",
    description: "전역(namespace 0) FUNCTIONS default ACL 이 정책 role 에 존재하고 PUBLIC 미포함. 보조 방어선이며 최종 보장은 owner-only creation + exact REVOKE + fingerprint" },
  { ...base, id: "fnsec-trigger-connection-count", expectedFunctionSignature: "*",
    description: `함수별 trigger 연결 수가 명세와 일치(합계 ${TOTAL_TRIGGER_CONNECTIONS})` },
  // 최소 9종 위에 추가한 10번째 — public schema CREATE 전략 A(임시 GRANT→즉시 REVOKE)의 잔여 권한 검문.
  { ...base, id: "fnsec-schema-create-privilege-zero", expectedFunctionSignature: "*",
    description: "정상 상태에서 orchestration_* role 전부 public schema CREATE 권한 0(전략 A 의 임시 GRANT 잔여 탐지)" },
];

export const ASSERTION_IDS = HARDENING_SECURITY_ASSERTIONS.map((a) => a.id);
export const findAssertion = (id: string) => HARDENING_SECURITY_ASSERTIONS.find((a) => a.id === id);

/** 함수별 trigger 연결 기대값 조회 */
export const triggerConnectionsFor = (name: string) => FUNCTION_SPECS.find((f) => f.name === name)?.triggerConnectionCount;
/** 6테이블(= trigger 가 붙는 대상) 재수출 — 개수 하드코딩 방지 */
export { SIX_TABLES };
