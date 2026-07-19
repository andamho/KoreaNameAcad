// 제한 shadow writer 검증 (PGlite, 운영 DB 미접촉). needs_review 만·fail-closed·idempotent·raw id 미저장.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runShadowWrite, selectNeedsReviewTargets, buildTargetObservations, type WriterConfig, type WriterClient } from "../../server/jobQueue/previews/shadowWriter";
import { sha256Hex } from "../../server/jobQueue/idempotency";

const here = path.dirname(fileURLToPath(import.meta.url));
const rd = (f: string) => readFileSync(path.join(here, "..", "..", "migrations", f), "utf-8");
const MIG01 = rd("0001_add_report_matches.sql"), MIG02 = rd("0002_create_persistent_job_queue.sql"), MIG03 = rd("0003_create_job_shadow_previews.sql");
const H = (s: string) => sha256Hex(s);
const TEST_KEY = "test-only-shadow-hmac-key-0123456789abcdef";

function cfg(over: Partial<WriterConfig> = {}): WriterConfig {
  return {
    keyVersion: "v1", hmacKey: TEST_KEY, pipelineVersion: "internal-report-pipeline-v1", rendererVersion: "report-renderer-v1",
    pipelineHash: H("pipe"), rendererHash: H("rend"), rendererLibraryVersion: "1.28.0",
    executionOptions: { outputFormat: "png", outputMode: "attach", dpi: 288 }, observedPipelineHash: H("pipe"),
    expectedSourceCount: 4, observedAt: "2026-07-19T00:00:00.000Z", ...over,
  };
}
async function freshDb(seedCount = 4, opts: { withArtifact?: boolean; badHash?: boolean; extraStatus?: string } = {}) {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  await db.exec(`CREATE TABLE customers(id varchar PRIMARY KEY); CREATE TABLE consultations(id varchar PRIMARY KEY);`);
  await db.exec(MIG01); await db.exec(MIG02); await db.exec(MIG03);
  const c: WriterClient = { query: (sql, params) => db.query(sql, params as any[]) as any, exec: (sql) => db.exec(sql).then(() => undefined) };
  for (let i = 0; i < seedCount; i++) {
    const fh = opts.badHash && i === 0 ? "not-a-hash" : H("report-" + i);
    await db.query(
      `INSERT INTO report_matches (file_name, file_hash, first_seen_at, report_type, status, rendered_url)
       VALUES ($1,$2,now(),$3,'needs_review',$4)`,
      [`f${i}.pdf`, fh, i % 2 === 0 ? "family" : "individual", opts.withArtifact === false ? null : `/objects/uploads/${i}.png`],
    );
  }
  if (opts.extraStatus) {
    await db.query(`INSERT INTO report_matches (file_name, file_hash, first_seen_at, report_type, status, rendered_url) VALUES ('x.pdf',$1,now(),'family',$2,'/objects/x.png')`, [H("extra"), opts.extraStatus]);
  }
  return { db, c };
}
const shadowCount = async (db: any) => (await db.query(`SELECT count(*)::int n FROM job_shadow_previews`)).rows[0].n;

describe("제한 shadow writer", () => {
  test("1. key 없음 → fail-closed(no write)", async () => {
    const { db, c } = await freshDb();
    try { const r = await runShadowWrite(c, cfg({ hmacKey: undefined }), "apply"); assert.ok(r.aborted && r.preflightCodes.includes("KEY_MISSING")); assert.equal(await shadowCount(db), 0); } finally { await db.close(); }
  });
  test("2. 짧은 key → fail(KEY_MISSING)", async () => {
    const { db, c } = await freshDb();
    try { const r = await runShadowWrite(c, cfg({ hmacKey: "short" }), "apply"); assert.ok(r.aborted && r.preflightCodes.includes("KEY_MISSING")); assert.equal(await shadowCount(db), 0); } finally { await db.close(); }
  });
  test("3. 대상 수 mismatch(3건) → no write", async () => {
    const { db, c } = await freshDb(3);
    try { const r = await runShadowWrite(c, cfg(), "apply"); assert.ok(r.aborted && r.preflightCodes.includes("COUNT_MISMATCH")); assert.equal(await shadowCount(db), 0); } finally { await db.close(); }
  });
  test("4. invalid hash → no write", async () => {
    const { db, c } = await freshDb(4, { badHash: true });
    try { const r = await runShadowWrite(c, cfg(), "apply"); assert.ok(r.aborted && r.preflightCodes.includes("INVALID_HASH")); assert.equal(await shadowCount(db), 0); } finally { await db.close(); }
  });
  test("5. provenance incomplete(lib null) → no write", async () => {
    const { db, c } = await freshDb();
    try { const r = await runShadowWrite(c, cfg({ rendererLibraryVersion: null }), "apply"); assert.ok(r.aborted && r.preflightCodes.includes("PROVENANCE_INCOMPLETE")); assert.equal(await shadowCount(db), 0); } finally { await db.close(); }
  });
  test("6. dry-run → tx insert 후 rollback(0행)", async () => {
    const { db, c } = await freshDb();
    try { const r = await runShadowWrite(c, cfg(), "dry-run"); assert.equal(r.inserted, 4); assert.equal(r.committed, false); assert.equal(await shadowCount(db), 0, "rollback 후 0"); } finally { await db.close(); }
  });
  test("7. first apply → 4 insert", async () => {
    const { db, c } = await freshDb();
    try { const r = await runShadowWrite(c, cfg(), "apply"); assert.equal(r.inserted, 4); assert.equal(r.existing, 0); assert.equal(r.committed, true); assert.equal(await shadowCount(db), 4); } finally { await db.close(); }
  });
  test("8. second apply → 0 insert / 4 existing(idempotent)", async () => {
    const { db, c } = await freshDb();
    try { await runShadowWrite(c, cfg(), "apply"); const r = await runShadowWrite(c, cfg(), "apply"); assert.equal(r.inserted, 0); assert.equal(r.existing, 4); assert.equal(await shadowCount(db), 4); } finally { await db.close(); }
  });
  test("9·10. 다른 status(duplicate 등) 제외 → needs_review 4만", async () => {
    const { db, c } = await freshDb(4, { extraStatus: "duplicate" });
    try {
      const targets = await selectNeedsReviewTargets(c);
      assert.equal(targets.length, 4, "needs_review 만 선택(duplicate 제외)");
      const r = await runShadowWrite(c, cfg(), "apply");
      assert.equal(r.inserted, 4); assert.equal(await shadowCount(db), 4);
    } finally { await db.close(); }
  });
  test("11. raw source id DB 미저장(source_record_ref=HMAC)", async () => {
    const { db, c } = await freshDb();
    try {
      const ids = (await c.query(`SELECT id FROM report_matches`)).rows.map((r: any) => r.id);
      await runShadowWrite(c, cfg(), "apply");
      const refs = (await c.query(`SELECT source_record_ref FROM job_shadow_previews`)).rows.map((r: any) => r.source_record_ref);
      for (const ref of refs) { assert.match(ref, /^[0-9a-f]{64}$/); assert.ok(!ids.includes(ref)); }
      const dump = JSON.stringify((await c.query(`SELECT * FROM job_shadow_previews`)).rows);
      for (const id of ids) assert.ok(!dump.includes(id), "raw report id 미저장");
    } finally { await db.close(); }
  });
  test("12. observation hash unique(4 distinct)·prospective distinct", async () => {
    const { db, c } = await freshDb();
    try {
      await runShadowWrite(c, cfg(), "apply");
      assert.equal((await c.query(`SELECT count(DISTINCT observation_hash)::int n FROM job_shadow_previews`)).rows[0].n, 4);
      assert.equal((await c.query(`SELECT count(DISTINCT prospective_idempotency_key)::int n FROM job_shadow_previews`)).rows[0].n, 4);
    } finally { await db.close(); }
  });
  test("13. jobs/job_executions 0행 유지", async () => {
    const { db, c } = await freshDb();
    try { await runShadowWrite(c, cfg(), "apply"); assert.equal((await c.query(`SELECT (SELECT count(*) FROM jobs)+(SELECT count(*) FROM job_executions) n`)).rows[0].n, 0); } finally { await db.close(); }
  });
  test("14. post-write 집계: needs_review·provenance·validation·kind·keyVersion 전부 4", async () => {
    const { db, c } = await freshDb();
    try {
      await runShadowWrite(c, cfg(), "apply");
      const row = (await c.query(`SELECT
        count(*) FILTER (WHERE source_status='needs_review')::int a,
        count(*) FILTER (WHERE provenance_complete)::int b,
        count(*) FILTER (WHERE validation_status='valid')::int cc,
        count(*) FILTER (WHERE observation_kind='needs-review')::int d,
        count(*) FILTER (WHERE source_ref_key_version='v1')::int e,
        count(*) FILTER (WHERE historical_execution_version_known=false)::int f,
        count(*) FILTER (WHERE validation_error_codes='[]')::int g FROM job_shadow_previews`)).rows[0];
      for (const k of ["a", "b", "cc", "d", "e", "f", "g"]) assert.equal(row[k], 4, k);
    } finally { await db.close(); }
  });
  test("15. transaction failure(제약 위반) → 전체 rollback", async () => {
    const { db, c } = await freshDb();
    try {
      const { observations } = buildTargetObservations(await selectNeedsReviewTargets(c), cfg());
      const bad = observations.map((o, i) => (i === 3 ? { ...o, observationHash: "BAD" } : o)); // 마지막 CHECK 위반
      await c.exec!("BEGIN");
      let threw = false;
      try { for (const o of bad) await c.query(`INSERT INTO job_shadow_previews(preview_schema_version,source_domain,source_record_ref,source_ref_key_version,observation_kind,job_type,owner_scope,prospective_idempotency_key,payload_hash,execution_options_hash,request_version_snapshot,observed_pipeline_hash,source_status,validation_status,provenance_complete,observation_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16)`, [o.previewSchemaVersion,o.sourceDomain,o.sourceRecordRef,o.sourceRefKeyVersion,o.observationKind,o.jobType,o.ownerScope,o.prospectiveIdempotencyKey,o.payloadHash,o.executionOptionsHash,JSON.stringify(o.requestVersionSnapshot),o.observedPipelineHash,o.sourceStatus,o.validationStatus,o.provenanceComplete,o.observationHash]); }
      catch { threw = true; await c.exec!("ROLLBACK"); }
      assert.ok(threw); assert.equal(await shadowCount(db), 0, "부분 insert 잔존 0");
    } finally { await db.close(); }
  });
  test("16. writer/CLI 안전성: DML allowlist·미배선·key/id 미로그", () => {
    const src = readFileSync(path.join(here, "..", "..", "scripts", "writeInternalReportShadowObservations.ts"), "utf8");
    const code = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const kw of [/\bDELETE\s+FROM\b/i, /\bUPDATE\s+\w/i, /\bDROP\b/i, /\bALTER\b/i, /\bCREATE\s+TABLE\b/i, /\bTRUNCATE\b/i]) assert.ok(!kw.test(code), `${kw} 없음`);
    assert.ok(/EXPECTED_DATABASE_HOST_HASH/.test(code) && /CONFIRM_SHADOW_WRITE/.test(code) && /EXPECTED_SOURCE_COUNT/.test(code), "가드");
    assert.ok(!/console\.log\([^)]*JOB_SHADOW_REF_HMAC_KEY[^)]*\)/.test(code), "key 미로그");
    // shadowWriter/CLI 가 reportSync/route 에서 import 되지 않음
    const rs = readFileSync(path.join(here, "..", "..", "server", "knop", "reportSync.ts"), "utf8");
    assert.ok(!/shadowWriter|writeInternalReportShadow/.test(rs), "reportSync 미배선");
  });
});
