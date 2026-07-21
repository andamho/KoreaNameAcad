// SELECT-only preflight 검증 — **실제 Neon 접속 0**. PGlite + pooled mock + 실패 주입.
// ⚠️ PGlite 는 PostgreSQL 18.x 이며 정본이 아니다. PG 17.10 정본 증거는 embedded 실행으로 확보한다.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  PREFLIGHT_QUERIES, PREFLIGHT_QUERY_IDS, validateQueryCatalog, findPreflightQuery, FORBIDDEN_SQL_KEYWORDS,
} from "../../scripts/neonCheck/preflightQueries";
import { ReadOnlySession, ReadOnlyViolationError, connectReadOnly, type RawDriver } from "../../scripts/neonCheck/readOnlyAdapter";
import {
  probeDirect, probePooled, summarizePreflight, formatPreflightReport, classifyPooler, classifyCreateRole,
  issueEvidence, assertExecuteAllowed, EVIDENCE_MAX_AGE_MS, PREFLIGHT_STATUSES,
  type DirectProbeResult, type PooledProbeResult,
} from "../../scripts/neonCheck/selectOnlyPreflight";
import { assertNoSecrets } from "../../scripts/neonCheck/evidenceStore";
import { parseHarnessEnv, DISPOSABLE_TOKEN, type HarnessEnv, type HarnessConfig } from "../../scripts/neonCheck/guards";
import { hostHashOf } from "../../scripts/neonCheck/secrets";

const DIRECT = "postgresql://u:p@ep-pf-1.ap-southeast-1.aws.neon.tech/testdb";
const POOLED = "postgresql://u:p@ep-pf-1-pooler.ap-southeast-1.aws.neon.tech/testdb";
const PROD_D = "postgresql://u:p@ep-prod-1.ap-southeast-1.aws.neon.tech/prod";
const PROD_P = "postgresql://u:p@ep-prod-1-pooler.ap-southeast-1.aws.neon.tech/prod";
const RUN = "pf260721";
const env = (over: Partial<HarnessEnv> = {}): HarnessEnv => ({
  NEON_CHECK_DIRECT_URL: DIRECT, NEON_CHECK_POOLED_URL: POOLED,
  NEON_CHECK_EXPECTED_DIRECT_HOST_HASH: hostHashOf(DIRECT),
  NEON_CHECK_EXPECTED_POOLED_HOST_HASH: hostHashOf(POOLED),
  NEON_CHECK_FORBIDDEN_DIRECT_HOST_HASH: hostHashOf(PROD_D),
  NEON_CHECK_FORBIDDEN_POOLED_HOST_HASH: hostHashOf(PROD_P),
  NEON_CHECK_DISPOSABLE_CONFIRM: DISPOSABLE_TOKEN, NEON_CHECK_RUN_ID: RUN, ...over,
});
const cfgOf = (over: Partial<HarnessEnv> = {}): HarnessConfig => {
  const p = parseHarnessEnv(env(over)); if (!p.ok) throw new Error(p.refusals.join("|")); return p.config;
};

// ── PGlite 를 RawDriver 로 ────────────────────────────────────────────────
async function pgliteDriver(seed?: (exec: (sql: string) => Promise<void>) => Promise<void>): Promise<RawDriver & { engine: string }> {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  if (seed) await seed(async (sql) => { await db.exec(sql); });
  const engine = (await db.query<{ server_version: string }>("SHOW server_version")).rows[0].server_version;
  return {
    engine,
    connect: async () => {},
    query: async (sql, params) => (await db.query(sql, params as any[])) as any,
    end: async () => db.close(),
  };
}

describe("query allowlist 정본", () => {
  test("무결성: 중복 0 · SELECT 로만 시작 · semicolon 0 · 금지 keyword 0 · 미허용 함수 0", () => {
    const v = validateQueryCatalog();
    assert.ok(v.ok, v.problems.join(" | "));
    assert.equal(new Set(PREFLIGHT_QUERY_IDS).size, PREFLIGHT_QUERIES.length);
    assert.ok(PREFLIGHT_QUERIES.length >= 12, `queries=${PREFLIGHT_QUERIES.length}`);
  });

  test("각 query 는 고정 SQL + 고정 parameter shape 를 가진다", () => {
    for (const q of PREFLIGHT_QUERIES) {
      assert.ok(q.sql.length > 0, q.id);
      assert.ok(["none", "text", "text[]"].includes(q.params), q.id);
      // 식별자 문자열 결합 흔적(템플릿 삽입) 금지
      assert.ok(!/\$\{/.test(q.sql), `${q.id}: 템플릿 삽입 금지`);
    }
  });

  test("금지 keyword 목록이 요구된 DDL/DML 을 모두 포함", () => {
    for (const kw of ["CREATE", "ALTER", "DROP", "GRANT", "REVOKE", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "COPY", "CALL", "DO", "VACUUM", "ANALYZE", "REFRESH"]) {
      assert.ok((FORBIDDEN_SQL_KEYWORDS as readonly string[]).includes(kw), kw);
    }
  });
});

describe("read-only adapter — 2중 방어", () => {
  test("raw SQL escape hatch 가 없다(ID 로만 실행)", () => {
    const proto = Object.getOwnPropertyNames(ReadOnlySession.prototype);
    assert.deepEqual(proto.filter((m) => ["exec", "raw", "unsafe", "rawQuery"].includes(m)), []);
    assert.ok(proto.includes("run"));
  });

  test("unknown query ID 거부", async () => {
    const d = await pgliteDriver();
    await assert.rejects(
      () => ReadOnlySession.withSession(d, (s) => s.run("no-such-query")),
      (e: any) => e instanceof ReadOnlyViolationError && /allowlist 에 없는/.test(e.message));
    await d.end();
  });

  test("`SELECT dangerous_function()` 류는 ID 가 없어 실행 자체가 불가", async () => {
    const d = await pgliteDriver();
    for (const attempt of ["SELECT pg_sleep(1)", "SELECT dangerous_function()", "DROP TABLE x"]) {
      await assert.rejects(() => ReadOnlySession.withSession(d, (s) => s.run(attempt)), ReadOnlyViolationError);
    }
    await d.end();
  });

  test("parameter shape 불일치 거부", async () => {
    const d = await pgliteDriver();
    await assert.rejects(() => ReadOnlySession.withSession(d, (s) => s.run("server-version", ["x"])), ReadOnlyViolationError);
    await assert.rejects(() => ReadOnlySession.withSession(d, (s) => s.run("business-tables")), ReadOnlyViolationError);
    await assert.rejects(() => ReadOnlySession.withSession(d, (s) => s.run("business-tables", ["notarray" as any])), ReadOnlyViolationError);
    await d.end();
  });

  test("read-only 트랜잭션 안에서 DDL/DML 이 서버 레벨에서도 거부된다", async () => {
    const d = await pgliteDriver(async (exec) => { await exec(`CREATE TABLE t_probe (id int)`); });
    // 각 시도를 **별도 read-only 트랜잭션**에서 수행한다. 한 트랜잭션 안에서는 첫 거부(25006) 이후
    // 나머지가 25P02(aborted)로 바뀌어 어떤 이유로 막혔는지 구분되지 않기 때문이다.
    for (const sql of [`INSERT INTO t_probe VALUES (1)`, `UPDATE t_probe SET id=2`, `DELETE FROM t_probe`,
                       `CREATE TABLE t2 (id int)`, `DROP TABLE t_probe`, `TRUNCATE t_probe`]) {
      await ReadOnlySession.withSession(d, async () => {
        await assert.rejects(() => d.query(sql), (e: any) => e.code === "25006", `${sql} 가 read-only 위반(25006)으로 거부되어야 함`);
      });
    }
    // 위 시도들이 전부 rollback 되어 원본 테이블이 그대로인지 확인(write 0)
    const still = await ReadOnlySession.withSession(d, () => d.query(`SELECT count(*)::int AS n FROM t_probe`));
    assert.equal(still.rows[0].n, 0, "read-only 트랜잭션에서 어떤 write 도 반영되면 안 된다");
    await d.end();
  });

  test("성공·실패 모두 ROLLBACK 되고 COMMIT 경로가 없다", async () => {
    const d = await pgliteDriver();
    const seen: string[] = [];
    const spy: RawDriver = { connect: d.connect, end: d.end, query: async (sql, p) => { seen.push(sql.trim().split(/\s+/)[0].toUpperCase()); return d.query(sql, p); } };
    await ReadOnlySession.withSession(spy, (s) => s.run("server-version"));
    await ReadOnlySession.withSession(spy, async (s) => { await s.run("server-version"); throw new Error("boom"); }).catch(() => {});
    assert.equal(seen.filter((x) => x === "COMMIT").length, 0, "COMMIT 발생");
    assert.equal(seen.filter((x) => x === "ROLLBACK").length, 2, "성공·실패 모두 rollback");
    assert.equal(seen.filter((x) => x === "BEGIN").length, 2);
    await d.end();
  });

  test("read-only 확인 실패 시 fail-closed", async () => {
    const fake: RawDriver = {
      connect: async () => {}, end: async () => {},
      query: async (sql) => (/transaction_read_only/.test(sql) ? { rows: [{ ro: "off" }] } : { rows: [] }),
    };
    await assert.rejects(() => ReadOnlySession.withSession(fake, async () => {}),
      (e: any) => e instanceof ReadOnlyViolationError && /read-only 트랜잭션 강제 실패/.test(e.message));
  });

  test("연결 실패는 sanitize 되어 원문 미노출", async () => {
    const fake: RawDriver = {
      connect: async () => { throw new Error("connect ECONNREFUSED postgresql://u:pw@secret.host/db"); },
      query: async () => ({ rows: [] }), end: async () => {},
    };
    const r = await connectReadOnly(fake);
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.ok(!JSON.stringify(r.error).includes("secret.host"), JSON.stringify(r.error));
    assert.ok(!JSON.stringify(r.error).includes("pw"));
  });
});

describe("direct probe (PGlite)", () => {
  test("깨끗한 DB → 안전 조건 전부 0 · read-only 강제 · query count > 0", async () => {
    const d = await pgliteDriver();
    const r = await probeDirect(d, cfgOf());
    assert.equal(r.connected, true);
    assert.equal(r.readOnlyEnforced, true, r.error);
    assert.equal(r.publicUserTableCount, 0);
    assert.equal(r.businessTableCount, 0);
    assert.equal(r.migrationHistoryCount, 0);
    assert.equal(r.orchestrationRoleCount, 0);
    assert.equal(r.residualCount, 0);
    assert.equal(r.syntheticNameConflicts, 0);
    assert.ok(r.queryCount >= 10, `queries=${r.queryCount}`);
    assert.ok(/^db#[0-9a-f]{8}…$/.test(r.databaseIdentity), r.databaseIdentity);
    await d.end();
  });

  test("public user table 감지", async () => {
    const d = await pgliteDriver(async (exec) => { await exec(`CREATE TABLE leftover (id int)`); });
    const r = await probeDirect(d, cfgOf());
    assert.equal(r.publicUserTableCount, 1);
    await d.end();
  });

  test("business table + migration history + orchestration role 감지", async () => {
    const d = await pgliteDriver(async (exec) => {
      await exec(`CREATE TABLE customers (id int); CREATE TABLE __drizzle_migrations (id int); CREATE ROLE orchestration_writer NOLOGIN;`);
    });
    const r = await probeDirect(d, cfgOf());
    assert.equal(r.businessTableCount, 1);
    assert.equal(r.migrationHistoryCount, 1);
    assert.equal(r.orchestrationRoleCount, 1);
    await d.end();
  });

  test("이전 run 잔여 감지", async () => {
    const d = await pgliteDriver(async (exec) => { await exec(`CREATE SCHEMA oc_chk_${RUN}`); });
    const r = await probeDirect(d, cfgOf());
    assert.ok(r.residualCount > 0, `residue=${r.residualCount}`);
    assert.ok(r.syntheticNameConflicts > 0);
    await d.end();
  });

  test("CREATE ROLE capability 는 단정하지 않는다", () => {
    assert.equal(classifyCreateRole({ is_super: true }), "likely-capable");
    assert.equal(classifyCreateRole({ can_create_role: true }), "likely-capable");
    assert.equal(classifyCreateRole({ can_create_role: false }), "likely-incapable");
    assert.equal(classifyCreateRole({}), "unverified");
    assert.ok(!(["confirmed", "capable"] as string[]).includes(classifyCreateRole({ is_super: true })));
  });
});

describe("pooled mock", () => {
  const makePooled = (o: { leak?: boolean; reconnect?: boolean; identity?: string } = {}) => {
    let checkouts = 0, txDepth = 0;
    const driver: RawDriver = {
      connect: async () => { checkouts += 1; },
      end: async () => {},
      query: async (sql) => {
        const head = sql.trim().split(/\s+/)[0].toUpperCase();
        if (head === "BEGIN") { txDepth += 1; return { rows: [] }; }
        if (head === "ROLLBACK") { txDepth -= 1; return { rows: [] }; }
        if (/SET TRANSACTION READ ONLY/i.test(sql)) return { rows: [] };
        if (txDepth <= 0) throw new Error("transaction 밖 query");
        if (/transaction_read_only/.test(sql) && /current_setting\('transaction_read_only'\) AS ro/.test(sql)) return { rows: [{ ro: "on" }] };
        if (/AS transaction_read_only/.test(sql)) return { rows: [{ transaction_read_only: "on", default_transaction_read_only: "off", server_version: "17.10", catalog_visible: true }] };
        if (/application_name/.test(sql)) return { rows: [{ application_name: o.leak ? "oc-preflight-local-marker" : "" }] };
        if (/database_hash/.test(sql)) return { rows: [{ database_hash: o.identity ?? "same", database_oid_hash: "o", schema_oid_hash: "s", server_version: "17.10" }] };
        return { rows: [{ server_version: "17.10" }] };
      },
    };
    return { driver, checkouts: () => checkouts };
  };

  test("checkout/checkin · transaction boundary · reconnect · identity 유지", async () => {
    const a = makePooled();
    const r = await probePooled(a.driver, async () => makePooled().driver);
    assert.equal(r.connected, true);
    assert.equal(r.readOnlyEnforced, true, r.error);
    assert.equal(r.reconnectOk, true);
    assert.equal(r.sessionStateLeak, false);
    assert.equal(r.poolerConfidence, "consistent-with-transaction-pooling");
    assert.ok(r.queryCount > 0);
  });

  test("session state leak 감지 → pooler confidence unverified", async () => {
    const a = makePooled({ leak: true });
    const r = await probePooled(a.driver, async () => null as any);
    assert.equal(r.sessionStateLeak, true);
    assert.equal(r.poolerConfidence, "unverified");
  });

  test("reconnect identity mismatch → reconnectOk false", async () => {
    const a = makePooled({ identity: "one" });
    const r = await probePooled(a.driver, async () => makePooled({ identity: "two" }).driver);
    assert.equal(r.reconnectOk, false);
    assert.equal(r.poolerConfidence, "unverified");
  });

  test("pooler classifier 는 추측으로 confirmed 를 내지 않는다", () => {
    assert.equal(classifyPooler({ reEnforced: true, leak: false, reconnectOk: true }), "consistent-with-transaction-pooling");
    assert.equal(classifyPooler({ reEnforced: true, leak: true, reconnectOk: true }), "unverified");
    assert.equal(classifyPooler({ reEnforced: false, leak: false, reconnectOk: true }), "unverified");
    // confirmed 는 authoritative signal 이 생기기 전까지 어떤 입력으로도 나오지 않는다
    for (const a of [true, false]) for (const b of [true, false]) for (const c of [true, false]) {
      assert.notEqual(classifyPooler({ reEnforced: a, leak: b, reconnectOk: c }), "confirmed");
    }
  });
});

// ── 결과 종합 · 실패 주입 ────────────────────────────────────────────────
const okDirect = (o: Partial<DirectProbeResult> = {}): DirectProbeResult => ({
  connected: true, readOnlyEnforced: true, serverVersion: "17.10", databaseIdentity: "db#aabbccdd…",
  identityFingerprint: "f".repeat(64), publicUserTableCount: 0, userSchemaCount: 0, businessTableCount: 0,
  businessRowsPresent: false, migrationHistoryCount: 0, orchestrationRoleCount: 0, residualCount: 0,
  syntheticNameConflicts: 0, createRoleCapability: "likely-capable", queryCount: 12, ...o,
});
const okPooled = (o: Partial<PooledProbeResult> = {}): PooledProbeResult => ({
  connected: true, readOnlyEnforced: true, serverVersion: "17.10", databaseIdentity: "db#aabbccdd…",
  identityFingerprint: "f".repeat(64), reconnectOk: true, sessionStateLeak: false,
  poolerConfidence: "consistent-with-transaction-pooling", queryCount: 4, ...o,
});

describe("preflight 결과 모델 · 실패 주입", () => {
  const cfg = cfgOf();
  const st = (d: Partial<DirectProbeResult> = {}, p: Partial<PooledProbeResult> = {}) =>
    summarizePreflight({ cfg, direct: okDirect(d), pooled: okPooled(p) });

  test("정상 → preflight-passed · write/DDL 0", () => {
    const r = st();
    assert.equal(r.status, "preflight-passed");
    assert.deepEqual(r.refusals, []);
    assert.equal(r.dbWrites, 0); assert.equal(r.ddl, 0);
    assert.equal(r.identityMatch, true);
    assert.equal(r.readOnlyState, "enforced");
  });

  test("status 모델 5종이 전부 도달 가능", () => {
    const reached = new Set<string>([
      st().status,
      st({ connected: false }).status,
      st({ readOnlyEnforced: false }).status,
      st({ publicUserTableCount: 3 }).status,
      st({}, { identityFingerprint: "e".repeat(64) }).status,
    ]);
    for (const s of PREFLIGHT_STATUSES) assert.ok(reached.has(s), `미도달 status: ${s}`);
  });

  test("실패 주입 — 각 조건이 정확한 status 로", () => {
    assert.equal(st({ connected: false }).status, "preflight-connection-failed");
    assert.equal(st({}, { connected: false }).status, "preflight-connection-failed");
    assert.equal(st({ readOnlyEnforced: false }).status, "preflight-readonly-enforcement-failed");
    assert.equal(st({}, { readOnlyEnforced: false }).status, "preflight-readonly-enforcement-failed");
    for (const inj of [
      { publicUserTableCount: 1 }, { businessTableCount: 2 }, { businessRowsPresent: true },
      { migrationHistoryCount: 1 }, { orchestrationRoleCount: 5 }, { residualCount: 3 },
      { syntheticNameConflicts: 1 }, { userSchemaCount: 2 },
    ]) {
      assert.equal(st(inj).status, "preflight-aborted-safety-guard", JSON.stringify(inj));
    }
    assert.equal(st({}, { identityFingerprint: "e".repeat(64) }).status, "preflight-target-identity-unverified");
  });

  test("실패 시에도 write/DDL 0 이며 execute 승인 불가 문구", () => {
    for (const r of [st({ connected: false }), st({ readOnlyEnforced: false }), st({ businessTableCount: 1 }), st({}, { identityFingerprint: "e".repeat(64) })]) {
      assert.equal(r.dbWrites, 0); assert.equal(r.ddl, 0);
      assert.notEqual(r.status, "preflight-passed");
      assert.match(r.nextAction, /승인 불가/);
    }
  });

  test("catalog query 실패는 probe 에서 error 로 흡수되고 write 0", async () => {
    const failing: RawDriver = {
      connect: async () => {}, end: async () => {},
      query: async (sql) => {
        const head = sql.trim().split(/\s+/)[0].toUpperCase();
        if (["BEGIN", "ROLLBACK"].includes(head) || /SET TRANSACTION/.test(sql)) return { rows: [] };
        if (/transaction_read_only.*AS ro/.test(sql)) return { rows: [{ ro: "on" }] };
        throw new Error("catalog query failed");
      },
    };
    const r = await probeDirect(failing, cfg);
    assert.equal(r.connected, true);
    assert.ok(r.error, "error 기록");
    assert.equal(summarizePreflight({ cfg, direct: r, pooled: okPooled() }).dbWrites, 0);
  });

  test("rollback 실패해도 예외가 새지 않는다", async () => {
    const d: RawDriver = {
      connect: async () => {}, end: async () => {},
      query: async (sql) => {
        if (/^ROLLBACK/i.test(sql.trim())) throw new Error("rollback failed");
        if (/transaction_read_only.*AS ro/.test(sql)) return { rows: [{ ro: "on" }] };
        return { rows: [{ server_version: "17.10" }] };
      },
    };
    const out = await ReadOnlySession.withSession(d, (s) => s.run("server-version"));
    assert.ok(out.rows.length >= 0);
  });
});

describe("masked report", () => {
  test("원문 식별자 0 · 허용 필드만", () => {
    const lines = formatPreflightReport(summarizePreflight({ cfg: cfgOf(), direct: okDirect(), pooled: okPooled() })).join("\n");
    for (const leak of ["ep-pf-1", "neon.tech", "testdb", "postgresql://", "u:p", "customers", "__drizzle_migrations", "orchestration_writer"]) {
      assert.ok(!lines.includes(leak), `${leak} 노출`);
    }
    assert.match(lines, /mode=select-only-preflight/);
    assert.match(lines, /status=preflight-passed/);
    assert.match(lines, /url#[0-9a-f]{8}…/);
    assert.match(lines, /database=db#[0-9a-f]{8}…/);
    assert.match(lines, /dbWrites=0 ddl=0/);
    assert.match(lines, /poolerConfidence=/);
    assert.match(lines, /createRoleCapability=/);
  });

  test("실패 사유에도 원문 테이블/role 이름이 없다", () => {
    const lines = formatPreflightReport(summarizePreflight({
      cfg: cfgOf(), direct: okDirect({ businessTableCount: 3, orchestrationRoleCount: 2 }), pooled: okPooled(),
    })).join("\n");
    assert.match(lines, /REFUSED/);
    for (const leak of ["customers", "calls", "orchestration_writer", "consultations"]) assert.ok(!lines.includes(leak), leak);
  });
});

describe("execute 차단 evidence (§13)", () => {
  const cfg = cfgOf();
  const passed = summarizePreflight({ cfg, direct: okDirect(), pooled: okPooled() });
  const NOW = 1_700_000_000_000;
  const ev = () => issueEvidence(cfg, passed, "f".repeat(64), NOW);

  test("evidence 없으면 execute 진입 불가", () => {
    const r = assertExecuteAllowed(cfg, null, NOW);
    assert.equal(r.ok, false);
    assert.match((r as any).refusals.join(), /evidence 없음/);
  });

  test("정상 evidence → 허용", () => {
    assert.equal(assertExecuteAllowed(cfg, ev(), NOW + 1000).ok, true);
  });

  test("status 가 passed 아니면 거부", () => {
    const bad = issueEvidence(cfg, summarizePreflight({ cfg, direct: okDirect({ businessTableCount: 1 }), pooled: okPooled() }), "f".repeat(64), NOW);
    const r = assertExecuteAllowed(cfg, bad, NOW);
    assert.equal(r.ok, false);
    assert.match((r as any).refusals.join(), /passed 아님/);
  });

  test("run-id·expected·forbidden hash 불일치 거부", () => {
    for (const other of [cfgOf({ NEON_CHECK_RUN_ID: "otherrun1" }), cfgOf({
      NEON_CHECK_DIRECT_URL: "postgresql://u:p@ep-other.aws.neon.tech/db",
      NEON_CHECK_EXPECTED_DIRECT_HOST_HASH: hostHashOf("postgresql://u:p@ep-other.aws.neon.tech/db"),
    })]) {
      const r = assertExecuteAllowed(other, ev(), NOW);
      assert.equal(r.ok, false);
    }
    const fbChanged = cfgOf({ NEON_CHECK_FORBIDDEN_POOLED_HOST_HASH: "c".repeat(64) });
    assert.equal(assertExecuteAllowed(fbChanged, ev(), NOW).ok, false);
  });

  test("integrity 변조 거부", () => {
    const tampered = { ...ev(), status: "preflight-passed" as const, runId: RUN, issuedAtMs: NOW + 5 };
    const r = assertExecuteAllowed(cfg, tampered, NOW + 10);
    assert.equal(r.ok, false);
    assert.match((r as any).refusals.join(), /integrity 불일치/);
  });

  test("freshness 만료 거부 · 미래 timestamp 거부", () => {
    assert.equal(assertExecuteAllowed(cfg, ev(), NOW + EVIDENCE_MAX_AGE_MS + 1).ok, false);
    assert.equal(assertExecuteAllowed(cfg, ev(), NOW - 1000).ok, false);
  });

  test("evidence 에 secret 이 없다", () => {
    const e = ev();
    assertNoSecrets(e);
    const json = JSON.stringify(e);
    for (const leak of ["ep-pf-1", "neon.tech", "testdb", "postgresql://", "u:p"]) assert.ok(!json.includes(leak), leak);
  });

  test("'통과했다' 문자열 같은 자기신고로는 열리지 않는다", () => {
    const fake = { ...ev(), integrity: "passed" };
    assert.equal(assertExecuteAllowed(cfg, fake as any, NOW).ok, false);
  });
});

describe("mode 모델", () => {
  test("세 모드가 플래그로 결정된다", () => {
    assert.equal(cfgOf().mode, "offline-dry-run");
    assert.equal(cfgOf({ PREFLIGHT_ONLY: "true" }).mode, "select-only-preflight");
    assert.equal(cfgOf({ CONFIRM_EXECUTE: "true" }).mode, "execute");
  });

  test("PREFLIGHT_ONLY 와 CONFIRM_EXECUTE 동시 설정 거부", () => {
    const r = parseHarnessEnv(env({ PREFLIGHT_ONLY: "true", CONFIRM_EXECUTE: "true" }));
    assert.equal(r.ok, false);
    assert.match((r as any).refusals.join(), /동시에 설정할 수 없습니다/);
  });

  test("애매한 값 거부", () => {
    for (const v of ["TRUE", "1", "yes", "True", " true "]) {
      const r = parseHarnessEnv(env({ PREFLIGHT_ONLY: v }));
      if (v.trim() === "true") continue;
      assert.equal(r.ok, false, `${v} 가 통과함`);
      assert.match((r as any).refusals.join(), /애매합니다/);
    }
  });
});
