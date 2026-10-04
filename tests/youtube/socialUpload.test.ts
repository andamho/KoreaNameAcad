// 틱톡·네이버 클립 자동 업로드 작업 큐 — 중복 게시 방지 중심(PGlite, 운영 DB 미접촉)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

delete process.env.DATABASE_URL;
delete process.env.NEON_DATABASE_URL;
const s = await import("../../server/socialUpload/store");
const { PGlite } = await import("@electric-sql/pglite");
const SQL = fs.readFileSync(path.resolve(import.meta.dirname, "../../migrations/0007_social_upload_tasks.sql"), "utf8");
async function fresh() { const db = new PGlite(); await db.exec(SQL); return { query: (a: string, p?: unknown[]) => db.query(a, p as any[]) as any } as s.Q; }
const JOB = "11111111-1111-1111-1111-111111111111";

test("배포 기록·플랫폼마다 1건만 등록", async () => {
  const q = await fresh();
  assert.equal((await s.enqueueSocial(q, JOB, "tiktok")).created, true);
  assert.equal((await s.enqueueSocial(q, JOB, "tiktok")).created, false);
  assert.equal((await s.enqueueSocial(q, JOB, "naver_clip")).created, true);
});

test("정상 흐름: 선점 → 게시 직전 → 게시 완료, 다시 안 나감", async () => {
  const q = await fresh();
  await s.enqueueSocial(q, JOB, "tiktok");
  const t = (await s.claimSocial(q))!;
  assert.equal(t.state, "running");
  assert.equal(await s.claimSocial(q), null, "리스 중 중복 선점 없음");
  assert.equal(await s.markPosted(q, t.id, t.lease_token!, "u"), false, "게시 직전 표시 없이 완료 불가");
  assert.equal(await s.markPosting(q, t.id, t.lease_token!), true);
  assert.equal(await s.markPosted(q, t.id, t.lease_token!, "https://x"), true);
  const row: any = await s.getSocialTask(q, t.id);
  assert.equal(row.state, "posted");
  assert.ok(row.posting_at && row.posted_at);
  await q.query(`update social_upload_tasks set available_at = now() - interval '1 hour'`);
  assert.equal(await s.claimSocial(q), null);
});

test("게시 버튼 전 실패는 재시도, 게시 버튼 뒤 실패는 확인 필요(재시도 안 함)", async () => {
  const q = await fresh();
  await s.enqueueSocial(q, JOB, "tiktok");
  let t = (await s.claimSocial(q))!;
  let r = await s.markSocialFailed(q, t.id, t.lease_token!, "upload", "업로드 실패", true);
  assert.equal(r.state, "queued");
  await q.query(`update social_upload_tasks set available_at = now()`);
  t = (await s.claimSocial(q))!;
  await s.markPosting(q, t.id, t.lease_token!);
  r = await s.markSocialFailed(q, t.id, t.lease_token!, "post", "게시 결과 확인 실패", true);
  assert.equal(r.state, "needs_review", "게시 뒤에는 재시도 가능이어도 확인 필요");
  await q.query(`update social_upload_tasks set available_at = now() - interval '1 hour'`);
  assert.equal(await s.claimSocial(q), null);
});

test("게시 직전 상태에서 워커가 죽으면 다시 넘기지 않고 확인 필요로", async () => {
  const q = await fresh();
  await s.enqueueSocial(q, JOB, "naver_clip");
  const t = (await s.claimSocial(q))!;
  await s.markPosting(q, t.id, t.lease_token!);
  await q.query(`update social_upload_tasks set lease_expires_at = now() - interval '1 second'`);
  assert.equal(await s.claimSocial(q), null, "posting 은 리스 만료돼도 재선점 안 함");
  const parked = await s.parkStalePosting(q);
  assert.equal(parked.length, 1);
  assert.equal(parked[0].state, "needs_review");
  assert.equal(await s.secondsUntilNextSocial(q), null);
});

test("게시 전 리스 만료(running)는 다시 넘긴다, 옛 토큰은 무효", async () => {
  const q = await fresh();
  await s.enqueueSocial(q, JOB, "tiktok");
  const t1 = (await s.claimSocial(q))!;
  await q.query(`update social_upload_tasks set lease_expires_at = now() - interval '1 second'`);
  const t2 = (await s.claimSocial(q))!;
  assert.notEqual(t2.lease_token, t1.lease_token);
  assert.equal(await s.markPosting(q, t1.id, t1.lease_token!), false);
  assert.equal(await s.markPosting(q, t2.id, t2.lease_token!), true);
});
