// 운영 read-only preview 집계(순수). 안전 행(file_hash·report_type·status)만 받아 메모리 preview → 집계·중복분석.
// ⚠️ 원문·고객값·idempotencyKey 전체값을 반환하지 않는다(그룹 수·건수만).
import { buildInternalReportQueuePreview, type InternalReportPreviewInput, type PreviewValidationCode } from "./internalReportPreview";

// 운영에서 SELECT 하는 안전 컬럼만(민감 컬럼 금지).
export interface SafeReportRow {
  fileHash: string; // report_matches.file_hash
  reportType: string; // report_matches.report_type
  status: string; // report_matches.status
}
// 버전은 운영 데이터가 아니라 config(코드/config)에서 주입(가짜 생성 금지).
export interface PreviewVersionConfig {
  pipelineVersion: string | null;
  rendererVersion: string | null;
  templateVersion: string | null;
  pipelineHash?: string | null;
  rendererHash?: string | null;
  templateHash?: string | null;
  executionOptions?: InternalReportPreviewInput["executionOptions"];
}

export interface PreviewAggregate {
  total: number;
  valid: number;
  invalid: number;
  eligibleForCreate: number;
  byErrorCode: Record<string, number>;
  byReportType: Record<string, number>;
  byStatus: Record<string, number>;
  projectIdNull: number;
  sourceHashValid: number;
  pipelineVersionPresent: number;
  rendererVersionPresent: number;
  templateVersionNull: number;
  // 중복 분석(전체 key 미노출)
  duplicateGroups: number; // 동일 idempotencyKey 그룹 수(2건 이상)
  duplicateRows: number; // 중복 그룹에 속한 총 행수
  sameSourceDiffReportType: number; // 동일 file_hash·다른 reportType 인데 key 충돌한 그룹 수(계약 결함 신호)
  sameSourceMultiVersionCandidates: number; // 동일 file_hash·다른 version candidate(현재 config 고정이라 0 예상)
}

export function aggregateInternalReportPreviews(rows: SafeReportRow[], config: PreviewVersionConfig): PreviewAggregate {
  const agg: PreviewAggregate = {
    total: rows.length, valid: 0, invalid: 0, eligibleForCreate: 0,
    byErrorCode: {}, byReportType: {}, byStatus: {}, projectIdNull: 0, sourceHashValid: 0,
    pipelineVersionPresent: 0, rendererVersionPresent: 0, templateVersionNull: 0,
    duplicateGroups: 0, duplicateRows: 0, sameSourceDiffReportType: 0, sameSourceMultiVersionCandidates: 0,
  };
  const keyGroups = new Map<string, { fileHashes: Set<string>; reportTypes: Set<string>; count: number }>();

  for (const row of rows) {
    agg.byReportType[row.reportType] = (agg.byReportType[row.reportType] ?? 0) + 1;
    agg.byStatus[row.status] = (agg.byStatus[row.status] ?? 0) + 1;
    const input: InternalReportPreviewInput = {
      projectId: null, sourceAssetHash: row.fileHash, reportType: row.reportType as any,
      pipelineVersion: config.pipelineVersion, rendererVersion: config.rendererVersion, templateVersion: config.templateVersion,
      pipelineHash: config.pipelineHash ?? null, rendererHash: config.rendererHash ?? null, templateHash: config.templateHash ?? null,
      executionOptions: config.executionOptions, existingDomainStatus: row.status,
    };
    const p = buildInternalReportQueuePreview(input);
    if (p.valid) agg.valid++; else agg.invalid++;
    if (p.eligibleForCreate) agg.eligibleForCreate++;
    if (p.projectId === null) agg.projectIdNull++;
    if (p.identitySummary.sourceHashPrefix) agg.sourceHashValid++;
    if (p.identitySummary.versionLabels.pipelineVersion) agg.pipelineVersionPresent++;
    if (p.identitySummary.versionLabels.rendererVersion) agg.rendererVersionPresent++;
    if (p.identitySummary.versionLabels.templateVersion === null) agg.templateVersionNull++;
    for (const e of p.validationErrors) agg.byErrorCode[e.code] = (agg.byErrorCode[e.code] ?? 0) + 1;

    if (p.idempotencyKey) {
      const g = keyGroups.get(p.idempotencyKey) ?? { fileHashes: new Set(), reportTypes: new Set(), count: 0 };
      g.fileHashes.add(row.fileHash); g.reportTypes.add(row.reportType); g.count++;
      keyGroups.set(p.idempotencyKey, g);
    }
  }
  for (const g of Array.from(keyGroups.values())) {
    if (g.count > 1) {
      agg.duplicateGroups++; agg.duplicateRows += g.count;
      // 같은 key 인데 reportType 이 다르면 identity 결함 신호(같은 file_hash+reportType 이어야 정상 중복=재처리 기록)
      if (g.reportTypes.size > 1) agg.sameSourceDiffReportType++;
    }
  }
  return agg;
}

// validation error 코드 목록(안정) — 보고 표에서 사용.
export const PREVIEW_ERROR_CODES: PreviewValidationCode[] = [
  "UNEXPECTED_INPUT_FIELD", "UNEXPECTED_EXECUTION_OPTION", "SENSITIVE_FIELD_PRESENT",
  "MISSING_SOURCE_HASH", "REPORT_CONTENT_HASH_UNSUPPORTED", "INVALID_PROJECT_ID",
  "UNSUPPORTED_REPORT_TYPE", "MISSING_PIPELINE_VERSION", "MISSING_RENDERER_VERSION",
  "INVALID_MANIFEST_HASH", "INVALID_EXECUTION_OPTIONS",
];
