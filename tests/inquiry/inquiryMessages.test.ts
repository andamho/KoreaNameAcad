// 문의 대화 메시지 개별 수정·삭제 회귀 테스트 (자체 완결 — 운영 DB·교정사전 테스트에 의존 안 함).
// 실행: node --import tsx/esm --test tests/inquiry/inquiryMessages.test.ts
// PGlite = 메모리 안의 진짜 Postgres. 네트워크 없어 운영 DB 에 닿을 수 없음.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";

// storage 의 editInquiryMessage/deleteInquiryMessage 가 실행하는 SQL 을 그대로 재현.
const SCHEMA = `
CREATE TABLE inquiries (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, contact text NOT NULL, contact_type text NOT NULL,
  content text NOT NULL, status text NOT NULL DEFAULT '접수완료',
  admin_reply text, access_token text UNIQUE,
  created_at timestamp NOT NULL DEFAULT now(), replied_at timestamp
);
CREATE TABLE inquiry_messages (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id varchar NOT NULL, sender_type text NOT NULL,
  content text NOT NULL, created_at timestamp NOT NULL DEFAULT now()
);`;

let db: PGlite;
const q = (sql: string, p: any[] = []) => db.query(sql, p) as Promise<{ rows: any[]; affectedRows?: number }>;
// storage 메서드와 동일한 SQL
const editMsg = (id: string, content: string) => q(`UPDATE inquiry_messages SET content = $1 WHERE id = $2 RETURNING *`, [content, id]);
const delMsg = (id: string) => q(`DELETE FROM inquiry_messages WHERE id = $1`, [id]);

async function seed() {
  const inq = (await q(`INSERT INTO inquiries (name, contact, contact_type, content) VALUES ('홍길동','01000000000','sms','원문 문의입니다') RETURNING *`)).rows[0];
  const u = (await q(`INSERT INTO inquiry_messages (inquiry_id, sender_type, content) VALUES ($1,'user','사용자 추가 문의') RETURNING *`, [inq.id])).rows[0];
  const a1 = (await q(`INSERT INTO inquiry_messages (inquiry_id, sender_type, content) VALUES ($1,'admin','관리자 첫 답변') RETURNING *`, [inq.id])).rows[0];
  const a2 = (await q(`INSERT INTO inquiry_messages (inquiry_id, sender_type, content) VALUES ($1,'admin','관리자 둘째 답변') RETURNING *`, [inq.id])).rows[0];
  return { inq, u, a1, a2 };
}

describe("문의 대화 메시지 수정·삭제 (PGlite)", () => {
  before(async () => { db = new PGlite(); await db.exec(SCHEMA); });
  after(async () => { await db.close(); });

  test("수정: 대상 메시지 content 만 바뀌고 다른 메시지·문의 원문은 불변", async () => {
    const { inq, u, a1, a2 } = await seed();
    const before = (await q(`SELECT id, content FROM inquiry_messages ORDER BY created_at`)).rows;

    const updated = (await editMsg(a1.id, "수정된 관리자 답변")).rows[0];
    assert.equal(updated.content, "수정된 관리자 답변");
    assert.equal(updated.id, a1.id, "같은 행이어야 함(id 불변)");

    // 다른 관리자 메시지·사용자 메시지 불변
    const a2After = (await q(`SELECT content FROM inquiry_messages WHERE id=$1`, [a2.id])).rows[0];
    const uAfter = (await q(`SELECT content FROM inquiry_messages WHERE id=$1`, [u.id])).rows[0];
    assert.equal(a2After.content, "관리자 둘째 답변", "다른 답변이 바뀌면 안 됨");
    assert.equal(uAfter.content, "사용자 추가 문의", "사용자 메시지가 바뀌면 안 됨");

    // 문의 원문 불변
    const inqAfter = (await q(`SELECT content FROM inquiries WHERE id=$1`, [inq.id])).rows[0];
    assert.equal(inqAfter.content, "원문 문의입니다", "문의 원문이 바뀌면 안 됨");

    // 행 수 불변
    assert.equal((await q(`SELECT count(*)::int n FROM inquiry_messages`)).rows[0].n, before.length);
    await q(`DELETE FROM inquiry_messages`); await q(`DELETE FROM inquiries`);
  });

  test("삭제: 대상 관리자 메시지만 제거되고 나머지·문의 원문은 유지", async () => {
    const { inq, u, a1, a2 } = await seed();
    await delMsg(a1.id);

    const rows = (await q(`SELECT id FROM inquiry_messages ORDER BY created_at`)).rows.map(r => r.id);
    assert.ok(!rows.includes(a1.id), "삭제한 메시지는 없어야 함");
    assert.ok(rows.includes(a2.id), "다른 관리자 답변은 유지");
    assert.ok(rows.includes(u.id), "사용자 메시지는 유지");
    assert.equal(rows.length, 2, "1개만 삭제되어야 함");

    const inqAfter = (await q(`SELECT id, content FROM inquiries WHERE id=$1`, [inq.id])).rows[0];
    assert.ok(inqAfter, "문의 자체는 삭제되면 안 됨");
    assert.equal(inqAfter.content, "원문 문의입니다", "문의 원문 유지");
    await q(`DELETE FROM inquiry_messages`); await q(`DELETE FROM inquiries`);
  });

  test("수정: 존재하지 않는 id 는 RETURNING 결과가 없다(storage 는 여기서 에러 처리)", async () => {
    const r = await editMsg("00000000-0000-0000-0000-000000000000", "x");
    assert.equal(r.rows.length, 0, "없는 id 는 수정되는 행이 없어야 함");
  });

  test("삭제: 다른 문의의 메시지는 건드리지 않는다", async () => {
    const A = await seed();
    const B = await seed();
    await delMsg(A.a1.id);
    // B 의 메시지는 그대로 3개
    const bCount = (await q(`SELECT count(*)::int n FROM inquiry_messages WHERE inquiry_id=$1`, [B.inq.id])).rows[0].n;
    assert.equal(bCount, 3, "다른 문의의 메시지는 영향 없어야 함");
    await q(`DELETE FROM inquiry_messages`); await q(`DELETE FROM inquiries`);
  });
});
