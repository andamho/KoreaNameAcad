// shadow source 참조 = keyed HMAC-SHA256(raw report_matches.id 저장 금지 — ID 공간 좁아 단순 sha256 역추측 가능).
// 비밀키는 코드·DB·manifest 에 두지 않고 환경변수로만. 로그·오류에 key·raw id 노출 금지. fail-closed.
import crypto from "crypto";

export const SHADOW_REF_KEY_ENV = "JOB_SHADOW_REF_HMAC_KEY";
export const SHADOW_REF_KEY_VERSION_DEFAULT = "v1";
const MIN_KEY_LEN = 32;

export type ShadowRefErrorCode = "SHADOW_REF_KEY_MISSING" | "SHADOW_REF_KEY_TOO_SHORT";
export class ShadowRefKeyError extends Error {
  constructor(public code: ShadowRefErrorCode) {
    super(code); // raw id·key 원문 없음
    this.name = "ShadowRefKeyError";
  }
}

function loadKey(explicit?: string): Buffer {
  const raw = explicit ?? process.env[SHADOW_REF_KEY_ENV];
  if (!raw) throw new ShadowRefKeyError("SHADOW_REF_KEY_MISSING");
  if (raw.length < MIN_KEY_LEN) throw new ShadowRefKeyError("SHADOW_REF_KEY_TOO_SHORT");
  return Buffer.from(raw, "utf8");
}

// domain-separated message + key version. 결과 = lowercase 64 hex. raw id 는 반환·로그에 없음.
export function computeSourceRecordRef(
  sourceDomain: string,
  sourceId: string,
  opts: { key?: string; keyVersion?: string } = {},
): { ref: string; sourceRefKeyVersion: string } {
  const key = loadKey(opts.key);
  const keyVersion = opts.keyVersion ?? SHADOW_REF_KEY_VERSION_DEFAULT;
  const message = `internal-report-shadow:${keyVersion}:${sourceDomain}:${sourceId}`;
  const ref = crypto.createHmac("sha256", key).update(message, "utf8").digest("hex");
  return { ref, sourceRefKeyVersion: keyVersion };
}

// rotation 계약: 과거 row UPDATE 아님. 새 key version 은 신규 observation(다른 ref → 다른 observation_hash)으로 처리.
// observation uniqueness 에 source ref 와 key version 모두 반영(observation_hash canonical 에 포함).
