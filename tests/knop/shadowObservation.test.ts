// shadow observation + 0003 migration 격리 검증 (PGlite, 운영 DB 미접촉). claim 불가·FK 0·dedup·승격 계약.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildShadowObservation, computeObservationHash, type ShadowObservationInput } from "../../server/jobQueue/previews/shadowObservation";
import { checkShadowPromotion } from "../../server/jobQueue/previews/promotion";
import { buildInternalReportQueuePreview, type InternalReportPreviewInput } from "../../server/jobQueue/previews/internalReportPreview";
import { claimNextJob, computeIdempotencyKey, sha256Hex, type QueueClient } from "../../server/jobQueue/index";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIG02 = readFileSync(path.join(here, "..", "..", "migrations", "0002_create_persistent_job_queue.sql"), "utf-8");
const MIG03 = readFileSync(path.join(here, "..", "..", "migrations", "0003_create_job_shadow_previews.sql"), "utf-8");
const H = (s: string) => sha256Hex(s);

function preview(over: Partial<InternalReportPreviewInput> = {}) {
  return buildInternalReportQueuePreview({ projectId: null, sourceAssetHash: H("rc-1"), reportType: "family", pipelineVersion: "internal-report-pipeline-v1", rendererVersion: "report-renderer-v1", templateVersion: null, executionOptions: { outputFormat: "png", outputMode: "attach", dpi: 288 }, ...over });
}
function obsInput(over: Partial<ShadowObservationInput> = {}): ShadowObservationInput {
  return {
    sourceDomain: "internal-report", sourceRecordRef: H("hmac-ref-1"), sourceRefKeyVersion: "v1", observationKind: "needs-review",
    preview: preview(), sourceStatus: "needs_review",
    provenance: { rendererLibrary: "pymupdf", rendererLibraryVersion: "1.28.0" },
    observedPipelineHash: H("pipe"), observedAt: "2026-07-19T00:00:00.000Z", ...over,
  };
}
async function freshQ(): Promise<{ db: any; c: QueueClient }> {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite(); await db.exec(MIG02); await db.exec(MIG03);
  return { db, c: { query: (sql, params) => db.query(sql, params as any[]) as any } };
}
async function insertObs(db: any, o: any) {
  await db.query(
    `INSERT INTO job_shadow_previews (preview_schema_version, source_domain, source_record_ref, source_ref_key_version, observation_kind,
      job_type, owner_scope, project_id, prospective_idempotency_key, payload_hash, execution_options_hash, request_version_snapshot,
      observed_pipeline_hash, renderer_library_version, source_status, validation_status, validation_error_codes, provenance_complete, observed_at, observation_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
    [o.previewSchemaVersion, o.sourceDomain, o.sourceRecordRef, o.sourceRefKeyVersion, o.observationKind, o.jobType, o.ownerScope, o.projectId,
     o.prospectiveIdempotencyKey, o.payloadHash, o.executionOptionsHash, JSON.stringify(o.requestVersionSnapshot), o.observedPipelineHash,
     o.rendererLibraryVersion, o.sourceStatus, o.validationStatus, JSON.stringify(o.validationErrorCodes), o.provenanceComplete, o.observedAt, o.observationHash],
  );
}

describe("shadow observation + 0003 migration", () => {
  test("1. 0003 구조: job_shadow_previews 존재·FK 0·claim index 없음", async () => {
    const { db, c } = await freshQ();
    try {
      assert.equal((await c.query(`SELECT to_regclass('public.job_shadow_previews') x`)).rows[0].x != null, true);
      const fk = (await c.query(`SELECT count(*)::int n FROM pg_constraint WHERE contype='f' AND conrelid='job_shadow_previews'::regclass`)).rows[0].n;
      assert.equal(fk, 0, "FK 없음(worker queue 물리 분리)");
      const idx = (await c.query(`SELECT indexname FROM pg_indexes WHERE tablename='job_shadow_previews'`)).rows.map((r: any) => r.indexname);
      assert.ok(!idx.some((n: string) => /queued|claim|lease/.test(n)), "claim/lease index 없음");
    } finally { await db.close(); }
  });

  test("2. shadow 행은 jobs claim 대상 아님·jobs 0행", async () => {
    const { db, c } = await freshQ();
    try {
      await insertObs(db, buildShadowObservation(obsInput()));
      assert.equal(await claimNextJob(c, "w1"), null);
      assert.equal((await c.query(`SELECT count(*)::int n FROM jobs`)).rows[0].n, 0);
      assert.equal((await c.query(`SELECT count(*)::int n FROM job_executions`)).rows[0].n, 0);
      assert.equal((await c.query(`SELECT count(*)::int n FROM job_shadow_previews`)).rows[0].n, 1);
    } finally { await db.close(); }
  });

  test("3. 같은 observation 중복 차단(UNIQUE observation_hash)", async () => {
    const { db } = await freshQ();
    try {
      const o = buildShadowObservation(obsInput());
      await insertObs(db, o);
      let dup = false; try { await insertObs(db, o); } catch { dup = true; }
      assert.ok(dup);
    } finally { await db.close(); }
  });

  test("4. observation_hash 재계약: pipeline/status/provenance/kind/keyVersion 변경 → 새 hash", () => {
    const b = buildShadowObservation(obsInput()).observationHash;
    assert.notEqual(buildShadowObservation(obsInput({ observedPipelineHash: H("pipe2") })).observationHash, b);
    assert.notEqual(buildShadowObservation(obsInput({ sourceStatus: "duplicate" })).observationHash, b);
    assert.notEqual(buildShadowObservation(obsInput({ observationKind: "baseline" })).observationHash, b);
    assert.notEqual(buildShadowObservation(obsInput({ sourceRefKeyVersion: "v2" })).observationHash, b);
    assert.notEqual(buildShadowObservation(obsInput({ provenance: { rendererLibrary: "pymupdf", rendererLibraryVersion: null } })).observationHash, b);
    // observedAt 은 hash 에 미포함
    assert.equal(buildShadowObservation(obsInput({ observedAt: "2020-01-01T00:00:00.000Z" })).observationHash, b);
  });

  test("5. hex CHECK: 잘못된 hash INSERT 거부", async () => {
    const { db } = await freshQ();
    try {
      const o: any = { ...buildShadowObservation(obsInput()), observationHash: "not-hex" };
      let rej = false; try { await insertObs(db, o); } catch { rej = true; }
      assert.ok(rej, "observation_hash 형식 CHECK");
    } finally { await db.close(); }
  });

  test("6. provenanceComplete: lib version 1.28.0+pipeline → true, null → false", () => {
    assert.equal(buildShadowObservation(obsInput()).provenanceComplete, true);
    assert.equal(buildShadowObservation(obsInput({ provenance: { rendererLibrary: "pymupdf", rendererLibraryVersion: null } })).provenanceComplete, false);
  });

  test("7. historicalExecutionVersionKnown=false·민감컬럼 없음(0003)", () => {
    assert.equal(buildShadowObservation(obsInput()).historicalExecutionVersionKnown, false);
    const ddl = MIG03.replace(/--[^\n]*/g, ""); // 주석 제거(주석의 URI 언급 오탐 방지) → 컬럼 정의만 검사
    for (const bad of ["extracted_name", "file_name", "file_path", "rendered_url", "\\buri\\b", "customer", "phone"]) {
      assert.ok(!new RegExp(bad, "i").test(ddl), `0003 컬럼에 ${bad} 없음`);
    }
  });

  test("8. 승격: provenance incomplete → 거부", () => {
    const o = buildShadowObservation(obsInput({ provenance: { rendererLibrary: "pymupdf", rendererLibraryVersion: null } }));
    const r = checkShadowPromotion(o, o.prospectiveIdempotencyKey, { sourceStatusEligible: true });
    assert.ok(!r.eligible && r.reasons.includes("PROVENANCE_INCOMPLETE"));
  });

  test("9. 승격: createJob key 재계산 일치 + 조건 통과 → 적격", () => {
    const pv = preview();
    const o = buildShadowObservation(obsInput({ preview: pv }));
    const recomputed = computeIdempotencyKey({ ownerScope: "korea-name-acad", projectId: null, jobType: "internal-report", inputAssetHash: H("rc-1"), pipelineVersion: "internal-report-pipeline-v1", transcriptionEngineHash: null, transcriptionEngineVersion: null, dictionaryVersion: null, normalizationVersion: null, correctionEngineHash: null, executionOptionsHash: pv.executionOptionsHash! });
    assert.equal(recomputed, o.prospectiveIdempotencyKey);
    assert.equal(checkShadowPromotion(o, recomputed, { sourceStatusEligible: true }).eligible, true);
    assert.ok(!checkShadowPromotion(o, H("wrong"), { sourceStatusEligible: true }).eligible);
    assert.ok(!checkShadowPromotion(o, recomputed, { sourceStatusEligible: false }).eligible);
  });

  test("10. observation_kind: 정책 대상 구분(baseline/needs-review/new-ingest/version-change)", () => {
    for (const k of ["baseline", "needs-review", "new-ingest", "version-change"] as const) {
      assert.equal(buildShadowObservation(obsInput({ observationKind: k })).observationKind, k);
    }
  });
});
