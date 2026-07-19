// source_record_ref HMAC + renderer version guard 검증. 테스트 전용 key 만(운영 key 미사용).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { computeSourceRecordRef, ShadowRefKeyError, SHADOW_REF_KEY_ENV } from "../../server/jobQueue/previews/shadowRef";
import { checkRendererVersion, EXPECTED_RENDERER } from "../../server/jobQueue/previews/rendererGuard";

const TEST_KEY = "test-only-hmac-key-0123456789abcdef"; // 테스트 전용(운영 key 아님)
const RAW_ID = "550e8400-e29b-41d4-a716-446655440000"; // raw report_matches.id 모사

describe("shadow source_record_ref HMAC", () => {
  test("같은 domain/id/key/version → 같은 ref(64 lowercase hex)", () => {
    const a = computeSourceRecordRef("internal-report", RAW_ID, { key: TEST_KEY, keyVersion: "v1" });
    const b = computeSourceRecordRef("internal-report", RAW_ID, { key: TEST_KEY, keyVersion: "v1" });
    assert.equal(a.ref, b.ref);
    assert.match(a.ref, /^[0-9a-f]{64}$/);
    assert.equal(a.sourceRefKeyVersion, "v1");
  });
  test("다른 id/domain/keyVersion/key → 다른 ref", () => {
    const base = computeSourceRecordRef("internal-report", RAW_ID, { key: TEST_KEY, keyVersion: "v1" }).ref;
    assert.notEqual(computeSourceRecordRef("internal-report", "other-id", { key: TEST_KEY, keyVersion: "v1" }).ref, base);
    assert.notEqual(computeSourceRecordRef("other-domain", RAW_ID, { key: TEST_KEY, keyVersion: "v1" }).ref, base);
    assert.notEqual(computeSourceRecordRef("internal-report", RAW_ID, { key: TEST_KEY, keyVersion: "v2" }).ref, base);
    assert.notEqual(computeSourceRecordRef("internal-report", RAW_ID, { key: "another-test-key-0123456789abcdef", keyVersion: "v1" }).ref, base);
  });
  test("raw source id 가 ref·오류에 없음", () => {
    const { ref } = computeSourceRecordRef("internal-report", RAW_ID, { key: TEST_KEY });
    assert.ok(!ref.includes(RAW_ID) && !ref.includes("550e8400"));
    try { computeSourceRecordRef("internal-report", RAW_ID, { key: "" }); } catch (e: any) { assert.ok(!String(e.message).includes(RAW_ID)); }
  });
  test("key 미설정 → fail-closed(SHADOW_REF_KEY_MISSING)", () => {
    const saved = process.env[SHADOW_REF_KEY_ENV]; delete process.env[SHADOW_REF_KEY_ENV];
    try {
      assert.throws(() => computeSourceRecordRef("internal-report", RAW_ID), (e: any) => e instanceof ShadowRefKeyError && e.code === "SHADOW_REF_KEY_MISSING");
    } finally { if (saved !== undefined) process.env[SHADOW_REF_KEY_ENV] = saved; }
  });
  test("key 너무 짧음 → SHADOW_REF_KEY_TOO_SHORT", () => {
    assert.throws(() => computeSourceRecordRef("internal-report", RAW_ID, { key: "short" }), (e: any) => e instanceof ShadowRefKeyError && e.code === "SHADOW_REF_KEY_TOO_SHORT");
  });
});

describe("renderer version guard", () => {
  test("실제==기대(pymupdf 1.28.0) → ok", () => {
    assert.deepEqual(checkRendererVersion({ library: EXPECTED_RENDERER.library, libraryVersion: EXPECTED_RENDERER.libraryVersion }), { ok: true });
  });
  test("버전 불일치 → RENDERER_LIBRARY_VERSION_MISMATCH", () => {
    const r = checkRendererVersion({ library: "pymupdf", libraryVersion: "1.99.9" });
    assert.equal(r.ok, false); assert.equal((r as any).code, "RENDERER_LIBRARY_VERSION_MISMATCH");
  });
  test("미가용(null) → RENDERER_LIBRARY_NOT_AVAILABLE", () => {
    const r = checkRendererVersion({ library: "pymupdf", libraryVersion: null });
    assert.equal(r.ok, false); assert.equal((r as any).code, "RENDERER_LIBRARY_NOT_AVAILABLE");
  });
});
