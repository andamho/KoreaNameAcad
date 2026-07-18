// 이름분석표 처리기 안전요건 검증 (PGlite + 주입식 render/upload). 운영 DB 안 씀.
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PGlite } from "@electric-sql/pglite";
import { processFile, type ProcessorDeps, type ProcessInput } from "../../server/knop/reportProcessor";
import type { Candidate } from "../../server/knop/reportMatch";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = fs.readFileSync(path.join(__dirname, "../../migrations/0001_add_report_matches.sql"), "utf-8");
const STUB = `
CREATE TABLE customers (id varchar PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, deleted_at timestamp);
CREATE TABLE consultations (id varchar PRIMARY KEY DEFAULT gen_random_uuid(), phone text NOT NULL);
CREATE TABLE crm_files (id varchar PRIMARY KEY DEFAULT gen_random_uuid(), customer_id varchar, file_name text, file_type text, file_url text, memo text, uploaded_at timestamp DEFAULT now());`;

let db: PGlite;
let uuidN = 0;
const T = new Date("2026-07-18T10:00:00Z");

function mkDeps(over: Partial<ProcessorDeps> = {}): ProcessorDeps {
  return {
    db: { query: (sql, params) => db.query(sql, params as any[]) as any },
    render: async () => Buffer.from("png"),
    upload: async (key) => `/objects/${key}`,
    hashFile: () => "HASH_DEFAULT",
    now: () => T,
    uuid: () => `uuid-${++uuidN}`,
    ...over,
  };
}
const cand = (o: Partial<Candidate> & { customerId: string }): Candidate => ({
  customerName: "이은혜", consultationId: "cons1", applicationDate: new Date(T.getTime() - 2 * 86400000),
  applicationDateSource: "consultation", numPeople: 3, consultStatus: "진행", alreadyLinkedSameType: false, ...o,
});
const input = (o: Partial<ProcessInput> = {}): ProcessInput => ({
  file: "이은혜님 가족 이름분석.pdf", absPath: "C:/x/이은혜님 가족 이름분석.pdf",
  extractedName: "이은혜", reportType: "family", label: "가족 이름분석", candidates: [cand({ customerId: "c1" })], ...o,
});
const getMatch = async (id: string) => (await db.query(`SELECT * FROM report_matches WHERE id=$1`, [id]) as any).rows[0];
const crmCount = async () => Number((await db.query(`SELECT count(*)::int n FROM crm_files`) as any).rows[0].n);

describe("이름분석표 처리기 안전요건", () => {
  beforeEach(async () => { db = new PGlite(); await db.exec(STUB); await db.exec(MIGRATION); uuidN = 0;
    await db.exec(`INSERT INTO customers (id, name) VALUES ('c1','이은혜'),('c2','이은혜');
                   INSERT INTO consultations (id, phone) VALUES ('cons1','01000000000');`); });
  afterEach(async () => { await db.close(); });

  test("정상 자동연결 → auto_matched + crm_files 1건", async () => {
    const r = await processFile(mkDeps(), input());
    assert.equal(r.status, "auto_matched");
    assert.equal(await crmCount(), 1);
    const m = await getMatch(r.matchId);
    assert.equal(m.matched_customer_id, "c1");
  });

  test("요건3: 동일 해시 재처리 → 재첨부 안 함(crm 그대로)", async () => {
    const r1 = await processFile(mkDeps(), input());
    assert.equal(r1.status, "auto_matched");
    const r2 = await processFile(mkDeps(), input({ absPath: "C:/DIFFERENT/path.pdf" })); // 경로만 다름, 해시 같음
    assert.equal(r2.status, "auto_matched");
    assert.equal(r2.matchId, r1.matchId, "같은 판정 건이어야(요건2: 경로 무관 동일 PDF)");
    assert.equal(await crmCount(), 1, "재첨부 안 됨");
  });

  test("요건1: first_seen_at 은 재처리해도 불변", async () => {
    const r1 = await processFile(mkDeps(), input());
    const before = (await getMatch(r1.matchId)).first_seen_at;
    await processFile(mkDeps({ now: () => new Date(T.getTime() + 5 * 86400000) }), input({ absPath: "C:/other.pdf" }));
    const after = (await getMatch(r1.matchId)).first_seen_at;
    assert.deepEqual(new Date(after).getTime(), new Date(before).getTime(), "first_seen_at 갱신되면 안 됨");
  });

  test("요건4: 같은 파일명·다른 해시 → 새 판정 건 + previousMatchId 기록", async () => {
    const r1 = await processFile(mkDeps({ hashFile: () => "HASH_A" }), input());
    const r2 = await processFile(mkDeps({ hashFile: () => "HASH_B" }), input());
    assert.notEqual(r2.matchId, r1.matchId, "새 판정 건이어야");
    const snap = JSON.parse((await getMatch(r2.matchId)).candidate_snapshot);
    assert.equal(snap.previousMatchId, r1.matchId, "이전 건 관계 기록되어야");
  });

  test("요건7: 렌더 실패 → attachment_failed, 첨부 없음, auto_matched 아님", async () => {
    const r = await processFile(mkDeps({ render: async () => { throw new Error("render죽음"); } }), input());
    assert.equal(r.status, "attachment_failed");
    assert.equal(await crmCount(), 0);
  });

  test("요건5,6: 첨부 트랜잭션 실패 → 롤백, attachment_failed, crm 0건", async () => {
    // crm_files INSERT 를 실패시키는 db 래퍼
    const realQuery = (sql: string, params?: any[]) => db.query(sql, params as any[]) as any;
    const failingDb = { query: (sql: string, params?: any[]) => sql.startsWith("INSERT INTO crm_files") ? Promise.reject(new Error("crm실패")) : realQuery(sql, params) };
    const r = await processFile(mkDeps({ db: failingDb }), input());
    assert.equal(r.status, "attachment_failed");
    assert.equal(await crmCount(), 0, "롤백되어 첨부 0건");
    const m = await getMatch(r.matchId);
    assert.notEqual(m.status, "auto_matched", "첨부 실패인데 auto_matched 로 확정되면 안 됨");
  });

  test("요건8: 후보 조회 실패 → processing_failed, 추측연결 없음", async () => {
    const r = await processFile(mkDeps(), input({ candidates: [], candidatesFailed: true }));
    assert.equal(r.status, "processing_failed");
    assert.equal(await crmCount(), 0);
  });

  test("동명이인 애매 → needs_review, 첨부 없음", async () => {
    const two = [cand({ customerId: "c1", applicationDate: new Date(T.getTime() - 1 * 86400000) }),
                 cand({ customerId: "c2", applicationDate: new Date(T.getTime() - 2 * 86400000) })];
    const r = await processFile(mkDeps(), input({ candidates: two }));
    assert.equal(r.status, "needs_review");
    assert.equal(await crmCount(), 0);
  });

  test("[7] 동명이인 애매 + 렌더 실패 → needs_review 유지(미리보기 없음), 첨부 없음", async () => {
    const two = [cand({ customerId: "c1", applicationDate: new Date(T.getTime() - 1 * 86400000) }),
                 cand({ customerId: "c2", applicationDate: new Date(T.getTime() - 2 * 86400000) })];
    const r = await processFile(mkDeps({ render: async () => { throw new Error("렌더죽음"); } }), input({ candidates: two }));
    assert.equal(r.status, "needs_review", "렌더 실패해도 needs_review 유지");
    const m = await getMatch(r.matchId);
    assert.equal(m.rendered_url, null, "미리보기 없음");
    assert.equal(await crmCount(), 0);
  });
});
