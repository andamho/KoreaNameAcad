// 실제 업무 adapter — 이름분석표 자동첨부. 기존 처리 함수 processFile() 을 **복제 없이 호출**한다.
// 기존 정상 경로(reportSync 로컬 동기화)는 그대로 두고, 큐 adapter 를 별도로 추가한다.
//
// 실제/test double 경계(정직 구분):
//   REAL  = processFile 로직(content-hash dedup·terminal skip=idempotency·후보매칭·원자적 첨부·report_matches/crm_files DB write) + db.
//   외부  = render(PDF→PNG, 로컬 Python render_pdf.py) · upload(R2) · resolveInput(로컬 파일→해시/이름/후보).
//           → 격리 E2E 에서는 이 셋을 **test double** 로 주입한다(가짜 성공 아님: processFile 의 실제 분기·DB write 를 모두 실행).
//           → 운영에서는 reportSync 와 동일한 실제 deps 로 **로컬 worker** 가 실행한다(Railway 클라우드는 로컬 파일 없음).
//
// ⚠️ 큐 job 은 고객 PII 를 담지 않는다 — inputIdentity = { fileContentHash(sha256, 비-PII), locator(불투명 참조) } 만.
//    실제 파일명·이름·후보는 실행 시점에 resolveInput 이 로컬에서 해석한다(계약: 큐에 원문 금지).
import crypto from "crypto";
import type { JobAdapter, AdapterExecuteContext } from "./types";
import { AdapterError } from "./types";
import type { ClaimResult, CompletionInput, ActualVersionSnapshot } from "../types";
import { processFile, type ProcessorDeps, type ProcessInput, type ProcessResult } from "../../knop/reportProcessor";

export const NAME_REPORT_JOB_TYPE = "name-report-attach";

/** 큐 job 의 비-PII 참조. locator 는 로컬 worker 만 해석 가능한 불투명 키(예: 파일 해시 기반). */
export interface NameReportRef { fileContentHash: string; locator: string }

/** adapter deps = processFile deps + 비-PII 참조를 실제 ProcessInput 으로 해석하는 resolver. */
export type NameReportDeps = ProcessorDeps & {
  resolveInput: (ref: NameReportRef, signal?: AbortSignal) => Promise<ProcessInput>;
};

const stripReq = (s: ClaimResult["adapterInput"]["requestVersionSnapshot"]): ActualVersionSnapshot => {
  const { executorRequirement, ...actual } = s; void executorRequirement; return actual;
};

function jobToRef(input: ClaimResult["adapterInput"]): NameReportRef {
  const id = (input.inputIdentity ?? {}) as Record<string, unknown>;
  const fileContentHash = String(id.fileContentHash ?? id.inputAssetHash ?? "");
  const locator = String(id.locator ?? fileContentHash);
  if (!/^[0-9a-f]{64}$/.test(fileContentHash)) throw new AdapterError("permanent.invalid-input", "fileContentHash 는 sha256 hex 여야 함");
  return { fileContentHash, locator };
}

// 재시도 대상(전이/미결 — 렌더/업로드/DB 일시 실패). idempotent 하게 다시 시도된다.
const RETRYABLE = new Set(["attachment_failed", "processing_failed"]);

/** 이름분석표 자동첨부 adapter. deps 로 실제/test double 을 주입한다. */
export function makeNameReportAdapter(deps: NameReportDeps): JobAdapter {
  return {
    jobType: NAME_REPORT_JOB_TYPE,
    actualVersion(input) { return stripReq(input.requestVersionSnapshot); },
    async execute(input, ctx?: AdapterExecuteContext): Promise<CompletionInput> {
      const ref = jobToRef(input);
      if (ctx?.signal?.aborted) throw new AdapterError("transient.timeout", "cancelled before processing");
      const pi: ProcessInput = await deps.resolveInput(ref, ctx?.signal);
      if (ctx?.signal?.aborted) throw new AdapterError("transient.timeout", "cancelled before processFile");

      const result: ProcessResult = await processFile(deps, pi); // 실제 함수 호출

      if (RETRYABLE.has(result.status)) {
        // 렌더/업로드/DB 일시 실패 → 큐가 재시도(idempotent: terminal 이면 다음 시도는 no-op).
        throw new AdapterError("transient.provider-5xx", `${result.status}: ${result.note}`);
      }
      // auto_matched / needs_review / duplicate / manually_matched / 이미 처리됨 → 작업 완료. 결과를 아티팩트에 기록.
      const artifactHash = crypto.createHash("sha256").update(JSON.stringify({ matchId: result.matchId, status: result.status, fileContentHash: ref.fileContentHash })).digest("hex");
      return {
        actualVersionSnapshot: stripReq(input.requestVersionSnapshot),
        artifactSnapshot: {
          inputAssetHash: ref.fileContentHash, learnedExportArtifactHash: null,
          resultArtifactHash: artifactHash, contentHash: artifactHash,
          projectSpecificArtifacts: [{
            artifactType: "name-report-match", uri: "", byteHash: artifactHash, contentHash: null,
            sizeBytes: null, createdAt: deps.now().toISOString(),
            metadata: { status: result.status, matchId: result.matchId }, // 고객 PII 없음(상태·id 만)
          }],
        },
        executorSnapshot: { executorType: "name-report", executorVersion: "1.0.0", runtimeVersion: null, workerIdentity: null, environmentFingerprint: null },
        manifestUri: null, manifestArtifactHash: null,
        verificationStatus: "passed",
      };
    },
  };
}
