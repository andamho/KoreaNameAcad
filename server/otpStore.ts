/**
 * OTP 저장소 인터페이스 + 인메모리 구현.
 * 향후 인스턴스가 여러 개가 되면 Redis/DB 구현체로 교체하고
 * createOtpStore() 반환값만 바꾸면 됩니다.
 */
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import path from "node:path";

const MIN_SECRET_CHARS = 32;
const MAX_ATTEMPTS = 5;
const OTP_TTL_MS = 5 * 60 * 1000; // 5분

// ── 타입 ─────────────────────────────────────────────────────────

export interface OtpChallenge {
  challengeId: string;
  codeHash: Buffer;  // 원문 아닌 HMAC-SHA256 digest
  expiresAt: number;
  attempts: number;
}

export interface OtpStore {
  /** 기존 challenge 전체 폐기 후 새 challenge 저장 */
  create(challengeId: string, codeHash: Buffer, expiresAt: number): void;
  get(challengeId: string): OtpChallenge | undefined;
  /** attempts 증가. MAX_ATTEMPTS 도달 시 자동 삭제하고 true 반환 */
  incrementAttempts(challengeId: string): boolean;
  delete(challengeId: string): void;
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "NOT_FOUND" | "EXPIRED" | "INVALID_FORMAT" | "INVALID_CODE" | "EXHAUSTED" };

// ── 인메모리 구현 (단일 Railway 인스턴스 전제) ────────────────────

class InMemoryOtpStore implements OtpStore {
  private readonly map = new Map<string, OtpChallenge>();

  create(challengeId: string, codeHash: Buffer, expiresAt: number): void {
    this.map.clear(); // 기존 challenge 전체 폐기
    this.map.set(challengeId, { challengeId, codeHash, expiresAt, attempts: 0 });
  }

  get(challengeId: string): OtpChallenge | undefined {
    return this.map.get(challengeId);
  }

  incrementAttempts(challengeId: string): boolean {
    const entry = this.map.get(challengeId);
    if (!entry) return true;
    entry.attempts += 1;
    if (entry.attempts >= MAX_ATTEMPTS) {
      this.map.delete(challengeId);
      return true;
    }
    return false;
  }

  delete(challengeId: string): void {
    this.map.delete(challengeId);
  }
}

// ── 공개 싱글턴 + 테스트용 팩토리 ──────────────────────────────────

export const otpStore: OtpStore = new InMemoryOtpStore();

/** 테스트 격리용: 독립된 인메모리 저장소 생성 */
export function createInMemoryOtpStore(): OtpStore {
  return new InMemoryOtpStore();
}

// ── OTP 생성 ─────────────────────────────────────────────────────

/** 암호학적 난수 6자리 (000000~999999) */
export function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

// ── HMAC 해시 ────────────────────────────────────────────────────

function getHmacSecret(): Buffer {
  const secret = process.env.OTP_HMAC_SECRET;
  if (!secret || secret.length < MIN_SECRET_CHARS) {
    throw new Error("[OTP] OTP_HMAC_SECRET is missing or too short");
  }
  return Buffer.from(secret, "utf8");
}

/** HMAC-SHA256(secret, challengeId:code) — Buffer 반환 */
export function computeOtpHash(challengeId: string, code: string): Buffer {
  const secret = getHmacSecret();
  return crypto.createHmac("sha256", secret).update(`${challengeId}:${code}`).digest();
}

/** 타이밍 공격 방지 비교 */
export function safeCompare(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ── 검증 로직 (라우트와 분리해 단독 테스트 가능) ─────────────────

/**
 * OTP 검증 순수 함수.
 * 성공 시 store에서 challenge 삭제.
 * 실패 시 attempts 증가 또는 challenge 삭제.
 */
export function verifyOtpCode(
  challengeId: string,
  inputCode: string,
  store: OtpStore = otpStore,
): VerifyResult {
  if (!challengeId || !/^\d{6}$/.test(inputCode?.trim() ?? "")) {
    return { ok: false, reason: "INVALID_FORMAT" };
  }

  const entry = store.get(challengeId);
  if (!entry) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  if (Date.now() > entry.expiresAt) {
    store.delete(challengeId);
    return { ok: false, reason: "EXPIRED" };
  }

  const inputHash = computeOtpHash(challengeId, inputCode.trim());
  if (!safeCompare(inputHash, entry.codeHash)) {
    const exhausted = store.incrementAttempts(challengeId);
    return { ok: false, reason: exhausted ? "EXHAUSTED" : "INVALID_CODE" };
  }

  store.delete(challengeId); // 성공 즉시 폐기
  return { ok: true };
}

// ── 서버 시작 검증 ────────────────────────────────────────────────

/** 서버 시작 단계에서 호출. 비밀키 없으면 즉시 process.exit(1) */
export function validateOtpConfig(): void {
  const secret = process.env.OTP_HMAC_SECRET;
  if (!secret || secret.length < MIN_SECRET_CHARS) {
    console.error(
      `[FATAL] OTP_HMAC_SECRET must be set and at least ${MIN_SECRET_CHARS} characters.\n` +
      `  Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    );
    process.exit(1);
  }
}

// ── 소스 감사 유틸 (테스트 전용) ─────────────────────────────────

/** routes.ts 소스를 읽어 OTP 원문 로깅 패턴 검사 */
export function auditRoutesForOtpLogging(): string[] {
  const routesPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "routes.ts",
  );
  const source = readFileSync(routesPath, "utf8");
  const violations: string[] = [];
  const badPatterns: Array<[RegExp, string]> = [
    [/console\.(log|info|debug)\s*\([^)]*\bcode\b/g, "console.*code"],
    [/console\.(log|info|debug)\s*\([^)]*otp/gi, "console.*otp"],
  ];
  for (const [pattern, label] of badPatterns) {
    if (pattern.test(source)) violations.push(label);
  }
  return violations;
}

export { OTP_TTL_MS };
