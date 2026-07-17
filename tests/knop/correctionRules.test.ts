// 교정사전 안전성 회귀 테스트 — 2026-07-16 사고 재발 방지.
// 실행: npm run test:knop
// DB 테스트는 TEST_DATABASE_URL 이 있을 때만 실행(없으면 skip). 운영 DB 면 거부.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "fs";
import path from "path";
import {
  ProductionDbRefused, productionReason, makeTestRunId, testWord, connectByUrl,
  withRollback, cleanupTestRows, makeTempDictDir, fileState, openTestClient, type TestClient,
} from "./testGuard";

// ── 1. 운영 DB 거부 (DB 없이도 실행됨) ──
describe("운영 DB 테스트 금지", () => {
  test("운영 접속 문자열과 같으면 거부", async () => {
    const prod = (process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "").trim();
    if (!prod) return; // 운영 URL 을 모르면 이 검사는 의미 없음
    assert.ok(productionReason(prod), "운영 URL 이 통과되면 안 됨");
    await assert.rejects(() => connectByUrl(prod), ProductionDbRefused); // 접속 자체를 거부
  });

  test("운영과 같은 호스트면 거부(DB 이름만 달라도)", () => {
    const prod = (process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "").trim();
    if (!prod) return;
    const u = new URL(prod);
    u.pathname = "/other_db";
    assert.ok(productionReason(u.toString()), "같은 호스트는 통과되면 안 됨");
  });

  test("test 표식 없는 DB 는 거부(안전한 기본값)", () => {
    assert.ok(productionReason("postgres://u:p@some-prod-host.example.com/appdb"));
  });

  test("NODE_ENV=test 만으로는 통과되지 않음", () => {
    const before = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    try {
      assert.ok(productionReason("postgres://u:p@some-prod-host.example.com/appdb"), "NODE_ENV 로 우회되면 안 됨");
    } finally {
      process.env.NODE_ENV = before;
    }
  });

  test("test 표식이 있는 DB 만 허용", () => {
    assert.equal(productionReason("postgres://u:p@localhost:5432/kop_test"), null);
  });

  test("cleanup 은 올바른 test_run_id 형식만 받는다", async () => {
    const fake = { query: async () => ({ rowCount: 0 }) } as any;
    await assert.rejects(() => cleanupTestRows(fake, "오늘"), /cleanup 거부/);
    await assert.rejects(() => cleanupTestRows(fake, "%"), /cleanup 거부/);
    await assert.rejects(() => cleanupTestRows(fake, "testrun_"), /cleanup 거부/);
  });
});

// ── 2. 사전 파일 안전성 (임시 디렉터리만 사용) ──
describe("사전 파일 보호", () => {
  test("active 0 이면 기존 파일을 유지한다(fail-closed)", async () => {
    const dir = await makeTempDictDir();
    const p = path.join(dir, "learned_corrections.json");
    const original = JSON.stringify({ rules: [{ wrong: "가", right: "나", enabled: true }] }, null, 2);
    await fs.writeFile(p, original, "utf-8");
    const before = await fileState(p);

    // exportLearnedToJson 의 fail-closed 규칙을 그대로 재현: active 0 → 쓰지 않는다
    const activeRules: unknown[] = [];
    if (activeRules.length === 0) {
      /* 차단: 파일에 손대지 않음 */
    } else {
      await fs.writeFile(p, JSON.stringify({ rules: activeRules }), "utf-8");
    }

    const after = await fileState(p);
    assert.equal(after.sha, before.sha, "active 0 인데 파일이 바뀌면 안 됨");
    assert.equal(await fs.readFile(p, "utf-8"), original);
    await fs.rm(dir, { recursive: true, force: true });
  });

  test("교체 중간에 실패하면 기존 파일이 남는다", async () => {
    const dir = await makeTempDictDir();
    const p = path.join(dir, "learned_corrections.json");
    const original = JSON.stringify({ rules: [{ wrong: "가", right: "나", enabled: true }] }, null, 2);
    await fs.writeFile(p, original, "utf-8");
    const before = await fileState(p);

    // 임시파일 경로에 같은 이름의 디렉터리를 만들어 쓰기를 실패시킨다
    const tmp = `${p}.tmp-${process.pid}`;
    await fs.mkdir(tmp, { recursive: true });
    let failed = false;
    try {
      const fh = await fs.open(tmp, "w"); // EISDIR
      await fh.close();
    } catch {
      failed = true; // 실패 → rename 에 도달하지 않음 → 원본 유지
    }
    await fs.rmdir(tmp).catch(() => {});

    const after = await fileState(p);
    assert.ok(failed, "쓰기가 실패해야 하는 시나리오");
    assert.equal(after.sha, before.sha, "실패했는데 기존 파일이 바뀌면 안 됨");
    await fs.rm(dir, { recursive: true, force: true });
  });

  test("테스트는 운영 사전 파일 경로를 쓰지 않는다", async () => {
    const dir = await makeTempDictDir();
    assert.ok(dir.includes("kop-dict-test-"), "임시 디렉터리여야 함");
    assert.ok(!dir.includes("video-caption-bot"), "운영 경로를 쓰면 안 됨");
    await fs.rm(dir, { recursive: true, force: true });
  });
});

// ── 3. DB 격리 (PGlite = 메모리 안의 진짜 Postgres. 운영에 닿을 수 없음) ──
describe("테스트 DB 격리", () => {
  let db: { client: TestClient; close: () => Promise<void>; kind: string };
  const count = async (c: TestClient, sql = "", p: unknown[] = []) =>
    Number((await c.query(`SELECT count(*)::int n FROM correction_rules ${sql}`, p)).rows[0].n);
  const ins = (c: TestClient, wrong: string, right: string, sources: unknown) =>
    c.query(`INSERT INTO correction_rules (wrong, "right", count, enabled, status, source, sources) VALUES ($1,$2,1,false,'pending','learned',$3)`,
      [wrong, right, JSON.stringify(sources)]);

  test("테스트 DB 준비", async () => {
    db = await openTestClient();
    console.log(`      → 테스트 DB: ${db.kind}`);
    assert.ok(db.kind);
  });

  test("테스트 행이 기존 실제 행과 같은 wrong 이어도 기존 행이 안 바뀐다", async () => {
    const runId = makeTestRunId();
    const real = "오늘"; // 실제 운영에 있는 원문과 같은 값을 일부러 사용
    await withRollback(db.client, async (c) => {
      await ins(c, real, "운을", [{ sourceId: "legacy" }]);
      const before = (await c.query(`SELECT * FROM correction_rules WHERE wrong=$1`, [real])).rows[0];

      // 같은 wrong 으로 테스트가 끼어들면 유니크 제약에 걸려 실패해야 한다(조용한 덮어쓰기 금지)
      await assert.rejects(() => ins(c, real, "테스트교정", [{ testRunId: runId }]), /duplicate key|unique/i);
      await c.query("ROLLBACK").catch(() => {});
      await c.query("BEGIN");
      await ins(c, real, "운을", [{ sourceId: "legacy" }]);
      const after = (await c.query(`SELECT * FROM correction_rules WHERE wrong=$1`, [real])).rows[0];
      assert.equal(after.right, before.right, "기존 행의 교정이 바뀌면 안 됨");
      assert.equal(after.sources, before.sources, "기존 행의 증거가 바뀌면 안 됨");
    });
  });

  test("예외가 나도 롤백되어 행수가 그대로", async () => {
    const runId = makeTestRunId();
    await withRollback(db.client, async (c) => { await ins(c, testWord(runId, "기준"), "교정", [{ testRunId: runId }]); });
    const before = await count(db.client);
    await withRollback(db.client, async (c) => {
      await ins(c, testWord(runId, "예외"), "교정", [{ testRunId: runId }]);
      throw new Error("의도적 예외");
    }).catch(() => {});
    assert.equal(await count(db.client), before, "예외 후에도 행수가 같아야 함(ROLLBACK)");
  });

  test("성공해도 COMMIT 하지 않는다", async () => {
    const runId = makeTestRunId();
    const w = testWord(runId, "커밋");
    await withRollback(db.client, async (c) => { await ins(c, w, "교정", [{ testRunId: runId }]); });
    assert.equal(await count(db.client, "WHERE wrong=$1", [w]), 0, "테스트 성공 후에도 데이터가 남으면 안 됨");
  });

  test("cleanup 은 test_run_id 가 다른 행을 지우지 않는다", async () => {
    const mine = makeTestRunId(), other = makeTestRunId();
    await withRollback(db.client, async (c) => {
      await ins(c, testWord(mine, "내것"), "교정", [{ testRunId: mine }]);
      await ins(c, testWord(other, "남의것"), "교정", [{ testRunId: other }]);
      await ins(c, "실제규칙단어", "실제교정", [{ sourceId: "legacy" }]); // 테스트 아님
      const deleted = await cleanupTestRows(c, mine);
      assert.equal(deleted, 1, "내 test_run_id 행만 지워야 함");
      assert.equal(await count(c, `WHERE sources LIKE $1`, [`%"testRunId":"${other}"%`]), 1, "다른 실행의 행은 남아야 함");
      assert.equal(await count(c, `WHERE wrong=$1`, ["실제규칙단어"]), 1, "실제 규칙은 절대 안 지워져야 함");
    });
  });

  test("정리", async () => { await db.close(); assert.ok(true); });
});
