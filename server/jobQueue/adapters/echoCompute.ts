// 순수 계산 test/e2e adapter — 부작용 없음. inputIdentity 를 해시해 결과 아티팩트로 반환한다.
// 실제 adapter(pdf/internal-report) 배선 전, worker 경로(queued→running→done)를 실제로 이동시키는 최소 구현.
import crypto from "crypto";
import type { JobAdapter } from "./types";
import { AdapterError } from "./types";
import type { ClaimResult, CompletionInput } from "../types";
import type { ErrorCode } from "../errorCodes";

const stripReq = (s: ClaimResult["adapterInput"]["requestVersionSnapshot"]) => {
  const { executorRequirement, ...actual } = s; // ActualVersionSnapshot = Omit<Request, "executorRequirement">
  void executorRequirement;
  return actual;
};

/** jobType 에 대한 순수 echo adapter. verificationStatus=passed(검증 필수 jobType 도 통과). */
export function makeEchoAdapter(jobType: string): JobAdapter {
  return {
    jobType,
    actualVersion(input) { return stripReq(input.requestVersionSnapshot); },
    async execute(input): Promise<CompletionInput> {
      const content = JSON.stringify(input.inputIdentity ?? {});
      const hash = crypto.createHash("sha256").update(content).digest("hex");
      return {
        actualVersionSnapshot: stripReq(input.requestVersionSnapshot),
        artifactSnapshot: {
          inputAssetHash: null, learnedExportArtifactHash: null,
          resultArtifactHash: hash, contentHash: hash, projectSpecificArtifacts: null,
        },
        executorSnapshot: {
          executorType: "echo-compute", executorVersion: "1.0.0",
          runtimeVersion: null, workerIdentity: null, environmentFingerprint: null,
        },
        verificationStatus: "passed",
      };
    },
  };
}

/** 항상 실패하는 adapter(테스트용) — 주어진 errorCode 로 AdapterError throw. */
export function makeFailingAdapter(jobType: string, errorCode: ErrorCode, summary = "forced failure"): JobAdapter {
  return {
    jobType,
    actualVersion(input) { return stripReq(input.requestVersionSnapshot); },
    async execute(): Promise<CompletionInput> { throw new AdapterError(errorCode, summary); },
  };
}
