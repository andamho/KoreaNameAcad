// error_code 레지스트리 — 제한된 중앙 코드만 DB 에 저장. 원문 오류·stack·payload·고객값 저장 금지.
// error_summary 는 시스템 생성 요약만(≤1000자, contract). 상세는 외부 보안 로그 URI(고객 식별 금지).
export const ERROR_CODES = [
  // transient(§9): 자동 retry 대상
  "transient.network",
  "transient.provider-5xx",
  "transient.timeout",
  "transient.locked",
  // permanent: 자동 retry 없음
  "permanent.invalid-input",
  "permanent.unsupported-version",
  "permanent.artifact-corrupt",
  "permanent.version-mismatch",
  // ambiguous side effect: needs_review
  "ambiguous.side-effect-unknown",
  // 검증
  "verification.failed",
  "verification.missing-artifact-hash",
  // fencing/상태
  "fencing.stale-lease",
  "state.already-terminal",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

const SET = new Set<string>(ERROR_CODES);
export const isErrorCode = (v: unknown): v is ErrorCode => typeof v === "string" && SET.has(v);

import type { FailureClass } from "./types";
export function classOfErrorCode(code: ErrorCode): FailureClass {
  if (code.startsWith("transient.")) return "transient";
  if (code.startsWith("ambiguous.")) return "ambiguous-side-effect";
  return "permanent";
}
