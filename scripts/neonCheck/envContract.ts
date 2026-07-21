// disposable Neon 하네스 **환경변수 계약 단일 정본**.
// 문서(`docs/disposable-neon-operator-setup.md`)·CLI 도움말·guards·테스트는 **전부 여기서 파생**한다.
// 값을 출력하는 코드를 이 파일에 두지 않는다(이름·설명만 보유).

export interface EnvVarSpec {
  name: string;
  required: boolean;
  /** 값 자체가 secret 이라 로그·에러·argv 어디에도 원문이 나오면 안 되는가 */
  secret: boolean;
  description: string;
}

/** 이번 계약의 필수/선택 변수. 순서가 문서 표의 순서다. */
export const ENV_CONTRACT: readonly EnvVarSpec[] = [
  { name: "NEON_CHECK_DIRECT_URL", required: true, secret: true, description: "disposable 환경 **direct** endpoint 연결 URL" },
  { name: "NEON_CHECK_POOLED_URL", required: true, secret: true, description: "동일 환경 **pooled**(PgBouncer) endpoint 연결 URL" },
  { name: "NEON_CHECK_EXPECTED_DIRECT_HOST_HASH", required: true, secret: false, description: "direct host 의 sha256 (64 lowercase hex) — direct endpoint 독립 pin" },
  { name: "NEON_CHECK_EXPECTED_POOLED_HOST_HASH", required: true, secret: false, description: "pooled host 의 sha256 (64 lowercase hex) — pooled endpoint 독립 pin" },
  { name: "NEON_CHECK_FORBIDDEN_HOST_HASH", required: false, secret: false, description: "**production** host 의 sha256 — direct/pooled 중 하나라도 일치하면 즉시 거부" },
  { name: "NEON_CHECK_DISPOSABLE_CONFIRM", required: true, secret: false, description: "disposable 확인 토큰(고정 문자열)" },
  { name: "NEON_CHECK_RUN_ID", required: true, secret: false, description: "이번 실행 식별자 `[a-z0-9]{4,16}` — 모든 synthetic object 이름 suffix" },
  { name: "CONFIRM_EXECUTE", required: false, secret: false, description: "`true` 일 때만 실제 DDL 실행. 미설정이면 **offline contract validation(dry-run)**" },
];

export const REQUIRED_ENV = ENV_CONTRACT.filter((v) => v.required).map((v) => v.name);
export const SECRET_ENV = ENV_CONTRACT.filter((v) => v.secret).map((v) => v.name);
export const ENV_NAMES = ENV_CONTRACT.map((v) => v.name);

/** 폐기된 변수. 설정돼 있으면 **오래된 계약**이므로 fail-closed 한다(호환성 유지 안 함). */
export const DEPRECATED_ENV: readonly { name: string; replacedBy: string; reason: string }[] = [
  {
    name: "NEON_CHECK_EXPECTED_HOST_HASH",
    replacedBy: "NEON_CHECK_EXPECTED_DIRECT_HOST_HASH + NEON_CHECK_EXPECTED_POOLED_HOST_HASH",
    reason: "단일 hash 로는 direct/pooled 두 endpoint 를 동시에 pin 할 수 없다(Neon 은 host 가 서로 다름) → pooled 가 사실상 미고정 상태가 된다",
  },
];

/** CLI 도움말/문서 표를 정본에서 생성 — 손으로 옮겨 적어 어긋나는 것을 막는다. */
export function formatEnvContract(): string[] {
  return [
    "환경변수 계약(단일 정본: scripts/neonCheck/envContract.ts)",
    ...ENV_CONTRACT.map((v) => `  ${v.required ? "필수" : "선택"}  ${v.name}${v.secret ? "  [secret — 명령줄/argv/로그 금지]" : ""}`),
    ...(DEPRECATED_ENV.length ? ["  폐기  " + DEPRECATED_ENV.map((d) => d.name).join(", ") + " (설정돼 있으면 거부)"] : []),
  ];
}
