// 운영 read-only preview 집계·중복분석·manifest·script 안전성(오프라인, 운영 DB 미접촉).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { aggregateInternalReportPreviews, type SafeReportRow, type PreviewVersionConfig } from "../../server/jobQueue/previews/reportPreviewAggregate";
import { computeReportManifestHash } from "../../server/jobQueue/previews/reportManifest";
import { sha256Hex } from "../../server/jobQueue/idempotency";

const here = path.dirname(fileURLToPath(import.meta.url));
const H = (s: string) => sha256Hex(s);
const CFG: PreviewVersionConfig = { pipelineVersion: "internal-report-pipeline-v1", rendererVersion: "report-renderer-v1", templateVersion: null, rendererHash: H("r"), pipelineHash: H("p"), executionOptions: { outputFormat: "png", outputMode: "attach", dpi: 288 } };

describe("report preview 집계·안전성", () => {
  test("집계: valid/invalid·reportType·status·eligibleForCreate", () => {
    const rows: SafeReportRow[] = [
      { fileHash: H("a"), reportType: "family", status: "duplicate" },
      { fileHash: H("b"), reportType: "individual", status: "needs_review" },
      { fileHash: "bad-hash", reportType: "family", status: "duplicate" }, // invalid source hash
    ];
    const agg = aggregateInternalReportPreviews(rows, CFG);
    assert.equal(agg.total, 3);
    assert.equal(agg.valid, 2); assert.equal(agg.invalid, 1);
    assert.equal(agg.eligibleForCreate, 2);
    assert.equal(agg.byReportType.family, 2); assert.equal(agg.byReportType.individual, 1);
    assert.equal(agg.byStatus.duplicate, 2);
    assert.equal(agg.byErrorCode.MISSING_SOURCE_HASH, 1);
    assert.equal(agg.projectIdNull, 3);
    assert.equal(agg.templateVersionNull, 3); // 모든 행 config template null(가짜 버전 강요 안 함)
    assert.equal(agg.sourceHashValid, 2); // bad-hash 1건 제외
  });

  test("중복 분석: 동일 file_hash·reportType → 같은 key 그룹, 다른 reportType 은 다른 key(결함 0)", () => {
    const rows: SafeReportRow[] = [
      { fileHash: H("same"), reportType: "family", status: "duplicate" },
      { fileHash: H("same"), reportType: "family", status: "duplicate" }, // 동일 → 같은 key(정상 중복)
      { fileHash: H("same"), reportType: "individual", status: "duplicate" }, // reportType 다름 → 다른 key
    ];
    const agg = aggregateInternalReportPreviews(rows, CFG);
    assert.equal(agg.duplicateGroups, 1, "동일 file_hash+reportType 1그룹");
    assert.equal(agg.duplicateRows, 2);
    assert.equal(agg.sameSourceDiffReportType, 0, "다른 reportType 은 같은 key 아님 = identity 정상");
  });

  test("집계 함수 순수: DB client 없음(SafeReportRow 만)", () => {
    assert.equal(aggregateInternalReportPreviews.length, 2);
  });

  test("manifest hash 결정성 + 파일 순서 무관 + params 반영", () => {
    const e1 = [{ path: "a.ts", content: "x" }, { path: "b.py", content: "y" }];
    const e2 = [{ path: "b.py", content: "y" }, { path: "a.ts", content: "x" }];
    assert.equal(computeReportManifestHash(e1), computeReportManifestHash(e2), "파일 순서 무관");
    assert.notEqual(computeReportManifestHash(e1, { renderDpiScale: 4 }), computeReportManifestHash(e1, { renderDpiScale: 2 }), "params 반영");
    assert.equal(computeReportManifestHash([{ path: "a", content: "l1\r\nl2" }]), computeReportManifestHash([{ path: "a", content: "l1\nl2" }]), "CRLF/LF 정규화");
  });

  test("운영 script 안전성: DML/DDL 없음·민감 컬럼 미SELECT·READ ONLY·URL 미로그", () => {
    const src = readFileSync(path.join(here, "..", "..", "scripts", "previewInternalReportQueue.ts"), "utf8");
    // 주석 제거 후 실행 SQL 검사
    const code = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const kw of [/\bINSERT\s+INTO\b/i, /\bUPDATE\s+\w/i, /\bDELETE\s+FROM\b/i, /\bDROP\b/i, /\bALTER\b/i, /\bCREATE\s+TABLE\b/i, /\bTRUNCATE\b/i]) {
      assert.ok(!kw.test(code), `실행 코드에 ${kw} 없음`);
    }
    assert.ok(/BEGIN TRANSACTION READ ONLY/.test(code), "READ ONLY tx");
    assert.ok(/READ_ONLY_PREVIEW/.test(code), "명시 플래그 게이트");
    for (const col of ["extracted_name", "matched_customer", "matched_consultation", "rendered_url", "file_name", "file_path"]) {
      assert.ok(!new RegExp(`SELECT[^;]*${col}`, "i").test(code), `민감 컬럼 ${col} 미SELECT`);
    }
    // 안전 3컬럼만
    assert.ok(/file_hash[\s\S]*report_type[\s\S]*status/.test(code), "안전 컬럼만 SELECT");
    assert.ok(!/console\.log\([^)]*connectionString/.test(code) && !/console\.log\([^)]*\bnew URL\b/.test(code), "URL 원문 미로그");
  });

  test("운영 script: jobs/job_executions 는 count SELECT 만(insert/update 없음)", () => {
    const src = readFileSync(path.join(here, "..", "..", "scripts", "previewInternalReportQueue.ts"), "utf8");
    assert.ok(/count\(\*\)::int n FROM jobs/.test(src) && /count\(\*\)::int n FROM job_executions/.test(src));
    assert.ok(!/INTO jobs|UPDATE jobs|INTO job_executions/i.test(src.replace(/\/\/[^\n]*/g, "")));
  });
});
