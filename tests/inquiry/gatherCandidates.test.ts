// gatherCandidates 실 DB 조회 검증 (PGlite). 신청일 출처 분류·가족 이름 매칭.
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { gatherCandidates } from "../../server/knop/reportProcessor";

let db: PGlite;
const q = { query: (sql: string, p?: any[]) => db.query(sql, p as any[]) as any };

describe("gatherCandidates (PGlite)", () => {
  beforeEach(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE TABLE customers (id varchar PRIMARY KEY, name text, created_at timestamp, source_consultation_id varchar, deleted_at timestamp);
      CREATE TABLE consultations (id varchar PRIMARY KEY, created_at timestamp, num_people integer, people_data text);
      CREATE TABLE crm_files (id varchar PRIMARY KEY DEFAULT gen_random_uuid(), customer_id varchar, memo text);`);
  });
  afterEach(async () => { await db.close(); });

  test("상담신청 연결 고객 → applicationDateSource=consultation, 신청일=상담 createdAt", async () => {
    await db.exec(`
      INSERT INTO consultations (id, created_at, num_people, people_data) VALUES ('con1','2026-07-16 12:00:00', 3, '[{"name":"이은혜"}]');
      INSERT INTO customers (id, name, created_at, source_consultation_id) VALUES ('c1','이은혜가족','2026-07-10 12:00:00','con1');`);
    const { candidates, failed } = await gatherCandidates(q, "이은혜", "family");
    assert.equal(failed, false);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].applicationDateSource, "consultation");
    assert.equal(new Date(candidates[0].applicationDate!).toISOString().slice(0, 10), "2026-07-16");
    assert.equal(candidates[0].numPeople, 3);
  });

  test("상담 미연결 고객 → customer_proxy (자동연결 불가 근거)", async () => {
    await db.exec(`INSERT INTO customers (id, name, created_at) VALUES ('c2','이은혜','2026-07-12');`);
    const { candidates } = await gatherCandidates(q, "이은혜", "individual");
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].applicationDateSource, "customer_proxy");
  });

  test("peopleData 가족 이름 매칭 → 대표자가 달라도 후보에 포함", async () => {
    // 홍길동 상담, 가족에 이은혜 포함 → 이은혜 분석표의 후보로 홍길동 고객이 잡힘
    await db.exec(`
      INSERT INTO consultations (id, created_at, num_people, people_data) VALUES ('con2','2026-07-15', 2, '[{"name":"홍길동"},{"name":"이은혜"}]');
      INSERT INTO customers (id, name, created_at, source_consultation_id) VALUES ('c3','홍길동가족','2026-07-15','con2');`);
    const { candidates } = await gatherCandidates(q, "이은혜", "family");
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].customerId, "c3");
    assert.equal(candidates[0].applicationDateSource, "consultation");
  });

  test("동명이인 2명 모두 후보로 (대표자 이름 일치)", async () => {
    await db.exec(`
      INSERT INTO customers (id, name, created_at) VALUES ('a','이은혜','2026-05-01'),('b','이은혜가족','2026-07-14');`);
    const { candidates } = await gatherCandidates(q, "이은혜", "family");
    assert.equal(candidates.length, 2);
  });

  test("삭제된(휴지통) 고객은 후보 제외", async () => {
    await db.exec(`INSERT INTO customers (id, name, created_at, deleted_at) VALUES ('d','이은혜','2026-07-10','2026-07-11');`);
    const { candidates } = await gatherCandidates(q, "이은혜", "family");
    assert.equal(candidates.length, 0);
  });

  test("기존 같은유형 분석표 있으면 alreadyLinkedSameType=true", async () => {
    await db.exec(`
      INSERT INTO customers (id, name, created_at) VALUES ('e','이은혜','2026-07-10');
      INSERT INTO crm_files (customer_id, memo) VALUES ('e','이름분석표:이은혜님 가족 이름분석.pdf');`);
    const { candidates } = await gatherCandidates(q, "이은혜", "family");
    assert.equal(candidates[0].alreadyLinkedSameType, true);
  });
});
