// 범용 마이그레이션 러너 검증 (PGlite = 기존 의존성, 운영 DB 미접촉).
// server/migrate.ts 의 'report_matches' 하드코딩을 일반화한 러너가 0001·0002 를 안전하게 다루는지,
// 위험 SQL·불완전 상태·구조 불일치를 전부 차단하는지 확인한다.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  runMigration,
  scanSql,
  verifyPostApply,
  isSuccessOutcome,
  type RunnerClient,
} from "../../server/migrations/runner";
import { findMigration, MIGRATIONS } from "../../server/migrations/registry";
import { computeCatalogFingerprint, fingerprintMatches } from "../../server/migrations/catalogFingerprint";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");
const readSql = (f: string) => readFileSync(path.join(root, "migrations", f), "utf-8");
const readFixture = (f: string) => JSON.parse(readFileSync(path.join(root, f), "utf-8"));

const DEF_0001 = findMigration("0001_add_report_matches")!;
const DEF_0002 = findMigration("0002_create_persistent_job_queue")!;
const SQL_0001 = readSql(DEF_0001.sqlFile);
const SQL_0002 = readSql(DEF_0002.sqlFile);
const FP_0001 = readFixture(DEF_0001.fingerprintFixture!);
const FP_0002 = readFixture(DEF_0002.fingerprintFixture!);

async function freshPg() {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  const client: RunnerClient = {
    query: (sql, params) => db.query(sql, params as any[]) as any,
    exec: (sql) => db.exec(sql).then(() => undefined),
  };
  return { db, client };
}
const listTables = async (db: any): Promise<string[]> =>
  (await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`)).rows.map((r: any) => r.tablename);
// 0001 FK 대상 + 불변 대조용 데이터 sentinel.
async function seedFor0001(db: any) {
  await db.exec(`CREATE TABLE customers (id varchar PRIMARY KEY);
    CREATE TABLE consultations (id varchar PRIMARY KEY);
    CREATE TABLE sentinel (id varchar PRIMARY KEY, v text);
    INSERT INTO sentinel(id,v) VALUES ('a','1'),('b','2');`);
}
const sentinelCount = async (db: any) => (await db.query(`SELECT count(*)::int n FROM sentinel`)).rows[0].n;

describe("범용 마이그레이션 러너", () => {
  // 1
  test("0001 dry-run: 검증 통과·미적용(ROLLBACK)·sentinel 불변", async () => {
    const { db, client } = await freshPg();
    try {
      await seedFor0001(db);
      const before = await sentinelCount(db);
      const r = await runMigration(client, DEF_0001, { sqlText: SQL_0001, fixture: FP_0001, apply: false });
      assert.equal(r.outcome, "dry-run-verified");
      assert.equal(r.committed, false);
      assert.deepEqual(r.createdTables, ["report_matches"]);
      assert.ok(!(await listTables(db)).includes("report_matches"), "dry-run 후 report_matches 없어야");
      assert.equal(await sentinelCount(db), before, "sentinel 데이터 불변");
    } finally {
      await db.close();
    }
  });

  // 2
  test("0001 apply: COMMIT·report_matches 존속·sentinel 불변", async () => {
    const { db, client } = await freshPg();
    try {
      await seedFor0001(db);
      const r = await runMigration(client, DEF_0001, { sqlText: SQL_0001, fixture: FP_0001, apply: true });
      assert.equal(r.outcome, "applied");
      assert.equal(r.committed, true);
      assert.ok((await listTables(db)).includes("report_matches"), "apply 후 report_matches 존재");
      assert.equal(await sentinelCount(db), 2, "sentinel 불변");
    } finally {
      await db.close();
    }
  });

  // 3
  test("0001 재실행: 이미 적용됨(구조 fingerprint 일치)", async () => {
    const { db, client } = await freshPg();
    try {
      await seedFor0001(db);
      await runMigration(client, DEF_0001, { sqlText: SQL_0001, fixture: FP_0001, apply: true });
      const r = await runMigration(client, DEF_0001, { sqlText: SQL_0001, fixture: FP_0001, apply: false });
      assert.equal(r.outcome, "already-applied");
      assert.ok(isSuccessOutcome(r.outcome));
    } finally {
      await db.close();
    }
  });

  // 4
  test("스캔: 0001 주석 속 'DROP/DELETE/ALTER' 오탐 없음 + 레지스트리 경로 조회", () => {
    assert.deepEqual(scanSql(SQL_0001, DEF_0001.expectedNewTables), { safe: true });
    assert.deepEqual(scanSql(SQL_0002, DEF_0002.expectedNewTables), { safe: true });
    // 경로 형식으로도 조회되어야(기존 CLI 하위호환)
    assert.equal(findMigration("migrations/0001_add_report_matches.sql")?.id, "0001_add_report_matches");
    assert.equal(MIGRATIONS.length, 2);
  });

  // 5
  test("0002 dry-run: 2테이블 검증·미적용(ROLLBACK)", async () => {
    const { db, client } = await freshPg();
    try {
      const r = await runMigration(client, DEF_0002, { sqlText: SQL_0002, fixture: FP_0002, apply: false });
      assert.equal(r.outcome, "dry-run-verified");
      assert.deepEqual([...r.createdTables].sort(), ["job_executions", "jobs"]);
      const t = await listTables(db);
      assert.ok(!t.includes("jobs") && !t.includes("job_executions"), "dry-run 후 큐 테이블 없어야");
    } finally {
      await db.close();
    }
  });

  // 6
  test("0002 apply: COMMIT·구조가 fixture 와 정확 일치", async () => {
    const { db, client } = await freshPg();
    try {
      const r = await runMigration(client, DEF_0002, { sqlText: SQL_0002, fixture: FP_0002, apply: true });
      assert.equal(r.outcome, "applied");
      assert.equal(r.committed, true);
      const fp = await computeCatalogFingerprint(client, ["jobs", "job_executions"]);
      assert.ok(fingerprintMatches(fp, FP_0002), "적용 구조 == fixture");
    } finally {
      await db.close();
    }
  });

  // 7
  test("0002 재실행: 이미 적용됨", async () => {
    const { db, client } = await freshPg();
    try {
      await runMigration(client, DEF_0002, { sqlText: SQL_0002, fixture: FP_0002, apply: true });
      const r = await runMigration(client, DEF_0002, { sqlText: SQL_0002, fixture: FP_0002, apply: false });
      assert.equal(r.outcome, "already-applied");
    } finally {
      await db.close();
    }
  });

  // 8
  test("0002 불완전(jobs 만 존재): 중단·job_executions 미생성", async () => {
    const { db, client } = await freshPg();
    try {
      await db.exec(`CREATE TABLE jobs (id varchar PRIMARY KEY);`); // 일부만 존재
      const r = await runMigration(client, DEF_0002, { sqlText: SQL_0002, fixture: FP_0002, apply: true });
      assert.equal(r.outcome, "aborted-incomplete");
      assert.equal(r.committed, false);
      assert.ok(!(await listTables(db)).includes("job_executions"), "job_executions 생성 안 됨");
    } finally {
      await db.close();
    }
  });

  // 9
  test("0002 구조 불일치(잘못된 기존 테이블): fingerprint mismatch 로 중단", async () => {
    const { db, client } = await freshPg();
    try {
      await db.exec(`CREATE TABLE jobs (id integer PRIMARY KEY);
        CREATE TABLE job_executions (id integer PRIMARY KEY);`); // 전부 존재하나 구조 상이
      const r = await runMigration(client, DEF_0002, { sqlText: SQL_0002, fixture: FP_0002, apply: false });
      assert.equal(r.outcome, "aborted-fingerprint-mismatch");
      assert.equal(r.committed, false);
    } finally {
      await db.close();
    }
  });

  // 10
  test("스캔: DROP 포함 SQL 거부(트랜잭션 미개시)", async () => {
    const { db, client } = await freshPg();
    try {
      await seedFor0001(db);
      const r = await runMigration(client, DEF_0001, { sqlText: `DROP TABLE customers;`, fixture: null, apply: true });
      assert.equal(r.outcome, "rejected-unsafe-sql");
      assert.match(r.detail, /DROP/);
    } finally {
      await db.close();
    }
  });

  // 11
  test("스캔: 기존 테이블 DELETE 포함 거부", async () => {
    const { client, db } = await freshPg();
    try {
      const r = await runMigration(client, DEF_0001, {
        sqlText: `CREATE TABLE report_matches(id integer); DELETE FROM customers;`,
        fixture: null,
        apply: true,
      });
      assert.equal(r.outcome, "rejected-unsafe-sql");
      assert.match(r.detail, /DELETE/);
    } finally {
      await db.close();
    }
  });

  // 12
  test("스캔: expectedNewTables 밖 CREATE TABLE 거부", async () => {
    const { client, db } = await freshPg();
    try {
      const r = await runMigration(client, DEF_0001, { sqlText: `CREATE TABLE evil(id integer);`, fixture: null, apply: true });
      assert.equal(r.outcome, "rejected-unsafe-sql");
      assert.match(r.detail, /evil/);
    } finally {
      await db.close();
    }
  });

  // 13
  test("스캔: 기존 테이블 ALTER 거부", async () => {
    const { client, db } = await freshPg();
    try {
      const r = await runMigration(client, DEF_0001, {
        sqlText: `CREATE TABLE report_matches(id integer); ALTER TABLE customers ADD COLUMN x integer;`,
        fixture: null,
        apply: true,
      });
      assert.equal(r.outcome, "rejected-unsafe-sql");
      assert.match(r.detail, /customers/);
    } finally {
      await db.close();
    }
  });

  // 14
  test("tx 내부: 기대 테이블 미생성 시 중단·ROLLBACK", async () => {
    const { db, client } = await freshPg();
    try {
      const def = { ...DEF_0002, expectedNewTables: ["jobs", "job_executions", "phantom"], fingerprintFixture: undefined };
      const r = await runMigration(client, def, { sqlText: SQL_0002, fixture: null, apply: true });
      assert.equal(r.outcome, "aborted-missing-tables");
      assert.match(r.detail, /phantom/);
      assert.ok(!(await listTables(db)).includes("jobs"), "ROLLBACK 으로 jobs 도 없어야");
    } finally {
      await db.close();
    }
  });

  // 15
  test("verifyPostApply 순수검증: 예상밖 테이블·기존행 변동 감지", () => {
    // 정상
    assert.deepEqual(verifyPostApply({ a: 3 }, { a: 3, jobs: 0 }, ["jobs"]), { ok: true, newTables: ["jobs"] });
    // 예상 밖 테이블 생성
    const stray = verifyPostApply({ a: 3 }, { a: 3, jobs: 0, extra: 0 }, ["jobs"]);
    assert.equal(stray.ok, false);
    assert.equal((stray as any).outcome, "aborted-unexpected-tables");
    // 기존 테이블 행 수 변동
    const changed = verifyPostApply({ a: 3 }, { a: 5, jobs: 0 }, ["jobs"]);
    assert.equal(changed.ok, false);
    assert.equal((changed as any).outcome, "aborted-existing-data-changed");
  });
});
