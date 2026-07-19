// read-only shadow 모니터 집계·drift 검증(순수, DB 미접촉).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { compareShadowObservations, type StoredObservationRow } from "../../server/jobQueue/previews/shadowMonitor";
import { buildShadowObservation, type ShadowObservation } from "../../server/jobQueue/previews/shadowObservation";
import { buildInternalReportQueuePreview } from "../../server/jobQueue/previews/internalReportPreview";
import { sha256Hex } from "../../server/jobQueue/idempotency";

const here = path.dirname(fileURLToPath(import.meta.url));
const H = (s: string) => sha256Hex(s);
function obs(i: number, over: any = {}): ShadowObservation {
  const preview = buildInternalReportQueuePreview({ projectId: null, sourceAssetHash: H("rc-" + i), reportType: i % 2 ? "individual" : "family", pipelineVersion: "internal-report-pipeline-v1", rendererVersion: "report-renderer-v1", templateVersion: null, executionOptions: { outputFormat: "png", outputMode: "attach", dpi: 288 } });
  return buildShadowObservation({ sourceDomain: "report_matches", sourceRecordRef: H("ref-" + i), sourceRefKeyVersion: "v1", observationKind: "needs-review", preview, sourceStatus: "needs_review", provenance: { rendererLibrary: "pymupdf", rendererLibraryVersion: "1.28.0" }, observedPipelineHash: H("pipe"), observedAt: "2026-07-19T00:00:00.000Z", ...over });
}
const storedFrom = (o: ShadowObservation, over: Partial<StoredObservationRow> = {}): StoredObservationRow => ({
  source_record_ref: o.sourceRecordRef, source_ref_key_version: o.sourceRefKeyVersion, observation_hash: o.observationHash,
  prospective_idempotency_key: o.prospectiveIdempotencyKey!, observed_pipeline_hash: o.observedPipelineHash!,
  source_status: o.sourceStatus, validation_status: o.validationStatus, provenance_complete: o.provenanceComplete,
  renderer_library_version: o.rendererLibraryVersion, ...over,
});

describe("shadow monitor(read-only)", () => {
  test("baseline: 4 fresh·4 stored 일치 → alreadyObserved 4, unobserved 0, drift 0, write false", () => {
    const fresh = [0, 1, 2, 3].map((i) => obs(i));
    const stored = fresh.map((o) => storedFrom(o));
    const a = compareShadowObservations({ selected: 4, fresh, invalidCodes: [], stored, duplicateExcluded: 110 });
    assert.equal(a.selected, 4); assert.equal(a.alreadyObserved, 4); assert.equal(a.unobservedEligible, 0);
    assert.equal(a.drift, 0); assert.equal(a.invalid, 0); assert.equal(a.write, false); assert.equal(a.duplicateExcluded, 110);
  });

  test("신규 candidate: 5 fresh·4 stored → unobservedEligible 1", () => {
    const fresh = [0, 1, 2, 3, 4].map((i) => obs(i));
    const stored = fresh.slice(0, 4).map((o) => storedFrom(o));
    const a = compareShadowObservations({ selected: 5, fresh, invalidCodes: [], stored, duplicateExcluded: 110 });
    assert.equal(a.unobservedEligible, 1); assert.equal(a.alreadyObserved, 4); assert.equal(a.write, false);
  });

  test("drift: 같은 ref·다른 hash(sourceStatus 변경) → drift 1·driftFields sourceStatus", () => {
    const fresh = [obs(0)];
    const stored = [storedFrom(fresh[0], { observation_hash: H("different"), source_status: "auto_matched" })];
    const a = compareShadowObservations({ selected: 1, fresh, invalidCodes: [], stored, duplicateExcluded: 0 });
    assert.equal(a.drift, 1); assert.ok(a.driftFields.includes("sourceStatus")); assert.equal(a.alreadyObserved, 0);
  });

  test("drift: rendererLibraryVersion 변경 감지", () => {
    const fresh = [obs(0)];
    const stored = [storedFrom(fresh[0], { observation_hash: H("diff2"), renderer_library_version: "1.27.0" })];
    const a = compareShadowObservations({ selected: 1, fresh, invalidCodes: [], stored, duplicateExcluded: 0 });
    assert.ok(a.drift === 1 && a.driftFields.includes("rendererLibraryVersion"));
  });

  test("observedAt 차이는 drift 아님(observation_hash 불변)", () => {
    const fresh = [obs(0, { observedAt: "2020-01-01T00:00:00.000Z" })];
    const stored = [storedFrom(obs(0))]; // 다른 observedAt 로 만들어도 hash 동일
    const a = compareShadowObservations({ selected: 1, fresh, invalidCodes: [], stored, duplicateExcluded: 0 });
    assert.equal(a.drift, 0); assert.equal(a.alreadyObserved, 1);
  });

  test("invalid: selected > eligible → invalid 계수·코드", () => {
    const fresh = [obs(0), obs(1)];
    const a = compareShadowObservations({ selected: 4, fresh, invalidCodes: ["INVALID_HASH", "ARTIFACT_MISSING"], stored: [], duplicateExcluded: 0 });
    assert.equal(a.invalid, 2); assert.ok(a.invalidCodes.includes("INVALID_HASH")); assert.equal(a.unobservedEligible, 2);
  });

  test("모니터 CLI 안전성: read-only·DML 없음·미배선·key 미로그", () => {
    const src = readFileSync(path.join(here, "..", "..", "scripts", "monitorInternalReportShadow.ts"), "utf8");
    const code = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const kw of [/\bINSERT\s+INTO\b/i, /\bUPDATE\s+\w/i, /\bDELETE\s+FROM\b/i, /\bDROP\b/i, /\bALTER\b/i, /\bTRUNCATE\b/i]) assert.ok(!kw.test(code), `${kw} 없음`);
    assert.ok(/BEGIN TRANSACTION READ ONLY/.test(code), "READ ONLY");
    assert.ok(!/console\.log\([^)]*JOB_SHADOW_REF_HMAC_KEY[^)]*\)/.test(code) && !/console\.log\([^)]*connectionString/.test(code), "key/URL 미로그");
    const rs = readFileSync(path.join(here, "..", "..", "server", "knop", "reportSync.ts"), "utf8");
    assert.ok(!/shadowMonitor|monitorInternalReportShadow/.test(rs), "reportSync 미배선");
  });
});
