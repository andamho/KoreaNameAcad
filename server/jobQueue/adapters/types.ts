// adapter 경계(prototype). adapter = commit 이후 claim 결과를 받아 실제 작업을 수행하고 결과를 반환.
// 운영 routes/worker 에 연결하지 않는다(이번 Gate). 실패는 AdapterError(error_code 포함)로 던진다.
import type { ClaimResult, CompletionInput, ActualVersionSnapshot } from "../types";
import type { ErrorCode } from "../errorCodes";

export class AdapterError extends Error {
  constructor(public errorCode: ErrorCode, public summary: string) {
    super(summary);
    this.name = "AdapterError";
  }
}

export interface JobAdapter {
  jobType: string;
  // worker 실제 실행 버전(request 와 대조됨).
  actualVersion(input: ClaimResult["adapterInput"]): ActualVersionSnapshot;
  // 실제 작업 수행 → CompletionInput. 실패 시 AdapterError throw.
  execute(input: ClaimResult["adapterInput"]): Promise<CompletionInput>;
}
