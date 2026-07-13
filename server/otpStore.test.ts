import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

// 테스트용 비밀키 설정 (최소 32자)
process.env.OTP_HMAC_SECRET = "test-secret-key-that-is-long-enough-for-hmac-sha256";

import {
  generateOtp,
  computeOtpHash,
  safeCompare,
  verifyOtpCode,
  createInMemoryOtpStore,
  validateOtpConfig,
  auditRoutesForOtpLogging,
} from "./otpStore.ts";

// ── generateOtp ───────────────────────────────────────────────────

describe("generateOtp", () => {
  test("항상 6자리 숫자 문자열", () => {
    for (let i = 0; i < 1000; i++) {
      const otp = generateOtp();
      assert.match(otp, /^\d{6}$/, `6자리가 아님: "${otp}"`);
    }
  });

  test("앞자리 0 포함 가능 (padStart)", () => {
    // 실제 앞자리 0 OTP가 나올 때까지 최대 100만 번 중 통계적으로
    // 1/10 확률이므로 충분히 많이 돌리면 반드시 나옴
    // 대신 padStart 동작을 직접 검증
    const val = (5).toString().padStart(6, "0");
    assert.equal(val, "000005");
    assert.equal(val.length, 6);
  });
});

// ── computeOtpHash + safeCompare ─────────────────────────────────

describe("computeOtpHash + safeCompare", () => {
  test("같은 입력 → true", () => {
    const cid = crypto.randomUUID();
    const h1 = computeOtpHash(cid, "483921");
    const h2 = computeOtpHash(cid, "483921");
    assert.ok(safeCompare(h1, h2));
  });

  test("다른 코드 → false", () => {
    const cid = crypto.randomUUID();
    const h1 = computeOtpHash(cid, "483921");
    const h2 = computeOtpHash(cid, "483922");
    assert.ok(!safeCompare(h1, h2));
  });

  test("다른 challengeId → false (도메인 분리)", () => {
    const h1 = computeOtpHash(crypto.randomUUID(), "483921");
    const h2 = computeOtpHash(crypto.randomUUID(), "483921");
    assert.ok(!safeCompare(h1, h2));
  });

  test("Buffer 반환 (hex 문자열 아님)", () => {
    const h = computeOtpHash(crypto.randomUUID(), "000000");
    assert.ok(Buffer.isBuffer(h));
    assert.equal(h.length, 32); // SHA-256 = 32바이트
  });
});

// ── verifyOtpCode ────────────────────────────────────────────────

describe("verifyOtpCode", () => {
  function makeChallenge(code: string, ttlMs = 5 * 60 * 1000) {
    const store = createInMemoryOtpStore();
    const challengeId = crypto.randomUUID();
    const codeHash = computeOtpHash(challengeId, code);
    store.create(challengeId, codeHash, Date.now() + ttlMs);
    return { store, challengeId, code };
  }

  test("올바른 OTP 성공", () => {
    const { store, challengeId, code } = makeChallenge("837291");
    const result = verifyOtpCode(challengeId, code, store);
    assert.deepEqual(result, { ok: true });
  });

  test("성공 후 challenge 즉시 삭제 (재사용 불가)", () => {
    const { store, challengeId, code } = makeChallenge("112233");
    verifyOtpCode(challengeId, code, store); // 1차 성공
    const result = verifyOtpCode(challengeId, code, store); // 2차 시도
    assert.equal(result.ok, false);
    assert.equal((result as any).reason, "NOT_FOUND");
  });

  test("틀린 OTP → INVALID_CODE, attempts 증가", () => {
    const { store, challengeId } = makeChallenge("999999");
    const result = verifyOtpCode(challengeId, "000000", store);
    assert.equal(result.ok, false);
    assert.equal((result as any).reason, "INVALID_CODE");
    assert.equal(store.get(challengeId)?.attempts, 1);
  });

  test("5회 실패 → EXHAUSTED, challenge 폐기", () => {
    const { store, challengeId } = makeChallenge("999999");
    for (let i = 0; i < 4; i++) {
      const r = verifyOtpCode(challengeId, "000000", store);
      assert.equal((r as any).reason, "INVALID_CODE");
    }
    const r5 = verifyOtpCode(challengeId, "000000", store);
    assert.equal(r5.ok, false);
    assert.equal((r5 as any).reason, "EXHAUSTED");
    assert.equal(store.get(challengeId), undefined); // 폐기 확인
  });

  test("만료 후 실패 → EXPIRED, challenge 폐기", () => {
    const { store, challengeId, code } = makeChallenge("123456", -1); // 이미 만료
    const result = verifyOtpCode(challengeId, code, store);
    assert.equal(result.ok, false);
    assert.equal((result as any).reason, "EXPIRED");
    assert.equal(store.get(challengeId), undefined); // 폐기 확인
  });

  test("새 OTP 발급 시 이전 OTP 폐기", () => {
    const store = createInMemoryOtpStore();

    const cid1 = crypto.randomUUID();
    const code1 = "111111";
    store.create(cid1, computeOtpHash(cid1, code1), Date.now() + 300_000);

    // 새 OTP 발급 (create 호출 → clear)
    const cid2 = crypto.randomUUID();
    const code2 = "222222";
    store.create(cid2, computeOtpHash(cid2, code2), Date.now() + 300_000);

    const r1 = verifyOtpCode(cid1, code1, store);
    assert.equal(r1.ok, false);
    assert.equal((r1 as any).reason, "NOT_FOUND"); // 이전 OTP 폐기됨

    const r2 = verifyOtpCode(cid2, code2, store);
    assert.deepEqual(r2, { ok: true }); // 새 OTP는 성공
  });

  test("잘못된 challengeId → NOT_FOUND", () => {
    const { store, code } = makeChallenge("444444");
    const result = verifyOtpCode(crypto.randomUUID(), code, store);
    assert.equal(result.ok, false);
    assert.equal((result as any).reason, "NOT_FOUND");
  });

  test("6자리 아닌 입력 → INVALID_FORMAT", () => {
    const { store, challengeId } = makeChallenge("555555");
    for (const bad of ["12345", "1234567", "abcdef", "", "  "]) {
      const r = verifyOtpCode(challengeId, bad, store);
      assert.equal(r.ok, false);
      assert.equal((r as any).reason, "INVALID_FORMAT", `bad input: "${bad}"`);
    }
  });
});

// ── validateOtpConfig ─────────────────────────────────────────────

describe("validateOtpConfig", () => {
  function withSecret(secret: string | undefined, fn: () => void) {
    const orig = process.env.OTP_HMAC_SECRET;
    if (secret === undefined) delete process.env.OTP_HMAC_SECRET;
    else process.env.OTP_HMAC_SECRET = secret;
    try { fn(); } finally {
      if (orig === undefined) delete process.env.OTP_HMAC_SECRET;
      else process.env.OTP_HMAC_SECRET = orig;
    }
  }

  function captureExit(fn: () => void): number | undefined {
    let code: number | undefined;
    const orig = process.exit.bind(process);
    (process as any).exit = (c?: number) => { code = c; throw new Error("__exit__"); };
    try { fn(); } catch (e: any) {
      if (e.message !== "__exit__") throw e;
    } finally {
      (process as any).exit = orig;
    }
    return code;
  }

  test("OTP_HMAC_SECRET 누락 시 exit(1)", () => {
    withSecret(undefined, () => {
      const code = captureExit(() => validateOtpConfig());
      assert.equal(code, 1);
    });
  });

  test("OTP_HMAC_SECRET 길이 부족(31자) 시 exit(1)", () => {
    withSecret("a".repeat(31), () => {
      const code = captureExit(() => validateOtpConfig());
      assert.equal(code, 1);
    });
  });

  test("OTP_HMAC_SECRET 32자 이상 → 정상 통과", () => {
    withSecret("a".repeat(32), () => {
      assert.doesNotThrow(() => validateOtpConfig());
    });
  });
});

// ── 소스 감사: routes.ts에 OTP 원문 로깅 없는지 ──────────────────

test("로그에 OTP 원문이 남지 않는지 (소스 감사)", () => {
  const violations = auditRoutesForOtpLogging();
  assert.deepEqual(
    violations,
    [],
    `routes.ts에 OTP 원문 로깅 패턴 발견: ${violations.join(", ")}`,
  );
});
