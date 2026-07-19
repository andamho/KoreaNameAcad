// runtime hardening 검증 — canonical 골든·createJob identity 재검증·불변식 진단·lease 경계·reprocess 가드·로그 안전성.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  canonicalStringify, sha256Hex, CanonicalizationError, computeIdempotencyKey,
  createJob, HashIdentityMismatchError, claimNextJob, markRunning, completeExecution, heartbeat, failExecution,
  inspectJobInvariant, getJob,
  type QueueClient, type RequestVersionSnapshot,
} from "../../server/jobQueue/index";
import { internalReportAdapter } from "../../server/jobQueue/adapters/internalReport";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIG = readFileSync(path.join(here, "..", "..", "migrations", "0002_create_persistent_job_queue.sql"), "utf-8");
const GOLDEN = JSON.parse(readFileSync(path.join(here, "fixtures", "canonicalGolden.json"), "utf-8"));

function snap(over: Partial<RequestVersionSnapshot> = {}): RequestVersionSnapshot {
  return { schemaVersion: 1, pipelineVersion: "p1", transcriptionEngineVersion: null, transcriptionEngineHash: null, dictionaryVersion: "d1", normalizationVersion: 1, correctionEngineVersion: null, correctionEngineHash: "e".repeat(64), executorRequirement: null, ...over };
}
function jobInput(over: any = {}) {
  return { ownerScope: "kop", projectId: "proj-1", jobType: "internal-report", inputIdentity: { inputAssetHash: "asset-1" }, requestVersionSnapshot: snap(), executionOptions: { a: 1 }, payloadHash: sha256Hex("payload"), ...over };
}
async function freshQ(): Promise<{ db: any; c: QueueClient }> {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite(); await db.exec(MIG);
  return { db, c: { query: (sql, params) => db.query(sql, params as any[]) as any } };
}

describe("runtime hardening", () => {
  // ── canonical 골든 ──
  test("canonical: 골든 fixture 재현(bytes+sha256 동결)", () => {
    for (const cse of GOLDEN.cases) {
      // 골든 case 의 canonicalBytes 를 다시 파싱→canonical 하면 동일해야(결정성)
      const reparsed = JSON.parse(cse.canonicalBytes);
      assert.equal(canonicalStringify(reparsed), cse.canonicalBytes, `${cse.name} bytes`);
      assert.equal(sha256Hex(cse.canonicalBytes), cse.sha256, `${cse.name} sha256`);
    }
    assert.equal(computeIdempotencyKey({ ownerScope: "kop", projectId: "proj-1", jobType: "internal-report", inputAssetHash: "asset-1", pipelineVersion: "p1", transcriptionEngineHash: null, transcriptionEngineVersion: null, dictionaryVersion: "d1", normalizationVersion: 1, correctionEngineHash: "e".repeat(64), executionOptionsHash: sha256Hex("null") }), GOLDEN.idempotencyKeyGolden.key);
  });

  test("canonical: key 순서 무관·배열 순서 보존·null≠missing·숫자 결정성", () => {
    assert.equal(canonicalStringify({ a: 1, b: 2 }), canonicalStringify({ b: 2, a: 1 }), "key 순서 무관");
    assert.notEqual(canonicalStringify([1, 2]), canonicalStringify([2, 1]), "배열 순서 보존");
    assert.notEqual(canonicalStringify({ a: null }), canonicalStringify({}), "null ≠ missing");
    assert.equal(canonicalStringify(1), "1");
    assert.equal(canonicalStringify({ n: 1.5 }), '{"n":1.5}');
    // CRLF/LF 는 값에 충실(다른 내용=다른 hash) + 소스 표기 무관하게 결정적
    assert.notEqual(canonicalStringify("a\r\nb"), canonicalStringify("a\nb"));
    assert.equal(canonicalStringify("a\nb"), canonicalStringify("a" + "\n" + "b"));
  });

  test("canonical: projectId null≠값·ownerScope 차이 → 다른 key", () => {
    const base = { jobType: "internal-report", inputAssetHash: "a", pipelineVersion: null, transcriptionEngineHash: null, transcriptionEngineVersion: null, dictionaryVersion: null, normalizationVersion: null, correctionEngineHash: null, executionOptionsHash: sha256Hex("null") };
    const k1 = computeIdempotencyKey({ ...base, ownerScope: "kop", projectId: null });
    const k2 = computeIdempotencyKey({ ...base, ownerScope: "kop", projectId: "p1" });
    const k3 = computeIdempotencyKey({ ...base, ownerScope: "other", projectId: null });
    assert.notEqual(k1, k2); assert.notEqual(k1, k3); assert.notEqual(k2, k3);
  });

  test("canonical: undefined·Date·BigInt·function·순환 거부", () => {
    assert.throws(() => canonicalStringify(undefined), CanonicalizationError);
    assert.throws(() => canonicalStringify({ a: undefined }), CanonicalizationError);
    assert.throws(() => canonicalStringify({ d: new Date() }), CanonicalizationError);
    assert.throws(() => canonicalStringify({ b: 10n }), CanonicalizationError);
    assert.throws(() => canonicalStringify({ f: () => 1 }), CanonicalizationError);
    const circ: any = {}; circ.self = circ;
    assert.throws(() => canonicalStringify(circ), CanonicalizationError);
  });

  // ── createJob identity 재검증 ──
  test("createJob: 같은 key·다른 payload_hash → HASH_IDENTITY_MISMATCH(fail-closed)", async () => {
    const { db, c } = await freshQ();
    try {
      await createJob(c, jobInput({ payloadHash: sha256Hex("H1") }));
      // 같은 key-입력(owner/project/jobType/inputAssetHash/버전/execOptions 동일)인데 payloadHash 만 다름
      await assert.rejects(
        () => createJob(c, jobInput({ payloadHash: sha256Hex("H2") })),
        (e: any) => e instanceof HashIdentityMismatchError && e.mismatchedFields.includes("payload_hash"),
      );
      assert.equal((await c.query(`SELECT count(*)::int n FROM jobs`)).rows[0].n, 1, "새 job 생성 안 함");
    } finally { await db.close(); }
  });

  test("createJob: 동일 요청 재호출 → 기존 반환(mismatch 아님)", async () => {
    const { db, c } = await freshQ();
    try {
      const a = await createJob(c, jobInput());
      const b = await createJob(c, jobInput());
      assert.equal(b.created, false); assert.equal(b.job.id, a.job.id);
    } finally { await db.close(); }
  });

  // ── reprocess 가드 ──
  test("reprocess: reason 만 바꾼 동일 identity → 새 job 안 만듦(기존 반환)", async () => {
    const { db, c } = await freshQ();
    try {
      const parent = await createJob(c, jobInput());
      const attempt = await createJob(c, jobInput({ parentJobId: parent.job.id, reprocessReason: "just-reason" }));
      assert.equal(attempt.created, false, "reason 만으로 새 job 금지");
      assert.equal(attempt.job.id, parent.job.id);
      assert.equal((await c.query(`SELECT count(*)::int n FROM jobs`)).rows[0].n, 1);
      // 실제 입력/버전 변경 시에만 새 job
      const real = await createJob(c, jobInput({ requestVersionSnapshot: snap({ pipelineVersion: "p2" }), parentJobId: parent.job.id, reprocessReason: "version-bump" }));
      assert.equal(real.created, true);
    } finally { await db.close(); }
  });

  // ── 불변식 진단 ──
  test("invariant: 고의 불일치를 진단기가 탐지", async () => {
    const { db, c } = await freshQ();
    try {
      // running job 인데 active execution 0 → running-without-single-active
      const j = await createJob(c, jobInput());
      await c.query(`UPDATE jobs SET status='running' WHERE id=$1`, [j.job.id]);
      let rep = await inspectJobInvariant(c, j.job.id);
      assert.ok(rep.violations.includes("running-without-single-active"));

      // terminal job 인데 active execution 존재 → terminal-with-active + active-without-running
      const k = await createJob(c, jobInput({ projectId: "p2" }));
      await c.query(`INSERT INTO job_executions(job_id,attempt_number,status,worker_id,lease_token_hash,leased_at,lease_expires_at) VALUES ($1,1,'running','w',repeat('a',64),now(),now()+interval '1 hour')`, [k.job.id]);
      await c.query(`UPDATE jobs SET status='succeeded' WHERE id=$1`, [k.job.id]);
      rep = await inspectJobInvariant(c, k.job.id);
      assert.ok(rep.violations.includes("terminal-with-active"));
      assert.equal(rep.activeExecutionIds.length, 1);

      // 정상 job → 위반 0
      const ok = await createJob(c, jobInput({ projectId: "p3" }));
      const r = await claimNextJob(c, "w1");
      await markRunning(c, { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken });
      await completeExecution(c, { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken, jobType: "internal-report", result: await internalReportAdapter.execute(r!.adapterInput) });
      assert.deepEqual((await inspectJobInvariant(c, ok.job.id)).violations, []);
    } finally { await db.close(); }
  });

  // ── lease 경계 ──
  test("lease: 만료된 lease 로 completion/heartbeat 거부(reaper 소관)", async () => {
    const { db, c } = await freshQ();
    try {
      await createJob(c, jobInput());
      const r = await claimNextJob(c, "w1");
      await markRunning(c, { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken });
      await c.query(`UPDATE job_executions SET lease_expires_at = now() - interval '1 second' WHERE id=$1`, [r!.executionId]);
      assert.equal(await heartbeat(c, { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken, jobType: "internal-report" }), false, "만료 heartbeat 거부");
      const res = await completeExecution(c, { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken, jobType: "internal-report", result: await internalReportAdapter.execute(r!.adapterInput) });
      assert.equal(res.outcome, "lease-expired", "만료 lease completion 거부");
    } finally { await db.close(); }
  });

  // ── 로그·error_summary 안전성 ──
  test("safety: error_code registry 강제 + error_summary 1000자 제한", async () => {
    const { db, c } = await freshQ();
    try {
      await createJob(c, jobInput());
      const r = await claimNextJob(c, "w1");
      await assert.rejects(() => failExecution(c, { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken, jobType: "internal-report", errorCode: "not-a-code" as any }), /미등록 error_code/);
      await assert.rejects(() => failExecution(c, { executionId: r!.executionId, workerId: "w1", rawLeaseToken: r!.rawLeaseToken, jobType: "internal-report", errorCode: "transient.network", errorSummary: "x".repeat(1001) }), /길이 초과/);
    } finally { await db.close(); }
  });

  test("safety: raw lease token 이 console·throw·DB 어디에도 없음", async () => {
    const { db, c } = await freshQ();
    const logs: string[] = [];
    const orig = { log: console.log, error: console.error, warn: console.warn };
    console.log = console.error = console.warn = (...a: any[]) => { logs.push(a.map(String).join(" ")); };
    try {
      await createJob(c, jobInput());
      const r = await claimNextJob(c, "w1");
      const token = r!.rawLeaseToken;
      await markRunning(c, { executionId: r!.executionId, workerId: "w1", rawLeaseToken: token });
      // 잘못된 token completion(throw 유발 없음, 결과만) + 정상 완료
      await completeExecution(c, { executionId: r!.executionId, workerId: "w1", rawLeaseToken: "wrong", jobType: "internal-report", result: await internalReportAdapter.execute(r!.adapterInput) });
      await completeExecution(c, { executionId: r!.executionId, workerId: "w1", rawLeaseToken: token, jobType: "internal-report", result: await internalReportAdapter.execute(r!.adapterInput) });
      const dbDump = JSON.stringify((await c.query(`SELECT * FROM job_executions`)).rows);
      console.log = orig.log; console.error = orig.error; console.warn = orig.warn;
      assert.ok(!dbDump.includes(token), "DB 에 raw token 없음");
      assert.ok(!logs.join("\n").includes(token), "로그에 raw token 없음");
    } finally {
      console.log = orig.log; console.error = orig.error; console.warn = orig.warn;
      await db.close();
    }
  });
});
