// preflight evidence 보관 — **secret 0 · repository 밖 · 프로세스 내 우선**.
//
// 설계:
//  - 기본은 **in-memory**(같은 프로세스에서 preflight → execute 를 이어 하는 경우).
//  - 프로세스가 분리되는 실제 운영 흐름을 위해, **repository 밖 임시 디렉터리**의 파일 저장을 허용한다.
//    저장 내용은 run-id·hash·status·timestamp·integrity 뿐이며 **URL·credential 이 포함되지 않는다**.
//  - integrity(sha256)로 변조를 탐지하고, 만료(EVIDENCE_MAX_AGE_MS)로 재사용을 막는다.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PreflightEvidence } from "./selectOnlyPreflight";

let memory: PreflightEvidence | null = null;

/** repository 밖 임시 경로. 저장소에 남기지 않는다. */
export const evidencePath = (): string => path.join(os.tmpdir(), "neon-preflight-evidence.json");

/** evidence 에 secret 계열 키가 섞이지 않았는지 확인(저장 전 마지막 방어선). */
export function assertNoSecrets(e: PreflightEvidence): void {
  const forbidden = ["url", "password", "user", "host", "database", "credential", "token"];
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

export function saveEvidence(e: PreflightEvidence, opts: { persist?: boolean } = {}): void {
  assertNoSecrets(e);
  memory = e;
  if (opts.persist) fs.writeFileSync(evidencePath(), JSON.stringify(e), { encoding: "utf-8" });
}

export function loadEvidence(): PreflightEvidence | null {
  if (memory) return memory;
  try {
    const raw = fs.readFileSync(evidencePath(), "utf-8");
    const parsed = JSON.parse(raw) as PreflightEvidence;
    assertNoSecrets(parsed);
    return parsed;
  } catch { return null; }
}

export function clearEvidence(): void {
  memory = null;
  try { fs.unlinkSync(evidencePath()); } catch { /* 없으면 무시 */ }
}
