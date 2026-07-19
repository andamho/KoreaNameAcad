// internal-report shadow preview — allowlist·version provenance·identity 결정성·민감정보 방지·순수성.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildInternalReportQueuePreview, type InternalReportPreviewInput } from "../../server/jobQueue/previews/internalReportPreview";
import { sha256Hex } from "../../server/jobQueue/idempotency";

const H = (s: string) => sha256Hex(s);
function base(over: Partial<InternalReportPreviewInput> = {}): InternalReportPreviewInput {
  return {
    projectId: null, sourceAssetHash: H("report-content-1"), reportType: "family",
    pipelineVersion: "internal-report-pipeline-v1", rendererVersion: "report-renderer-v1", templateVersion: null,
    executionOptions: { outputFormat: "png", outputMode: "attach", dpi: 288 }, ...over,
  };
}
const key = (i: InternalReportPreviewInput) => buildInternalReportQueuePreview(i).idempotencyKey;

describe("internal-report shadow preview (provenance+allowlist)", () => {
  test("1. 동일 입력 → 같은 key/payload/execOptionsHash + eligibleForCreate·databaseLookupPerformed", () => {
    const a = buildInternalReportQueuePreview(base()), b = buildInternalReportQueuePreview(base());
    assert.equal(a.valid, true); assert.equal(a.eligibleForCreate, true);
    assert.equal(a.databaseLookupPerformed, false);
    assert.equal((a as any).existingJobId, undefined, "existingJobId 제거됨");
    assert.equal(a.idempotencyKey, b.idempotencyKey); assert.equal(a.payloadHash, b.payloadHash);
    assert.equal(a.ownerScope, "korea-name-acad"); assert.equal(a.jobType, "internal-report");
  });
  test("2. executionOptions 키 순서 무관 → 동일", () => {
    assert.equal(key(base({ executionOptions: { dpi: 288, outputMode: "attach", outputFormat: "png" } })), key(base()));
  });
  test("3. sourceAssetHash 변경 → 다른 key", () => assert.notEqual(key(base({ sourceAssetHash: H("x") })), key(base())));
  test("4. projectId 변경 → 다른 key", () => assert.notEqual(key(base({ projectId: "p1" })), key(base())));
  test("5. reportType 변경 → 다른 key", () => assert.notEqual(key(base({ reportType: "individual" })), key(base())));
  test("6. templateVersion 변경(null→값) → 다른 key", () => assert.notEqual(key(base({ templateVersion: "tpl-v1" })), key(base())));
  test("7. rendererVersion 변경 → 다른 key", () => assert.notEqual(key(base({ rendererVersion: "r2" })), key(base())));
  test("8. rendererHash(manifest) 변경 → 다른 key (label/hash 분리)", () => {
    assert.notEqual(key(base({ rendererHash: H("m1") })), key(base({ rendererHash: H("m2") })));
    assert.notEqual(key(base({ rendererHash: H("m1") })), key(base())); // hash 유무도 identity 영향
  });
  test("9. 비-identity 필드(existingDomainStatus) 변경 → key 불변", () => {
    assert.equal(key(base({ existingDomainStatus: "duplicate" })), key(base({ existingDomainStatus: "needs_review" })));
  });
  test("10. 예상 밖 top-level 필드 → UNEXPECTED_INPUT_FIELD 거부", () => {
    const r = buildInternalReportQueuePreview({ ...base(), foo: 1 } as any);
    assert.equal(r.valid, false); assert.equal(r.eligibleForCreate, false);
    assert.ok(r.validationErrors.some((e) => e.code === "UNEXPECTED_INPUT_FIELD" && e.field === "foo"));
    assert.equal(r.idempotencyKey, null);
  });
  test("11. 예상 밖 executionOption → UNEXPECTED_EXECUTION_OPTION 거부", () => {
    const r = buildInternalReportQueuePreview(base({ executionOptions: { outputFormat: "png", weird: 1 } as any }));
    assert.ok(r.validationErrors.some((e) => e.code === "UNEXPECTED_EXECUTION_OPTION" && /weird/.test(e.field)));
  });
  test("12. 민감 이름(customerName/phone/filePath/uri) 즉시 거부(값 미열람)", () => {
    for (const f of ["customerName", "phone", "filePath", "uri"]) {
      const r = buildInternalReportQueuePreview({ ...base(), [f]: "whatever" } as any);
      assert.ok(r.validationErrors.some((e) => e.code === "SENSITIVE_FIELD_PRESENT" && e.field.toLowerCase().includes(f.toLowerCase())), `${f} 거부`);
    }
  });
  test("13. 값 2차검문: 허용 필드에 전화/URI 값 → SENSITIVE", () => {
    assert.ok(buildInternalReportQueuePreview(base({ rendererVersion: "r 010-1234-5678" })).validationErrors.some((e) => e.code === "SENSITIVE_FIELD_PRESENT"));
    assert.ok(buildInternalReportQueuePreview(base({ pipelineVersion: "https://x/y" })).validationErrors.some((e) => e.code === "SENSITIVE_FIELD_PRESENT"));
  });
  test("14. reportContentHash 중복 금지 → REPORT_CONTENT_HASH_UNSUPPORTED", () => {
    const r = buildInternalReportQueuePreview({ ...base(), reportContentHash: H("dup") as any });
    assert.ok(r.validationErrors.some((e) => e.code === "REPORT_CONTENT_HASH_UNSUPPORTED"));
  });
  test("15. sourceAssetHash 누락/형식 → MISSING_SOURCE_HASH·eligibleForCreate false", () => {
    const r = buildInternalReportQueuePreview(base({ sourceAssetHash: "nope" }));
    assert.equal(r.eligibleForCreate, false);
    assert.ok(r.validationErrors.some((e) => e.code === "MISSING_SOURCE_HASH"));
  });
  test("16. template 미사용(templateVersion null) → valid 허용(가짜 버전 강요 안 함)", () => {
    const r = buildInternalReportQueuePreview(base({ templateVersion: null }));
    assert.equal(r.valid, true);
    assert.equal(r.requestVersionSnapshot!.projectSpecific!.templateVersion as any, null);
  });
  test("17. manifest hash 형식오류 → INVALID_MANIFEST_HASH", () => {
    assert.ok(buildInternalReportQueuePreview(base({ rendererHash: "xyz" })).validationErrors.some((e) => e.code === "INVALID_MANIFEST_HASH"));
  });
  test("18. dictionary/normalization/correction snapshot null + projectSpecific 제공", () => {
    const s = buildInternalReportQueuePreview(base({ rendererHash: H("m"), pipelineHash: H("p") })).requestVersionSnapshot!;
    assert.equal(s.dictionaryVersion, null); assert.equal(s.normalizationVersion, null);
    assert.equal(s.correctionEngineVersion, null); assert.equal(s.correctionEngineHash, null);
    assert.equal(s.pipelineVersion, "internal-report-pipeline-v1");
    assert.equal((s.projectSpecific as any).rendererHash, H("m"));
    assert.equal((s.projectSpecific as any).pipelineHash, H("p"));
  });
  test("19. 순수성: 1 인자·부작용 없음·frozen 입력 비변형", () => {
    assert.equal(buildInternalReportQueuePreview.length, 1);
    const input = base({ projectId: "p1" }); Object.freeze(input); Object.freeze(input.executionOptions);
    const r = buildInternalReportQueuePreview(input);
    assert.equal(r.valid, true); assert.equal(input.projectId, "p1");
    assert.ok(!Object.values(r).some((v) => typeof v === "function"));
  });
  test("20. 출력 민감정보 없음(hash prefix 12·전화/경로/URI 패턴 부재)", () => {
    const dump = JSON.stringify(buildInternalReportQueuePreview(base({ projectId: "p1" })));
    assert.ok(!/\d{2,3}-\d{3,4}-\d{4}/.test(dump) && !/[a-zA-Z]:\\/.test(dump) && !/[a-z]+:\/\//i.test(dump));
    assert.equal(buildInternalReportQueuePreview(base()).identitySummary.sourceHashPrefix!.length, 12);
  });
  test("21. validation 코드: pipeline/renderer 누락·reportType·projectId", () => {
    assert.ok(buildInternalReportQueuePreview(base({ pipelineVersion: null })).validationErrors.some((e) => e.code === "MISSING_PIPELINE_VERSION"));
    assert.ok(buildInternalReportQueuePreview(base({ rendererVersion: null })).validationErrors.some((e) => e.code === "MISSING_RENDERER_VERSION"));
    assert.ok(buildInternalReportQueuePreview(base({ reportType: "weird" as any })).validationErrors.some((e) => e.code === "UNSUPPORTED_REPORT_TYPE"));
    assert.ok(buildInternalReportQueuePreview(base({ projectId: "" })).validationErrors.some((e) => e.code === "INVALID_PROJECT_ID"));
  });
});
