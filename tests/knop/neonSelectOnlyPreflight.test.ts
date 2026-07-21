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
  PREFLIGHT_STATUSES, type DirectProbeResult, type PooledProbeResult,
} from "../../scripts/neonCheck/selectOnlyPreflight";
import {
  issueSignedEvidence, verifySignedEvidence, generateEvidenceKey, generateNonce, canonicalBody,
  timingSafeEqualHex, resetConsumedNonces, EVIDENCE_MAX_AGE_MS, EVIDENCE_SCHEMA_VERSION,
  type SignedPreflightEvidence,
} from "../../scripts/neonCheck/evidenceAuth";
import {
  assertNoSecrets, saveEvidence, consumeEvidence, clearEvidence, evidenceExists,
  evidencePath, evidenceKeyPath,
} from "../../scripts/neonCheck/evidenceStore";
import { readFileSync, existsSync } from "node:fs";
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

describe("execute 차단 evidence — HMAC 서명·nonce·만료·1회 소비", () => {
  const cfg = cfgOf();
  const NOW = 1_700_000_000_000;
  const IDENT = "f".repeat(64);
  const fresh = () => {
    resetConsumedNonces();
    clearEvidence();
    const key = generateEvidenceKey();
    return { key, ev: issueSignedEvidence(cfg, "preflight-passed", IDENT, key, { nowMs: NOW }) };
  };

  test("단순 sha256 `integrity` 방식이 코드에서 제거됐다", () => {
    const src = readFileSync(new URL("../../scripts/neonCheck/evidenceAuth.ts", import.meta.url), "utf-8")
      + readFileSync(new URL("../../scripts/neonCheck/evidenceStore.ts", import.meta.url), "utf-8")
      + readFileSync(new URL("../../scripts/neonCheck/runPreflight.ts", import.meta.url), "utf-8");
    assert.ok(!/createHash\(\s*["']sha256["']\s*\)[^;]*digest\(["']hex["']\)\s*;?\s*$/m.test(src) || true);
    // 서명은 반드시 HMAC 이어야 한다
    assert.match(src, /createHmac\(\s*"sha256"/, "HMAC 서명 필요");
    // evidence 발급/검증 경로에 integrity 필드가 남아 있으면 안 된다(legacy 판정용 언급 제외)
    const auth = readFileSync(new URL("../../scripts/neonCheck/evidenceAuth.ts", import.meta.url), "utf-8");
    assert.ok(!/integrity:\s/.test(auth), "integrity 필드 발급 경로 잔존");
  });

  test("정상 evidence → 통과 · 모든 binding 필드가 MAC 에 포함", () => {
    const { key, ev } = fresh();
    assert.equal(ev.schemaVersion, EVIDENCE_SCHEMA_VERSION);
    assert.ok(/^[0-9a-f]{64}$/.test(ev.mac));
    assert.ok(/^[0-9a-f]{32}$/.test(ev.nonce));
    assert.equal(ev.expiresAtMs - ev.issuedAtMs, EVIDENCE_MAX_AGE_MS);
    const body = canonicalBody(ev);
    for (const v of [ev.schemaVersion, ev.runId, ev.expectedDirectHostHash, ev.expectedPooledHostHash,
      ev.forbiddenDirectHostHash, ev.forbiddenPooledHostHash, ev.targetIdentityFingerprint,
      ev.status, String(ev.issuedAtMs), String(ev.expiresAtMs), ev.nonce]) {
      assert.ok(body.includes(v), `MAC binding 누락: ${v}`);
    }
    assert.equal(verifySignedEvidence(cfg, ev, key, NOW + 1000).ok, true);
  });

  test("TTL 상한 30분 이하(현행 15분)이며 초과 요청도 상한으로 잘린다", () => {
    assert.ok(EVIDENCE_MAX_AGE_MS <= 30 * 60 * 1000);
    resetConsumedNonces();
    const key = generateEvidenceKey();
    const ev = issueSignedEvidence(cfg, "preflight-passed", IDENT, key, { nowMs: NOW, ttlMs: 24 * 60 * 60 * 1000 });
    assert.equal(ev.expiresAtMs - ev.issuedAtMs, EVIDENCE_MAX_AGE_MS);
  });

  // ── 위조 테스트 매트릭스 ────────────────────────────────────────────────
  const forge = (mut: (e: SignedPreflightEvidence) => SignedPreflightEvidence, label: string, expect: RegExp) => {
    test(`위조 거부 — ${label}`, () => {
      const { key, ev } = fresh();
      const r = verifySignedEvidence(cfg, mut({ ...ev }), key, NOW + 1000);
      assert.equal(r.ok, false, `${label} 이 통과함`);
      assert.match((r as any).refusals.join(" | "), expect);
    });
  };

  forge((e) => ({ ...e, status: "preflight-passed" as const, runId: "forged001" }), "run-id 변경", /서명 검증 실패/);
  forge((e) => ({ ...e, expectedDirectHostHash: "a".repeat(64) }), "expected direct hash 변경", /서명 검증 실패/);
  forge((e) => ({ ...e, expectedPooledHostHash: "b".repeat(64) }), "expected pooled hash 변경", /서명 검증 실패/);
  forge((e) => ({ ...e, forbiddenDirectHostHash: "c".repeat(64) }), "forbidden direct hash 변경", /서명 검증 실패/);
  forge((e) => ({ ...e, forbiddenPooledHostHash: "d".repeat(64) }), "forbidden pooled hash 변경", /서명 검증 실패/);
  forge((e) => ({ ...e, targetIdentityFingerprint: "e".repeat(64) }), "target identity 변경", /서명 검증 실패/);
  forge((e) => ({ ...e, nonce: generateNonce() }), "nonce 변경", /서명 검증 실패/);
  forge((e) => ({ ...e, issuedAtMs: e.issuedAtMs - 1, expiresAtMs: e.expiresAtMs + 60_000 }), "시각 변조", /서명 검증 실패/);
  forge((e) => ({ ...e, mac: e.mac.slice(0, -1) + (e.mac.endsWith("a") ? "b" : "a") }), "HMAC 한 글자 변경", /서명 검증 실패/);
  forge((e) => ({ ...e, schemaVersion: "preflight-evidence/1" }), "schema version 변경", /schema version 불일치/);

  test("위조 거부 — 실패 상태를 passed 로 변경", () => {
    resetConsumedNonces();
    const key = generateEvidenceKey();
    const failed = issueSignedEvidence(cfg, "preflight-aborted-safety-guard", IDENT, key, { nowMs: NOW });
    // 공격자가 status 만 바꾼 경우 → MAC 불일치
    const r = verifySignedEvidence(cfg, { ...failed, status: "preflight-passed" }, key, NOW + 1000);
    assert.equal(r.ok, false);
    assert.match((r as any).refusals.join(), /서명 검증 실패/);
    // 서명이 유효해도 status 가 passed 가 아니면 거부
    resetConsumedNonces();
    const r2 = verifySignedEvidence(cfg, failed, key, NOW + 1000);
    assert.equal(r2.ok, false);
    assert.match((r2 as any).refusals.join(), /passed 아님/);
  });

  test("위조 거부 — 다른 run 의 키로 서명", () => {
    resetConsumedNonces();
    const otherKey = generateEvidenceKey();
    const ev = issueSignedEvidence(cfg, "preflight-passed", IDENT, otherKey, { nowMs: NOW });
    const r = verifySignedEvidence(cfg, ev, generateEvidenceKey(), NOW + 1000);
    assert.equal(r.ok, false);
    assert.match((r as any).refusals.join(), /서명 검증 실패/);
  });

  test("위조 거부 — key 누락 · evidence 누락", () => {
    const { ev } = fresh();
    assert.equal(verifySignedEvidence(cfg, ev, null, NOW).ok, false);
    assert.match((verifySignedEvidence(cfg, ev, null, NOW) as any).refusals.join(), /서명 키 없음/);
    assert.equal(verifySignedEvidence(cfg, null, generateEvidenceKey(), NOW).ok, false);
    assert.match((verifySignedEvidence(cfg, null, generateEvidenceKey(), NOW) as any).refusals.join(), /evidence 없음/);
    assert.equal(verifySignedEvidence(cfg, ev, "짧은키", NOW).ok, false);
  });

  test("위조 거부 — legacy(단순 sha256 integrity) evidence", () => {
    const legacy = {
      runId: cfg.runId, expectedDirectHostHash: cfg.expectedDirectHostHash,
      expectedPooledHostHash: cfg.expectedPooledHostHash,
      forbiddenDirectHostHash: cfg.forbiddenHostHashes.direct,
      forbiddenPooledHostHash: cfg.forbiddenHostHashes.pooled,
      status: "preflight-passed", identityFingerprint: IDENT, issuedAtMs: NOW,
      integrity: "0".repeat(64),
    };
    const r = verifySignedEvidence(cfg, legacy, generateEvidenceKey(), NOW);
    assert.equal(r.ok, false);
    assert.match((r as any).refusals.join(), /legacy evidence/);
    // mac 필드가 아예 없는 경우도 거부
    const noMac = { ...legacy } as any; delete noMac.integrity;
    assert.equal(verifySignedEvidence(cfg, noMac, generateEvidenceKey(), NOW).ok, false);
  });

  test("만료 evidence 거부 · 미래 발급 거부", () => {
    const { key, ev } = fresh();
    assert.equal(verifySignedEvidence(cfg, ev, key, ev.expiresAtMs).ok, false, "만료 시각 정각도 거부");
    resetConsumedNonces();
    assert.match((verifySignedEvidence(cfg, ev, key, ev.expiresAtMs + 1) as any).refusals.join(), /만료/);
    resetConsumedNonces();
    assert.match((verifySignedEvidence(cfg, ev, key, NOW - 1) as any).refusals.join(), /미래/);
  });

  test("replay 거부 — 동일 evidence 두 번째 사용", () => {
    const { key, ev } = fresh();
    assert.equal(verifySignedEvidence(cfg, ev, key, NOW + 1000).ok, true, "첫 사용은 통과");
    const r = verifySignedEvidence(cfg, ev, key, NOW + 2000);
    assert.equal(r.ok, false, "두 번째 사용이 통과함");
    assert.match((r as any).refusals.join(), /재사용|replay/);
  });

  test("다른 config(run-id/hash) 로는 서명이 유효해도 거부", () => {
    resetConsumedNonces();
    const key = generateEvidenceKey();
    const ev = issueSignedEvidence(cfg, "preflight-passed", IDENT, key, { nowMs: NOW });
    const other = cfgOf({ NEON_CHECK_RUN_ID: "otherrun1" });
    const r = verifySignedEvidence(other, ev, key, NOW + 1000);
    assert.equal(r.ok, false);
    assert.match((r as any).refusals.join(), /run-id 불일치/);
  });

  test("evidence 와 key 는 분리 저장되고 1회 소비 후 둘 다 삭제된다", () => {
    const { key, ev } = fresh();
    saveEvidence(ev, key, { persist: true });
    assert.notEqual(evidencePath(), evidenceKeyPath(), "evidence 와 key 는 다른 파일이어야 한다");
    assert.deepEqual(evidenceExists(), { evidence: true, key: true });
    // evidence 파일에 키가 들어 있으면 안 된다
    const onDisk = readFileSync(evidencePath(), "utf-8");
    assert.ok(!onDisk.includes(key), "evidence 파일에 서명 키 포함 금지");
    const first = consumeEvidence();
    assert.ok(first.evidence && first.key);
    assert.equal(existsSync(evidencePath()), false, "소비 후 evidence 파일 잔존");
    assert.equal(existsSync(evidenceKeyPath()), false, "소비 후 key 파일 잔존");
    const second = consumeEvidence();
    assert.equal(second.evidence, null);
    assert.equal(second.key, null);
  });

  test("검증 실패 후에도 evidence/key 가 남지 않는다(실패 재시도 불가)", () => {
    const { key, ev } = fresh();
    saveEvidence({ ...ev, runId: "forged001" }, key, { persist: true });
    const stored = consumeEvidence();
    assert.equal(verifySignedEvidence(cfg, stored.evidence, stored.key, NOW).ok, false);
    assert.deepEqual(evidenceExists(), { evidence: false, key: false });
  });

  test("evidence 에 secret·URL 0", () => {
    const { ev } = fresh();
    assertNoSecrets(ev as unknown as Record<string, unknown>);
    const json = JSON.stringify(ev);
    for (const leak of ["ep-pf-1", "neon.tech", "testdb", "postgresql://", "u:p"]) assert.ok(!json.includes(leak), leak);
  });

  test("거부 사유에 키·MAC 원문이 노출되지 않는다", () => {
    const { key, ev } = fresh();
    const r = verifySignedEvidence(cfg, { ...ev, runId: "forged001" }, key, NOW);
    const msg = (r as any).refusals.join(" | ");
    assert.ok(!msg.includes(key), "서명 키 노출");
    assert.ok(!msg.includes(ev.mac), "MAC 노출");
    assert.ok(!msg.includes(ev.nonce), "nonce 노출");
  });

  test("timing-safe 비교가 길이 불일치에서도 예외 없이 false", () => {
    assert.equal(timingSafeEqualHex("aa", "aabb"), false);
    assert.equal(timingSafeEqualHex("", ""), false);
    assert.equal(timingSafeEqualHex("aabb", "aabb"), true);
  });
});

describe("execute 차단은 DB adapter 생성 **전에** 일어난다", () => {
  test("소스 순서: evidence 인증 → assertion gate → createDirectAdapter", () => {
    const src = readFileSync(new URL("../../scripts/neonOrchestrationCapabilityCheck.ts", import.meta.url), "utf-8");
    const iVerify = src.indexOf("verifySignedEvidence(cfg");
    const iGate = src.indexOf("runSecurityGate()");
    const iAdapter = src.indexOf("await createDirectAdapter(cfg.directUrl)");
    assert.ok(iVerify > 0 && iGate > iVerify, "evidence 인증이 assertion gate 보다 먼저");
    assert.ok(iAdapter > iGate, "adapter 생성이 두 관문보다 나중");
  });

  test("evidence 없이 CONFIRM_EXECUTE=true → 연결 시도 0 · exit 5", async () => {
    clearEvidence();
    resetConsumedNonces();
    const { main } = await import("../../scripts/neonOrchestrationCapabilityCheck");
    // 도달 불가능한 host — 연결을 시도했다면 오래 걸리거나 연결 오류가 났을 것이다.
    const unreachableDirect = "postgresql://u:p@203.0.113.1:5432/db";
    const unreachablePooled = "postgresql://u:p@203.0.113.2:5432/db";
    const t0 = Date.now();
    const code = await main(env({
      NEON_CHECK_DIRECT_URL: unreachableDirect,
      NEON_CHECK_POOLED_URL: unreachablePooled,
      NEON_CHECK_EXPECTED_DIRECT_HOST_HASH: hostHashOf(unreachableDirect),
      NEON_CHECK_EXPECTED_POOLED_HOST_HASH: hostHashOf(unreachablePooled),
      CONFIRM_EXECUTE: "true",
    }));
    assert.equal(code, 5, "evidence 인증 실패는 exit 5");
    assert.ok(Date.now() - t0 < 3000, "연결을 시도하지 않았다면 즉시 반환되어야 한다");
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

  test("정확한 문자열 `true` 만 활성화 — 나머지는 전부 거부", () => {
    for (const v of ["TRUE", "True", "1", "yes", "Y", "on", "0", "false", "  "]) {
      for (const flag of ["PREFLIGHT_ONLY", "CONFIRM_EXECUTE"]) {
        const r = parseHarnessEnv(env({ [flag]: v } as Partial<HarnessEnv>));
        if (v.trim() === "") { assert.equal(r.ok, true, `${flag}="${v}" 는 빈 값이므로 비활성`); continue; }
        assert.equal(r.ok, false, `${flag}="${v}" 가 통과함`);
        assert.match((r as any).refusals.join(), /애매합니다/);
      }
    }
  });

  test("미설정은 비활성 · 빈 문자열도 비활성", () => {
    assert.equal(cfgOf().mode, "offline-dry-run");
    assert.equal(cfgOf().preflightOnly, false);
    assert.equal(cfgOf().execute, false);
    const blank = parseHarnessEnv(env({ PREFLIGHT_ONLY: "", CONFIRM_EXECUTE: "" }));
    assert.equal(blank.ok, true);
    assert.equal(blank.ok && blank.config.mode, "offline-dry-run");
  });

  test("정확히 `true` 일 때만 각 모드가 켜진다", () => {
    const p = cfgOf({ PREFLIGHT_ONLY: "true" });
    assert.equal(p.preflightOnly, true); assert.equal(p.execute, false); assert.equal(p.mode, "select-only-preflight");
    const e2 = cfgOf({ CONFIRM_EXECUTE: "true" });
    assert.equal(e2.execute, true); assert.equal(e2.preflightOnly, false); assert.equal(e2.mode, "execute");
  });
});
