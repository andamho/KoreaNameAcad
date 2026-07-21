// preflight evidence 보관 — **secret 0 · 저장소 밖 · evidence/key 분리 · 1회 소비 후 폐기**.
//
// 설계:
//  - evidence 파일과 **서명 키 파일을 분리**한다(다른 경로). evidence 만 훔쳐도 위조가 불가능해야 한다.
//  - 두 파일 모두 **저장소 밖 임시 디렉터리**. 내용에 URL·credential 이 없다(`assertNoSecrets` 로 강제).
//  - `consumeEvidence()` 는 읽는 즉시 **두 파일을 모두 삭제**한다 → 성공·실패 무관하게 재사용 불가(replay 방지).
//  - 같은 프로세스 안 재사용은 `evidenceAuth` 의 nonce 소비 기록이 추가로 막는다.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { SignedPreflightEvidence } from "./evidenceAuth";

let memoryEvidence: SignedPreflightEvidence | null = null;
let memoryKey: string | null = null;

const base = () => os.tmpdir();
/** evidence 와 key 는 **서로 다른 파일**에 둔다. */
export const evidencePath = (): string => path.join(base(), "neon-preflight-evidence.json");
export const evidenceKeyPath = (): string => path.join(base(), "neon-preflight-evidence.key");

/** secret 계열 필드·URL 이 섞이지 않았는지 확인(저장 전 마지막 방어선). */
export function assertNoSecrets(e: Record<string, unknown>): void {
  const forbidden = ["url", "password", "user", "host", "database", "credential", "token", "key", "secret"];
  for (const k of Object.keys(e)) {
    const lower = k.toLowerCase();
    if (forbidden.some((f) => lower.includes(f) && !lower.includes("hash"))) {
      throw new Error(`evidence 에 secret 계열 필드 포함 금지: ${k}`);
    }
  }
  for (const v of Object.values(e)) {
    if (typeof v === "string" && /postgres(ql)?:\/\//.test(v)) throw new Error("evidence 에 URL 포함 금지");
  }
}

export interface StoredEvidence { evidence: SignedPreflightEvidence | null; key: string | null }

/** evidence 와 key 를 분리 저장한다. key 는 evidence 파일에 절대 들어가지 않는다. */
export function saveEvidence(evidence: SignedPreflightEvidence, keyHex: string, opts: { persist?: boolean } = {}): void {
  assertNoSecrets(evidence as unknown as Record<string, unknown>);
  memoryEvidence = evidence;
  memoryKey = keyHex;
  if (opts.persist) {
    fs.writeFileSync(evidencePath(), JSON.stringify(evidence), { encoding: "utf-8", mode: 0o600 });
    fs.writeFileSync(evidenceKeyPath(), keyHex, { encoding: "utf-8", mode: 0o600 });
  }
}

/**
 * **1회 소비**: evidence 와 key 를 읽는 즉시 메모리·파일 양쪽에서 제거한다.
 * 검증 성공 여부와 무관하게 삭제하므로 실패 후 재시도(replay)도 불가능하다.
 */
export function consumeEvidence(): StoredEvidence {
  const out: StoredEvidence = { evidence: memoryEvidence, key: memoryKey };
  if (!out.evidence) {
    try { out.evidence = JSON.parse(fs.readFileSync(evidencePath(), "utf-8")) as SignedPreflightEvidence; }
    catch { out.evidence = null; }
  }
  if (!out.key) {
    try { out.key = fs.readFileSync(evidenceKeyPath(), "utf-8").trim(); }
    catch { out.key = null; }
  }
  clearEvidence();
  return out;
}

/** 읽지 않고 존재 여부만 확인(진단용). 소비하지 않는다. */
export function evidenceExists(): { evidence: boolean; key: boolean } {
  return {
    evidence: memoryEvidence !== null || fs.existsSync(evidencePath()),
    key: memoryKey !== null || fs.existsSync(evidenceKeyPath()),
  };
}

export function clearEvidence(): void {
  memoryEvidence = null;
  memoryKey = null;
  for (const p of [evidencePath(), evidenceKeyPath()]) {
    try { fs.unlinkSync(p); } catch { /* 없으면 무시 */ }
  }
}
