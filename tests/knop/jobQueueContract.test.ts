// 영속 작업 큐 중앙 타입·validator 단일 소스 검증(shared/jobQueueContract.ts). 순수 함수, DB 미접촉.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  JOB_STATUSES, EXECUTION_STATUSES, EXECUTION_REASONS, VERIFICATION_STATUSES,
  isJobStatus, isExecutionStatus, isExecutionReason, isVerificationStatus,
  jobSucceededAllowed, isValidPriority, PRIORITY, isSha256Hex, isValidErrorSummary,
  ERROR_SUMMARY_MAX, SNAPSHOT_SCHEMA_VERSION, assertNoEmptyString,
} from "../../shared/jobQueueContract";

describe("jobQueueContract 상태 값", () => {
  test("JobStatus 7종", () => {
    assert.deepEqual([...JOB_STATUSES], ["queued", "running", "succeeded", "failed", "cancelled", "blocked", "needs_review"]);
    assert.ok(isJobStatus("blocked") && isJobStatus("needs_review") && !isJobStatus("bogus"));
  });
  test("ExecutionStatus 7종", () => {
    assert.deepEqual([...EXECUTION_STATUSES], ["claimed", "running", "succeeded", "failed", "expired", "cancelled", "verification_failed"]);
    assert.ok(isExecutionStatus("verification_failed") && !isExecutionStatus("bogus"));
  });
  test("ExecutionReason / VerificationStatus", () => {
    assert.deepEqual([...EXECUTION_REASONS], ["normal", "retry", "forced-rerun"]);
    assert.deepEqual([...VERIFICATION_STATUSES], ["pending", "passed", "failed", "skipped"]);
    assert.ok(isExecutionReason("forced-rerun") && !isExecutionReason("x"));
    assert.ok(isVerificationStatus("skipped") && !isVerificationStatus("x"));
  });
});

describe("jobQueueContract 정책", () => {
  test("succeeded 허용: 검증 필수는 passed만, 비필수는 skipped 허용", () => {
    assert.equal(jobSucceededAllowed("passed", true), true);
    assert.equal(jobSucceededAllowed("skipped", true), false);   // 필수인데 skipped → 불허
    assert.equal(jobSucceededAllowed("skipped", false), true);   // 비필수 → 허용
    assert.equal(jobSucceededAllowed("failed", false), false);
    assert.equal(jobSucceededAllowed("pending", true), false);
  });
  test("priority 범위(0–1000, 기본 100)", () => {
    assert.equal(PRIORITY.default, 100);
    assert.ok(isValidPriority(0) && isValidPriority(1000) && isValidPriority(100));
    assert.ok(!isValidPriority(-1) && !isValidPriority(1001) && !isValidPriority(1.5) && !isValidPriority("100" as any));
  });
  test("SHA-256 lowercase hex validator", () => {
    assert.ok(isSha256Hex("a".repeat(64)) && isSha256Hex("0123456789abcdef".repeat(4)));
    assert.ok(!isSha256Hex("A".repeat(64)) && !isSha256Hex("a".repeat(63)) && !isSha256Hex("g".repeat(64)) && !isSha256Hex(123 as any));
  });
  test("error_summary 최대 길이·null 허용", () => {
    assert.equal(ERROR_SUMMARY_MAX, 1000);
    assert.ok(isValidErrorSummary(null) && isValidErrorSummary("x".repeat(1000)) && !isValidErrorSummary("x".repeat(1001)));
  });
  test("snapshot schemaVersion 상수", () => { assert.equal(SNAPSHOT_SCHEMA_VERSION, 1); });
  test("snapshot 빈문자열 금지(미사용은 null)", () => {
    assert.doesNotThrow(() => assertNoEmptyString({ a: null, b: "x", c: 1 }));
    assert.throws(() => assertNoEmptyString({ a: "" }));
  });
});
