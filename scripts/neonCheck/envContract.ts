// disposable Neon 하네스 **환경변수 계약 단일 정본**.
// 문서(`docs/disposable-neon-operator-setup.md`)·CLI 도움말·guards·테스트는 **전부 여기서 파생**한다.
// 값을 출력하는 코드를 이 파일에 두지 않는다(이름·설명만 보유).
//
// ⚠️ 두 계약을 **분리**한다. 표에 섞지 않는다.
//   1) harness execution env   — 하네스가 실제로 읽는 변수(ENV_CONTRACT)
//   2) operator hash-helper temporary input — hash 계산기만 읽는 임시 입력(HASH_HELPER_CONTRACT).
//      하네스는 이 이름들을 **읽지 않는다**(테스트로 강제).

export interface EnvVarSpec {
  name: string;
  required: boolean;
  /** 값 자체가 secret 이라 로그·에러·argv 어디에도 원문이 나오면 안 되는가 */
  secret: boolean;
  description: string;
}

/** ① harness execution env — 순서가 문서 표의 순서다. */
export const ENV_CONTRACT: readonly EnvVarSpec[] = [
  { name: "NEON_CHECK_DIRECT_URL", required: true, secret: true, description: "disposable 환경 **direct** endpoint 연결 URL" },
  { name: "NEON_CHECK_POOLED_URL", required: true, secret: true, description: "동일 환경 **pooled**(PgBouncer) endpoint 연결 URL" },
  { name: "NEON_CHECK_EXPECTED_DIRECT_HOST_HASH", required: true, secret: false, description: "disposable **direct** host 의 sha256 (64 lowercase hex) — 독립 pin" },
  { name: "NEON_CHECK_EXPECTED_POOLED_HOST_HASH", required: true, secret: false, description: "disposable **pooled** host 의 sha256 — 독립 pin" },
  { name: "NEON_CHECK_FORBIDDEN_DIRECT_HOST_HASH", required: true, secret: false, description: "**production direct** host 의 sha256 — forbidden set 구성원" },
  { name: "NEON_CHECK_FORBIDDEN_POOLED_HOST_HASH", required: true, secret: false, description: "**production pooled** host 의 sha256 — forbidden set 구성원" },
  { name: "NEON_CHECK_DISPOSABLE_CONFIRM", required: true, secret: false, description: "disposable 확인 토큰(고정 문자열)" },
  { name: "NEON_CHECK_RUN_ID", required: true, secret: false, description: "이번 실행 식별자 `[a-z0-9]{4,16}` — 모든 synthetic object 이름 suffix" },
  { name: "PREFLIGHT_ONLY", required: false, secret: false, description: "`true` 일 때 **select-only-preflight** 모드(읽기 전용 연결, write/DDL 0)" },
  { name: "CONFIRM_EXECUTE", required: false, secret: false, description: "`true` 일 때만 **execute**(실제 DDL). PREFLIGHT_ONLY 와 동시 설정 금지" },
];

/** ② operator hash-helper temporary input — 하네스는 읽지 않는다. 계산 직후 제거. */
export const HASH_HELPER_CONTRACT: readonly EnvVarSpec[] = [
  { name: "NEON_HASH_INPUT_DIRECT_URL", required: false, secret: true, description: "hash 계산용 임시 입력 — disposable **direct** URL" },
  { name: "NEON_HASH_INPUT_POOLED_URL", required: false, secret: true, description: "hash 계산용 임시 입력 — disposable **pooled** URL" },
  { name: "NEON_HASH_INPUT_FORBIDDEN_DIRECT_URL", required: false, secret: true, description: "hash 계산용 임시 입력 — **production direct** URL" },
  { name: "NEON_HASH_INPUT_FORBIDDEN_POOLED_URL", required: false, secret: true, description: "hash 계산용 임시 입력 — **production pooled** URL" },
];

export const REQUIRED_ENV = ENV_CONTRACT.filter((v) => v.required).map((v) => v.name);
export const SECRET_ENV = ENV_CONTRACT.filter((v) => v.secret).map((v) => v.name);
export const ENV_NAMES = ENV_CONTRACT.map((v) => v.name);
export const HASH_HELPER_NAMES = HASH_HELPER_CONTRACT.map((v) => v.name);

/** 폐기된 변수. 설정돼 있으면 **오래된 계약**이므로 fail-closed 한다(호환성 유지 안 함). */
export const DEPRECATED_ENV: readonly { name: string; replacedBy: string; reason: string }[] = [
  {
    name: "NEON_CHECK_EXPECTED_HOST_HASH",
    replacedBy: "NEON_CHECK_EXPECTED_DIRECT_HOST_HASH + NEON_CHECK_EXPECTED_POOLED_HOST_HASH",
    reason: "단일 hash 로는 direct/pooled 두 endpoint 를 동시에 pin 할 수 없다(host 가 서로 다름) → pooled 가 사실상 미고정",
  },
  {
    name: "NEON_CHECK_FORBIDDEN_HOST_HASH",
    replacedBy: "NEON_CHECK_FORBIDDEN_DIRECT_HOST_HASH + NEON_CHECK_FORBIDDEN_POOLED_HOST_HASH",
    reason: "production 도 direct/pooled 로 host 가 둘이다. 단일 forbidden hash 로는 production **pooled** endpoint 를 차단하지 못한다",
  },
  {
    name: "NEON_CHECK_FORBIDDEN_URL",
    replacedBy: "NEON_HASH_INPUT_FORBIDDEN_DIRECT_URL / NEON_HASH_INPUT_FORBIDDEN_POOLED_URL",
    reason: "URL 입력은 hash-helper 전용 계약이며 실행 하네스 env 계약에 섞지 않는다",
  },
];

/** 실행 모드 — 플래그 조합으로 결정한다. */
export const RUN_MODES = ["offline-dry-run", "select-only-preflight", "execute"] as const;
export type RunMode = (typeof RUN_MODES)[number];

/** CLI 도움말/문서 표를 정본에서 생성 — 손으로 옮겨 적어 어긋나는 것을 막는다. */
export function formatEnvContract(): string[] {
  return [
    "① harness execution env (단일 정본: scripts/neonCheck/envContract.ts)",
    ...ENV_CONTRACT.map((v) => `    ${v.required ? "필수" : "선택"}  ${v.name}${v.secret ? "  [secret — 명령줄/argv/로그 금지]" : ""}`),
    "② operator hash-helper temporary input (하네스는 읽지 않음 · 계산 직후 제거)",
    ...HASH_HELPER_CONTRACT.map((v) => `    선택  ${v.name}  [secret]`),
    "폐기(설정돼 있으면 거부): " + DEPRECATED_ENV.map((d) => d.name).join(", "),
    "실행 모드: (플래그 없음)=offline-dry-run · PREFLIGHT_ONLY=true=select-only-preflight · CONFIRM_EXECUTE=true=execute",
  ];
}
