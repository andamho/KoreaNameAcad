// internal-report shadow observation read-only 모니터(one-shot). 신규 candidate·drift 집계만.
// ⚠️ write 없음(SELECT 만). INSERT/UPDATE/DELETE/DDL 금지. reportSync/route/worker 미배선.
//    key/raw id/URL 원문 미로그. 신규 발견돼도 INSERT 안 함. 자동 스케줄 없음.
// 사용: node --import tsx/esm scripts/monitorInternalReportShadow.ts   (dotenv 로 env 로드)
import "dotenv/config";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import pg from "pg";
import { selectNeedsReviewTargets, buildTargetObservations, type WriterClient, type WriterConfig } from "../server/jobQueue/previews/shadowWriter";
import { compareShadowObservations, type StoredObservationRow } from "../server/jobQueue/previews/shadowMonitor";
import { REPORT_MANIFEST_TARGETS, computeReportManifestHash, INTERNAL_REPORT_PIPELINE_LABEL, INTERNAL_REPORT_RENDERER_LABEL, type ManifestEntry } from "../server/jobQueue/previews/reportManifest";
import { checkRendererVersion, EXPECTED_RENDERER } from "../server/jobQueue/previews/rendererGuard";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hostHash = (url: string) => { try { return crypto.createHash("sha256").update(new URL(url).host.toLowerCase()).digest("hex"); } catch { return ""; } };

function manifestHashes() {
  const entries: ManifestEntry[] = [];
  for (const rel of REPORT_MANIFEST_TARGETS) { const abs = path.join(repoRoot, rel); if (fs.existsSync(abs)) entries.push({ path: rel, content: fs.readFileSync(abs, "utf8") }); }
  const pipelineHash = entries.length ? computeReportManifestHash(entries, { renderDpiScale: 4, pageConversion: "pdf->png" }) : null;
  const rendererOnly = entries.filter((e) => /render_pdf|reportSync/.test(e.path));
  const rendererHash = rendererOnly.length ? computeReportManifestHash(rendererOnly, { renderDpiScale: 4 }) : null;
  return { pipelineHash, rendererHash };
}
function rendererLibraryVersion(): string | null {
  try { const m = fs.readFileSync(path.join(repoRoot, "requirements-report-renderer.txt"), "utf8").match(/PyMuPDF==([0-9.]+)/i); return m ? m[1] : null; } catch { return null; }
}

async function main() {
  const keyVersion = process.env.SHADOW_REF_KEY_VERSION || "v1";
  const keyConfigured = !!process.env.JOB_SHADOW_REF_HMAC_KEY; // 값·길이 미노출, 불린만
  console.log(`[shadow-monitor] key configured=${keyConfigured} keyVersion=${keyVersion} · read-only(write 없음)`);
  const rlv = rendererLibraryVersion();
  const guard = checkRendererVersion({ library: EXPECTED_RENDERER.library, libraryVersion: rlv });
  console.log(`[shadow-monitor] renderer pin=${rlv} guard=${guard.ok ? "ok" : (guard as any).code}`);

  const url = (process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "").trim();
  if (!url) { console.error("[shadow-monitor] DB URL 없음"); process.exit(2); }
  const expectHost = (process.env.EXPECTED_DATABASE_HOST_HASH || "").trim().toLowerCase();
  if (expectHost && hostHash(url) !== expectHost) { console.error("[shadow-monitor] host 해시 불일치 → 중단"); process.exit(3); }

  const { pipelineHash, rendererHash } = manifestHashes();
  const config: WriterConfig = {
    keyVersion, pipelineVersion: INTERNAL_REPORT_PIPELINE_LABEL, rendererVersion: INTERNAL_REPORT_RENDERER_LABEL,
    pipelineHash, rendererHash, rendererLibraryVersion: rlv,
    executionOptions: { outputFormat: "png", outputMode: "attach", dpi: 288 },
    observedPipelineHash: pipelineHash, expectedSourceCount: 0, observedAt: new Date().toISOString(),
  };

  const c = new pg.Client({ connectionString: url, ssl: url.includes("sslmode=disable") ? false : { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  await c.connect();
  console.log(`[shadow-monitor] 접속(host#${hostHash(url).slice(0, 8)}…) READ ONLY`);
  const client: WriterClient = { query: (sql, params) => c.query(sql, params as any[]) };
  try {
    await c.query("BEGIN TRANSACTION READ ONLY"); // write 시도 차단
    const rows = await selectNeedsReviewTargets(client);
    const { observations, codes } = buildTargetObservations(rows, config);
    const stored: StoredObservationRow[] = (await client.query(
      `SELECT source_record_ref, source_ref_key_version, observation_hash, prospective_idempotency_key,
              observed_pipeline_hash, source_status, validation_status, provenance_complete, renderer_library_version
         FROM job_shadow_previews`,
    )).rows;
    const duplicateExcluded = (await client.query(`SELECT count(*)::int n FROM report_matches WHERE status='duplicate'`)).rows[0].n;
    const total = (await client.query(`SELECT count(*)::int n FROM job_shadow_previews`)).rows[0].n;
    const jc = (await client.query(`SELECT (SELECT count(*) FROM jobs)::int j, (SELECT count(*) FROM job_executions)::int e`)).rows[0];
    await c.query("ROLLBACK");

    const agg = compareShadowObservations({ selected: rows.length, fresh: observations, invalidCodes: codes, stored, duplicateExcluded });
    console.log(`[shadow-monitor] selected=${agg.selected} eligible=${agg.eligible} invalid=${agg.invalid} invalidCodes=[${agg.invalidCodes.join(",")}]`);
    console.log(`[shadow-monitor] alreadyObserved=${agg.alreadyObserved} unobservedEligible=${agg.unobservedEligible} write=${agg.write}`);
    console.log(`[shadow-monitor] drift=${agg.drift} driftFields=[${agg.driftFields.join(",")}] provenanceMismatch=${agg.provenanceMismatch}`);
    console.log(`[shadow-monitor] duplicateExcluded=${agg.duplicateExcluded} | shadow_total=${total} jobs=${jc.j} job_executions=${jc.e}`);
  } finally { await c.end(); }
}
main().catch((e) => { console.error("[shadow-monitor] 오류:", e?.message); process.exit(1); });
