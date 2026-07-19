// 실제 PostgreSQL 17 다중 커넥션 동시성·교착 안전성 검증(opt-in). test:knop 글롭 밖 → `npm run test:queue:pg`.
// 재현성: TEST_DATABASE_URL 있을 때만 실행(운영 URL 은 testGuard 가 거부, URL 원문 미로그).
// 매 실행 전후 큐 테이블 재생성(cleanup), 시작 시 0행 확인. 테스트마다 무작위 identity 로 충돌 방지.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { resolveTestDbUrl } from "../knop/testGuard";
import {
  createJob, claimNextJob, markRunning, heartbeat, completeExecution, failExecution, reapExpired,
  sha256Hex, getJob, getExecution, listExecutions,
  type QueueClient, type RequestVersionSnapshot,
} from "../../server/jobQueue/index";
import { internalReportAdapter } from "../../server/jobQueue/adapters/internalReport";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIG = readFileSync(path.join(here, "..", "..", "migrations", "0002_create_persistent_job_queue.sql"), "utf-8");

// 운영 오접속 차단: testGuard 가 운영 URL/무표식 DB 를 거부. 실패 사유는 host/URL 원문 없이만 노출.
let URL: string | null = null;
try { URL = resolveTestDbUrl(); } catch (e: any) { URL = null; console.error("[queue-pg] 부적합 DB 거부(skip):", e?.name || "guard"); }
const RUN = !!URL;

const conn = () => new pg.Client({ connectionString: URL!, ssl: URL!.includes("sslmode=disable") ? false : { rejectUnauthorized: false } });
const qc = (c: pg.Client): QueueClient => ({ query: (sql, params) => c.query(sql, params as any[]) });
function snap(over: Partial<RequestVersionSnapshot> = {}): RequestVersionSnapshot {
  return { schemaVersion: 1, pipelineVersion: "p1", transcriptionEngineVersion: null, transcriptionEngineHash: null, dictionaryVersion: "d1", normalizationVersion: 1, correctionEngineVersion: null, correctionEngineHash: "e".repeat(64), executorRequirement: null, ...over };
}
let seq = 0;
const jobInput = (over: any = {}) => ({ ownerScope: "kop", projectId: "p", jobType: "internal-report", inputIdentity: { inputAssetHash: `a-${++seq}` }, requestVersionSnapshot: snap(), executionOptions: null, payloadHash: sha256Hex("p"), ...over });
const rowCount = async (c: pg.Client, t: string) => (await c.query(`SELECT count(*)::int n FROM ${t}`)).rows[0].n;

let admin: pg.Client;

describe("PG17 동시성·교착 안전성(opt-in)", { skip: RUN ? false : "TEST_DATABASE_URL 없음 → skip" }, () => {
  before(async () => {
    admin = conn(); await admin.connect();
    await admin.query(`DROP TABLE IF EXISTS job_executions CASCADE; DROP TABLE IF EXISTS jobs CASCADE;`);
    await admin.query(MIG);
    assert.equal(await rowCount(admin, "jobs"), 0, "시작 시 jobs 0행");
    assert.equal(await rowCount(admin, "job_executions"), 0, "시작 시 job_executions 0행");
  });
  after(async () => {
    if (admin) { await admin.query(`DROP TABLE IF EXISTS job_executions CASCADE; DROP TABLE IF EXISTS jobs CASCADE;`).catch(() => {}); await admin.end(); }
  });

  test("claim 경합: 1 job·2 워커 동시 → 정확히 1 획득", async () => {
    await createJob(qc(admin), jobInput());
    const [a, b] = [conn(), conn()]; await a.connect(); await b.connect();
    try {
      const [r1, r2] = await Promise.all([claimNextJob(qc(a), "w1"), claimNextJob(qc(b), "w2")]);
      assert.equal([r1, r2].filter(Boolean).length, 1, "한 워커만 claim");
    } finally { await a.end(); await b.end(); }
  });

  test("claim 경합: 10 job·4 워커 동시 → 중복 claim 0", async () => {
    for (let i = 0; i < 10; i++) await createJob(qc(admin), jobInput());
    const workers = await Promise.all([0, 1, 2, 3].map(async (w) => {
      const cc = conn(); await cc.connect();
      const got: string[] = [];
      try { for (let k = 0; k < 6; k++) { const r = await claimNextJob(qc(cc), "w" + w); if (r) got.push(r.job.id); } }
      finally { await cc.end(); }
      return got;
    }));
    const all = workers.flat();
    assert.equal(all.length, new Set(all).size, "중복 claim 0");
    assert.equal((await admin.query(`SELECT count(*)::int n FROM jobs WHERE status='queued'`)).rows[0].n, 0, "queued 잔여 0");
  });

  test("completion vs reaper: reaper 먼저 → 늦은 completion 거부(덮어쓰기 없음)", async () => {
    const j = await createJob(qc(admin), jobInput());
    const r = await claimNextJob(qc(admin), "w1");
    await markRunning(qc(admin), { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken });
    await admin.query(`UPDATE job_executions SET lease_expires_at=now()-interval '1s' WHERE id=$1`, [r!.executionId]);
    await reapExpired(qc(admin));
    const res = await completeExecution(qc(admin), { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken, jobType: "internal-report", result: await internalReportAdapter.execute(r!.adapterInput) });
    assert.ok(["already-terminal", "lease-expired"].includes(res.outcome), `late completion 거부(${res.outcome})`);
    assert.notEqual((await getExecution(qc(admin), r!.executionId))!.status, "succeeded");
  });

  test("completion vs reaper: completion 먼저 → reaper no-op", async () => {
    const j = await createJob(qc(admin), jobInput());
    const r = await claimNextJob(qc(admin), "w1");
    await markRunning(qc(admin), { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken });
    await completeExecution(qc(admin), { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken, jobType: "internal-report", result: await internalReportAdapter.execute(r!.adapterInput) });
    await admin.query(`UPDATE job_executions SET lease_expires_at=now()-interval '1s' WHERE id=$1`, [r!.executionId]);
    assert.equal((await reapExpired(qc(admin))).reaped, 0);
    assert.equal((await getJob(qc(admin), j.job.id))!.status, "succeeded");
  });

  test("heartbeat vs reaper: 연장하면 reaper 가 expire 안 함", async () => {
    await createJob(qc(admin), jobInput());
    const r = await claimNextJob(qc(admin), "w1");
    assert.equal(await heartbeat(qc(admin), { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken, jobType: "internal-report" }), true);
    assert.equal((await reapExpired(qc(admin))).reaped, 0);
  });

  test("두 reaper 동시 → 같은 expired execution 1회만(SKIP LOCKED)", async () => {
    const j = await createJob(qc(admin), jobInput());
    const r = await claimNextJob(qc(admin), "w1");
    await markRunning(qc(admin), { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken });
    await admin.query(`UPDATE job_executions SET lease_expires_at=now()-interval '1s' WHERE id=$1`, [r!.executionId]);
    const [a, b] = [conn(), conn()]; await a.connect(); await b.connect();
    try {
      const [s1, s2] = await Promise.all([reapExpired(qc(a)), reapExpired(qc(b))]);
      assert.equal(s1.reaped + s2.reaped, 1, "합쳐서 1회");
    } finally { await a.end(); await b.end(); }
    assert.equal((await listExecutions(qc(admin), j.job.id)).filter((e) => e.status === "expired").length, 1);
  });

  test("교착 안전성: completion·fail 동시(같은 execution) → 교착 없음·한쪽만 terminal", async () => {
    const j = await createJob(qc(admin), jobInput());
    const r = await claimNextJob(qc(admin), "w1");
    await markRunning(qc(admin), { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken });
    const [a, b] = [conn(), conn()]; await a.connect(); await b.connect();
    try {
      const res = await Promise.allSettled([
        completeExecution(qc(a), { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken, jobType: "internal-report", result: await internalReportAdapter.execute(r!.adapterInput) }),
        failExecution(qc(b), { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken, jobType: "internal-report", errorCode: "transient.network" }),
      ]);
      // 교착·예외 없음(둘 다 fulfilled). execution→job 단일 lock 순서라 한쪽이 대기 후 already-terminal.
      assert.ok(res.every((x) => x.status === "fulfilled"), "교착/예외 없음");
    } finally { await a.end(); await b.end(); }
    const ex = await getExecution(qc(admin), r!.executionId);
    assert.ok(["succeeded", "failed"].includes(ex!.status), "정확히 하나의 terminal 결과");
  });

  test("교착 안전성: completion·reaper 동시(만료 경계) → 교착 없음", async () => {
    const j = await createJob(qc(admin), jobInput());
    const r = await claimNextJob(qc(admin), "w1");
    await markRunning(qc(admin), { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken });
    await admin.query(`UPDATE job_executions SET lease_expires_at=now()-interval '1s' WHERE id=$1`, [r!.executionId]);
    const [a, b] = [conn(), conn()]; await a.connect(); await b.connect();
    try {
      const res = await Promise.allSettled([
        completeExecution(qc(a), { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken, jobType: "internal-report", result: await internalReportAdapter.execute(r!.adapterInput) }),
        reapExpired(qc(b)),
      ]);
      assert.ok(res.every((x) => x.status === "fulfilled"), "교착/예외 없음(SKIP LOCKED)");
    } finally { await a.end(); await b.end(); }
    assert.notEqual((await getExecution(qc(admin), r!.executionId))!.status, "succeeded", "만료건은 succeeded 안 됨");
  });
});
