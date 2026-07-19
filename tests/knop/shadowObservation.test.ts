// shadow observation 격리 prototype 검증 (PGlite, 운영 DB 미접촉). worker claim 불가·승격 계약·민감정보 부재.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildShadowObservation, SHADOW_PROTOTYPE_DDL, type ShadowObservationInput } from "../../server/jobQueue/previews/shadowObservation";
import { checkShadowPromotion } from "../../server/jobQueue/previews/promotion";
import { buildInternalReportQueuePreview, type InternalReportPreviewInput } from "../../server/jobQueue/previews/internalReportPreview";
import { REPORT_MANIFEST_TARGETS, computeReportManifestHash } from "../../server/jobQueue/previews/reportManifest";
import { claimNextJob, computeIdempotencyKey, sha256Hex, type QueueClient } from "../../server/jobQueue/index";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIG = readFileSync(path.join(here, "..", "..", "migrations", "0002_create_persistent_job_queue.sql"), "utf-8");
const H = (s: string) => sha256Hex(s);

function previewInput(over: Partial<InternalReportPreviewInput> = {}): InternalReportPreviewInput {
  return { projectId: null, sourceAssetHash: H("rc-1"), reportType: "family", pipelineVersion: "internal-report-pipeline-v1", rendererVersion: "report-renderer-v1", templateVersion: null, executionOptions: { outputFormat: "png", outputMode: "attach", dpi: 288 }, ...over };
}
function obsInput(over: Partial<ShadowObservationInput> = {}): ShadowObservationInput {
  const preview = buildInternalReportQueuePreview(previewInput());
  return {
    sourceDomain: "internal-report", sourceRecordRef: H("report-matches-id-1"), // keyed HMAC/hash(raw id 아님)
    preview, sourceStatus: "needs_review",
    provenance: { rendererLibrary: "pymupdf", rendererLibraryVersion: "1.24.0" },
    observedPipelineHash: H("pipeline-manifest"), observedAt: "2026-07-19T00:00:00.000Z", ...over,
  };
}
async function freshQ(): Promise<{ db: any; c: QueueClient }> {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite(); await db.exec(MIG); await db.exec(SHADOW_PROTOTYPE_DDL);
  return { db, c: { query: (sql, params) => db.query(sql, params as any[]) as any } };
}
async function insertObs(db: any, o: any) {
  await db.query(
    `INSERT INTO job_shadow_previews (preview_schema_version, source_domain, source_record_ref, job_type, owner_scope, project_id,
      prospective_idempotency_key, payload_hash, execution_options_hash, request_version_snapshot, observed_pipeline_hash,
      source_status, validation_status, validation_error_codes, provenance_complete, observed_at, observation_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [o.previewSchemaVersion, o.sourceDomain, o.sourceRecordRef, o.jobType, o.ownerScope, o.projectId,
     o.prospectiveIdempotencyKey, o.payloadHash, o.executionOptionsHash, JSON.stringify(o.requestVersionSnapshot), o.observedPipelineHash,
     o.sourceStatus, o.validationStatus, JSON.stringify(o.validationErrorCodes), o.provenanceComplete, o.observedAt, o.observationHash],
  );
}

describe("shadow observation prototype", () => {
  test("1. shadow 행은 jobs claim 대상 아님(구조적)", async () => {
    const { db, c } = await freshQ();
    try {
      await insertObs(db, buildShadowObservation(obsInput()));
      assert.equal(await claimNextJob(c, "w1"), null, "claim 은 jobs 만 보므로 shadow 안 잡음");
      assert.equal((await c.query(`SELECT count(*)::int n FROM jobs`)).rows[0].n, 0, "jobs 0행");
      assert.equal((await c.query(`SELECT count(*)::int n FROM job_shadow_previews`)).rows[0].n, 1);
    } finally { await db.close(); }
  });

  test("2. shadow table 은 jobs/job_executions FK 없음", async () => {
    const { db, c } = await freshQ();
    try {
      const fks = (await c.query(`SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE contype='f' AND conrelid='job_shadow_previews'::regclass`)).rows;
      assert.equal(fks.length, 0, "FK 없음(queue 와 물리 분리)");
    } finally { await db.close(); }
  });

  test("3. 같은 observation 중복 차단(UNIQUE observation_hash)", async () => {
    const { db } = await freshQ();
    try {
      const o = buildShadowObservation(obsInput());
      await insertObs(db, o);
      let dup = false; try { await insertObs(db, o); } catch { dup = true; }
      assert.ok(dup, "같은 source+key+pipeline hash 중복 거부");
    } finally { await db.close(); }
  });

  test("4. pipeline hash 변경 → 새 observation(다른 observation_hash)", () => {
    const a = buildShadowObservation(obsInput({ observedPipelineHash: H("pipe-1") }));
    const b = buildShadowObservation(obsInput({ observedPipelineHash: H("pipe-2") }));
    assert.notEqual(a.observationHash, b.observationHash);
  });

  test("5·8. historical vs prospective: historicalExecutionVersionKnown=false·prospective key 의미", () => {
    const o = buildShadowObservation(obsInput({ sourceStatus: "duplicate" }));
    assert.equal(o.historicalExecutionVersionKnown, false, "과거 실행 버전 미확인");
    assert.ok(o.prospectiveIdempotencyKey, "prospective(현재 계약 변환) key");
  });

  test("6. provenance incomplete(lib version null) → provenanceComplete=false", () => {
    const o = buildShadowObservation(obsInput({ provenance: { rendererLibrary: "pymupdf", rendererLibraryVersion: null } }));
    assert.equal(o.provenanceComplete, false);
  });

  test("7. 민감 컬럼 없음(DDL·observation 필드에 원문/URI/경로 없음)", () => {
    for (const bad of ["extracted_name", "file_name", "file_path", "rendered_url", "uri", "customer", "phone"]) {
      assert.ok(!new RegExp(bad, "i").test(SHADOW_PROTOTYPE_DDL), `DDL 에 ${bad} 컬럼 없음`);
    }
    const o = buildShadowObservation(obsInput());
    const dump = JSON.stringify(o);
    assert.ok(!/[a-zA-Z]:\\/.test(dump) && !/[a-z]+:\/\//i.test(dump), "경로/URI 없음");
  });

  test("9. raw source id 보호: sourceRecordRef 는 hash/HMAC(원문 아님)", () => {
    const o = buildShadowObservation(obsInput({ sourceRecordRef: H("hmac-of-id") }));
    assert.match(o.sourceRecordRef, /^[0-9a-f]{64}$/, "안전한 hash 참조");
  });

  test("10. 승격: provenance incomplete → 불가", () => {
    const o = buildShadowObservation(obsInput({ provenance: { rendererLibrary: "pymupdf", rendererLibraryVersion: null } }));
    const r = checkShadowPromotion(o, o.prospectiveIdempotencyKey, { sourceStatusEligible: true });
    assert.equal(r.eligible, false);
    assert.ok(r.reasons.includes("PROVENANCE_INCOMPLETE"));
  });

  test("11. 승격: createJob key 재계산 일치 시 적격(provenance 완비·status 적격)", () => {
    const input = previewInput();
    const preview = buildInternalReportQueuePreview(input);
    const o = buildShadowObservation(obsInput({ preview }));
    // 승격 시점 재계산(원본 입력으로 runtime computeIdempotencyKey)
    const recomputed = computeIdempotencyKey({
      ownerScope: "korea-name-acad", projectId: null, jobType: "internal-report",
      inputAssetHash: input.sourceAssetHash, pipelineVersion: input.pipelineVersion,
      transcriptionEngineHash: null, transcriptionEngineVersion: null, dictionaryVersion: null, normalizationVersion: null,
      correctionEngineHash: null, executionOptionsHash: preview.executionOptionsHash!,
    });
    assert.equal(recomputed, o.prospectiveIdempotencyKey, "재계산 == prospective");
    assert.equal(checkShadowPromotion(o, recomputed, { sourceStatusEligible: true }).eligible, true);
  });

  test("12. 승격: key mismatch → KEY_RECOMPUTE_MISMATCH", () => {
    const o = buildShadowObservation(obsInput());
    const r = checkShadowPromotion(o, H("different-key"), { sourceStatusEligible: true });
    assert.ok(!r.eligible && r.reasons.includes("KEY_RECOMPUTE_MISMATCH"));
  });

  test("13. 승격: terminal historical status 부적격 → SOURCE_STATUS_NOT_ELIGIBLE", () => {
    const o = buildShadowObservation(obsInput({ sourceStatus: "duplicate" }));
    const r = checkShadowPromotion(o, o.prospectiveIdempotencyKey, { sourceStatusEligible: false });
    assert.ok(!r.eligible && r.reasons.includes("SOURCE_STATUS_NOT_ELIGIBLE"));
  });

  test("14. manifest: 대상에 route/UI 제외", () => {
    for (const t of REPORT_MANIFEST_TARGETS) assert.ok(!/routes|client\/|\.tsx|components/.test(t), `${t} 는 코드 provenance`);
    // 관련 파일 내용 변경 → hash 변경
    const e = [{ path: "server/knop/render_pdf.py", content: "a" }];
    assert.notEqual(computeReportManifestHash(e), computeReportManifestHash([{ path: "server/knop/render_pdf.py", content: "b" }]));
  });

  test("15. jobs/job_executions 0행 유지(shadow insert 는 별도 테이블)", async () => {
    const { db, c } = await freshQ();
    try {
      await insertObs(db, buildShadowObservation(obsInput()));
      await insertObs(db, buildShadowObservation(obsInput({ sourceRecordRef: H("id-2") })));
      assert.equal((await c.query(`SELECT count(*)::int n FROM jobs`)).rows[0].n, 0);
      assert.equal((await c.query(`SELECT count(*)::int n FROM job_executions`)).rows[0].n, 0);
      assert.equal((await c.query(`SELECT count(*)::int n FROM job_shadow_previews`)).rows[0].n, 2);
    } finally { await db.close(); }
  });

  test("16. worker/runtime 미배선: buildShadowObservation 은 순수(DB client 없음)", () => {
    assert.equal(buildShadowObservation.length, 1);
    assert.equal(checkShadowPromotion.length, 3);
  });
});
