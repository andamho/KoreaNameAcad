// 운영 제한 shadow observation writer(one-shot CLI). needs_review 4건만. ⚠️ reportSync/route/worker 미배선.
// 안전 계약: 기본 inspect. dry-run=DDL 없이 INSERT 후 ROLLBACK. apply=COMMIT은 아래 모두 명시일 때만.
//   SHADOW_WRITE_MODE=inspect|dry-run|apply · CONFIRM_SHADOW_WRITE=true · EXPECTED_SOURCE_COUNT=4 ·
//   EXPECTED_DATABASE_HOST_HASH=<sha256(host)> · SHADOW_REF_KEY_VERSION=v1 · JOB_SHADOW_REF_HMAC_KEY(env, 미로그).
//   DELETE/UPDATE/DDL 없음. raw report id·HMAC key·URL 원문 미로그. jobs/job_executions 미접촉.
import "dotenv/config";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import pg from "pg";
import { runShadowWrite, type WriterClient, type WriterConfig } from "../server/jobQueue/previews/shadowWriter";
import { REPORT_MANIFEST_TARGETS, computeReportManifestHash, INTERNAL_REPORT_PIPELINE_LABEL, INTERNAL_REPORT_RENDERER_LABEL, type ManifestEntry } from "../server/jobQueue/previews/reportManifest";
import { checkRendererVersion, EXPECTED_RENDERER } from "../server/jobQueue/previews/rendererGuard";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hostHash = (url: string) => { try { return crypto.createHash("sha256").update(new URL(url).host.toLowerCase()).digest("hex"); } catch { return ""; } };
const fail = (code: number, msg: string): never => { console.error(msg); process.exit(code); };

function manifestHashes() {
  const entries: ManifestEntry[] = [];
  for (const rel of REPORT_MANIFEST_TARGETS) { const abs = path.join(repoRoot, rel); if (fs.existsSync(abs)) entries.push({ path: rel, content: fs.readFileSync(abs, "utf8") }); }
  const pipelineHash = entries.length ? computeReportManifestHash(entries, { renderDpiScale: 4, pageConversion: "pdf->png" }) : null;
  const rendererOnly = entries.filter((e) => /render_pdf|reportSync/.test(e.path));
  const rendererHash = rendererOnly.length ? computeReportManifestHash(rendererOnly, { renderDpiScale: 4 }) : null;
  return { pipelineHash, rendererHash };
}

// requirements pin 과 기대 버전 일치 확인(render 실행 없음). 불일치면 write 중단.
function rendererLibraryVersion(): string | null {
  try {
    const req = fs.readFileSync(path.join(repoRoot, "requirements-report-renderer.txt"), "utf8");
    const m = req.match(/PyMuPDF==([0-9.]+)/i);
    return m ? m[1] : null;
  } catch { return null; }
}

async function main() {
  const mode = (process.env.SHADOW_WRITE_MODE || "inspect").toLowerCase();
  if (!["inspect", "dry-run", "apply"].includes(mode)) fail(2, `[shadow-write] 잘못된 SHADOW_WRITE_MODE: ${mode}`);
  const keyVersion = process.env.SHADOW_REF_KEY_VERSION || "v1";
  const expectedSourceCount = Number(process.env.EXPECTED_SOURCE_COUNT || "4");

  // key configured(값 미출력)
  const keyConfigured = !!process.env.JOB_SHADOW_REF_HMAC_KEY;
  const keyLenOk = keyConfigured && (process.env.JOB_SHADOW_REF_HMAC_KEY as string).length >= 32;
  console.log(`[shadow-write] key configured=${keyConfigured} lengthPolicy=${keyConfigured ? (keyLenOk ? "pass" : "fail") : "n/a"} keyVersion=${keyVersion}`);

  // renderer guard(pin==기대). render 실행 없음.
  const rlv = rendererLibraryVersion();
  const guard = checkRendererVersion({ library: EXPECTED_RENDERER.library, libraryVersion: rlv });
  if (!guard.ok) fail(3, `[shadow-write] renderer guard 실패: ${guard.code} (write 중단)`);
  console.log(`[shadow-write] renderer pin=${rlv} guard=ok`);

  const url = (process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "").trim();
  if (!url) fail(2, "[shadow-write] DB URL 없음");
  const expectHost = (process.env.EXPECTED_DATABASE_HOST_HASH || "").trim().toLowerCase();
  if (expectHost && hostHash(url) !== expectHost) fail(3, `[shadow-write] host 해시 불일치 → 중단`);

  if (mode === "apply") {
    if (process.env.CONFIRM_SHADOW_WRITE !== "true") fail(3, "[shadow-write] apply 에는 CONFIRM_SHADOW_WRITE=true 필수");
    if (!expectHost) fail(3, "[shadow-write] apply 에는 EXPECTED_DATABASE_HOST_HASH 핀 필수");
    if (!keyLenOk) fail(3, "[shadow-write] apply 에는 JOB_SHADOW_REF_HMAC_KEY(>=32) 필수");
  }

  const { pipelineHash, rendererHash } = manifestHashes();
  const config: WriterConfig = {
    keyVersion, pipelineVersion: INTERNAL_REPORT_PIPELINE_LABEL, rendererVersion: INTERNAL_REPORT_RENDERER_LABEL,
    pipelineHash, rendererHash, rendererLibraryVersion: rlv,
    executionOptions: { outputFormat: "png", outputMode: "attach", dpi: 288 },
    observedPipelineHash: pipelineHash, expectedSourceCount, observedAt: new Date().toISOString(),
  };

  const c = new pg.Client({ connectionString: url, ssl: url.includes("sslmode=disable") ? false : { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  await c.connect();
  console.log(`[shadow-write] 접속(host#${hostHash(url).slice(0, 8)}…) mode=${mode}`);
  const client: WriterClient = { query: (sql, params) => c.query(sql, params as any[]), exec: async (sql) => { await c.query(sql); } };
  let exit = 0;
  try {
    const r = await runShadowWrite(client, config, mode as any);
    console.log(`[shadow-write] selected=${r.selected} eligible=${r.eligible} aborted=${r.aborted} preflight=[${r.preflightCodes.join(",")}]`);
    if (!r.aborted) console.log(`[shadow-write] mode=${r.mode} inserted=${r.inserted} existing=${r.existing} committed=${r.committed}`);
    const jc = (await client.query(`SELECT (SELECT count(*) FROM jobs)::int j, (SELECT count(*) FROM job_executions)::int e, (SELECT count(*) FROM job_shadow_previews)::int s`)).rows[0];
    console.log(`[shadow-write] jobs=${jc.j} job_executions=${jc.e} job_shadow_previews=${jc.s}`);
    exit = r.aborted ? 5 : 0;
  } catch (e: any) {
    console.error(`[shadow-write] 오류(전체 rollback): ${e?.message}`); exit = 1;
  } finally { await c.end(); }
  process.exit(exit);
}
main().catch((e) => { console.error("[shadow-write] 오류:", e?.message); process.exit(1); });
