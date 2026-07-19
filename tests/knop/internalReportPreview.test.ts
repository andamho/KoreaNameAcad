// internal-report shadow preview 검증 — identity 결정성·민감정보 방지·순수성(운영 DB 미접촉).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildInternalReportQueuePreview, type InternalReportPreviewInput } from "../../server/jobQueue/previews/internalReportPreview";
import { sha256Hex } from "../../server/jobQueue/idempotency";

const H = (s: string) => sha256Hex(s);
function base(over: Partial<InternalReportPreviewInput> = {}): InternalReportPreviewInput {
  return {
    projectId: null,
    reportContentHash: H("report-content-1"),
    pipelineVersion: "report-pipeline-v1",
    executionOptions: { reportType: "family", templateVersion: "tpl-v1", rendererVersion: "render-v1", outputFormat: "png", outputMode: "attach", dpi: 288 },
    ...over,
  };
}
const key = (i: InternalReportPreviewInput) => buildInternalReportQueuePreview(i).idempotencyKey;

describe("internal-report shadow preview", () => {
  test("1. 동일 입력 → 같은 idempotencyKey/payloadHash/execOptionsHash", () => {
    const a = buildInternalReportQueuePreview(base());
    const b = buildInternalReportQueuePreview(base());
    assert.equal(a.valid, true); assert.equal(a.wouldCreate, true);
    assert.equal(a.idempotencyKey, b.idempotencyKey);
    assert.equal(a.payloadHash, b.payloadHash);
    assert.equal(a.executionOptionsHash, b.executionOptionsHash);
    assert.equal(a.existingJobId, null); // stage A DB 미조회
    assert.equal(a.ownerScope, "korea-name-acad");
    assert.equal(a.jobType, "internal-report");
  });

  test("2. executionOptions 키 순서 변경 → 동일 hash", () => {
    const reordered = base({ executionOptions: { dpi: 288, outputMode: "attach", rendererVersion: "render-v1", templateVersion: "tpl-v1", reportType: "family", outputFormat: "png" } as any });
    assert.equal(key(reordered), key(base()));
  });

  test("3. source(content) hash 변경 → 다른 key", () => {
    assert.notEqual(key(base({ reportContentHash: H("other-content") })), key(base()));
  });

  test("4. projectId 변경 → 다른 key", () => {
    assert.notEqual(key(base({ projectId: "proj-1" })), key(base()));
  });

  test("5. templateVersion 변경 → 다른 key", () => {
    assert.notEqual(key(base({ executionOptions: { ...base().executionOptions, templateVersion: "tpl-v2" } })), key(base()));
  });

  test("6. rendererVersion 변경 → 다른 key", () => {
    assert.notEqual(key(base({ executionOptions: { ...base().executionOptions, rendererVersion: "render-v2" } })), key(base()));
  });

  test("7. reportType 변경 → 다른 key", () => {
    assert.notEqual(key(base({ executionOptions: { ...base().executionOptions, reportType: "individual" } })), key(base()));
  });

  test("8. 비-identity 필드(projectIdRationale) 변경 → key 불변", () => {
    assert.equal(key(base({ projectIdRationale: "none" })), key(base({ projectIdRationale: "projects-row" as any })));
  });

  test("9. 보고서 원문(전화번호 값) 입력 → SENSITIVE_FIELD_PRESENT 거부", () => {
    const r = buildInternalReportQueuePreview({ ...base(), reportBody: "홍길동 님 전화 010-1234-5678" } as any);
    assert.equal(r.valid, false); assert.equal(r.wouldCreate, false);
    assert.ok(r.validationErrors.some((e) => e.code === "SENSITIVE_FIELD_PRESENT"));
    assert.equal(r.idempotencyKey, null);
  });

  test("10. 고객 식별 필드(extractedName) 입력 → 거부", () => {
    const r = buildInternalReportQueuePreview({ ...base(), extractedName: "홍길동" } as any);
    assert.equal(r.valid, false);
    assert.ok(r.validationErrors.some((e) => e.code === "SENSITIVE_FIELD_PRESENT" && /extractedName/i.test(e.field)));
  });

  test("11. 필수 hash 누락/형식오류 → MISSING_SOURCE_HASH·wouldCreate false", () => {
    const r = buildInternalReportQueuePreview(base({ reportContentHash: "not-a-hash" }));
    assert.equal(r.wouldCreate, false);
    assert.ok(r.validationErrors.some((e) => e.code === "MISSING_SOURCE_HASH"));
  });

  test("12. dictionary/normalization/correction 미사용 → snapshot null 유지", () => {
    const s = buildInternalReportQueuePreview(base()).requestVersionSnapshot!;
    assert.equal(s.dictionaryVersion, null);
    assert.equal(s.normalizationVersion, null);
    assert.equal(s.correctionEngineVersion, null);
    assert.equal(s.correctionEngineHash, null);
    assert.equal(s.transcriptionEngineHash, null);
    assert.equal(s.pipelineVersion, "report-pipeline-v1");
  });

  test("13·14·15. 순수 함수: DB client 없음·부작용 없음·artifact 없음", () => {
    // 인자는 입력 하나뿐(db/store 미주입). 반환은 순수 객체(함수 없음).
    assert.equal(buildInternalReportQueuePreview.length, 1);
    const r = buildInternalReportQueuePreview(base());
    assert.equal(typeof r, "object");
    assert.ok(!Object.values(r).some((v) => typeof v === "function"));
  });

  test("16. 출력에 민감정보 없음(값·전화·경로·URI 패턴 부재)", () => {
    const r = buildInternalReportQueuePreview(base({ projectId: "proj-1" }));
    const dump = JSON.stringify(r);
    assert.ok(!/\d{2,3}-\d{3,4}-\d{4}/.test(dump), "전화 없음");
    assert.ok(!/[a-zA-Z]:\\/.test(dump), "윈도우 경로 없음");
    assert.ok(!/[a-z]+:\/\//i.test(dump), "URI 없음");
    assert.equal(r.identitySummary.sourceHashPrefix!.length, 12, "hash prefix 만(전체 아님)");
    assert.notEqual(r.identitySummary.sourceHashPrefix, r.requestVersionSnapshot ? undefined : null);
  });

  test("17. sentinel: frozen 입력 비변형(순수)", () => {
    const input = base({ projectId: "proj-1" });
    Object.freeze(input); Object.freeze(input.executionOptions);
    const r = buildInternalReportQueuePreview(input); // 입력 변형하면 frozen 에서 throw
    assert.equal(r.valid, true);
    assert.equal(input.projectId, "proj-1"); // 불변
  });

  test("18. validation 코드: 버전 누락·잘못된 reportType·projectId", () => {
    assert.ok(buildInternalReportQueuePreview(base({ pipelineVersion: null })).validationErrors.some((e) => e.code === "MISSING_PIPELINE_VERSION"));
    assert.ok(buildInternalReportQueuePreview(base({ executionOptions: { ...base().executionOptions, templateVersion: null } })).validationErrors.some((e) => e.code === "MISSING_TEMPLATE_VERSION"));
    assert.ok(buildInternalReportQueuePreview(base({ executionOptions: { ...base().executionOptions, rendererVersion: null } })).validationErrors.some((e) => e.code === "MISSING_RENDERER_VERSION"));
    assert.ok(buildInternalReportQueuePreview(base({ executionOptions: { ...base().executionOptions, reportType: "weird" as any } })).validationErrors.some((e) => e.code === "UNSUPPORTED_REPORT_TYPE"));
    assert.ok(buildInternalReportQueuePreview(base({ projectId: "" })).validationErrors.some((e) => e.code === "INVALID_PROJECT_ID"));
  });
});
