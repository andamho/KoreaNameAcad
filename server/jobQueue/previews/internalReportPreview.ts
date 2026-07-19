// internal-report shadow **preview** (오프라인 순수 함수). 기존 report 요청 → queue job candidate 메모리 계산.
// ⚠️ jobs/job_executions INSERT 없음 · reportSync/route 미연결 · 기존 상태·artifact 무변경 · 운영 DB 조회 없음.
// 주 방어선 = 명시적 입력 allowlist(예상 밖 필드 거부). 값 정규식은 2차 검문일 뿐 — "정규식 통과=안전" 아님.
import type { RequestVersionSnapshot } from "../../../shared/jobQueueContract";
import { isSha256Hex } from "../../../shared/jobQueueContract";
import { computeExecutionOptionsHash, computeIdempotencyKey, canonicalStringify, sha256Hex, CanonicalizationError } from "../idempotency";
import { jobTypePolicy } from "../registry";

export const INTERNAL_REPORT_OWNER_SCOPE = "korea-name-acad" as const;
export const INTERNAL_REPORT_JOB_TYPE = "internal-report" as const;
const REPORT_TYPES = new Set(["family", "individual"]);

// ── 입력 allowlist(주 방어선) ──
const TOP_LEVEL_ALLOWED = new Set([
  "ownerScope", "projectId", "sourceAssetHash", "reportContentHash", "reportType",
  "pipelineVersion", "pipelineHash", "templateVersion", "templateHash", "rendererVersion", "rendererHash",
  "executionOptions", "existingDomainStatus", "artifactIdentitySummary",
]);
const EXEC_OPT_ALLOWED = new Set(["outputFormat", "outputMode", "dpi", "pageSize", "orientation", "imageMode", "attachmentMode"]);
// 이름만으로 즉시 거부(값 미열람)
const SENSITIVE_NAMES = new Set(
  ["customerName", "phone", "email", "address", "residentNumber", "reportBody", "consultationText",
   "absolutePath", "filePath", "fileName", "uri", "url", "databaseUrl", "leaseToken", "extractedName"].map((s) => s.toLowerCase()),
);
// 2차 검문(명확한 패턴만). 단어경계로 sha256 hex 오탐 방지.
const SENSITIVE_VALUE_RE = [
  /\b\d{2,3}-\d{3,4}-\d{4}\b/, // 전화
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/, // 이메일
  /[a-zA-Z]:\\/, // 윈도우 경로
  /[a-z]+:\/\//i, // scheme://
  /\b\d{6}-\d{7}\b/, // 주민번호
];

export interface InternalReportExecutionOptions {
  outputFormat?: string | null;
  outputMode?: string | null;
  dpi?: number | null;
  pageSize?: string | null;
  orientation?: string | null;
  imageMode?: string | null;
  attachmentMode?: string | null;
}
export interface InternalReportPreviewInput {
  ownerScope?: string;
  projectId: string | null;
  sourceAssetHash: string; // 입력 파일 bytes sha256(= report_matches.file_hash). identity 원천.
  reportContentHash?: null; // 별도 canonical content hash 부재 → null 만 허용(sourceAssetHash 중복 금지).
  reportType: "family" | "individual";
  pipelineVersion: string | null; // semantic label
  pipelineHash?: string | null; // manifest hash(영향 파일·파라미터), 있으면 identity 반영
  templateVersion?: string | null; // 실제 template 있을 때만(없으면 null)
  templateHash?: string | null;
  rendererVersion: string | null; // semantic label 또는 lib 버전
  rendererHash?: string | null;
  executionOptions?: InternalReportExecutionOptions;
  existingDomainStatus?: string | null; // report_matches.status(참고용, identity 아님)
  artifactIdentitySummary?: { hasRenderedArtifact?: boolean } | null;
}

export type PreviewValidationCode =
  | "UNEXPECTED_INPUT_FIELD" | "UNEXPECTED_EXECUTION_OPTION" | "SENSITIVE_FIELD_PRESENT"
  | "MISSING_SOURCE_HASH" | "REPORT_CONTENT_HASH_UNSUPPORTED" | "INVALID_PROJECT_ID"
  | "UNSUPPORTED_REPORT_TYPE" | "MISSING_PIPELINE_VERSION" | "MISSING_RENDERER_VERSION"
  | "INVALID_MANIFEST_HASH" | "INVALID_EXECUTION_OPTIONS";
export interface PreviewValidationError { code: PreviewValidationCode; field: string }

export interface SafeAdapterPolicySummary {
  jobType: string; maxAttempts: number; leaseDurationSec: number; heartbeatIntervalSec: number; sideEffectClass: string; verificationRequired: boolean;
}
export interface SafeIdentitySummary {
  jobType: string; ownerScope: string; projectPresent: boolean;
  sourceIdentityType: "content-hash"; sourceHashPrefix: string | null; reportType: string | null;
  versionLabels: { pipelineVersion: string | null; templateVersion: string | null; rendererVersion: string | null };
  manifestHashesPresent: { pipelineHash: boolean; templateHash: boolean; rendererHash: boolean };
}
export interface InternalReportQueuePreview {
  valid: boolean;
  eligibleForCreate: boolean; // validation 통과 & createJob 구조 완성. DB UNIQUE 충돌·존재 여부 확인 안 함(생성 보장 아님).
  databaseLookupPerformed: false; // stage A/B 순수 preview — DB 조회 안 함
  jobType: "internal-report"; ownerScope: string; projectId: string | null;
  idempotencyKey: string | null; payloadHash: string | null; executionOptionsHash: string | null;
  requestVersionSnapshot: RequestVersionSnapshot | null;
  validationErrors: PreviewValidationError[];
  adapterPolicy: SafeAdapterPolicySummary; identitySummary: SafeIdentitySummary;
}

function scanValues(obj: unknown, path: string, hits: string[]): void {
  if (typeof obj === "string") { if (SENSITIVE_VALUE_RE.some((re) => re.test(obj))) hits.push(path); return; }
  if (obj && typeof obj === "object") for (const [k, v] of Object.entries(obj)) scanValues(v, `${path}.${k}`, hits);
}

export function buildInternalReportQueuePreview(input: InternalReportPreviewInput): InternalReportQueuePreview {
  const ownerScope = input.ownerScope ?? INTERNAL_REPORT_OWNER_SCOPE;
  const errors: PreviewValidationError[] = [];

  // 1) allowlist(주 방어선) — 예상 밖/민감 top-level 키 거부(값 미열람)
  for (const k of Object.keys(input)) {
    const kl = k.toLowerCase();
    if (SENSITIVE_NAMES.has(kl)) errors.push({ code: "SENSITIVE_FIELD_PRESENT", field: k });
    else if (!TOP_LEVEL_ALLOWED.has(k)) errors.push({ code: "UNEXPECTED_INPUT_FIELD", field: k });
  }
  const opts = input.executionOptions ?? {};
  for (const k of Object.keys(opts)) {
    const kl = k.toLowerCase();
    if (SENSITIVE_NAMES.has(kl)) errors.push({ code: "SENSITIVE_FIELD_PRESENT", field: `executionOptions.${k}` });
    else if (!EXEC_OPT_ALLOWED.has(k)) errors.push({ code: "UNEXPECTED_EXECUTION_OPTION", field: `executionOptions.${k}` });
  }
  // 2차 값 검문(명확 패턴)
  const vh: string[] = []; scanValues(input, "input", vh);
  for (const f of vh) errors.push({ code: "SENSITIVE_FIELD_PRESENT", field: f });

  // 2) 필수·형식
  if (!isSha256Hex(input.sourceAssetHash)) errors.push({ code: "MISSING_SOURCE_HASH", field: "sourceAssetHash" });
  if (input.reportContentHash != null) errors.push({ code: "REPORT_CONTENT_HASH_UNSUPPORTED", field: "reportContentHash" });
  if (input.projectId !== null && (typeof input.projectId !== "string" || input.projectId.length === 0)) errors.push({ code: "INVALID_PROJECT_ID", field: "projectId" });
  if (!REPORT_TYPES.has(input.reportType)) errors.push({ code: "UNSUPPORTED_REPORT_TYPE", field: "reportType" });
  if (!input.pipelineVersion) errors.push({ code: "MISSING_PIPELINE_VERSION", field: "pipelineVersion" });
  if (!input.rendererVersion) errors.push({ code: "MISSING_RENDERER_VERSION", field: "rendererVersion" });
  for (const [name, val] of [["pipelineHash", input.pipelineHash], ["templateHash", input.templateHash], ["rendererHash", input.rendererHash]] as const) {
    if (val != null && !isSha256Hex(val)) errors.push({ code: "INVALID_MANIFEST_HASH", field: name });
  }

  const adapterPolicy = safePolicy();
  const identitySummary: SafeIdentitySummary = {
    jobType: INTERNAL_REPORT_JOB_TYPE, ownerScope, projectPresent: input.projectId !== null,
    sourceIdentityType: "content-hash",
    sourceHashPrefix: isSha256Hex(input.sourceAssetHash) ? input.sourceAssetHash.slice(0, 12) : null,
    reportType: REPORT_TYPES.has(input.reportType) ? input.reportType : null,
    versionLabels: { pipelineVersion: input.pipelineVersion, templateVersion: input.templateVersion ?? null, rendererVersion: input.rendererVersion },
    manifestHashesPresent: { pipelineHash: input.pipelineHash != null, templateHash: input.templateHash != null, rendererHash: input.rendererHash != null },
  };
  const fail = (extra: PreviewValidationError[] = []): InternalReportQueuePreview => ({
    valid: false, eligibleForCreate: false, databaseLookupPerformed: false, jobType: INTERNAL_REPORT_JOB_TYPE, ownerScope,
    projectId: input.projectId, idempotencyKey: null, payloadHash: null, executionOptionsHash: null,
    requestVersionSnapshot: null, validationErrors: [...errors, ...extra], adapterPolicy, identitySummary,
  });
  if (errors.length) return fail();

  // 3) canonical 계산(메모리). identity 는 sourceAssetHash 만 사용(reportContentHash 중복 안 함).
  // 결과영향 값(reportType·version label·manifest hash·render options)은 executionOptionsHash 로 identity 반영.
  let executionOptionsHash: string, requestVersionSnapshot: RequestVersionSnapshot, idempotencyKey: string, payloadHash: string;
  try {
    const identityOptions = {
      reportType: input.reportType,
      templateVersion: input.templateVersion ?? null, templateHash: input.templateHash ?? null,
      rendererVersion: input.rendererVersion, rendererHash: input.rendererHash ?? null,
      pipelineHash: input.pipelineHash ?? null,
      renderOptions: { outputFormat: opts.outputFormat ?? null, outputMode: opts.outputMode ?? null, dpi: opts.dpi ?? null, pageSize: opts.pageSize ?? null, orientation: opts.orientation ?? null, imageMode: opts.imageMode ?? null, attachmentMode: opts.attachmentMode ?? null },
    };
    executionOptionsHash = computeExecutionOptionsHash(identityOptions);
    requestVersionSnapshot = {
      schemaVersion: 1, pipelineVersion: input.pipelineVersion,
      transcriptionEngineVersion: null, transcriptionEngineHash: null,
      dictionaryVersion: null, normalizationVersion: null, correctionEngineVersion: null, correctionEngineHash: null,
      executorRequirement: null,
      projectSpecific: {
        reportType: input.reportType, pipelineHash: input.pipelineHash ?? null,
        rendererVersion: input.rendererVersion, rendererHash: input.rendererHash ?? null,
        templateVersion: input.templateVersion ?? null, templateHash: input.templateHash ?? null,
        outputMode: opts.outputMode ?? null,
      },
    };
    idempotencyKey = computeIdempotencyKey({
      ownerScope, projectId: input.projectId, jobType: INTERNAL_REPORT_JOB_TYPE,
      inputAssetHash: input.sourceAssetHash, pipelineVersion: input.pipelineVersion,
      transcriptionEngineHash: null, transcriptionEngineVersion: null,
      dictionaryVersion: null, normalizationVersion: null, correctionEngineHash: null, executionOptionsHash,
    });
    payloadHash = sha256Hex(canonicalStringify({ ownerScope, projectId: input.projectId, jobType: INTERNAL_REPORT_JOB_TYPE, inputAssetHash: input.sourceAssetHash, identityOptions, requestVersionSnapshot }));
  } catch (e) {
    if (e instanceof CanonicalizationError) return fail([{ code: "INVALID_EXECUTION_OPTIONS", field: "executionOptions" }]);
    throw e;
  }

  return {
    valid: true, eligibleForCreate: true, databaseLookupPerformed: false, jobType: INTERNAL_REPORT_JOB_TYPE, ownerScope,
    projectId: input.projectId, idempotencyKey, payloadHash, executionOptionsHash, requestVersionSnapshot,
    validationErrors: [], adapterPolicy, identitySummary,
  };
}

function safePolicy(): SafeAdapterPolicySummary {
  const p = jobTypePolicy(INTERNAL_REPORT_JOB_TYPE);
  return { jobType: p.jobType, maxAttempts: p.maxAttempts, leaseDurationSec: p.leaseDurationSec, heartbeatIntervalSec: p.heartbeatIntervalSec, sideEffectClass: p.sideEffectClass, verificationRequired: p.verificationRequired };
}
