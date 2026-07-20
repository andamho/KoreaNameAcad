// disposable Neon capability 하네스 **Phase 1(execute core)** 자체 검증. Neon 접속 0.
// ⚠️ 여기 결과는 실행 골격/가드/cleanup 검증이며 **Neon 실측이 아니다**(Neon capability = not-run).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseHarnessEnv, evaluatePreflight, DISPOSABLE_TOKEN, type HarnessEnv, type CatalogProbe, type HarnessConfig } from "../../scripts/neonCheck/guards";
import { scopedNames, assertRunScoped, qi, RUN_ID_RE, allNames } from "../../scripts/neonCheck/identifiers";
import { buildCleanupPlan, assertCleanupScope, verifyResidual } from "../../scripts/neonCheck/cleanup";
import { generateSecret, sanitizeText, sanitizeError, maskUrl, hostHashOf, MemorySecret } from "../../scripts/neonCheck/secrets";
import { CAPABILITIES, CAPABILITY_IDS, countFor, applicableFor, validateCatalog, PROFILES } from "../../scripts/neonCheck/capabilities";
import { wrapClientAsDirect, createPooledMockAdapter, type DbAdapter } from "../../scripts/neonCheck/adapters";
import { executeHarness, classifyResult, buildReport, formatReport, injectAt, noInjection, INJECTION_POINTS, PHASE1_SMOKE_IDS, runPooledMockSmoke, failFirstExec } from "../../scripts/neonCheck/executor";
import { buildDryRunPlan } from "../../scripts/neonOrchestrationCapabilityCheck";

const here = path.dirname(fileURLToPath(import.meta.url));
const CLI_SRC = readFileSync(path.join(here, "..", "..", "scripts", "neonOrchestrationCapabilityCheck.ts"), "utf-8");

const DIRECT = "postgresql://u:p@disposable-branch.example.neon.tech/testdb";
const POOLED = "postgresql://u:p@disposable-branch-pooler.example.neon.tech/testdb";
const RUN = "phase1aa";
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

describe("Phase1: capability 정본 · profile 모델", () => {
  test("정본 무결성(중복 0·누락 0·순서 deterministic·profile 배정)", () => {
    const v = validateCatalog();
    assert.ok(v.ok, v.problems.join(" | "));
    assert.equal(new Set(CAPABILITY_IDS).size, CAPABILITIES.length, "ID 중복 0");
    // 순서 deterministic: 두 번 읽어도 동일
    assert.deepEqual(CAPABILITIES.map((c) => c.id), CAPABILITY_IDS);
  });

  test("profile applicability: embedded+pooled = 전체, 겹침 0", () => {
    const d = countFor("embedded-direct"), m = countFor("pooled-mock"), n = countFor("neon-full");
    assert.equal(n, CAPABILITIES.length, "neon-full = 전체");
    assert.equal(d + m, CAPABILITIES.length, "격리 profile 합 = 전체");
    const dIds = new Set(applicableFor("embedded-direct").map((c) => c.id));
    for (const c of applicableFor("pooled-mock")) assert.ok(!dIds.has(c.id), `겹침: ${c.id}`);
    assert.deepEqual([...PROFILES], ["embedded-direct", "pooled-mock", "neon-full"]);
  });

  test("숫자 하드코딩 없이 파생 — 정본이 유일한 출처", () => {
    assert.ok(CAPABILITIES.length > 0);
    assert.equal(countFor("neon-full"), CAPABILITIES.length);
  });
});

describe("Phase1: execute stub 제거 · 진입", () => {
  test("execute stub(거부 메시지/exit 3) 이 더 이상 존재하지 않음", () => {
    assert.ok(!CLI_SRC.includes("이 저장소 Gate 에서는 미실행"), "stub 문구 잔존");
    assert.ok(!/return 3;/.test(CLI_SRC), "stub exit 3 잔존");
    assert.ok(CLI_SRC.includes("executeHarness"), "executor 로 위임");
  });

  test("CONFIRM_EXECUTE=true 에서 executor 진입(실제 실행 경로)", async () => {
    const { db, close } = await pglite();
    try {
      const r = await executeHarness({ profile: "embedded-direct", cfg: cfgOf({ CONFIRM_EXECUTE: "true" }), db, pooledHostDistinct: true });
      assert.ok(["passed-clean", "passed-branch-disposal-required"].includes(r.status), `status=${r.status} notes=${r.notes.join("|")}`);
      assert.equal(r.capabilityImplementation, "partial", "Phase1 = partial");
      assert.equal(r.totalApplicable, PHASE1_SMOKE_IDS.length, "Phase1 scope = smoke");
      assert.equal(r.catalogTotal, CAPABILITIES.length, "정본 총수 투명 표기");
    } finally { await close(); }
  });

  test("guard 실패 시 DB 연결 0 (파싱 단계에서 차단)", () => {
    for (const bad of [{ NEON_CHECK_DISPOSABLE_CONFIRM: "no" }, { NEON_CHECK_RUN_ID: "BAD" }, { NEON_CHECK_EXPECTED_HOST_HASH: "b".repeat(64) }]) {
      const r = parseHarnessEnv(okEnv(bad as Partial<HarnessEnv>));
      assert.ok(!r.ok, JSON.stringify(bad));
    }
  });
});

describe("Phase1: preflight 가드", () => {
  test("public user table > 0 → abort (hard stop)", () => {
    const g = evaluatePreflight(cleanProbe({ publicUserTableCount: 1 }));
    assert.ok(!g.ok && g.refusals.some((x) => x.includes("public schema 사용자 테이블")));
  });

  test("business/row/migration/orch-role/leftover/schema/endpoint/createRole 전부 거부 사유", () => {
    const cases: Array<[Partial<CatalogProbe>, string]> = [
      [{ businessTableCount: 2 }, "업무/운영 테이블"],
      [{ businessRowTotal: 5 }, "기존 데이터 행"],
      [{ productionMigrationHistory: true }, "migration history"],
      [{ productionOrchRoleCount: 1 }, "orchestration_* role"],
      [{ runScopedLeftoverCount: 3 }, "이전 run-id 잔여"],
      [{ unexpectedSchemaCount: 1 }, "user schema"],
      [{ endpointDistinguishable: false }, "endpoint 구분 불가"],
      [{ canCreateRole: false }, "CREATE ROLE 불가"],
    ];
    for (const [o, kw] of cases) {
      const g = evaluatePreflight(cleanProbe(o));
      assert.ok(!g.ok && g.refusals.some((x) => x.includes(kw)), kw);
    }
    assert.ok(evaluatePreflight(cleanProbe()).ok, "clean → 통과");
  });

  test("preflight abort 시 DDL 0 (schema/role 미생성)", async () => {
    const { db, close } = await pglite();
    try {
      await db.exec(`CREATE TABLE public.leftover_business (id int)`); // public user table 존재 → hard stop
      const r = await executeHarness({ profile: "embedded-direct", cfg: cfgOf({ CONFIRM_EXECUTE: "true" }), db, pooledHostDistinct: true });
      assert.equal(r.status, "aborted-safety-guard");
      const n = scopedNames(RUN);
      const roles = Number((await db.query(`SELECT count(*)::int AS n FROM pg_roles WHERE rolname LIKE $1`, [`%\\_${RUN}`])).rows[0].n);
      const schemas = Number((await db.query(`SELECT count(*)::int AS n FROM pg_namespace WHERE nspname = $1`, [n.schema])).rows[0].n);
      assert.equal(roles, 0, "role 미생성"); assert.equal(schemas, 0, "schema 미생성");
    } finally { await close(); }
  });
});

describe("Phase1: identifier · cleanup scope", () => {
  test("synthetic identifier run-id 범위 · production 이름 미사용", () => {
    const n = scopedNames(RUN);
    for (const name of allNames(n)) {
      assert.ok(name.endsWith(`_${RUN}`), name);
      assert.ok(!name.startsWith("orchestration_"), name);
    }
    assert.throws(() => assertRunScoped("orchestration_owner", RUN), /스코프 위반|production 예약/);
    assert.throws(() => scopedNames("BAD"), /invalid runId/);
    assert.ok(RUN_ID_RE.test(RUN));
  });

  test("SQL identifier escaping — 형식 위반/예약 접두 차단", () => {
    assert.equal(qi("oc_owner_phase1aa"), `"oc_owner_phase1aa"`);
    for (const bad of [`x"; DROP TABLE y; --`, "Bad-Name", "1abc", ""]) assert.throws(() => qi(bad), /unsafe SQL identifier/);
    assert.throws(() => qi("orchestration_owner"), /forbidden identifier prefix/);
    assert.throws(() => qi("pg_x"), /forbidden identifier prefix/);
  });

  test("cleanup plan 은 run-id 범위만 · production 참조 0 · DROP OWNED 포함", () => {
    const n = scopedNames(RUN);
    const plan = buildCleanupPlan(n);
    assertCleanupScope(plan, RUN); // throw 하지 않아야
    for (const s of plan) assert.ok(s.target.endsWith(`_${RUN}`), s.label);
    assert.ok(plan.some((s) => s.sql.includes("DROP OWNED BY")), "DROP OWNED");
    assert.ok(plan.some((s) => s.sql.includes("DROP ROLE")), "DROP ROLE");
    assert.ok(plan.some((s) => s.sql.includes("DROP SCHEMA")), "DROP SCHEMA");
    assert.ok(!plan.some((s) => /orchestration_(owner|admin|writer|reader|deployer)\b/.test(s.sql)), "production role 미참조");
  });
});

describe("Phase1: secret · sanitizer", () => {
  test("CSPRNG secret 은 출력/직렬화로 새지 않음", () => {
    const s = generateSecret();
    assert.ok(s instanceof MemorySecret);
    assert.equal(String(s), "[redacted]");
    assert.equal(JSON.stringify({ s }), '{"s":"[redacted]"}');
    assert.ok(s.reveal().length >= 40, "충분한 엔트로피");
    assert.notEqual(generateSecret().reveal(), generateSecret().reveal(), "매번 다름");
  });

  test("sanitizer: URL/password/연결정보/생성비밀 제거", () => {
    const sec = generateSecret().reveal();
    const raw = `connect ${DIRECT} failed password=hunter2 user=admin host=db.internal token: abc ${sec}`;
    const out = sanitizeText(raw);
    for (const bad of ["postgresql://", "disposable-branch.example.neon.tech", "hunter2", sec]) assert.ok(!out.includes(bad), `누수: ${bad}`);
    assert.ok(out.includes("[redacted"), out);
  });

  test("sanitizeError: 메시지·스택에 connection string 미포함", () => {
    const e = new Error(`failed to connect to ${DIRECT} (password=secret123)`);
    const s = sanitizeError(e);
    assert.ok(!s.message.includes("postgresql://") && !s.message.includes("secret123"), s.message);
  });

  test("URL masking 은 hash 접두 8자만", () => {
    const m = maskUrl(DIRECT);
    assert.match(m, /^url#[0-9a-f]{8}…$/);
    for (const bad of ["postgresql://", "example.neon.tech", "u:p", "testdb"]) assert.ok(!m.includes(bad));
  });
});

describe("Phase1: cleanup · failure injection", () => {
  const runOnce = async (inject: ReturnType<typeof injectAt> | typeof noInjection) => {
    const { db, close } = await pglite();
    try {
      const r = await executeHarness({ profile: "embedded-direct", cfg: cfgOf({ CONFIRM_EXECUTE: "true" }), db, injector: inject, pooledHostDistinct: true });
      const residual = await verifyResidual(db, scopedNames(RUN));
      return { r, residual };
    } finally { await close(); }
  };

  test("정상 경로 cleanup — 잔여 0", async () => {
    const { r, residual } = await runOnce(noInjection);
    assert.equal(residual.roles, 0); assert.equal(residual.objects, 0); assert.equal(residual.disabledTriggers, 0);
    assert.ok(r.cleanupStatements > 0);
  });

  test("failure injection 8종 — 모든 경로에서 잔여 role/object/trigger 0 · secret 누수 0", async () => {
    const points = INJECTION_POINTS.filter((p) => p !== "during-pooled-mock" && p !== "cleanup-first-attempt");
    for (const p of points) {
      const { r, residual } = await runOnce(injectAt(p));
      assert.equal(residual.roles, 0, `${p}: residual roles`);
      assert.equal(residual.objects, 0, `${p}: residual objects`);
      assert.equal(residual.disabledTriggers, 0, `${p}: disabled triggers`);
      const joined = formatReport(r).join("\n");
      assert.ok(!joined.includes("postgresql://") && !joined.includes("neon.tech"), `${p}: secret 누수`);
    }
  });

  test("cleanup 1차 실패 후 재시도 — 최종 잔여 0", async () => {
    const { r, residual } = await runOnce(injectAt("cleanup-first-attempt"));
    assert.equal(residual.roles, 0); assert.equal(residual.objects, 0);
    assert.ok(r.notes.some((n) => n.includes("cleanup 1차 실패 주입")), r.notes.join("|"));
  });

  test("failFirstExec 래퍼가 첫 호출만 실패시킴", async () => {
    const { db, close } = await pglite();
    try {
      const w = failFirstExec(db, 1);
      await assert.rejects(() => w.exec("SELECT 1"), /injected cleanup failure/);
      await w.exec("SELECT 1"); // 두 번째는 성공
    } finally { await close(); }
  });

  test("pooled mock: tx 종료 후 role 초기화 · recycle 누수 감지", async () => {
    const r = await runPooledMockSmoke(noInjection);
    assert.equal(r.txResetOk, true, "tx 종료 후 세션 role 초기화");
    assert.equal(r.leakDetected, true, "결함 모드에서 누수 감지됨(감지 능력 확인)");
    await assert.rejects(() => runPooledMockSmoke(injectAt("during-pooled-mock")), /injected failure/);
  });

  test("pooled mock 권한 분리 — reader 는 write 불가", async () => {
    const pool = createPooledMockAdapter("r", { r: "select", w: "write" });
    await assert.rejects(() => pool.exec("INSERT INTO t VALUES (1)"), /permission denied/);
    await pool.exec("SELECT 1");
  });
});

describe("Phase1: 결과 분류 · report", () => {
  const okCleanup = { ok: true, attempted: 13, failed: [], residualRoles: 0, residualObjects: 0, disabledTriggers: 0, retried: false };
  const results = PHASE1_SMOKE_IDS.map((id) => ({ id, outcome: "pass" as const }));

  test("classifier: 4가지 상태 매핑 · partial success 를 success 로 표기 금지", () => {
    const base = { guardsOk: true, results, applicable: results.length, cleanup: okCleanup, operatorDisposalPending: false };
    assert.equal(classifyResult(base), "passed-clean");
    assert.equal(classifyResult({ ...base, operatorDisposalPending: true }), "passed-branch-disposal-required");
    assert.equal(classifyResult({ ...base, guardsOk: false }), "aborted-safety-guard");
    assert.equal(classifyResult({ ...base, cleanup: { ...okCleanup, ok: false } }), "failed-cleanup");
    assert.equal(classifyResult({ ...base, cleanup: { ...okCleanup, residualRoles: 1 } }), "failed-cleanup", "잔여 role → passed 금지");
    assert.equal(classifyResult({ ...base, cleanup: { ...okCleanup, disabledTriggers: 1 } }), "failed-cleanup", "disabled trigger → passed 금지");
    assert.equal(classifyResult({ ...base, results: [...results.slice(1), { id: "x", outcome: "fail" as const }] }), "failed-cleanup", "capability 실패 → passed 금지");
    assert.equal(classifyResult({ ...base, results: [...results.slice(1), { id: "x", outcome: "skipped" as const }] }), "failed-cleanup", "skipped → passed 금지");
    assert.equal(classifyResult({ ...base, results: results.slice(1) }), "failed-cleanup", "미실행(missing) → passed 금지");
  });

  test("report 에 profile 이 항상 포함되고 masked 항목만 출력", () => {
    const rep = buildReport({ profile: "embedded-direct", status: "passed-clean", cfg: cfgOf(), probe: null, results, cleanup: okCleanup, elapsedMs: 12, applicable: results.length, capabilityImplementation: "partial" });
    const lines = formatReport(rep);
    assert.ok(lines[0].includes("profile=embedded-direct"), "profile 각인");
    assert.ok(lines[0].includes("status=passed-clean"));
    for (const l of lines) { assert.ok(!l.includes("postgresql://"), l); assert.ok(!l.includes("neon.tech"), l); }
    assert.ok(lines.some((l) => l.includes(`catalog total=${CAPABILITIES.length}`)), "정본 총수 표기");
  });

  test("embedded/mock 결과를 Neon 통과로 표시하지 않음", () => {
    const rep = buildReport({ profile: "embedded-direct", status: "passed-clean", cfg: cfgOf(), probe: null, results, cleanup: okCleanup, elapsedMs: 1, applicable: results.length, capabilityImplementation: "partial" });
    assert.notEqual(rep.profile, "neon-full");
    const joined = formatReport(rep).join("\n");
    assert.ok(!/neon-full/.test(joined), "neon-full 로 표기되지 않음");
  });

  test("dry-run plan: DB 연결/write 0 · URL 원문 없음 · 정본 수 파생", () => {
    const lines = buildDryRunPlan(cfgOf(), "neon-full");
    assert.ok(lines.some((l) => l.includes("DB connection 0") && l.includes("DB write 0")));
    assert.ok(lines.some((l) => l.includes(`capability catalog=${CAPABILITIES.length}`)));
    for (const l of lines) assert.ok(!l.includes("postgresql://") && !l.includes("neon.tech"), l);
  });
});
