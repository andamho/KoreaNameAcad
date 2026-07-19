// internal-report shadow **preview** (stage A, 오프라인 순수 함수).
// 기존 report 요청을 queue job candidate 로 "메모리에서만" 변환한다.
// ⚠️ jobs/job_executions INSERT 없음 · reportSync/route 미연결 · 기존 상태·artifact 무변경 · 운영 DB 조회 없음.
// 민감정보(고객명·전화·경로·URI·본문)는 입력·출력·로그에 넣지 않는다.
import type { RequestVersionSnapshot } from "../../../shared/jobQueueContract";
import { isSha256Hex } from "../../../shared/jobQueueContract";
import { computeExecutionOptionsHash, computeIdempotencyKey, canonicalStringify, sha256Hex, CanonicalizationError } from "../idempotency";
import { jobTypePolicy } from "../registry";

export const INTERNAL_REPORT_OWNER_SCOPE = "korea-name-acad" as const;
export const INTERNAL_REPORT_JOB_TYPE = "internal-report" as const;
const REPORT_TYPES = new Set(["family", "individual"]);

// 결과에 영향을 주는 실행 옵션만(요청시각·로그·retry·임시경로 제외). 이 값들이 executionOptionsHash → idempotencyKey 에 반영.
export interface InternalReportExecutionOptions {
  reportType: "family" | "individual";
  templateVersion: string | null;
  rendererVersion: string | null;
  outputFormat?: string | null; // 예: png
  outputMode?: string | null; // 예: attach|preview
  dpi?: number | null;
}

// 순수 preview 입력 — 기존 report 객체 전체가 아니라 필요한 비민감 값만 명시적으로 받는다.
export interface InternalReportPreviewInput {
  ownerScope?: string; // 기본 korea-name-acad
  projectId: string | null; // projects.id 근거 있을 때만. 고객/상담 ID 대체 금지 → 없으면 null
  projectIdRationale?: "projects-row" | "none";
  reportContentHash: string; // = report_matches.file_hash(sha256 내용해시). sourceAssetHash 와 동일 원천
  pipelineVersion: string | null; // report 렌더 파이프라인 버전(현재 운영 미저장=gap)
  executionOptions: InternalReportExecutionOptions;
}

export type PreviewValidationCode =
  | "MISSING_SOURCE_HASH"
  | "INVALID_PROJECT_ID"
  | "UNSUPPORTED_REPORT_TYPE"
  | "MISSING_PIPELINE_VERSION"
  | "MISSING_TEMPLATE_VERSION"
  | "MISSING_RENDERER_VERSION"
  | "INVALID_EXECUTION_OPTIONS"
  | "SENSITIVE_FIELD_PRESENT";
export interface PreviewValidationError {
  code: PreviewValidationCode;
  field: string; // 필드명만(값 원문 금지)
}

export interface SafeAdapterPolicySummary {
  jobType: string;
  maxAttempts: number;
  leaseDurationSec: number;
  heartbeatIntervalSec: number;
  sideEffectClass: string;
  verificationRequired: boolean;
}
export interface SafeIdentitySummary {
  jobType: string;
  ownerScope: string;
  projectPresent: boolean;
  sourceIdentityType: "content-hash";
  sourceHashPrefix: string | null; // prefix 만(로그 안전)
  reportType: string | null;
  versionLabels: { pipelineVersion: string | null; templateVersion: string | null; rendererVersion: string | null };
}

export interface InternalReportQueuePreview {
  valid: boolean;
  wouldCreate: boolean; // = validation 통과 & createJob 호출 가능. **DB 미조회**(UNIQUE 충돌·존재 여부 확인 안 함)
  existingJobId: string | null; // stage A 는 DB 미조회 → 항상 null
  jobType: "internal-report";
  ownerScope: string;
  projectId: string | null;
  idempotencyKey: string | null;
  payloadHash: string | null;
  executionOptionsHash: string | null;
  requestVersionSnapshot: RequestVersionSnapshot | null;
  validationErrors: PreviewValidationError[];
  adapterPolicy: SafeAdapterPolicySummary;
  identitySummary: SafeIdentitySummary;
}

// 민감 키(부분일치, 소문자). 입력에 이런 키/값이 있으면 SENSITIVE_FIELD_PRESENT 로 거부(fail-closed).
const SENSITIVE_KEY_HINTS = [
  "name", "phone", "tel", "mobile", "email", "mail", "address", "addr", "ssn", "jumin",
  "customer", "consult", "filename", "file_name", "filepath", "file_path", "abspath", "path",
  "uri", "url", "token", "password", "secret", "database", "본문", "이름", "전화", "고객", "주민", "주소",
];
// 단어경계(\b) 필수 — sha256 hex 안의 연속 숫자(문자로 둘러싸임)를 오탐하지 않게.
const SENSITIVE_VALUE_RE = [
  /\b\d{2,3}-\d{3,4}-\d{4}\b/, // 전화번호(하이픈 형태)
  /[a-zA-Z]:\\/, // 윈도우 절대경로
  /(^|[^0-9a-f])\/[A-Za-z]+\/[A-Za-z]/, // unix 경로 느낌
  /[a-z]+:\/\//i, // scheme:// (URI)
  /\b\d{6}-\d{7}\b/, // 주민번호(하이픈 형태)
];
function scanSensitive(obj: unknown, path: string, hits: string[]): void {
  if (obj === null || obj === undefined) return;
  if (typeof obj === "string") {
    if (SENSITIVE_VALUE_RE.some((re) => re.test(obj))) hits.push(path);
    return;
  }
  if (typeof obj !== "object") return;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const kl = k.toLowerCase();
    if (SENSITIVE_KEY_HINTS.some((h) => kl.includes(h))) hits.push(`${path}.${k}`);
    scanSensitive(v, `${path}.${k}`, hits);
  }
}

export function buildInternalReportQueuePreview(input: InternalReportPreviewInput): InternalReportQueuePreview {
  const ownerScope = input.ownerScope ?? INTERNAL_REPORT_OWNER_SCOPE;
  const opts = input.executionOptions;
  const errors: PreviewValidationError[] = [];

  // 1) 민감정보 방지(최우선, fail-closed) — 입력 전체 스캔
  const sensitiveHits: string[] = [];
  scanSensitive(input, "input", sensitiveHits);
  for (const f of sensitiveHits) errors.push({ code: "SENSITIVE_FIELD_PRESENT", field: f });

  // 2) 필수·형식 검증
  if (!isSha256Hex(input.reportContentHash)) errors.push({ code: "MISSING_SOURCE_HASH", field: "reportContentHash" });
  if (input.projectId !== null && (typeof input.projectId !== "string" || input.projectId.length === 0)) errors.push({ code: "INVALID_PROJECT_ID", field: "projectId" });
  if (!opts || !REPORT_TYPES.has(opts.reportType)) errors.push({ code: "UNSUPPORTED_REPORT_TYPE", field: "executionOptions.reportType" });
  if (!input.pipelineVersion) errors.push({ code: "MISSING_PIPELINE_VERSION", field: "pipelineVersion" });
  if (!opts?.templateVersion) errors.push({ code: "MISSING_TEMPLATE_VERSION", field: "executionOptions.templateVersion" });
  if (!opts?.rendererVersion) errors.push({ code: "MISSING_RENDERER_VERSION", field: "executionOptions.rendererVersion" });

  const adapterPolicy = safePolicy();
  const identitySummary: SafeIdentitySummary = {
    jobType: INTERNAL_REPORT_JOB_TYPE, ownerScope,
    projectPresent: input.projectId !== null,
    sourceIdentityType: "content-hash",
    sourceHashPrefix: isSha256Hex(input.reportContentHash) ? input.reportContentHash.slice(0, 12) : null,
    reportType: opts?.reportType ?? null,
    versionLabels: { pipelineVersion: input.pipelineVersion, templateVersion: opts?.templateVersion ?? null, rendererVersion: opts?.rendererVersion ?? null },
  };

  const fail = (extra: PreviewValidationError[] = []): InternalReportQueuePreview => ({
    valid: false, wouldCreate: false, existingJobId: null, jobType: INTERNAL_REPORT_JOB_TYPE, ownerScope,
    projectId: input.projectId, idempotencyKey: null, payloadHash: null, executionOptionsHash: null,
    requestVersionSnapshot: null, validationErrors: [...errors, ...extra], adapterPolicy, identitySummary,
  });
  if (errors.length) return fail();

  // 3) canonical 계산(메모리 전용). canonicalization 위반은 INVALID_EXECUTION_OPTIONS 로 안전 변환.
  let executionOptionsHash: string, requestVersionSnapshot: RequestVersionSnapshot, idempotencyKey: string, payloadHash: string;
  try {
    executionOptionsHash = computeExecutionOptionsHash(opts);
    requestVersionSnapshot = {
      schemaVersion: 1,
      pipelineVersion: input.pipelineVersion,
      transcriptionEngineVersion: null, transcriptionEngineHash: null,
      dictionaryVersion: null, normalizationVersion: null, // report 는 이름교정사전·정규화 미사용
      correctionEngineVersion: null, correctionEngineHash: null,
      executorRequirement: null,
      projectSpecific: { reportType: opts.reportType, templateVersion: opts.templateVersion, rendererVersion: opts.rendererVersion, outputMode: opts.outputMode ?? null },
    };
    idempotencyKey = computeIdempotencyKey({
      ownerScope, projectId: input.projectId, jobType: INTERNAL_REPORT_JOB_TYPE,
      inputAssetHash: input.reportContentHash,
      pipelineVersion: input.pipelineVersion,
      transcriptionEngineHash: null, transcriptionEngineVersion: null,
      dictionaryVersion: null, normalizationVersion: null, correctionEngineHash: null,
      executionOptionsHash,
    });
    // payloadHash = 비민감 요청 envelope 무결성(보고서 본문 미포함). idempotencyKey(작업 identity)와 구분.
    payloadHash = sha256Hex(canonicalStringify({
      ownerScope, projectId: input.projectId, jobType: INTERNAL_REPORT_JOB_TYPE,
      reportContentHash: input.reportContentHash, executionOptions: opts, requestVersionSnapshot,
    }));
  } catch (e) {
    if (e instanceof CanonicalizationError) return fail([{ code: "INVALID_EXECUTION_OPTIONS", field: "executionOptions" }]);
    throw e;
  }

  return {
    valid: true, wouldCreate: true, existingJobId: null, jobType: INTERNAL_REPORT_JOB_TYPE, ownerScope,
    projectId: input.projectId, idempotencyKey, payloadHash, executionOptionsHash, requestVersionSnapshot,
    validationErrors: [], adapterPolicy, identitySummary,
  };
}

function safePolicy(): SafeAdapterPolicySummary {
  const p = jobTypePolicy(INTERNAL_REPORT_JOB_TYPE);
  return { jobType: p.jobType, maxAttempts: p.maxAttempts, leaseDurationSec: p.leaseDurationSec, heartbeatIntervalSec: p.heartbeatIntervalSec, sideEffectClass: p.sideEffectClass, verificationRequired: p.verificationRequired };
}
