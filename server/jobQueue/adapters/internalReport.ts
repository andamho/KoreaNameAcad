// 순수 계산 adapter(prototype 검증용) — 외부 부작용 없음, 입력으로 결과 hash 를 결정적으로 계산.
// 첫 운영 adapter 후보(pdf-generate/internal-report)의 최소 형태. 운영 경로에 연결하지 않는다.
import type { JobAdapter } from "./types";
import type { ClaimResult, CompletionInput, ActualVersionSnapshot } from "../types";
import { sha256Hex, canonicalStringify } from "../idempotency";

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
