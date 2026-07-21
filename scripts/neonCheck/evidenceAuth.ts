// preflight evidence **인증**(위조·replay 방지).
//
// ⚠️ 이전 판의 결함: `integrity = sha256(evidence body)` 는 **누구나 재계산할 수 있다.**
//    body 를 원하는 값으로 바꾸고 sha256 을 다시 계산하면 그대로 통과한다 = **위조 가능**.
//    → 비밀키 기반 **HMAC-SHA256** + **일회성 nonce** + **만료** + **소비 즉시 폐기** 로 교체한다.
//
// 설계:
//  - 키는 실행마다 CSPRNG 로 새로 만들고 **evidence 와 분리 저장**한다(다른 파일, 저장소 밖 temp).
//  - evidence 는 schema version·run-id·expected 2·forbidden 2·target identity·status·issuedAt·expiresAt·nonce 를
//    **전부 MAC 에 binding** 한다. 하나라도 바뀌면 MAC 이 깨진다.
//  - 검증은 **timing-safe** 비교. 성공·실패 무관하게 evidence/key 를 **소비(삭제)** 한다 → replay 불가.
//  - `integrity` 필드를 가진 **legacy(unsigned/SHA-256) evidence 는 무조건 거부**한다.
import crypto from "node:crypto";
import type { HarnessConfig } from "./guards";
import type { PreflightStatus } from "./selectOnlyPreflight";

/** MAC 대상 필드 구성이 바뀌면 반드시 올린다. 다른 버전의 evidence 는 거부된다. */
export const EVIDENCE_SCHEMA_VERSION = "preflight-evidence/2-hmac";
/** 만료 상한 — 요구사항상 30분 이하. */
export const EVIDENCE_MAX_AGE_MS = 15 * 60 * 1000;
const KEY_BYTES = 32;
const NONCE_BYTES = 16;

export interface SignedPreflightEvidence {
  schemaVersion: string;
  runId: string;
  expectedDirectHostHash: string;
  expectedPooledHostHash: string;
  forbiddenDirectHostHash: string;
  forbiddenPooledHostHash: string;
  targetIdentityFingerprint: string;
  status: PreflightStatus;
  issuedAtMs: number;
  expiresAtMs: number;
  nonce: string;
  /** HMAC-SHA256(key, canonicalBody) — hex */
  mac: string;
}

export const generateEvidenceKey = (): string => crypto.randomBytes(KEY_BYTES).toString("hex");
export const generateNonce = (): string => crypto.randomBytes(NONCE_BYTES).toString("hex");

/** MAC 대상 정규화 문자열. 필드 순서를 코드로 고정해 직렬화 차이로 MAC 이 흔들리지 않게 한다. */
export function canonicalBody(e: Omit<SignedPreflightEvidence, "mac">): string {
  return [
    e.schemaVersion, e.runId,
    e.expectedDirectHostHash, e.expectedPooledHostHash,
    e.forbiddenDirectHostHash, e.forbiddenPooledHostHash,
    e.targetIdentityFingerprint, e.status,
    String(e.issuedAtMs), String(e.expiresAtMs), e.nonce,
  ].join("␟"); // unit separator — 필드 값에 나타날 수 없는 문자
}

const macOf = (keyHex: string, body: string): string =>
  crypto.createHmac("sha256", Buffer.from(keyHex, "hex")).update(body, "utf8").digest("hex");

/** 길이가 달라도 예외 없이 false 를 돌려주는 timing-safe 비교. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex"), bb = Buffer.from(b, "hex");
  if (ab.length === 0 || ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export interface IssueOptions { nowMs: number; ttlMs?: number; nonce?: string }

export function issueSignedEvidence(
  cfg: HarnessConfig, status: PreflightStatus, targetIdentityFingerprint: string, keyHex: string, opts: IssueOptions,
): SignedPreflightEvidence {
  const ttl = Math.min(opts.ttlMs ?? EVIDENCE_MAX_AGE_MS, EVIDENCE_MAX_AGE_MS);
  const body: Omit<SignedPreflightEvidence, "mac"> = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    runId: cfg.runId,
    expectedDirectHostHash: cfg.expectedDirectHostHash,
    expectedPooledHostHash: cfg.expectedPooledHostHash,
    forbiddenDirectHostHash: cfg.forbiddenHostHashes.direct,
    forbiddenPooledHostHash: cfg.forbiddenHostHashes.pooled,
    targetIdentityFingerprint,
    status,
    issuedAtMs: opts.nowMs,
    expiresAtMs: opts.nowMs + ttl,
    nonce: opts.nonce ?? generateNonce(),
  };
  return { ...body, mac: macOf(keyHex, canonicalBody(body)) };
}

/** 같은 프로세스 안에서의 재사용까지 막는 소비 기록(파일 삭제와 이중). */
const consumedNonces = new Set<string>();
export const markNonceConsumed = (nonce: string) => { consumedNonces.add(nonce); };
export const isNonceConsumed = (nonce: string) => consumedNonces.has(nonce);
export const resetConsumedNonces = () => { consumedNonces.clear(); };

const HEX64 = /^[0-9a-f]{64}$/;

/**
 * evidence 인증. **DB adapter 를 만들기 전에** 호출되어야 한다.
 * 실패 사유는 여러 개를 모아 반환하되, secret(키·MAC 원문)은 절대 포함하지 않는다.
 */
export function verifySignedEvidence(
  cfg: HarnessConfig, evidence: unknown, keyHex: string | null, nowMs: number,
): { ok: true; evidence: SignedPreflightEvidence } | { ok: false; refusals: string[] } {
  const r: string[] = [];
  if (!evidence || typeof evidence !== "object") return { ok: false, refusals: ["preflight evidence 없음 → execute 진입 불가"] };
  const e = evidence as Record<string, unknown>;

  // 0. legacy(unsigned / 단순 sha256) 거부 — 호환성 유지하지 않는다.
  if ("integrity" in e || !("mac" in e)) {
    return { ok: false, refusals: ["legacy evidence(단순 sha256 `integrity`) 는 위조 가능하여 거부합니다 → HMAC 서명 evidence 재발급 필요"] };
  }
  if (e.schemaVersion !== EVIDENCE_SCHEMA_VERSION) {
    return { ok: false, refusals: [`evidence schema version 불일치(기대 ${EVIDENCE_SCHEMA_VERSION}) → 거부`] };
  }
  if (!keyHex || !/^[0-9a-f]{64}$/.test(keyHex)) {
    return { ok: false, refusals: ["evidence 서명 키 없음/형식오류 → 거부(키는 evidence 와 분리 보관되며 1회 사용 후 폐기됩니다)"] };
  }

  // 1. 형태 검사 — MAC 계산 전에 타입을 고정한다.
  const strFields = ["runId", "expectedDirectHostHash", "expectedPooledHostHash", "forbiddenDirectHostHash",
    "forbiddenPooledHostHash", "targetIdentityFingerprint", "status", "nonce", "mac"] as const;
  for (const f of strFields) if (typeof e[f] !== "string") r.push(`evidence 필드 형식 오류: ${f}`);
  for (const f of ["issuedAtMs", "expiresAtMs"] as const) if (typeof e[f] !== "number" || !Number.isFinite(e[f] as number)) r.push(`evidence 필드 형식 오류: ${f}`);
  if (r.length) return { ok: false, refusals: r };

  const ev = evidence as SignedPreflightEvidence;
  if (!HEX64.test(ev.mac)) return { ok: false, refusals: ["evidence MAC 형식 오류"] };

  // 2. MAC 검증(timing-safe) — 하나라도 변조되면 여기서 걸린다.
  if (!timingSafeEqualHex(ev.mac, macOf(keyHex, canonicalBody(ev)))) {
    return { ok: false, refusals: ["evidence 서명 검증 실패(변조 또는 다른 run 의 키)"] };
  }

  // 3. binding 대조 — MAC 이 맞아도 현재 실행 대상과 다르면 거부.
  if (ev.status !== "preflight-passed") r.push(`preflight status 가 passed 아님(${ev.status})`);
  if (ev.runId !== cfg.runId) r.push("run-id 불일치");
  if (ev.expectedDirectHostHash !== cfg.expectedDirectHostHash) r.push("expected direct host hash 불일치");
  if (ev.expectedPooledHostHash !== cfg.expectedPooledHostHash) r.push("expected pooled host hash 불일치");
  if (ev.forbiddenDirectHostHash !== cfg.forbiddenHostHashes.direct) r.push("forbidden direct host hash 불일치");
  if (ev.forbiddenPooledHostHash !== cfg.forbiddenHostHashes.pooled) r.push("forbidden pooled host hash 불일치");
  if (!HEX64.test(ev.targetIdentityFingerprint)) r.push("target identity fingerprint 형식 오류");

  // 4. 만료 · 미래 발급 · TTL 상한
  if (nowMs < ev.issuedAtMs) r.push("evidence 발급 시각이 미래");
  if (nowMs >= ev.expiresAtMs) r.push("evidence 만료");
  if (ev.expiresAtMs - ev.issuedAtMs > EVIDENCE_MAX_AGE_MS) r.push("evidence TTL 이 허용 상한 초과");

  // 5. replay
  if (!/^[0-9a-f]{32}$/.test(ev.nonce)) r.push("evidence nonce 형식 오류");
  else if (isNonceConsumed(ev.nonce)) r.push("evidence 재사용(nonce 이미 소비됨) → replay 거부");

  if (r.length) return { ok: false, refusals: r };
  markNonceConsumed(ev.nonce);
  return { ok: true, evidence: ev };
}
