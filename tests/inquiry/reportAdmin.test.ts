// 이름분석표 관리자 액션(수동지정/대체/무시) + 감사기록 검증 (PGlite).
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
import { PGlite } from "@electric-sql/pglite";
import { listPendingReports, assignReport, replaceReport, ignoreReport } from "../../server/knop/reportAdmin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = fs.readFileSync(path.join(__dirname, "../../migrations/0001_add_report_matches.sql"), "utf-8");

let db: PGlite;
// PGlite 는 rowCount 대신 affectedRows → 운영 pg 풀과 같은 모양으로 정규화
const q = { query: async (sql: string, p?: any[]) => { const r: any = await db.query(sql, p as any[]); return { rows: r.rows ?? [], rowCount: (r.rows?.length || r.affectedRows) ?? 0 }; } };
const crmCount = async (cust?: string) => Number((await db.query(cust ? `SELECT count(*)::int n FROM crm_files WHERE customer_id=$1` : `SELECT count(*)::int n FROM crm_files`, cust ? [cust] : []) as any).rows[0].n);
const match = async (id: string) => (await db.query(`SELECT * FROM report_matches WHERE id=$1`, [id]) as any).rows[0];

describe("이름분석표 관리자 액션", () => {
  beforeEach(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE TABLE customers (id varchar PRIMARY KEY, name text);
      CREATE TABLE consultations (id varchar PRIMARY KEY);
      CREATE TABLE crm_files (id varchar PRIMARY KEY DEFAULT gen_random_uuid(), customer_id varchar, file_name text, file_type text, file_url text, memo text, uploaded_at timestamp DEFAULT now());`);
    await db.exec(MIGRATION);
    await db.exec(`INSERT INTO customers (id,name) VALUES ('c1','이은혜'),('c2','이은혜');`);
  });
  afterEach(async () => { await db.close(); });

  test("수동지정: needs_review → manually_matched + 첨부 + 감사기록", async () => {
    await db.query(`INSERT INTO report_matches (id, file_name, report_type, status, rendered_url, candidate_snapshot)
      VALUES ('m1','이은혜님 가족 이름분석.pdf','family','needs_review','/objects/x.png', $1)`,
      [JSON.stringify({ candidates: [{ customerId: "c1", score: 90 }, { customerId: "c2", score: 88 }] })]);
    await assignReport(q, "m1", "c1", "원장님", "상담일 확인함");
    const m = await match("m1");
    assert.equal(m.status, "manually_matched");
    assert.equal(m.matched_customer_id, "c1");
    assert.equal(m.manually_confirmed_by, "원장님");
    assert.equal(await crmCount("c1"), 1, "c1 에 첨부");
    const audit = JSON.parse(m.candidate_snapshot).audit;
    assert.equal(audit.length, 1);
    assert.equal(audit[0].action, "assign");
    assert.equal(audit[0].fromStatus, "needs_review");
    assert.equal(audit[0].customerId, "c1");
    assert.equal(audit[0].reason, "상담일 확인함");
  });

  test("대체(갱신): 기존 첨부 삭제 + 새 이미지 첨부, 이전 건 rejected", async () => {
    // 이전 확정 건 + 기존 첨부
    await db.query(`INSERT INTO report_matches (id, file_name, report_type, status, matched_customer_id, rendered_url)
      VALUES ('old','이은혜님 가족 이름분석.pdf','family','auto_matched','c1','/objects/old.png')`);
    await db.query(`INSERT INTO crm_files (customer_id, file_name, file_type, file_url, memo) VALUES ('c1','이름분석표 (가족 이름분석)','image/png','/objects/old.png','이름분석표:이은혜님 가족 이름분석.pdf')`);
    // 갱신 건(같은 파일명, 새 내용)
    await db.query(`INSERT INTO report_matches (id, file_name, report_type, status, supersedes_id, rendered_url, candidate_snapshot)
      VALUES ('new','이은혜님 가족 이름분석.pdf','family','needs_review','old','/objects/new.png','{}')`);
    await replaceReport(q, "new", "원장님", "새 분석표로 교체");
    // 기존 첨부는 새 URL 로 교체(1건 유지, url 바뀜)
    const files = (await db.query(`SELECT file_url FROM crm_files WHERE customer_id='c1'`) as any).rows;
    assert.equal(files.length, 1, "첨부 1건 유지");
    assert.equal(files[0].file_url, "/objects/new.png", "새 이미지로 교체됨");
    assert.equal((await match("new")).status, "manually_matched");
    assert.equal((await match("old")).status, "rejected", "이전 건은 대체됨 표시");
  });

  test("무시: → ignored + 감사기록, 첨부 없음", async () => {
    await db.query(`INSERT INTO report_matches (id, file_name, report_type, status, candidate_snapshot) VALUES ('m3','이은혜님 이름분석.pdf','individual','needs_review','{}')`);
    await ignoreReport(q, "m3", "원장님", "동일인 아님");
    const m = await match("m3");
    assert.equal(m.status, "ignored");
    assert.equal(await crmCount(), 0);
    assert.equal(JSON.parse(m.candidate_snapshot).audit[0].action, "ignore");
  });

  test("목록조회: 확인 필요 건에 후보 고객 이름이 채워짐", async () => {
    await db.query(`INSERT INTO report_matches (id, file_name, report_type, status, first_seen_at, candidate_snapshot)
      VALUES ('m4','이은혜님 가족 이름분석.pdf','family','needs_review', now(), $1)`,
      [JSON.stringify({ candidates: [{ customerId: "c1", score: 90 }, { customerId: "c2", score: 88 }] })]);
    const list = await listPendingReports(q);
    assert.equal(list.length, 1);
    assert.equal(list[0].kind, "ambiguous");
    assert.equal(list[0].candidates.length, 2);
    assert.equal(list[0].candidates[0].customerName, "이은혜");
  });

  test("미리보기 없으면 수동지정 거부(워커 재처리 안내)", async () => {
    await db.query(`INSERT INTO report_matches (id, file_name, report_type, status, candidate_snapshot) VALUES ('m5','x.pdf','family','needs_review','{}')`);
    await assert.rejects(() => assignReport(q, "m5", "c1", "원장님"), /미리보기 이미지가 없어/);
  });

  test("멱등성: 같은 건 두 번 수동지정 → 2번째 거부, 첨부 1건만", async () => {
    await db.query(`INSERT INTO report_matches (id, file_name, report_type, status, rendered_url, candidate_snapshot)
      VALUES ('mi','이은혜님 가족 이름분석.pdf','family','needs_review','/objects/x.png','{}')`);
    await assignReport(q, "mi", "c1", "원장님");
    await assert.rejects(() => assignReport(q, "mi", "c2", "원장님"), /이미 처리/);
    assert.equal(await crmCount(), 1, "중복 첨부 안 됨");
    assert.equal((await match("mi")).matched_customer_id, "c1", "첫 지정 유지");
  });

  test("무시 후 지정 시도 → 거부(상태 조건부)", async () => {
    await db.query(`INSERT INTO report_matches (id, file_name, report_type, status, rendered_url, candidate_snapshot)
      VALUES ('mj','x.pdf','individual','needs_review','/objects/y.png','{}')`);
    await ignoreReport(q, "mj", "원장님");
    await assert.rejects(() => assignReport(q, "mj", "c1", "원장님"), /이미 처리/);
    assert.equal(await crmCount(), 0);
  });

  test("audit 이력은 재처리(candidate_snapshot 갱신)돼도 보존", async () => {
    // 이미 audit 있는 스냅샷 + 재판정 시 보존되는지 (jsonSnapshot 이 prevAudit 유지)
    const snap = JSON.stringify({ candidates: [], audit: [{ action: "ignore", actor: "원장님", at: "2026-07-18", reason: "test" }] });
    await db.query(`INSERT INTO report_matches (id, file_name, report_type, status, candidate_snapshot) VALUES ('mk','x.pdf','family','needs_review',$1)`, [snap]);
    // 무시로 전환 → withAudit 이 기존 audit 뒤에 append
    await ignoreReport(q, "mk", "원장님2", "확정");
    const audit = JSON.parse((await match("mk")).candidate_snapshot).audit;
    assert.equal(audit.length, 2, "기존 audit 보존 + 새 audit 추가");
    assert.equal(audit[0].reason, "test");
    assert.equal(audit[1].action, "ignore");
  });
});
