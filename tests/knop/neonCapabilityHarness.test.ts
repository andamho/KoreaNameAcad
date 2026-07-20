// disposable Neon capability 하네스 **자체** 검증 (Neon 접근 없음).
// ⚠️ 여기 결과는 하네스 가드/계획 로직의 검증이며 **Neon 실측이 아니다**. Neon capability 는 not-run.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parseHarnessEnv, evaluateSafetyGuards, scopedNames, assertRunScoped, buildCleanupPlan,
  buildDryRunPlan, classifyOutcome, maskUrl, hostHashOf, DISPOSABLE_TOKEN, CAPABILITY_CHECKS,
  type HarnessEnv, type CatalogProbe,
} from "../../scripts/neonOrchestrationCapabilityCheck";

const DIRECT = "postgresql://u:p@disposable-branch.example.neon.tech/testdb";
const POOLED = "postgresql://u:p@disposable-branch-pooler.example.neon.tech/testdb";
const PRODLIKE = "postgresql://u:p@prod-main.example.neon.tech/proddb";
const okEnv = (over: Partial<HarnessEnv> = {}): HarnessEnv => ({
  NEON_CHECK_DIRECT_URL: DIRECT, NEON_CHECK_POOLED_URL: POOLED,
  NEON_CHECK_EXPECTED_HOST_HASH: hostHashOf(DIRECT),
  NEON_CHECK_DISPOSABLE_CONFIRM: DISPOSABLE_TOKEN, NEON_CHECK_RUN_ID: "r7a21x", ...over,
});
const cleanProbe = (): CatalogProbe => ({ businessTablesPresent: [], businessRowTotal: 0, productionOrchRolesPresent: [], runScopedLeftovers: [], baseTableCount: 0 });

describe("neon capability 하네스: env 계약·가드(Neon 미접속)", () => {
  test("정상 env → 통과", () => {
    const r = parseHarnessEnv(okEnv());
    assert.ok(r.ok); if (r.ok) { assert.equal(r.config.runId, "r7a21x"); assert.equal(r.config.execute, false, "기본 dry-run"); }
  });

  test("env 누락 → 실행 거부", () => {
    const r = parseHarnessEnv({});
    assert.ok(!r.ok); if (!r.ok) assert.ok(r.refusals.length >= 3, "복수 거부 사유");
  });

  test("disposable confirmation 누락/오타 → 거부", () => {
    for (const t of [undefined, "", "yes", DISPOSABLE_TOKEN.toUpperCase()]) {
      const r = parseHarnessEnv(okEnv({ NEON_CHECK_DISPOSABLE_CONFIRM: t }));
      assert.ok(!r.ok && r.refusals.some((x) => x.includes("토큰")), `token=${t}`);
    }
  });

  test("host hash mismatch → 거부", () => {
    const r = parseHarnessEnv(okEnv({ NEON_CHECK_EXPECTED_HOST_HASH: "b".repeat(64) }));
    assert.ok(!r.ok && r.refusals.some((x) => x.includes("expected pin")));
  });

  test("production host hash 와 일치 → 거부", () => {
    const r = parseHarnessEnv(okEnv({ NEON_CHECK_DIRECT_URL: PRODLIKE, NEON_CHECK_EXPECTED_HOST_HASH: hostHashOf(PRODLIKE), NEON_CHECK_FORBIDDEN_HOST_HASH: hostHashOf(PRODLIKE) }));
    assert.ok(!r.ok && r.refusals.some((x) => x.includes("production host hash")));
  });

  test("direct/pooled URL 동일 → 거부(pooler 검증 불가)", () => {
    const r = parseHarnessEnv(okEnv({ NEON_CHECK_POOLED_URL: DIRECT }));
    assert.ok(!r.ok && r.refusals.some((x) => x.includes("동일")));
  });

  test("run-id 형식 오류 → 거부", () => {
    for (const rid of ["", "AB", "has-dash", "way_too_long_run_identifier"]) {
      const r = parseHarnessEnv(okEnv({ NEON_CHECK_RUN_ID: rid }));
      assert.ok(!r.ok && r.refusals.some((x) => x.includes("RUN_ID")), `rid=${rid}`);
    }
  });

  test("production-like catalog(업무 테이블/행/production role/잔여) → safety guard 거부", () => {
    const p = parseHarnessEnv(okEnv()); assert.ok(p.ok); if (!p.ok) return;
    assert.ok(!evaluateSafetyGuards(p.config, { ...cleanProbe(), businessTablesPresent: ["customers", "calls"] }).ok, "업무 테이블");
    assert.ok(!evaluateSafetyGuards(p.config, { ...cleanProbe(), businessRowTotal: 5 }).ok, "기존 행");
    assert.ok(!evaluateSafetyGuards(p.config, { ...cleanProbe(), productionOrchRolesPresent: ["orchestration_owner"] }).ok, "production role");
    assert.ok(!evaluateSafetyGuards(p.config, { ...cleanProbe(), runScopedLeftovers: ["oc_owner_r7a21x"] }).ok, "이전 run 잔여");
    assert.ok(evaluateSafetyGuards(p.config, cleanProbe()).ok, "빈 disposable → 통과");
  });
});

describe("neon capability 하네스: run-id 스코프·cleanup·마스킹", () => {
  test("모든 object/role 이름에 run-id suffix 강제 · production 이름 미사용", () => {
    const n = scopedNames("r7a21x");
    const all = [n.schema, ...Object.values(n.roles), ...Object.values(n.tables), ...Object.values(n.functions)];
    for (const name of all) {
      assert.ok(name.endsWith("_r7a21x"), `${name} run-id suffix`);
      assert.ok(!name.startsWith("orchestration_"), `${name} 는 production 이름과 달라야`);
    }
    assert.throws(() => assertRunScoped("orchestration_owner", "r7a21x"), /run-id 스코프 위반/);
    assert.throws(() => scopedNames("BAD"), /invalid runId/);
  });

  test("cleanup plan 은 run-id 범위만 (production object 불포함)", () => {
    const n = scopedNames("r7a21x");
    const plan = buildCleanupPlan(n, "r7a21x");
    assert.ok(plan.length >= 1 + 6 + 6, "schema + DROP OWNED + DROP ROLE");
    for (const stmt of plan) assert.ok(/_r7a21x\b/.test(stmt), `run-id 범위: ${stmt}`);
    assert.ok(plan.some((s) => s.includes("DROP OWNED BY")), "DROP OWNED 포함");
    assert.ok(!plan.some((s) => /orchestration_(owner|admin|writer|reader|deployer)\b/.test(s)), "production role 미포함");
    assert.ok(!plan.some((s) => /\b(job_artifacts|orchestration_audit_log|customers|calls)\b/.test(s)), "production table 미포함");
  });

  test("로그 마스킹: URL/secret 원문 미출력", () => {
    const masked = maskUrl(DIRECT);
    assert.ok(/^url#[0-9a-f]{8}…$/.test(masked), masked);
    for (const bad of ["postgresql://", "example.neon.tech", "u:p", "testdb"]) assert.ok(!masked.includes(bad), `마스킹 누락: ${bad}`);
  });

  test("dry-run plan: DB write 0 · 계획만 출력 · URL 원문 없음", () => {
    const p = parseHarnessEnv(okEnv()); assert.ok(p.ok); if (!p.ok) return;
    const lines = buildDryRunPlan(p.config, scopedNames(p.config.runId));
    assert.ok(lines.some((l) => l.includes("DB write 0")), "dry-run 명시");
    assert.ok(lines.some((l) => l.includes("CONFIRM_EXECUTE=true")), "실행 조건 명시");
    for (const l of lines) { assert.ok(!l.includes("postgresql://"), "URL 원문 없음"); assert.ok(!l.includes("example.neon.tech"), "host 원문 없음"); }
  });

  test("결과 분류: guard/cleanup/trigger 상태별", () => {
    const base = { guardsOk: true, checksOk: true, cleanupOk: true, residual: 0, triggersAllEnabled: true };
    assert.equal(classifyOutcome(base), "passed-clean");
    assert.equal(classifyOutcome({ ...base, guardsOk: false }), "aborted-safety-guard");
    assert.equal(classifyOutcome({ ...base, cleanupOk: false }), "failed-cleanup");
    assert.equal(classifyOutcome({ ...base, residual: 2 }), "failed-cleanup");
    assert.equal(classifyOutcome({ ...base, triggersAllEnabled: false }), "failed-cleanup", "disabled trigger 잔존 → 실패");
    assert.equal(classifyOutcome({ ...base, checksOk: false }), "passed-branch-disposal-required");
  });

  test("capability 목록이 문서 동기화용으로 충분히 정의됨", () => {
    assert.ok(CAPABILITY_CHECKS.length >= 35, `${CAPABILITY_CHECKS.length}종`);
    for (const kw of ["ownership: bootstrap A", "pooled: prepared statement", "emergency: session_replication_role"])
      assert.ok(CAPABILITY_CHECKS.some((c) => c.includes(kw.split(": ")[1])), kw);
  });
});
