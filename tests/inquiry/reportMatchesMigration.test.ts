// report_matches 마이그레이션 검증 (PGlite = 메모리 Postgres). 운영 DB 안 씀.
// - 마이그레이션 SQL 이 파싱/실행되는가
// - 새 테이블 생성 + 인덱스 + FK 동작
// - 기존(스텁) 테이블은 무변경
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PGlite } from "@electric-sql/pglite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.join(__dirname, "../../migrations/0001_add_report_matches.sql");

// 기존 테이블 스텁 (FK 대상 + 무변경 검증용)
const STUB = `
CREATE TABLE customers (id varchar PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, deleted_at timestamp);
CREATE TABLE consultations (id varchar PRIMARY KEY DEFAULT gen_random_uuid(), phone text NOT NULL);
CREATE TABLE crm_files (id varchar PRIMARY KEY DEFAULT gen_random_uuid(), memo text);`;

describe("report_matches 마이그레이션 (PGlite)", () => {
  let db: PGlite;
  before(async () => {
    db = new PGlite();
    await db.exec(STUB);
    // 기존 데이터 몇 건
    await db.exec(`INSERT INTO customers (name) VALUES ('이은혜'),('이은혜'),('김유진');
                   INSERT INTO consultations (phone) VALUES ('01000000000');
                   INSERT INTO crm_files (memo) VALUES ('이름분석표:x.pdf');`);
  });
  after(async () => { await db.close(); });

  const counts = async () => {
    const t = (await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'`)) as any;
    const out: Record<string, number> = {};
    for (const r of t.rows) {
      const n = (await db.query(`SELECT count(*)::int AS n FROM "${r.tablename}"`)) as any;
      out[r.tablename] = n.rows[0].n;
    }
    return out;
  };

  test("마이그레이션 적용 → report_matches 생성, 기존 테이블 무변경", async () => {
    const before = await counts();
    const sql = fs.readFileSync(MIGRATION, "utf-8");
    await db.exec(sql); // 마이그레이션 실행

    const after = await counts();
    assert.ok("report_matches" in after, "report_matches 테이블이 생겨야 함");
    for (const t of Object.keys(before)) {
      assert.equal(after[t], before[t], `기존 테이블 ${t} 행 수 불변이어야 함`);
    }
  });

  test("인덱스·FK 가 실제로 걸렸는지", async () => {
    const idx = (await db.query(`SELECT indexname FROM pg_indexes WHERE tablename='report_matches'`)) as any;
    const names = idx.rows.map((r: any) => r.indexname);
    for (const want of ["report_matches_status_idx", "report_matches_file_hash_idx"]) {
      assert.ok(names.includes(want), `${want} 인덱스가 있어야 함`);
    }
    const fk = (await db.query(`SELECT conname FROM pg_constraint WHERE conname LIKE 'report_matches_%_fk'`)) as any;
    assert.equal(fk.rows.length, 2, "FK 2개(customer, consultation)가 있어야 함");
  });

  test("FK ON DELETE SET NULL: 고객 삭제해도 report_matches 는 남고 연결만 NULL", async () => {
    const [cust] = (await db.query(`SELECT id FROM customers WHERE name='김유진' LIMIT 1`) as any).rows;
    await db.query(`INSERT INTO report_matches (file_name, matched_customer_id, status) VALUES ('김유진님 이름분석.pdf', $1, 'auto_matched')`, [cust.id]);
    await db.query(`DELETE FROM customers WHERE id=$1`, [cust.id]);
    const [rm] = (await db.query(`SELECT matched_customer_id, status FROM report_matches WHERE file_name='김유진님 이름분석.pdf'`) as any).rows;
    assert.equal(rm.matched_customer_id, null, "고객 삭제 시 연결은 NULL 이 되어야 함");
    assert.equal(rm.status, "auto_matched", "판정 이력 자체는 보존되어야 함");
  });

  test("재적용해도 안전(IF NOT EXISTS) — 두 번 돌려도 오류 없음", async () => {
    const sql = fs.readFileSync(MIGRATION, "utf-8");
    await db.exec(sql); // 두 번째 적용
    assert.ok(true);
  });
});
