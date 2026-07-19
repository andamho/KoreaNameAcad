// internal-report 제한 shadow observation writer 코어(needs_review 만). fail-closed.
// ⚠️ reportSync/route/worker 미배선. DML allowlist = SELECT + INSERT ON CONFLICT DO NOTHING(+BEGIN/COMMIT/ROLLBACK).
//    DELETE/UPDATE/DDL 금지. raw source id·HMAC key·URL 원문 미로그. jobs/job_executions 미접촉.
import { computeSourceRecordRef } from "./shadowRef";
import { buildInternalReportQueuePreview, type InternalReportExecutionOptions } from "./internalReportPreview";
import { buildShadowObservation, type ShadowObservation } from "./shadowObservation";

export interface WriterClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
  exec?(sql: string): Promise<void>;
}
// report_matches 에서 SELECT 하는 안전 컬럼만(민감 컬럼 금지). id 는 즉시 HMAC 변환용.
export interface SafeReportTargetRow { id: string; fileHash: string; reportType: string; status: string; hasArtifact: boolean }

export interface WriterConfig {
  keyVersion: string; // v1
  hmacKey?: string; // 명시(테스트). 없으면 env JOB_SHADOW_REF_HMAC_KEY
  pipelineVersion: string; rendererVersion: string;
  pipelineHash: string | null; rendererHash: string | null;
  rendererLibraryVersion: string | null;
  executionOptions: InternalReportExecutionOptions;
  observedPipelineHash: string | null;
  expectedSourceCount: number; // 정확히 이 수여야 write(4)
  observedAt: string; // ISO(기록용, DB observed_at 은 now() default)
}

export type PreflightCode =
  | "KEY_MISSING" | "COUNT_MISMATCH" | "STATUS_NOT_NEEDS_REVIEW" | "INVALID_HASH"
  | "UNSUPPORTED_REPORT_TYPE" | "ARTIFACT_MISSING" | "DUPLICATE_SOURCE_HASH"
  | "PREVIEW_INVALID" | "PROVENANCE_INCOMPLETE";

export interface WriteResult {
  mode: "inspect" | "dry-run" | "apply";
  aborted: boolean;
  preflightCodes: PreflightCode[];
  selected: number;
  eligible: number;
  inserted: number;
  existing: number;
  rejected: number;
  committed: boolean;
}

const REPORT_TYPES = new Set(["family", "individual"]);
const isSha = (s: unknown) => typeof s === "string" && /^[0-9a-f]{64}$/.test(s);

export async function selectNeedsReviewTargets(c: WriterClient): Promise<SafeReportTargetRow[]> {
  // 안전 컬럼만: id(HMAC 변환용)·file_hash·report_type·status·artifact 존재 여부(boolean). 원문/URI/고객값 미조회.
  return (
    await c.query(
      `SELECT id, file_hash AS "fileHash", report_type AS "reportType", status, (rendered_url IS NOT NULL) AS "hasArtifact"
         FROM report_matches WHERE status='needs_review'`,
    )
  ).rows as SafeReportTargetRow[];
}

// 각 대상 → observation. 실패 사유 수집(fail-closed). raw id 는 메모리에서 즉시 HMAC 변환.
export function buildTargetObservations(
  rows: SafeReportTargetRow[],
  config: WriterConfig,
): { observations: ShadowObservation[]; codes: PreflightCode[] } {
  const codes = new Set<PreflightCode>();
  const observations: ShadowObservation[] = [];
  const seenHashes = new Set<string>();

  // key 존재 probe(값 미노출)
  let keyOk = true;
  try { computeSourceRecordRef("report_matches", "probe", { key: config.hmacKey, keyVersion: config.keyVersion }); }
  catch { keyOk = false; codes.add("KEY_MISSING"); }

  for (const r of rows) {
    if (r.status !== "needs_review") { codes.add("STATUS_NOT_NEEDS_REVIEW"); continue; }
    if (!isSha(r.fileHash)) { codes.add("INVALID_HASH"); continue; }
    if (!REPORT_TYPES.has(r.reportType)) { codes.add("UNSUPPORTED_REPORT_TYPE"); continue; }
    if (!r.hasArtifact) { codes.add("ARTIFACT_MISSING"); continue; }
    if (seenHashes.has(r.fileHash)) { codes.add("DUPLICATE_SOURCE_HASH"); continue; }
    seenHashes.add(r.fileHash);
    if (!keyOk) continue;

    const preview = buildInternalReportQueuePreview({
      projectId: null, sourceAssetHash: r.fileHash, reportType: r.reportType as any,
      pipelineVersion: config.pipelineVersion, pipelineHash: config.pipelineHash,
      rendererVersion: config.rendererVersion, rendererHash: config.rendererHash,
      templateVersion: null, executionOptions: config.executionOptions,
    });
    if (!preview.valid) { codes.add("PREVIEW_INVALID"); continue; }
    const { ref, sourceRefKeyVersion } = computeSourceRecordRef("report_matches", r.id, { key: config.hmacKey, keyVersion: config.keyVersion });
    const obs = buildShadowObservation({
      sourceDomain: "report_matches", sourceRecordRef: ref, sourceRefKeyVersion,
      observationKind: "needs-review", preview, sourceStatus: r.status,
      provenance: { rendererLibrary: "pymupdf", rendererLibraryVersion: config.rendererLibraryVersion },
      observedPipelineHash: config.observedPipelineHash, observedAt: config.observedAt,
    });
    if (!obs.provenanceComplete) { codes.add("PROVENANCE_INCOMPLETE"); continue; }
    observations.push(obs);
  }
  return { observations, codes: Array.from(codes) };
}

async function insertObservations(c: WriterClient, obs: ShadowObservation[]): Promise<number> {
  let inserted = 0;
  for (const o of obs) {
    const r = await c.query(
      `INSERT INTO job_shadow_previews
         (preview_schema_version, source_domain, source_record_ref, source_ref_key_version, observation_kind,
          job_type, owner_scope, project_id, prospective_idempotency_key, payload_hash, execution_options_hash,
          request_version_snapshot, observed_pipeline_hash, renderer_library_version, source_status, validation_status,
          validation_error_codes, provenance_complete, observation_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17::jsonb,$18,$19)
       ON CONFLICT (observation_hash) DO NOTHING
       RETURNING id`,
      [o.previewSchemaVersion, o.sourceDomain, o.sourceRecordRef, o.sourceRefKeyVersion, o.observationKind,
       o.jobType, o.ownerScope, o.projectId, o.prospectiveIdempotencyKey, o.payloadHash, o.executionOptionsHash,
       JSON.stringify(o.requestVersionSnapshot), o.observedPipelineHash, o.rendererLibraryVersion, o.sourceStatus,
       o.validationStatus, JSON.stringify(o.validationErrorCodes), o.provenanceComplete, o.observationHash],
    );
    if (r.rows.length) inserted++;
  }
  return inserted;
}

export async function runShadowWrite(c: WriterClient, config: WriterConfig, mode: "inspect" | "dry-run" | "apply"): Promise<WriteResult> {
  const exec = c.exec ?? (async (sql: string) => { await c.query(sql); });
  const rows = await selectNeedsReviewTargets(c);
  const { observations, codes } = buildTargetObservations(rows, config);
  const selected = rows.length, eligible = observations.length;
  const base: WriteResult = { mode, aborted: false, preflightCodes: codes, selected, eligible, inserted: 0, existing: 0, rejected: 0, committed: false };

  // fail-closed: 대상 수 정확히 expected + eligible == selected == expected + 오류 코드 없음.
  const countOk = selected === config.expectedSourceCount && eligible === config.expectedSourceCount;
  if (!countOk) codes.push("COUNT_MISMATCH");
  if (codes.length) return { ...base, aborted: true, preflightCodes: Array.from(new Set(codes)) };

  if (mode === "inspect") return base; // write 없음

  await exec("BEGIN");
  try {
    const inserted = await insertObservations(c, observations);
    const existing = eligible - inserted;
    // post-write invariant: shadow rows == 관측 대상, jobs/job_executions 불변
    if (mode === "dry-run") {
      await exec("ROLLBACK");
      return { ...base, inserted, existing, committed: false };
    }
    await exec("COMMIT");
    return { ...base, inserted, existing, committed: true };
  } catch (e) {
    await exec("ROLLBACK").catch(() => {}); // observation_hash 외 제약 오류 = 즉시 rollback
    throw e;
  }
}
