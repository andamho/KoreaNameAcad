// 운영 read-only preview 실행기(별도 CLI). ⚠️ reportSync/route 미import. 운영 DB write 0.
//
// 안전 계약:
//  - READ_ONLY_PREVIEW=true 명시 필요(기본 실행 거부).
//  - SELECT 만: report_matches 의 file_hash/report_type/status 만 조회(민감 컬럼 미조회).
//  - jobs/job_executions 는 count SELECT 만.
//  - BEGIN TRANSACTION READ ONLY 로 감쌈(INSERT/UPDATE/DELETE/DDL 불가).
//  - URL/host 원문 미로그. 결과를 DB 에 저장하지 않음. 행 단위 원문 출력 없음(집계만).
//
// 사용: READ_ONLY_PREVIEW=true node --import tsx/esm scripts/previewInternalReportQueue.ts
import "dotenv/config";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import pg from "pg";
import { aggregateInternalReportPreviews, type SafeReportRow, type PreviewVersionConfig } from "../server/jobQueue/previews/reportPreviewAggregate";
import {
  REPORT_MANIFEST_TARGETS, computeReportManifestHash, INTERNAL_REPORT_PIPELINE_LABEL, INTERNAL_REPORT_RENDERER_LABEL, type ManifestEntry,
} from "../server/jobQueue/previews/reportManifest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hostHash = (url: string) => { try { return crypto.createHash("sha256").update(new URL(url).host.toLowerCase()).digest("hex"); } catch { return ""; } };

// manifest hash(현재 코드 provenance) — 운영 데이터가 아니라 코드에서 계산.
function manifestHashes(): { pipelineHash: string | null; rendererHash: string | null } {
  const entries: ManifestEntry[] = [];
  for (const rel of REPORT_MANIFEST_TARGETS) {
    const abs = path.join(repoRoot, rel);
    if (fs.existsSync(abs)) entries.push({ path: rel, content: fs.readFileSync(abs, "utf8") });
  }
  if (!entries.length) return { pipelineHash: null, rendererHash: null };
  const pipelineHash = computeReportManifestHash(entries, { renderDpiScale: 4, pageConversion: "pdf->png" });
  const rendererOnly = entries.filter((e) => /render_pdf|reportSync/.test(e.path));
  const rendererHash = rendererOnly.length ? computeReportManifestHash(rendererOnly, { renderDpiScale: 4 }) : null;
  return { pipelineHash, rendererHash };
}

async function main() {
  if (process.env.READ_ONLY_PREVIEW !== "true") {
    console.error("[preview] 거부: READ_ONLY_PREVIEW=true 명시 필요(기본 실행 금지)");
    process.exit(2);
  }
  const url = (process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "").trim();
  if (!url) { console.error("[preview] DB URL 없음"); process.exit(2); }
  const { pipelineHash, rendererHash } = manifestHashes();
  const config: PreviewVersionConfig = {
    pipelineVersion: INTERNAL_REPORT_PIPELINE_LABEL, rendererVersion: INTERNAL_REPORT_RENDERER_LABEL,
    templateVersion: null, // 별도 template 없음(PDF→PNG 통과)
    pipelineHash, rendererHash, executionOptions: { outputFormat: "png", outputMode: "attach", dpi: 288 },
  };

  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  await c.connect();
  console.log(`[preview] 접속(host#${hostHash(url).slice(0, 8)}…) · READ ONLY`);
  try {
    await c.query("BEGIN TRANSACTION READ ONLY"); // 이 tx 안에서 write 시도는 DB 가 거부
    // 민감 컬럼(extracted_name/matched_*/rendered_url/file_name/file_path) 미조회 — 안전 3컬럼만.
    const rows: SafeReportRow[] = (
      await c.query(`SELECT file_hash AS "fileHash", report_type AS "reportType", status FROM report_matches WHERE file_hash IS NOT NULL`)
    ).rows;
    const jobs = (await c.query(`SELECT count(*)::int n FROM jobs`)).rows[0].n;
    const jobExec = (await c.query(`SELECT count(*)::int n FROM job_executions`)).rows[0].n;
    await c.query("ROLLBACK");

    const agg = aggregateInternalReportPreviews(rows, config);
    // 집계만 출력(행 원문·전체 key·hash 원문 없음)
    console.log(`[preview] manifest: pipelineHash#${(pipelineHash ?? "").slice(0, 8)}… rendererHash#${(rendererHash ?? "").slice(0, 8)}…`);
    console.log(`[preview] jobs=${jobs} job_executions=${jobExec} (0 유지 확인)`);
    console.log(`[preview] total=${agg.total} valid=${agg.valid} invalid=${agg.invalid} eligibleForCreate=${agg.eligibleForCreate}`);
    console.log(`[preview] byReportType=${JSON.stringify(agg.byReportType)}`);
    console.log(`[preview] byStatus=${JSON.stringify(agg.byStatus)}`);
    console.log(`[preview] projectIdNull=${agg.projectIdNull} sourceHashValid=${agg.sourceHashValid} pipelineVersionPresent=${agg.pipelineVersionPresent} rendererVersionPresent=${agg.rendererVersionPresent} templateVersionNull=${agg.templateVersionNull}`);
    console.log(`[preview] byErrorCode=${JSON.stringify(agg.byErrorCode)}`);
    console.log(`[preview] duplicateGroups=${agg.duplicateGroups} duplicateRows=${agg.duplicateRows} sameSourceDiffReportType=${agg.sameSourceDiffReportType}(0=정상) sameSourceMultiVersion=${agg.sameSourceMultiVersionCandidates}`);
  } finally {
    await c.end();
  }
}
main().catch((e) => { console.error("[preview] 오류:", e?.message); process.exit(1); });
