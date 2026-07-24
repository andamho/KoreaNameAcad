// internal-report adapter. 두 가지:
//   1) internalReportAdapter(const) — prototype/테스트 전용 최소 해시 계산(기존 테스트가 사용).
//   2) internalReportComputeAdapter() — **실제 adapter**: 기존 처리 코드 buildInternalReportQueuePreview 를 호출해
//      report identity·manifest·검증을 canonical 하게 계산하고 그 결과를 아티팩트로 반환한다(순수·외부 I/O 0·기존 코드 재사용).
import crypto from "crypto";
import type { JobAdapter } from "./types";
import { AdapterError } from "./types";
import type { ClaimResult, CompletionInput, ActualVersionSnapshot } from "../types";
import { sha256Hex, canonicalStringify } from "../idempotency";
import {
  buildInternalReportQueuePreview,
  INTERNAL_REPORT_JOB_TYPE,
  type InternalReportPreviewInput,
} from "../previews/internalReportPreview";

const VERSION_FROM_REQUEST = (input: ClaimResult["adapterInput"]): ActualVersionSnapshot => {
  const s = input.requestVersionSnapshot;
  // 순수 계산이라 worker 실제 버전 = request 와 동일하게 재현(불일치 없음).
  return {
    schemaVersion: s.schemaVersion,
    pipelineVersion: s.pipelineVersion,
    transcriptionEngineVersion: s.transcriptionEngineVersion,
    transcriptionEngineHash: s.transcriptionEngineHash,
    dictionaryVersion: s.dictionaryVersion,
    normalizationVersion: s.normalizationVersion,
    correctionEngineVersion: s.correctionEngineVersion,
    correctionEngineHash: s.correctionEngineHash,
  };
};

export const internalReportAdapter: JobAdapter = {
  jobType: "internal-report",
  actualVersion: VERSION_FROM_REQUEST,
  async execute(input) {
    const resultHash = sha256Hex(canonicalStringify({ input: input.inputIdentity, opts: input.executionOptions }));
    const result: CompletionInput = {
      actualVersionSnapshot: VERSION_FROM_REQUEST(input),
      artifactSnapshot: {
        inputAssetHash: (input.inputIdentity as any)?.inputAssetHash ?? null,
        learnedExportArtifactHash: null,
        resultArtifactHash: resultHash,
        contentHash: resultHash,
        projectSpecificArtifacts: null,
      },
      executorSnapshot: {
        executorType: "internal-report",
        executorVersion: "proto-1",
        runtimeVersion: null,
        workerIdentity: null,
        environmentFingerprint: null,
      },
      manifestUri: null,
      manifestArtifactHash: null,
      verificationStatus: "passed",
    };
    return result;
  },
};

// ── 실제 adapter: 기존 처리 코드(buildInternalReportQueuePreview) 호출 ──
/** job 저장값에서 preview 입력을 복원(민감정보 없음 계약). */
function toPreviewInput(input: ClaimResult["adapterInput"]): InternalReportPreviewInput {
  const id = (input.inputIdentity ?? {}) as Record<string, unknown>;
  const s = input.requestVersionSnapshot;
  return {
    projectId: (id.projectId as string | null) ?? null,
    sourceAssetHash: String(id.sourceAssetHash ?? id.inputAssetHash ?? ""),
    reportType: (id.reportType as "family" | "individual") ?? "individual",
    pipelineVersion: s.pipelineVersion,
    pipelineHash: (id.pipelineHash as string | null) ?? null,
    templateVersion: (id.templateVersion as string | null) ?? null,
    templateHash: (id.templateHash as string | null) ?? null,
    rendererVersion: (id.rendererVersion as string | null) ?? s.correctionEngineVersion ?? "renderer-1",
    rendererHash: (id.rendererHash as string | null) ?? null,
    executionOptions: (input.executionOptions ?? undefined) as InternalReportPreviewInput["executionOptions"],
    artifactIdentitySummary: (id.artifactIdentitySummary as any) ?? null,
  };
}

/** 실제 internal-report adapter. buildInternalReportQueuePreview 로 identity·manifest·검증 계산 → 결과 아티팩트.
 *  validation 실패는 permanent.invalid-input(자동 retry 안 함)로 던진다. */
export function internalReportComputeAdapter(): JobAdapter {
  return {
    jobType: INTERNAL_REPORT_JOB_TYPE,
    actualVersion: VERSION_FROM_REQUEST,
    async execute(input): Promise<CompletionInput> {
      const preview = buildInternalReportQueuePreview(toPreviewInput(input));
      if (!preview.valid) {
        throw new AdapterError("permanent.invalid-input", `internal-report 검증 실패: ${preview.validationErrors.map((e) => e.code).join(",")}`);
      }
      const canonical = canonicalStringify({
        idempotencyKey: preview.idempotencyKey, payloadHash: preview.payloadHash,
        executionOptionsHash: preview.executionOptionsHash,
        identitySummary: preview.identitySummary, adapterPolicy: preview.adapterPolicy,
      });
      const resultHash = crypto.createHash("sha256").update(canonical).digest("hex");
      return {
        actualVersionSnapshot: VERSION_FROM_REQUEST(input),
        artifactSnapshot: { inputAssetHash: null, learnedExportArtifactHash: null, resultArtifactHash: resultHash, contentHash: resultHash, projectSpecificArtifacts: null },
        executorSnapshot: { executorType: "internal-report", executorVersion: "1.0.0", runtimeVersion: null, workerIdentity: null, environmentFingerprint: null },
        manifestUri: null, manifestArtifactHash: null, verificationStatus: "passed",
      };
    },
  };
}
