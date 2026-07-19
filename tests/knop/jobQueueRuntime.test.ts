// 영속 작업 큐 runtime prototype 검증 (PGlite=기존 의존성, 운영 DB 미접촉).
// claim/lease/heartbeat/completion/retry/reaper 계약을 격리 DB 에서 검증. 실제 PG17 SKIP LOCKED 경합은 별도(e2e).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  createJob, claimNextJob, markRunning, heartbeat, completeExecution, failExecution, markVersionMismatch,
  reapExpired, claimForcedRerun, compareVersionSnapshots, sha256Hex,
  getJob, getExecution, listExecutions, internalReportAdapter,
  type QueueClient, type RequestVersionSnapshot,
} from "../../server/jobQueue/index";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIG = readFileSync(path.join(here, "..", "..", "migrations", "0002_create_persistent_job_queue.sql"), "utf-8");
const H = (s: string) => sha256Hex(s); // 64hex payloadHash 편의

function snap(over: Partial<RequestVersionSnapshot> = {}): RequestVersionSnapshot {
  return {
    schemaVersion: 1, pipelineVersion: "p1", transcriptionEngineVersion: null, transcriptionEngineHash: null,
    dictionaryVersion: "d1", normalizationVersion: 1, correctionEngineVersion: null, correctionEngineHash: "e1".padEnd(64, "0"),
    executorRequirement: null, ...over,
  };
}
function jobInput(over: any = {}) {
  return {
    ownerScope: "kop", projectId: "proj-1", jobType: "internal-report",
    inputIdentity: { inputAssetHash: "asset-1" }, requestVersionSnapshot: snap(),
    executionOptions: { a: 1 }, payloadHash: H("payload"), ...over,
  };
}

async function freshQ(): Promise<{ db: any; c: QueueClient }> {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  await db.exec(MIG);
  const c: QueueClient = { query: (sql, params) => db.query(sql, params as any[]) as any };
  return { db, c };
}

describe("영속 작업 큐 runtime prototype", () => {
  test("1. 동일 idempotency 2회 → jobs 1행", async () => {
    const { db, c } = await freshQ();
    try {
      const a = await createJob(c, jobInput());
      const b = await createJob(c, jobInput());
      assert.equal(a.created, true); assert.equal(b.created, false);
      assert.equal(a.job.id, b.job.id);
      assert.equal((await c.query(`SELECT count(*)::int n FROM jobs`)).rows[0].n, 1);
    } finally { await db.close(); }
  });

  test("2. 다른 project → 다른 key(2 jobs)", async () => {
    const { db, c } = await freshQ();
    try {
      await createJob(c, jobInput({ projectId: "proj-1" }));
      const b = await createJob(c, jobInput({ projectId: "proj-2" }));
      assert.equal(b.created, true);
      assert.equal((await c.query(`SELECT count(*)::int n FROM jobs`)).rows[0].n, 2);
    } finally { await db.close(); }
  });

  test("3. claim 2회(순차) → 한 번만 획득(나머지 null)", async () => {
    const { db, c } = await freshQ();
    try {
      await createJob(c, jobInput());
      const r1 = await claimNextJob(c, "w1");
      const r2 = await claimNextJob(c, "w2");
      assert.ok(r1 && !r2, "한 워커만 claim");
      assert.equal((await getJob(c, r1!.job.id))!.status, "running");
    } finally { await db.close(); }
  });

  test("4. queued 우선순위 순서(priority ASC)", async () => {
    const { db, c } = await freshQ();
    try {
      await createJob(c, jobInput({ projectId: "lo", priority: 200 }));
      await createJob(c, jobInput({ projectId: "hi", priority: 10 }));
      const r = await claimNextJob(c, "w1");
      assert.equal(r!.job.project_id, "hi", "priority 낮은(우선) job 먼저");
    } finally { await db.close(); }
  });

  test("5. available_at 미래 job 미claim", async () => {
    const { db, c } = await freshQ();
    try {
      const j = await createJob(c, jobInput());
      await c.query(`UPDATE jobs SET available_at = now() + interval '1 hour' WHERE id=$1`, [j.job.id]);
      assert.equal(await claimNextJob(c, "w1"), null);
    } finally { await db.close(); }
  });

  test("6. attempt_number 증가(retry)", async () => {
    const { db, c } = await freshQ();
    try {
      await createJob(c, jobInput());
      const r1 = await claimNextJob(c, "w1");
      assert.equal(r1!.attemptNumber, 1);
      await failExecution(c, { executionId: r1!.executionId, workerId: "w1", rawLeaseToken: r1!.rawLeaseToken, jobType: "internal-report", errorCode: "transient.network" });
      await c.query(`UPDATE jobs SET available_at=now()`); // 시간 경과 모사
      const r2 = await claimNextJob(c, "w1");
      assert.equal(r2!.attemptNumber, 2);
    } finally { await db.close(); }
  });

  test("7. active execution 중복 DB 차단(부분유일)", async () => {
    const { db, c } = await freshQ();
    try {
      const j = await createJob(c, jobInput());
      const r = await claimNextJob(c, "w1");
      let blocked = false;
      try { await c.query(`INSERT INTO job_executions(job_id,attempt_number,status) VALUES ($1,99,'running')`, [j.job.id]); }
      catch { blocked = true; }
      assert.ok(blocked, "두 번째 active execution DB 거부");
      assert.ok(r);
    } finally { await db.close(); }
  });

  test("8. 잘못된 token heartbeat 거부", async () => {
    const { db, c } = await freshQ();
    try {
      await createJob(c, jobInput());
      const r = await claimNextJob(c, "w1");
      assert.equal(await heartbeat(c, { executionId: r!.executionId, workerId: "w1", rawLeaseToken: "deadbeef", jobType: "internal-report" }), false);
      assert.equal(await heartbeat(c, { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken, jobType: "internal-report" }), true);
    } finally { await db.close(); }
  });

  test("9. stale token completion 거부", async () => {
    const { db, c } = await freshQ();
    try {
      await createJob(c, jobInput());
      const r = await claimNextJob(c, "w1");
      const res = await completeExecution(c, { executionId: r!.executionId, workerId: "w1", rawLeaseToken: "wrong", jobType: "internal-report", result: await internalReportAdapter.execute(r!.adapterInput) });
      assert.equal(res.outcome, "fencing-failed");
    } finally { await db.close(); }
  });

  test("10·11. pure job lease 만료 → reaper → queued", async () => {
    const { db, c } = await freshQ();
    try {
      const j = await createJob(c, jobInput());
      const r = await claimNextJob(c, "w1");
      await c.query(`UPDATE job_executions SET lease_expires_at = now() - interval '1 minute' WHERE id=$1`, [r!.executionId]);
      const sum = await reapExpired(c);
      assert.equal(sum.reaped, 1); assert.equal(sum.requeued, 1);
      assert.equal((await getJob(c, j.job.id))!.status, "queued");
      assert.equal((await getExecution(c, r!.executionId))!.status, "expired");
    } finally { await db.close(); }
  });

  test("12. side-effect job 만료(adapter 시작 후) → needs_review", async () => {
    const { db, c } = await freshQ();
    try {
      const j = await createJob(c, jobInput({ jobType: "sns-publish", inputIdentity: { inputAssetHash: "v" } }));
      const r = await claimNextJob(c, "w1");
      // adapter 실제 시작(running+started_at) 후 만료 → 부작용 발생 여부 불명 → needs_review
      await markRunning(c, { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken });
      await c.query(`UPDATE job_executions SET lease_expires_at = now() - interval '1 minute' WHERE id=$1`, [r!.executionId]);
      const sum = await reapExpired(c);
      assert.equal(sum.needsReview, 1);
      assert.equal((await getJob(c, j.job.id))!.status, "needs_review");
    } finally { await db.close(); }
  });

  test("12b. side-effect job 만료(claimed·adapter 미시작) → queued/failed(needs_review 아님)", async () => {
    const { db, c } = await freshQ();
    try {
      // sns-publish maxAttempts=1 → 미시작 만료는 needs_review 가 아니라 소진 failed(부작용 없었음이 증명됨)
      const j = await createJob(c, jobInput({ jobType: "sns-publish", inputIdentity: { inputAssetHash: "w" } }));
      const r = await claimNextJob(c, "w1"); // claimed, started_at null
      await c.query(`UPDATE job_executions SET lease_expires_at = now() - interval '1 minute' WHERE id=$1`, [r!.executionId]);
      const sum = await reapExpired(c);
      assert.equal(sum.needsReview, 0, "미시작이면 needs_review 아님");
      assert.notEqual((await getJob(c, j.job.id))!.status, "needs_review");
    } finally { await db.close(); }
  });

  test("13. transient failure → queued(backoff)", async () => {
    const { db, c } = await freshQ();
    try {
      const j = await createJob(c, jobInput());
      const r = await claimNextJob(c, "w1");
      const f = await failExecution(c, { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken, jobType: "internal-report", errorCode: "transient.network" });
      assert.equal(f.outcome, "retry-scheduled");
      assert.equal((await getJob(c, j.job.id))!.status, "queued");
    } finally { await db.close(); }
  });

  test("14. permanent failure → failed", async () => {
    const { db, c } = await freshQ();
    try {
      const j = await createJob(c, jobInput());
      const r = await claimNextJob(c, "w1");
      const f = await failExecution(c, { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken, jobType: "internal-report", errorCode: "permanent.invalid-input" });
      assert.equal(f.outcome, "failed");
      assert.equal((await getJob(c, j.job.id))!.status, "failed");
    } finally { await db.close(); }
  });

  test("15. retry 소진 → failed", async () => {
    const { db, c } = await freshQ();
    try {
      const j = await createJob(c, jobInput()); // internal-report maxAttempts=3
      for (let i = 1; i <= 3; i++) {
        await c.query(`UPDATE jobs SET available_at=now()`);
        const r = await claimNextJob(c, "w1");
        assert.ok(r, `claim attempt ${i}`);
        await failExecution(c, { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken, jobType: "internal-report", errorCode: "transient.network" });
      }
      assert.equal((await getJob(c, j.job.id))!.status, "failed", "3회 소진 후 failed");
    } finally { await db.close(); }
  });

  test("16. forced-rerun → 같은 job 새 execution", async () => {
    const { db, c } = await freshQ();
    try {
      const j = await createJob(c, jobInput());
      const r = await claimNextJob(c, "w1");
      await markRunning(c, { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken });
      await completeExecution(c, { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken, jobType: "internal-report", result: await internalReportAdapter.execute(r!.adapterInput) });
      const fr = await claimForcedRerun(c, j.job.id, "w2");
      assert.ok(fr && fr.attemptNumber === 2);
      const exs = await listExecutions(c, j.job.id);
      assert.equal(exs.length, 2);
      assert.equal(exs[1].execution_reason, "forced-rerun");
      assert.equal(exs[0].status, "succeeded", "기존 결과 보존");
    } finally { await db.close(); }
  });

  test("17. reprocess → 새 job·parent 관계", async () => {
    const { db, c } = await freshQ();
    try {
      const parent = await createJob(c, jobInput());
      const child = await createJob(c, jobInput({
        requestVersionSnapshot: snap({ pipelineVersion: "p2" }), // 버전 변경 → 새 key
        parentJobId: parent.job.id, reprocessReason: "version-bump",
      }));
      assert.equal(child.created, true);
      assert.equal(child.job.parent_job_id, parent.job.id);
      assert.notEqual(child.job.idempotency_key, parent.job.idempotency_key);
    } finally { await db.close(); }
  });

  test("18. snapshot mismatch → adapter 미실행·job blocked", async () => {
    const { db, c } = await freshQ();
    try {
      const j = await createJob(c, jobInput());
      const r = await claimNextJob(c, "w1");
      const cmp = compareVersionSnapshots(r!.adapterInput.requestVersionSnapshot, { ...internalReportAdapter.actualVersion(r!.adapterInput), pipelineVersion: "DIFFERENT" });
      assert.equal(cmp.match, false);
      assert.deepEqual(cmp.mismatchedFields, ["pipelineVersion"]);
      const res = await markVersionMismatch(c, { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken, jobType: "internal-report", mismatchedFields: cmp.mismatchedFields });
      assert.equal(res.outcome, "blocked");
      assert.equal((await getJob(c, j.job.id))!.status, "blocked");
      assert.equal((await getExecution(c, r!.executionId))!.status, "verification_failed");
    } finally { await db.close(); }
  });

  test("19. verification pending → succeeded 금지", async () => {
    const { db, c } = await freshQ();
    try {
      await createJob(c, jobInput());
      const r = await claimNextJob(c, "w1");
      const result = await internalReportAdapter.execute(r!.adapterInput);
      const res = await completeExecution(c, { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken, jobType: "internal-report", result: { ...result, verificationStatus: "pending" } });
      assert.equal(res.outcome, "rejected-verification");
      assert.equal((await getExecution(c, r!.executionId))!.status, "claimed", "succeeded 로 안 감(상태 불변)");
      assert.notEqual((await getJob(c, r!.job.id))!.status, "succeeded");
    } finally { await db.close(); }
  });

  test("20. passed → succeeded(전체 lifecycle)", async () => {
    const { db, c } = await freshQ();
    try {
      const j = await createJob(c, jobInput());
      const r = await claimNextJob(c, "w1");
      assert.equal(await markRunning(c, { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken }), true);
      const result = await internalReportAdapter.execute(r!.adapterInput);
      const res = await completeExecution(c, { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken, jobType: "internal-report", result });
      assert.equal(res.outcome, "succeeded");
      assert.equal((await getJob(c, j.job.id))!.status, "succeeded");
      assert.equal((await getExecution(c, r!.executionId))!.verification_status, "passed");
    } finally { await db.close(); }
  });

  test("21. terminal execution 결과 덮어쓰기 금지", async () => {
    const { db, c } = await freshQ();
    try {
      await createJob(c, jobInput());
      const r = await claimNextJob(c, "w1");
      const result = await internalReportAdapter.execute(r!.adapterInput);
      await completeExecution(c, { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken, jobType: "internal-report", result });
      const again = await completeExecution(c, { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken, jobType: "internal-report", result });
      assert.equal(again.outcome, "already-terminal");
    } finally { await db.close(); }
  });

  test("22. raw token DB 미저장(hash 만)", async () => {
    const { db, c } = await freshQ();
    try {
      await createJob(c, jobInput());
      const r = await claimNextJob(c, "w1");
      const stored = (await getExecution(c, r!.executionId))!.lease_token_hash;
      assert.notEqual(stored, r!.rawLeaseToken, "raw token 저장 안 함");
      assert.equal(stored, sha256Hex(r!.rawLeaseToken), "hash 만 저장");
      // DB 전체 텍스트에 raw token 없음
      const dump = JSON.stringify((await c.query(`SELECT * FROM job_executions`)).rows);
      assert.ok(!dump.includes(r!.rawLeaseToken), "어느 컬럼에도 raw token 없음");
    } finally { await db.close(); }
  });

  test("23. 기존 sentinel 불변(전체 lifecycle 후)", async () => {
    const { db, c } = await freshQ();
    try {
      await db.exec(`CREATE TABLE sentinel(id int primary key, v text); INSERT INTO sentinel VALUES (1,'x'),(2,'y');`);
      const before = (await c.query(`SELECT * FROM sentinel ORDER BY id`)).rows;
      await createJob(c, jobInput());
      const r = await claimNextJob(c, "w1");
      await completeExecution(c, { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken, jobType: "internal-report", result: await internalReportAdapter.execute(r!.adapterInput) });
      assert.deepEqual((await c.query(`SELECT * FROM sentinel ORDER BY id`)).rows, before);
    } finally { await db.close(); }
  });
});
