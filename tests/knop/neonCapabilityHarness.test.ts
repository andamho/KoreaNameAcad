// disposable Neon capability 하네스 Phase 2 검증. **Neon 접속 0.**
// ⚠️ 여기 결과는 pglite/pooled-mock evidence 이며 **actual Neon 실측이 아니다**(actual-neon-* = not-run, neon-full = unverified).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseHarnessEnv, evaluatePreflight, DISPOSABLE_TOKEN, type HarnessEnv, type CatalogProbe, type HarnessConfig } from "../../scripts/neonCheck/guards";
import { scopedNames, assertRunScoped, qi, allNames } from "../../scripts/neonCheck/identifiers";
import { buildCleanupPlan, assertCleanupScope, verifyResidual } from "../../scripts/neonCheck/cleanup";
import { generateSecret, sanitizeText, sanitizeError, maskUrl, hostHashOf, MemorySecret } from "../../scripts/neonCheck/secrets";
import {
  CAPABILITIES, CAPABILITY_IDS, countFor, applicableFor, authoritativeFor, validateCatalog,
  EXECUTION_PROFILES, AGGREGATE_PROFILE, findCapability,
} from "../../scripts/neonCheck/capabilities";
import { wrapClientAsDirect, createPooledMockAdapter, type DbAdapter } from "../../scripts/neonCheck/adapters";
import { DIRECT_HANDLERS, POOLED_HANDLERS } from "../../scripts/neonCheck/handlers";
import {
  executeDirectProfile, executePooledProfile, rollupNeonFull, assertNoNeonPromotion,
  classifyProfile, formatProfileReport, formatNeonFull, injectAt, noInjection, INJECTION_POINTS, failFirstExec,
  type ExecutionResult,
} from "../../scripts/neonCheck/executor";
import { buildDryRunPlan } from "../../scripts/neonOrchestrationCapabilityCheck";

const here = path.dirname(fileURLToPath(import.meta.url));
const CLI_SRC = readFileSync(path.join(here, "..", "..", "scripts", "neonOrchestrationCapabilityCheck.ts"), "utf-8");

const DIRECT = "postgresql://u:p@disposable-branch.example.neon.tech/testdb";
const POOLED = "postgresql://u:p@disposable-branch-pooler.example.neon.tech/testdb";
const RUN = "phase2aa";
const okEnv = (over: Partial<HarnessEnv> = {}): HarnessEnv => ({
  NEON_CHECK_DIRECT_URL: DIRECT, NEON_CHECK_POOLED_URL: POOLED,
  NEON_CHECK_EXPECTED_HOST_HASH: hostHashOf(DIRECT),
  NEON_CHECK_DISPOSABLE_CONFIRM: DISPOSABLE_TOKEN, NEON_CHECK_RUN_ID: RUN, ...over,
});
const cfgOf = (over: Partial<HarnessEnv> = {}): HarnessConfig => {
  const p = parseHarnessEnv(okEnv(over)); if (!p.ok) throw new Error("env"); return p.config;
};
const cleanProbe = (o: Partial<CatalogProbe> = {}): CatalogProbe => ({
  serverVersion: "17.10", publicUserTableCount: 0, businessTableCount: 0, businessRowTotal: 0,
  productionMigrationHistory: false, productionOrchRoleCount: 0, runScopedLeftoverCount: 0,
  unexpectedSchemaCount: 0, endpointDistinguishable: true, canCreateRole: true, ...o,
});
async function pglite(): Promise<{ db: DbAdapter; close: () => Promise<void> }> {
  const { PGlite } = await import("@electric-sql/pglite");
  const p = new PGlite();
  return { db: wrapClientAsDirect({ query: (sql, params) => p.query(sql, params as any[]) as any }), close: () => p.close() };
}

describe("Phase2: capability 정본 · profile 모델", () => {
  test("무결성: 중복 0 · order deterministic · metadata 누락 0 · requiredForNeonFull 전부 true", () => {
    const v = validateCatalog();
    assert.ok(v.ok, v.problems.join(" | "));
    assert.equal(new Set(CAPABILITY_IDS).size, CAPABILITIES.length);
    assert.deepEqual(CAPABILITIES.map((c) => c.id), CAPABILITY_IDS, "order deterministic");
    for (const c of CAPABILITIES) {
      assert.ok(c.applicableProfiles.length > 0, c.id);
      assert.ok(c.authoritativeProfile, c.id);
      assert.ok(c.expectation, c.id);
      assert.equal(c.requiredForNeonFull, true, c.id);
      assert.equal(c.mandatory, true, c.id);
    }
  });

  test("handler missing 0 — 카탈로그 전부 handler 연결", () => {
    const missing: string[] = [];
    for (const c of CAPABILITIES) {
      const isPooled = c.applicableProfiles.includes("pooled-mock");
      const h = isPooled ? POOLED_HANDLERS[c.id] : DIRECT_HANDLERS[c.id];
      if (!h) missing.push(c.id);
    }
    assert.deepEqual(missing, [], `handler 누락: ${missing.join(",")}`);
  });

  test("profile별 applicable/authoritative 개수(정본에서 산출)", () => {
    const counts = Object.fromEntries(EXECUTION_PROFILES.map((p) => [p, countFor(p)]));
    // 사전 고정하지 않고 정본에서 산출 — 관계만 검증
    assert.equal(counts["actual-neon-direct"] + counts["actual-neon-pooled"], CAPABILITIES.length, "neon 계열 합 = 전체");
    assert.equal(counts["embedded-direct"], counts["actual-neon-direct"], "embedded 는 direct 계열 전부 판정");
    assert.equal(counts["pooled-mock"], counts["actual-neon-pooled"], "pooled-mock 은 pooled 계열 전부 판정");
    assert.ok(counts["pglite"] < counts["embedded-direct"], "PGlite 는 embedded 의 진부분집합");
    assert.equal(authoritativeFor("pglite").length, 0, "PGlite 는 authoritative 아님");
    assert.equal(authoritativeFor("embedded-direct").length + authoritativeFor("actual-neon-pooled").length, CAPABILITIES.length);
  });

  test("PGlite 비적용 = 실제 LOGIN/escalation/TRUNCATE/replication 계열", () => {
    const pgIds = new Set(applicableFor("pglite").map((c) => c.id));
    for (const id of ["set-role-denied-after-revoke", "escalation-denied-for-runtime-roles", "reader-select-success",
      "writer-insert-success", "writer-business-table-access-denied", "trigger-function-direct-call-denied",
      "truncate-trigger-or-fk-denied", "session-replication-role-denied", "runtime-trigger-disable-denied", "default-privileges-secure",
      "direct-reader-credential", "direct-writer-credential", "deployer-admin-owner-chain"]) {
      assert.ok(!pgIds.has(id), `${id} 는 PGlite 비적용이어야`);
      assert.equal(findCapability(id)!.authoritativeProfile, "embedded-direct", id);
    }
  });

});

describe("Phase2: PGlite profile 실제 실행", () => {
  test("pglite profile — applicable 전부 판정 · 비적용은 not-applicable · 잔여 0", async () => {
    const { db, close } = await pglite();
    try {
      const r = await executeDirectProfile({ profile: "pglite", cfg: cfgOf({ CONFIRM_EXECUTE: "true" }), db, login: null, pooledHostDistinct: true });
      assert.equal(r.profile, "pglite");
      assert.equal(r.applicable, countFor("pglite"));
      assert.equal(r.notApplicable, CAPABILITIES.length - countFor("pglite"), "비적용 = not-applicable");
      assert.equal(r.failed, 0, `실패: ${r.results.filter((x) => x.outcome === "fail").map((x) => `${x.capabilityId}:${x.detailCode ?? x.sanitizedError}`).join(", ")}`);
      assert.equal(r.passed + r.expectedDenial, r.applicable, "applicable 전부 판정");
      assert.equal(r.status, "passed-clean", r.notes.join(" | "));
      assert.equal(r.residualObjects, 0); assert.equal(r.residualRoles, 0); assert.equal(r.disabledTriggers, 0);
      // evidenceSource 는 executionProfile 과 항상 일치
      for (const x of r.results) assert.equal(x.evidenceSource, x.executionProfile, x.capabilityId);
      // PGlite 는 authoritative evidence 0
      assert.equal(r.authoritativeEvidence, 0, "PGlite 결과는 authoritative 아님");
    } finally { await close(); }
  });

  test("not-applicable 은 catalog 로 결정되며 pass 로 계산되지 않음", async () => {
    const { db, close } = await pglite();
    try {
      const r = await executeDirectProfile({ profile: "pglite", cfg: cfgOf({ CONFIRM_EXECUTE: "true" }), db, login: null, pooledHostDistinct: true });
      const na = r.results.filter((x) => x.outcome === "not-applicable").map((x) => x.capabilityId);
      const pgIds = new Set(applicableFor("pglite").map((c) => c.id));
      for (const id of na) assert.ok(!pgIds.has(id), `${id} 는 applicable 인데 not-applicable 로 처리됨`);
      assert.ok(!r.results.some((x) => x.outcome === ("skipped" as never)), "skipped 없음");
    } finally { await close(); }
  });
});

describe("Phase2: pooled-mock profile", () => {
  test("pooled-mock — applicable 전부 판정 · authoritative 아님(actual-neon-pooled 가 authoritative)", async () => {
    const r = await executePooledProfile({ profile: "pooled-mock", cfg: cfgOf() });
    assert.equal(r.applicable, countFor("pooled-mock"));
    assert.equal(r.failed, 0, r.results.filter((x) => x.outcome === "fail").map((x) => x.capabilityId).join(","));
    assert.equal(r.passed + r.expectedDenial, r.applicable);
    assert.equal(r.status, "passed-clean");
    assert.equal(r.authoritativeEvidence, 0, "pooled-mock 은 actual-neon-pooled 의 대체 evidence 아님");
    assert.ok(r.notes.some((n) => n.includes("실제 PgBouncer 검증이 아니")), "표현 가드");
  });

  test("mock 은 결함 모드에서 누수/무효화를 실제로 감지", async () => {
    const leaky = createPooledMockAdapter("w", { w: "write" }, { leakSessionStateOnRecycle: true });
    await leaky.exec("SET ROLE r"); leaky.recycle();
    assert.notEqual(leaky.currentRole(), null, "누수 감지 능력");
    const rot = createPooledMockAdapter("r", { r: "select" }, { invalidateOnRotation: true });
    rot.rotateCredential("r");
    await assert.rejects(() => rot.query("SELECT 1"), /invalidated/);
  });

  test("during-pooled-mock injection → 해당 capability fail", async () => {
    const r = await executePooledProfile({ profile: "pooled-mock", cfg: cfgOf(), injector: injectAt("during-pooled-mock") });
    assert.ok(r.failed > 0, "injection 시 실패 기록");
    assert.equal(r.status, "failed-cleanup");
  });
});

describe("Phase2: neon-full 승격 금지", () => {
  const fakeResults = (profile: ExecutionResult["executionProfile"]): ExecutionResult[] =>
    CAPABILITIES.map((c) => ({ capabilityId: c.id, executionProfile: profile, outcome: "pass" as const, evidenceSource: profile, authoritative: false, durationMs: 1 }));

  test("actual Neon evidence 0 → neon-full 은 항상 unverified", () => {
    const r = rollupNeonFull([]);
    assert.equal(r.profile, AGGREGATE_PROFILE);
    assert.equal(r.status, "unverified");
    assert.equal(r.neonEvidenceCount, 0);
  });

  test("embedded + pooled-mock 결과를 합쳐도 neon-full passed 불가", () => {
    const all = [...fakeResults("embedded-direct"), ...fakeResults("pooled-mock")];
    const r = rollupNeonFull(all);
    assert.equal(r.status, "unverified", "승격 금지");
    assert.equal(r.neonEvidenceCount, 0);
  });

  test("pglite 결과를 embedded/Neon 결과로 승격 불가", () => {
    const r = rollupNeonFull(fakeResults("pglite"));
    assert.equal(r.status, "unverified");
  });

  test("actual Neon evidence 없이 passed 주입 시도 → assert 실패", () => {
    assert.throws(() => assertNoNeonPromotion({ profile: AGGREGATE_PROFILE, status: "passed", neonEvidenceCount: 0, missing: 0 }, fakeResults("embedded-direct")), /승격 금지/);
  });

  test("actual Neon evidence 가 전부 있을 때만 passed (Phase2 에서는 발생하지 않음)", () => {
    const direct = CAPABILITIES.filter((c) => c.applicableProfiles.includes("actual-neon-direct"))
      .map((c) => ({ capabilityId: c.id, executionProfile: "actual-neon-direct" as const, outcome: "pass" as const, evidenceSource: "actual-neon-direct" as const, authoritative: true, durationMs: 1 }));
    const pooled = CAPABILITIES.filter((c) => c.applicableProfiles.includes("actual-neon-pooled"))
      .map((c) => ({ capabilityId: c.id, executionProfile: "actual-neon-pooled" as const, outcome: "pass" as const, evidenceSource: "actual-neon-pooled" as const, authoritative: true, durationMs: 1 }));
    assert.equal(rollupNeonFull([...direct, ...pooled]).status, "passed", "모든 capability 가 actual Neon evidence 일 때에만");
    assert.equal(rollupNeonFull([...direct]).status, "unverified", "pooled 누락 시 unverified");
  });
});

describe("Phase2: guard · preflight · identifier · sanitizer", () => {
  test("env 계약 거부 경로", () => {
    assert.ok(!parseHarnessEnv({}).ok);
    for (const bad of [{ NEON_CHECK_DISPOSABLE_CONFIRM: "no" }, { NEON_CHECK_RUN_ID: "BAD" }, { NEON_CHECK_EXPECTED_HOST_HASH: "b".repeat(64) }, { NEON_CHECK_POOLED_URL: DIRECT }])
      assert.ok(!parseHarnessEnv(okEnv(bad as Partial<HarnessEnv>)).ok, JSON.stringify(bad));
  });

  test("public user table > 0 등 preflight hard stop", () => {
    assert.ok(!evaluatePreflight(cleanProbe({ publicUserTableCount: 1 })).ok);
    assert.ok(!evaluatePreflight(cleanProbe({ businessRowTotal: 1 })).ok);
    assert.ok(!evaluatePreflight(cleanProbe({ productionOrchRoleCount: 1 })).ok);
    assert.ok(!evaluatePreflight(cleanProbe({ canCreateRole: false })).ok);
    assert.ok(evaluatePreflight(cleanProbe()).ok);
  });

  test("preflight abort 시 DDL 0", async () => {
    const { db, close } = await pglite();
    try {
      await db.exec(`CREATE TABLE public.biz_leftover (id int)`);
      const r = await executeDirectProfile({ profile: "pglite", cfg: cfgOf({ CONFIRM_EXECUTE: "true" }), db, login: null, pooledHostDistinct: true });
      assert.equal(r.status, "aborted-safety-guard");
      assert.equal(Number((await db.query(`SELECT count(*)::int AS n FROM pg_roles WHERE rolname LIKE $1`, [`%\\_${RUN}`])).rows[0].n), 0);
      assert.equal(Number((await db.query(`SELECT count(*)::int AS n FROM pg_namespace WHERE nspname=$1`, [scopedNames(RUN).schema])).rows[0].n), 0);
    } finally { await close(); }
  });

  test("identifier run-id 스코프 · escaping · cleanup 범위", () => {
    const n = scopedNames(RUN);
    for (const name of allNames(n)) { assert.ok(name.endsWith(`_${RUN}`)); assert.ok(!name.startsWith("orchestration_")); }
    assert.throws(() => qi(`x"; DROP TABLE y; --`), /unsafe SQL identifier/);
    assert.throws(() => qi("orchestration_owner"), /forbidden identifier prefix/);
    assert.throws(() => assertRunScoped("orchestration_owner", RUN), /스코프 위반|production 예약/);
    const plan = buildCleanupPlan(n);
    assertCleanupScope(plan, RUN);
    for (const s of plan) assert.ok(s.target.endsWith(`_${RUN}`), s.label);
  });

  test("secret/URL sanitizer — 누수 0", () => {
    const s = generateSecret();
    assert.ok(s instanceof MemorySecret);
    assert.equal(String(s), "[redacted]");
    assert.equal(JSON.stringify({ s }), '{"s":"[redacted]"}');
    const out = sanitizeText(`connect ${DIRECT} password=hunter2 ${s.reveal()}`);
    for (const bad of ["postgresql://", "neon.tech", "hunter2", s.reveal()]) assert.ok(!out.includes(bad), bad);
    assert.ok(!sanitizeError(new Error(`fail ${DIRECT}`)).message.includes("postgresql://"));
    assert.match(maskUrl(DIRECT), /^url#[0-9a-f]{8}…$/);
  });
});

describe("Phase2: failure injection 17종 · cleanup", () => {
  const directPoints = INJECTION_POINTS.filter((p) => p !== "during-pooled-mock" && p !== "prepared-statement-pooled-failure" && p !== "reconnect-credential-rotation-failure");

  test(`direct injection ${directPoints.length}종 — 모든 경우 잔여 role/object/membership/trigger 0 · secret 누수 0`, async () => {
    for (const p of directPoints) {
      const { db, close } = await pglite();
      try {
        const r = await executeDirectProfile({ profile: "pglite", cfg: cfgOf({ CONFIRM_EXECUTE: "true" }), db, login: null, injector: injectAt(p), pooledHostDistinct: true });
        const residual = await verifyResidual(db, scopedNames(RUN));
        assert.equal(residual.roles, 0, `${p}: roles`);
        assert.equal(residual.objects, 0, `${p}: objects`);
        assert.equal(residual.disabledTriggers, 0, `${p}: disabled triggers`);
        const membership = Number((await db.query(`SELECT count(*)::int AS n FROM pg_auth_members am JOIN pg_roles g ON g.oid=am.roleid WHERE g.rolname LIKE $1`, [`%\\_${RUN}`])).rows[0].n);
        assert.equal(membership, 0, `${p}: membership`);
        const joined = formatProfileReport(r).join("\n");
        assert.ok(!joined.includes("postgresql://") && !joined.includes("neon.tech"), `${p}: secret 누수`);
      } finally { await close(); }
    }
  });

  test("pooled injection 2종 — 해당 capability fail 로 기록", async () => {
    for (const p of ["prepared-statement-pooled-failure", "reconnect-credential-rotation-failure"] as const) {
      const r = await executePooledProfile({ profile: "pooled-mock", cfg: cfgOf(), injector: injectAt(p) });
      assert.ok(r.failed > 0, `${p}: 실패 기록 없음`);
    }
  });

  test("INJECTION_POINTS 17종 · 중복 0", () => {
    assert.equal(INJECTION_POINTS.length, 17);
    assert.equal(new Set(INJECTION_POINTS).size, 17);
  });

  test("failFirstExec — 첫 호출만 실패", async () => {
    const { db, close } = await pglite();
    try {
      const w = failFirstExec(db, 1);
      await assert.rejects(() => w.exec("SELECT 1"), /injected cleanup failure/);
      await w.exec("SELECT 1");
    } finally { await close(); }
  });
});

describe("Phase2: classifier · report · CLI", () => {
  const okCleanup = { ok: true, attempted: 16, failed: [], residualRoles: 0, residualObjects: 0, disabledTriggers: 0, retried: false };
  const mk = (outcome: ExecutionResult["outcome"]): ExecutionResult[] => [{ capabilityId: "x", executionProfile: "pglite", outcome, evidenceSource: "pglite", authoritative: false, durationMs: 1 }];

  test("classifier 4상태 · fail/미실행 → passed 금지", () => {
    const base = { guardsOk: true, results: mk("pass"), applicable: 1, cleanup: okCleanup, operatorDisposalPending: false };
    assert.equal(classifyProfile(base), "passed-clean");
    assert.equal(classifyProfile({ ...base, operatorDisposalPending: true }), "passed-branch-disposal-required");
    assert.equal(classifyProfile({ ...base, guardsOk: false }), "aborted-safety-guard");
    assert.equal(classifyProfile({ ...base, cleanup: { ...okCleanup, ok: false } }), "failed-cleanup");
    assert.equal(classifyProfile({ ...base, cleanup: { ...okCleanup, residualRoles: 1 } }), "failed-cleanup");
    assert.equal(classifyProfile({ ...base, cleanup: { ...okCleanup, disabledTriggers: 1 } }), "failed-cleanup");
    assert.equal(classifyProfile({ ...base, results: mk("fail") }), "failed-cleanup");
    assert.equal(classifyProfile({ ...base, results: [], applicable: 1 }), "failed-cleanup", "미실행 → passed 금지");
  });

  test("report 는 profile 각인 + masked 항목만", async () => {
    const r = await executePooledProfile({ profile: "pooled-mock", cfg: cfgOf() });
    const lines = formatProfileReport(r);
    assert.ok(lines[0].includes("profile=pooled-mock") && lines[0].includes("status="));
    for (const l of lines) { assert.ok(!l.includes("postgresql://"), l); assert.ok(!l.includes("neon.tech"), l); }
    assert.ok(formatNeonFull(rollupNeonFull(r.results)).includes("status=unverified"));
  });

  test("CLI: stub 부재 · dry-run 은 연결/write 0 · 정본 수 파생", () => {
    assert.ok(!CLI_SRC.includes("이 저장소 Gate 에서는 미실행"));
    assert.ok(CLI_SRC.includes("executeDirectProfile") && CLI_SRC.includes("assertNoNeonPromotion"));
    const lines = buildDryRunPlan(cfgOf());
    assert.ok(lines.some((l) => l.includes("DB connection 0") && l.includes("DB write 0")));
    assert.ok(lines.some((l) => l.includes(`capability catalog=${CAPABILITIES.length}`)));
    for (const l of lines) assert.ok(!l.includes("postgresql://") && !l.includes("neon.tech"), l);
  });
});
