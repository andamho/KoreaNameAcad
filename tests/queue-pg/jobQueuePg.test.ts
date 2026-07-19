// 실제 PostgreSQL 17 다중 커넥션 동시성 검증(opt-in). test:knop 글롭 밖 → `npm run test:queue:pg`.
// TEST_DATABASE_URL 있을 때만 실행(운영 URL 은 testGuard 가 거부). 없으면 skip.
// heartbeat/reaper·completion/reaper·fail/completion·두 reaper·forced-rerun 동시 요청의 불변식 검증.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { resolveTestDbUrl } from "../knop/testGuard";
import {
  createJob, claimNextJob, markRunning, heartbeat, completeExecution, failExecution, reapExpired, claimForcedRerun,
  internalReportAdapter, sha256Hex, getJob, getExecution, listExecutions,
  type QueueClient, type RequestVersionSnapshot,
} from "../../server/jobQueue/index";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIG = readFileSync(path.join(here, "..", "..", "migrations", "0002_create_persistent_job_queue.sql"), "utf-8");

let URL: string | null = null;
try { URL = resolveTestDbUrl(); } catch (e: any) { URL = null; console.error("[queue-pg] 운영/부적합 DB 거부:", e?.message); }
const RUN = !!URL;

const conn = () => new pg.Client({ connectionString: URL!, ssl: URL!.includes("sslmode=disable") ? false : { rejectUnauthorized: false } });
const qc = (c: pg.Client): QueueClient => ({ query: (sql, params) => c.query(sql, params as any[]) });
function snap(over: Partial<RequestVersionSnapshot> = {}): RequestVersionSnapshot {
  return { schemaVersion: 1, pipelineVersion: "p1", transcriptionEngineVersion: null, transcriptionEngineHash: null, dictionaryVersion: "d1", normalizationVersion: 1, correctionEngineVersion: null, correctionEngineHash: "e".repeat(64), executorRequirement: null, ...over };
}
const jobInput = (over: any = {}) => ({ ownerScope: "kop", projectId: "p", jobType: "internal-report", inputIdentity: { inputAssetHash: "a" + Math.random() }, requestVersionSnapshot: snap(), executionOptions: null, payloadHash: sha256Hex("p"), ...over });

let admin: pg.Client;

describe("PG17 동시성(opt-in)", { skip: RUN ? false : "TEST_DATABASE_URL 없음 → skip" }, () => {
  before(async () => {
    admin = conn(); await admin.connect();
    await admin.query(`DROP TABLE IF EXISTS job_executions CASCADE; DROP TABLE IF EXISTS jobs CASCADE;`);
    await admin.query(MIG);
  });
  after(async () => { await admin.query(`DROP TABLE IF EXISTS job_executions CASCADE; DROP TABLE IF EXISTS jobs CASCADE;`).catch(() => {}); await admin.end(); });

  test("completion vs reaper: reaper 먼저 expired → 늦은 completion 거부(덮어쓰기 없음)", async () => {
    const j = await createJob(qc(admin), jobInput());
    const r = await claimNextJob(qc(admin), "w1");
    await markRunning(qc(admin), { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken });
    await admin.query(`UPDATE job_executions SET lease_expires_at=now()-interval '1s' WHERE id=$1`, [r!.executionId]);
    await reapExpired(qc(admin)); // reaper 먼저 → expired, job queued
    const res = await completeExecution(qc(admin), { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken, jobType: "internal-report", result: await internalReportAdapter.execute(r!.adapterInput) });
    assert.ok(["already-terminal", "lease-expired"].includes(res.outcome), `late completion 거부(${res.outcome})`);
    assert.notEqual((await getExecution(qc(admin), r!.executionId))!.status, "succeeded", "expired 를 succeeded 로 덮어쓰지 않음");
  });

  test("completion vs reaper: completion 먼저 성공 → reaper no-op", async () => {
    const j = await createJob(qc(admin), jobInput());
    const r = await claimNextJob(qc(admin), "w1");
    await markRunning(qc(admin), { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken });
    await completeExecution(qc(admin), { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken, jobType: "internal-report", result: await internalReportAdapter.execute(r!.adapterInput) });
    await admin.query(`UPDATE job_executions SET lease_expires_at=now()-interval '1s' WHERE id=$1`, [r!.executionId]);
    const sum = await reapExpired(qc(admin));
    assert.equal(sum.reaped, 0, "succeeded 는 reaper 대상 아님");
    assert.equal((await getJob(qc(admin), j.job.id))!.status, "succeeded");
  });

  test("heartbeat vs reaper: heartbeat 로 연장하면 reaper 가 expire 안 함", async () => {
    const j = await createJob(qc(admin), jobInput());
    const r = await claimNextJob(qc(admin), "w1");
    const ok = await heartbeat(qc(admin), { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken, jobType: "internal-report" });
    assert.equal(ok, true);
    const sum = await reapExpired(qc(admin)); // lease 연장됨 → 만료 대상 아님
    assert.equal(sum.reaped, 0);
    assert.equal((await getExecution(qc(admin), r!.executionId))!.status, "claimed");
  });

  test("fail vs completion: 한쪽만 terminal, 갈라짐 없음", async () => {
    const j = await createJob(qc(admin), jobInput());
    const r = await claimNextJob(qc(admin), "w1");
    await markRunning(qc(admin), { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken });
    await completeExecution(qc(admin), { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken, jobType: "internal-report", result: await internalReportAdapter.execute(r!.adapterInput) });
    const f = await failExecution(qc(admin), { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken, jobType: "internal-report", errorCode: "transient.network" });
    assert.equal(f.outcome, "already-terminal", "이미 succeeded → fail 은 already-terminal");
    assert.equal((await getJob(qc(admin), j.job.id))!.status, "succeeded");
  });

  test("두 reaper 동시 → 같은 expired execution 1회만 처리", async () => {
    const j = await createJob(qc(admin), jobInput());
    const r = await claimNextJob(qc(admin), "w1");
    await markRunning(qc(admin), { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken });
    await admin.query(`UPDATE job_executions SET lease_expires_at=now()-interval '1s' WHERE id=$1`, [r!.executionId]);
    const [a, b] = [conn(), conn()]; await a.connect(); await b.connect();
    const [s1, s2] = await Promise.all([reapExpired(qc(a)), reapExpired(qc(b))]);
    await a.end(); await b.end();
    assert.equal(s1.reaped + s2.reaped, 1, "합쳐서 정확히 1회 처리(SKIP LOCKED)");
    assert.equal((await listExecutions(qc(admin), j.job.id)).filter((e) => e.status === "expired").length, 1);
  });

  test("forced-rerun 동시 요청 → active execution 1개만(부분유일 최종 방어)", async () => {
    const j = await createJob(qc(admin), jobInput());
    const r = await claimNextJob(qc(admin), "w1");
    await markRunning(qc(admin), { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken });
    await completeExecution(qc(admin), { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken, jobType: "internal-report", result: await internalReportAdapter.execute(r!.adapterInput) });
    const [a, b] = [conn(), conn()]; await a.connect(); await b.connect();
    const results = await Promise.allSettled([claimForcedRerun(qc(a), j.job.id, "w2"), claimForcedRerun(qc(b), j.job.id, "w3")]);
    await a.end(); await b.end();
    const ok = results.filter((x) => x.status === "fulfilled" && x.value).length;
    assert.equal(ok, 1, "정확히 1개만 forced-rerun 성공");
    const active = (await listExecutions(qc(admin), j.job.id)).filter((e) => e.status === "claimed" || e.status === "running");
    assert.equal(active.length, 1, "active execution 1개");
  });
});
