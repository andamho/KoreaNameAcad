// lease 토큰 — raw 토큰은 claim 반환값(호출자 메모리)에만 존재. DB 에는 sha256 hash 만 저장.
// 로그·manifest·오류 메시지에도 raw 토큰 금지. 재발급 = 새 execution(기존 token 교체 안 함).
import crypto from "crypto";
import { sha256Hex } from "./idempotency";

export function generateLeaseToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("hex"); // 256-bit
  return { raw, hash: sha256Hex(raw) };
}

// heartbeat/complete 시 constant-time 비교 권장(타이밍 누출 방지).
export function leaseTokenMatches(rawCandidate: string, storedHash: string): boolean {
  const cand = Buffer.from(sha256Hex(rawCandidate), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return cand.length === stored.length && crypto.timingSafeEqual(cand, stored);
}
