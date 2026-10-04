// 쇼츠 썸네일 장면 선택 작업 큐 — 저장소·배분 서비스·워커 API 검증 (PGlite, 운영 DB 미접촉)
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";

delete process.env.DATABASE_URL;
delete process.env.NEON_DATABASE_URL;
process.env.YT_FRAME_WORKER_TOKEN = "t".repeat(40);

const store = await import("../../server/ytFrame/store");
const { createFrameService } = await import("../../server/ytFrame/service");
const { isProcessingDone, isProcessingFailed } = await import("../../server/ytFrame/processing");
const { registerYtFrameRoutes } = await import("../../server/ytFrame");
const { PGlite } = await import("@electric-sql/pglite");

const root = path.resolve(import.meta.dirname, "../..");
const SQL = fs.readFileSync(path.join(root, "migrations/0006_yt_frame_tasks.sql"), "utf8");

async function freshDb() {
  const db = new PGlite();
  await db.exec(SQL);
  const q: store.Q = { query: (s, p) => db.query(s, p as any[]) as any };
  return { db, q };
}
const VID = "AbCdEfGhIj1";
const VID2 = "ZyXwVuTsRq2";
const done = { kind: "ok" as const, state: { uploadStatus: "processed", processingStatus: "succeeded", processingFailureReason: null, privacyStatus: "private", title: "t" } };

describe("store", () => {
  test("같은 영상 ID 는 한 번만 등록된다", async () => {
    const { q } = await freshDb();
    const a = await store.enqueueFrameTask(q, { videoId: VID, expectedTitle: "x" });
    const b = await store.enqueueFrameTask(q, { videoId: VID, expectedTitle: "y" });
    assert.equal(a.created, true);
    assert.equal(b.created, false);
    assert.equal(b.task.id, a.task.id);
    assert.equal((await q.query(`select count(*)::int n from yt_frame_tasks`)).rows[0].n, 1);
    await assert.rejects(store.enqueueFrameTask(q, { videoId: "bad id" }));
  });

  test("선점은 1건만, 리스 중엔 다시 못 가져가고 만료되면 회수된다", async () => {
    const { q } = await freshDb();
    await store.enqueueFrameTask(q, { videoId: VID });
    const t1 = await store.claimFrameTask(q);
    assert.ok(t1);
    assert.equal(t1!.state, "running");
    assert.equal(t1!.attempts, 1);
    assert.equal(await store.claimFrameTask(q), null, "리스 중 중복 실행 금지");
    await q.query(`update yt_frame_tasks set lease_expires_at = now() - interval '1 second'`);
    const t2 = await store.claimFrameTask(q);
    assert.ok(t2);
    assert.notEqual(t2!.lease_token, t1!.lease_token);
    assert.equal(t2!.attempts, 2);
    // 옛 토큰으로는 아무 보고도 반영되지 않는다(펜싱)
    assert.equal(await store.markFrameSaved(q, t1!.id, t1!.lease_token!), false);
    assert.equal(await store.heartbeatFrameTask(q, t1!.id, t1!.lease_token!), false);
    assert.equal((await store.markFrameFailed(q, t1!.id, t1!.lease_token!, "save", "x", false)).applied, false);
  });

  test("저장 성공과 반영 확인은 따로 기록된다", async () => {
    const { q } = await freshDb();
    await store.enqueueFrameTask(q, { videoId: VID });
    const t = (await store.claimFrameTask(q))!;
    assert.equal(await store.markFrameVerified(q, t.id, t.lease_token!, "match", ""), false, "저장 전 확인 금지");
    assert.equal(await store.markFrameSaved(q, t.id, t.lease_token!), true);
    let row = await store.getFrameTask(q, t.id) as any;
    assert.equal(row.state, "saved");
    assert.ok(row.saved_at);
    assert.equal(row.verified_at, null);
    assert.equal(await store.markFrameVerified(q, t.id, t.lease_token!, "unverifiable_non_public", "비공개"), true);
    row = await store.getFrameTask(q, t.id);
    assert.equal(row.state, "unverifiable");
    assert.equal(row.verify_result, "unverifiable_non_public");
    assert.ok(row.verified_at);
    assert.equal(row.lease_token, null);
    assert.equal(await store.claimFrameTask(q), null, "종결된 작업은 다시 안 나간다");
  });

  test("불일치는 verify_failed 로 남는다", async () => {
    const { q } = await freshDb();
    await store.enqueueFrameTask(q, { videoId: VID });
    const t = (await store.claimFrameTask(q))!;
    await store.markFrameSaved(q, t.id, t.lease_token!);
    await store.markFrameVerified(q, t.id, t.lease_token!, "mismatch", "본편 프레임");
    const row: any = await store.getFrameTask(q, t.id);
    assert.equal(row.state, "verify_failed");
    assert.equal(row.last_stage, "verify");
    assert.ok(row.saved_at, "저장 기록은 유지");
  });

  test("판단 애매(uncertain)는 성공이 아니라 확인 필요(needs_review)로 남는다", async () => {
    const { q } = await freshDb();
    await store.enqueueFrameTask(q, { videoId: VID });
    const t = (await store.claimFrameTask(q))!;
    await store.markFrameSaved(q, t.id, t.lease_token!);
    assert.equal(await store.markFrameVerified(q, t.id, t.lease_token!, "uncertain", "첫 장면과 본편이 비슷"), true);
    const row: any = await store.getFrameTask(q, t.id);
    assert.equal(row.state, "needs_review");
    assert.equal(row.verify_result, "uncertain");
    assert.equal(row.last_stage, "verify");
    assert.ok(row.saved_at && row.verified_at);
  });

  test("재시도 가능한 실패는 백오프 후 다시, 횟수 소진·재시도 불가는 종결", async () => {
    const { q } = await freshDb();
    await store.enqueueFrameTask(q, { videoId: VID });
    let t = (await store.claimFrameTask(q))!;
    let r = await store.markFrameFailed(q, t.id, t.lease_token!, "navigate", "버튼 없음", true);
    assert.deepEqual([r.applied, r.terminal], [true, false]);
    assert.equal(await store.claimFrameTask(q), null, "백오프 중");
    const s = await store.secondsUntilNextWork(q);
    assert.ok(s! > 200 && s! <= 300, `백오프 ${s}s`);
    for (let i = 2; i <= store.MAX_ATTEMPTS; i++) {
      await q.query(`update yt_frame_tasks set available_at = now() - interval '1 second'`);
      t = (await store.claimFrameTask(q))!;
      assert.equal(t.attempts, i);
      r = await store.markFrameFailed(q, t.id, t.lease_token!, "navigate", "버튼 없음", true);
    }
    assert.equal(r.terminal, true, "횟수 소진 → 종결");
    // 재시도 불가는 1회만에 종결
    await store.enqueueFrameTask(q, { videoId: VID2 });
    const u = (await store.claimFrameTask(q))!;
    const r2 = await store.markFrameFailed(q, u.id, u.lease_token!, "identity", "ID 불일치", false);
    assert.equal(r2.terminal, true);
    assert.equal(await store.secondsUntilNextWork(q), null, "남은 일 없음");
  });

  test("보류(처리 중)는 시도 횟수로 세지 않는다", async () => {
    const { q } = await freshDb();
    await store.enqueueFrameTask(q, { videoId: VID });
    const t = (await store.claimFrameTask(q))!;
    assert.equal(await store.deferFrameTask(q, t.id, t.lease_token!, 120, "processing", "처리 중"), true);
    const row: any = await store.getFrameTask(q, t.id);
    assert.equal(row.state, "queued");
    assert.equal(row.attempts, 0);
    const s = await store.secondsUntilNextWork(q);
    assert.ok(s! >= 119 && s! <= 120);
  });
});

describe("processing 판정", () => {
  test("완료·실패 판정", () => {
    assert.equal(isProcessingDone({ processingStatus: "succeeded", uploadStatus: "processed" } as any), true);
    assert.equal(isProcessingDone({ processingStatus: null, uploadStatus: "processed" } as any), true);
    assert.equal(isProcessingDone({ processingStatus: "processing", uploadStatus: "uploaded" } as any), false);
    assert.equal(isProcessingFailed({ processingStatus: "terminated" } as any), true);
    assert.equal(isProcessingFailed({ uploadStatus: "rejected" } as any), true);
    assert.equal(isProcessingFailed({ processingStatus: "processing", uploadStatus: "uploaded" } as any), false);
  });
});

function mkService(q: store.Q, check: (id: string) => Promise<any>) {
  const alerts: string[] = [];
  const svc = createFrameService({
    q, checkProcessing: check, alert: async (h) => { alerts.push(h); }, esc: (v) => String(v),
    processingDeferSec: 1, lookupErrorDeferSec: 1, log: () => {},
  });
  return { svc, alerts };
}

describe("service", () => {
  test("할 일이 없을 때 롱폴링은 DB 를 조회하지 않는다", async () => {
    const { q } = await freshDb();
    const { svc } = mkService(q, async () => done);
    await svc.init();
    const before = svc._debug().dbReads;
    const t0 = Date.now();
    const r = await Promise.all([svc.next(300), svc.next(300), svc.next(300)]);
    assert.deepEqual(r, [null, null, null]);
    assert.ok(Date.now() - t0 >= 280);
    assert.equal(svc._debug().dbReads, before, "대기 중 DB 조회 0회");
    svc._stop();
  });

  test("등록 즉시 대기 중인 워커를 깨워 넘긴다 + 중복 출고 없음", async () => {
    const { q } = await freshDb();
    const { svc } = mkService(q, async () => done);
    await svc.init();
    const w1 = svc.next(3000);
    const w2 = svc.next(800);
    setTimeout(() => { void svc.enqueue({ videoId: VID, expectedTitle: "제목" }); }, 50);
    const [a, b] = await Promise.all([w1, w2]);
    const got = [a, b].filter(Boolean);
    assert.equal(got.length, 1, "한 작업은 한 워커에게만");
    assert.equal(got[0]!.video_id, VID);
    assert.equal(got[0]!.live_privacy, "private");
    svc._stop();
  });

  test("서버 재시작(PC 꺼짐 동안 쌓인 작업) — 부팅 1회 조회로 복원", async () => {
    const { q } = await freshDb();
    await store.enqueueFrameTask(q, { videoId: VID }); // 이전 프로세스가 남긴 작업
    const { svc } = mkService(q, async () => done);
    await svc.init();
    const t = await svc.next(500);
    assert.equal(t?.video_id, VID);
    svc._stop();
  });

  test("처리 중이면 보류했다가 완료 후 넘긴다", async () => {
    const { q } = await freshDb();
    let n = 0;
    const { svc } = mkService(q, async () => (++n === 1
      ? { kind: "ok", state: { uploadStatus: "uploaded", processingStatus: "processing" } }
      : done));
    await svc.init();
    await svc.enqueue({ videoId: VID });
    const t0 = Date.now();
    const t = await svc.next(5000);
    assert.equal(t?.video_id, VID);
    assert.ok(Date.now() - t0 >= 900, "보류 시간(1초) 뒤에 출고");
    assert.equal(t?.attempts, 1, "보류는 시도로 안 셈");
    svc._stop();
  });

  test("영상 없음·처리 실패는 종결하고 영상 ID 와 이유를 알린다", async () => {
    const { q } = await freshDb();
    const { svc, alerts } = mkService(q, async (id) => (id === VID
      ? { kind: "not_found" }
      : { kind: "ok", state: { uploadStatus: "failed", processingStatus: "failed", processingFailureReason: "other" } }));
    await svc.init();
    await svc.enqueue({ videoId: VID, expectedTitle: "제목A" });
    await svc.enqueue({ videoId: VID2 });
    assert.equal(await svc.next(300), null);
    assert.equal(alerts.length, 2);
    assert.match(alerts.join("\n"), new RegExp(VID));
    assert.match(alerts.join("\n"), new RegExp(VID2));
    assert.match(alerts.join("\n"), /찾을 수 없음/);
    assert.match(alerts.join("\n"), /처리 실패/);
    const rows = (await q.query(`select state, last_stage from yt_frame_tasks`)).rows;
    assert.ok(rows.every((r: any) => r.state === "failed" && r.last_stage === "processing"));
    svc._stop();
  });

  test("워커 실패: 재시도 예정은 알리지 않고, 종결·반영 불일치는 알린다", async () => {
    const { q } = await freshDb();
    const { svc, alerts } = mkService(q, async () => done);
    await svc.init();
    await svc.enqueue({ videoId: VID });
    let t = (await svc.next(500))!;
    let r = await svc.failed(t.id, t.lease_token!, "navigate", "Edit 버튼 없음", true);
    assert.equal(r.terminal, false);
    assert.equal(alerts.length, 0);
    await q.query(`update yt_frame_tasks set available_at = now()`);
    await svc.init();
    t = (await svc.next(500))!;
    r = await svc.failed(t.id, t.lease_token!, "identity", "클립보드 ID 불일치", false);
    assert.equal(r.terminal, true);
    assert.equal(alerts.length, 1);
    assert.match(alerts[0], /identity/);
    assert.match(alerts[0], /클립보드 ID 불일치/);

    await svc.enqueue({ videoId: VID2 });
    const u = (await svc.next(500))!;
    await svc.saved(u.id, u.lease_token!);
    await svc.verified(u.id, u.lease_token!, "mismatch", "본편과 일치");
    assert.equal(alerts.length, 2);
    assert.match(alerts[1], new RegExp(VID2));

    // 판단 애매도 알린다(확인 필요)
    const VID3 = "Qq1Ww2Ee3Rr";
    await svc.enqueue({ videoId: VID3, expectedTitle: "한글 제목 — 확인용" });
    const w = (await svc.next(500))!;
    await svc.saved(w.id, w.lease_token!);
    await svc.verified(w.id, w.lease_token!, "uncertain", "첫 장면과 본편이 비슷");
    assert.equal(alerts.length, 3);
    assert.match(alerts[2], /확인 필요/);
    assert.match(alerts[2], /한글 제목 — 확인용/);
    svc._stop();
  });

  test("롱폴링 연결이 끊기면 출고를 취소하고 되돌린다", async () => {
    const { q } = await freshDb();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { svc } = mkService(q, async () => { await gate; return done; });
    await svc.init();
    await svc.enqueue({ videoId: VID });
    const ac = new AbortController();
    const p = svc.next(3000, ac.signal);
    setTimeout(() => { ac.abort(); release(); }, 50);
    assert.equal(await p, null);
    const row = (await q.query(`select state, attempts from yt_frame_tasks`)).rows[0];
    assert.deepEqual([row.state, row.attempts], ["queued", 0]);
    const t = await svc.next(500);
    assert.equal(t?.video_id, VID, "다음 연결에서 다시 받는다");
    svc._stop();
  });

  test("매일 점검: 6시간 넘게 남은 작업을 알린다", async () => {
    const { q } = await freshDb();
    const { svc, alerts } = mkService(q, async () => done);
    await svc.enqueue({ videoId: VID });
    assert.equal(await svc.dailyCheck(), 0);
    await q.query(`update yt_frame_tasks set created_at = now() - interval '7 hours'`);
    assert.equal(await svc.dailyCheck(), 1);
    assert.match(alerts[0], new RegExp(VID));
    svc._stop();
  });
});

describe("워커 API", () => {
  let server: Server;
  let base: string;
  let svc: ReturnType<typeof createFrameService>;
  let q: store.Q;
  const auth = { Authorization: `Bearer ${"t".repeat(40)}`, "Content-Type": "application/json" };

  before(async () => {
    ({ q } = await freshDb());
    ({ svc } = mkService(q, async () => done));
    await svc.init();
    const app = express();
    app.use(express.json());
    registerYtFrameRoutes(app, () => svc);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => { svc._stop(); server.close(); });

  test("토큰 없거나 틀리면 401", async () => {
    assert.equal((await fetch(`${base}/api/yt-frame/next?wait=0`)).status, 401);
    assert.equal((await fetch(`${base}/api/yt-frame/next?wait=0`, { headers: { Authorization: "Bearer nope" } })).status, 401);
  });

  test("next → saved → verified, 리스 잃으면 409", async () => {
    assert.equal((await fetch(`${base}/api/yt-frame/next?wait=0`, { headers: auth })).status, 204);
    await svc.enqueue({ videoId: VID, expectedTitle: "제목" });
    const r = await fetch(`${base}/api/yt-frame/next?wait=2`, { headers: auth });
    assert.equal(r.status, 200);
    const { task } = await r.json() as any;
    assert.equal(task.videoId, VID);
    assert.equal(task.privacyStatus, "private");
    const post = (p: string, b: any) => fetch(`${base}/api/yt-frame/${task.id}/${p}`, { method: "POST", headers: auth, body: JSON.stringify(b) });
    assert.equal((await post("heartbeat", { token: task.leaseToken })).status, 200);
    assert.equal((await post("saved", { token: "wrong" })).status, 409);
    assert.equal((await post("saved", { token: task.leaseToken })).status, 200);
    assert.equal((await post("verified", { token: task.leaseToken, result: "match", detail: "ok" })).status, 200);
    assert.equal((await post("verified", { token: task.leaseToken, result: "match" })).status, 409, "이미 종결");
    const row = (await q.query(`select state, saved_at is not null s, verified_at is not null v from yt_frame_tasks`)).rows[0];
    assert.deepEqual([row.state, row.s, row.v], ["verified", true, true]);
  });
});

describe("마이그레이션 SQL", () => {
  test("0006 은 새 테이블만 만든다", async () => {
    const { scanSql } = await import("../../server/migrations/runner");
    assert.deepEqual(scanSql(SQL, ["yt_frame_tasks"]), { safe: true });
  });
});
