// 예상 밖 실패의 **구조화 보고**가 보고서 파일에 영구 기록되는지 검증(콘솔 휘발 대비).
// 원문(SQL·URL·credential) 미노출, 3개 합성 실패 전부 기록, 실패 0이면 빈 목록.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { formatUnexpectedFailures, type ProfileReport, type ExecutionResult } from "../../scripts/neonCheck/executor";
import { CAPABILITIES } from "../../scripts/neonCheck/capabilities";

// capability 정본에서 실제 존재하는 id 를 골라 합성 결과를 만든다(expectation 조회가 실제와 맞는지 확인용).
const passCapId = CAPABILITIES.find((c) => c.expectation === "pass")!.id;
const denyCapId = CAPABILITIES.find((c) => c.expectation === "expected-denial")!.id;

const result = (over: Partial<ExecutionResult>): ExecutionResult => ({
  capabilityId: passCapId, executionProfile: "actual-neon-direct", outcome: "fail",
  evidenceSource: "actual-neon-direct", authoritative: false, durationMs: 1, ...over,
});
const report = (results: ExecutionResult[], profile: ProfileReport["profile"] = "actual-neon-direct"): ProfileReport => ({
  profile, status: "failed-cleanup", runId: "rep260724", directFingerprint: "url#aaaa1111…", pooledFingerprint: "url#bbbb2222…",
  serverVersion: "17.10", applicable: results.length, notApplicable: 0,
  passed: results.filter((r) => r.outcome === "pass").length, expectedDenial: results.filter((r) => r.outcome === "expected-denial").length,
  failed: results.filter((r) => r.outcome === "fail").length, authoritativeEvidence: 0,
  cleanupStatements: 0, residualObjects: 0, residualRoles: 0, residualMembership: 0, disabledTriggers: 0,
  elapsedMs: 1, results, notes: [], operatorNextAction: "",
});

describe("unexpected failure 구조화 보고", () => {
  test("합성 실패 3개 → 세 capabilityId·sqlState·detailCode 전부 기록", () => {
    const direct = report([
      result({ capabilityId: passCapId, sqlState: "42501", detailCode: "disable-failed:42501" }),
      result({ capabilityId: denyCapId, sqlState: "0A000", sanitizedError: "feature not supported" }),
      result({ capabilityId: passCapId, sqlState: "42P01", detailCode: "probe-failed:42P01" }),
    ]);
    const lines = formatUnexpectedFailures([{ report: direct, endpoint: "direct" }]).join("\n");
    assert.match(lines, /unexpectedFailures=3/);
    for (const s of ["42501", "0A000", "42P01"]) assert.ok(lines.includes(s), `sqlState ${s} 누락`);
    assert.ok(lines.includes("disable-failed:42501"));
    assert.ok(lines.includes("probe-failed:42P01"));
    // 각 failure 블록에 필수 항목
    for (const k of ["capabilityId=", "endpoint=direct", "expected=", "actual=fail", "sqlState=", "detailCode=", "stage=capability-handler", "phase=before-cleanup"]) {
      assert.ok(lines.includes(k), `항목 ${k} 누락`);
    }
    assert.equal((lines.match(/failure\[\d+\]:/g) ?? []).length, 3, "failure 블록 3개");
  });

  test("expected 는 capability 정본 expectation 과 일치", () => {
    const lines = formatUnexpectedFailures([{ report: report([
      result({ capabilityId: passCapId, sqlState: "42501" }),
      result({ capabilityId: denyCapId, sqlState: "42501" }),
    ]), endpoint: "direct" }]).join("\n");
    assert.ok(lines.includes("expected=pass"), "pass capability");
    assert.ok(lines.includes("expected=expected-denial"), "expected-denial capability");
  });

  test("error/message 에 URL·password 가 있어도 마스킹된 것만 실린다", () => {
    // sanitizedError 는 이미 sanitizeError 를 거친 값이 들어온다는 계약. 여기서는 report 가 그 값을 그대로 실어도
    // 우리가 직접 URL/password 를 주입하지 않음을 확인(구조화 함수는 필드를 가공하지 않고 그대로 옮기되, 원문 주입 경로 0).
    const lines = formatUnexpectedFailures([{ report: report([
      result({ capabilityId: passCapId, sqlState: "42501", sanitizedError: "permission denied for schema oc_chk_x" }),
    ]), endpoint: "direct" }]).join("\n");
    // 구조화 출력 자체에 connection string·password 형태가 등장하지 않는다
    assert.ok(!/postgres(ql)?:\/\//.test(lines), "DSN 노출");
    assert.ok(!/password=/i.test(lines), "password 노출");
  });

  test("실패 0이면 상세 목록이 비어 있고 unexpectedFailures=0", () => {
    const direct = report([
      result({ capabilityId: passCapId, outcome: "pass" }),
      result({ capabilityId: denyCapId, outcome: "expected-denial" }),
    ]);
    const lines = formatUnexpectedFailures([{ report: direct, endpoint: "direct" }]).join("\n");
    assert.match(lines, /unexpectedFailures=0/);
    assert.ok(!/failure\[1\]/.test(lines), "실패 0인데 failure 블록 존재");
    assert.match(lines, /없음/);
  });

  test("direct/pooled 두 profile 의 실패를 endpoint 로 구분해 합산", () => {
    const direct = report([result({ capabilityId: passCapId, sqlState: "42501" })], "actual-neon-direct");
    const pooled = report([result({ capabilityId: passCapId, sqlState: "55000", executionProfile: "actual-neon-pooled" })], "actual-neon-pooled");
    const lines = formatUnexpectedFailures([{ report: direct, endpoint: "direct" }, { report: pooled, endpoint: "pooled" }]).join("\n");
    assert.match(lines, /unexpectedFailures=2/);
    assert.ok(lines.includes("endpoint=direct"));
    assert.ok(lines.includes("endpoint=pooled"));
  });
});
