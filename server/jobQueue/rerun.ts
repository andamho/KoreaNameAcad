// forced-rerun — 안 C(현 스키마에서 미지원, 계약만 유지).
//
// 배경: forced-rerun 은 "같은 job 에 새 execution(execution_reason='forced-rerun')을 만들어 재실행"하는
// 관리자 승인 작업이다. 그러나 일반 claim 이 아닌 관리자 함수가 worker_id/lease token/lease 만료를 직접
// 발급하면 책임 경계가 어긋난다(worker 배정·capability·SKIP LOCKED·priority 경로 우회). 부분유일 인덱스가
// "중복 방지"는 하지만 그것이 직접 execution 생성 책임을 정당화하지는 않는다.
//
// 올바른 계약(향후 활성화): 요청 함수는 execution 을 만들지 않고 job 을 queued 로 되돌리며, 다음 정상 claim 이
// execution_reason='forced-rerun' 으로 execution 을 생성해 일반 claim/lease 경로를 재사용한다. 이를 위해서는
// jobs 에 다음 실행 이유를 보존할 컬럼(pending_execution_reason)이 필요하다(현 스키마에 없음).
//   - 안 A: jobs.pending_execution_reason 추가(additive migration) → 다음 claim 이 해당 reason 사용. (향후)
//   - 안 B: 별도 job_execution_intents 테이블 → 현 단계 과도, 불채택.
//   - 안 C(채택): 현 스키마에서는 forced-rerun 실행 API 를 제공하지 않는다. 계약만 유지, additive migration 후 활성화.
//
// 따라서 runtime core RC 에서는 forced-rerun 실행을 명시적으로 미지원 처리한다(직접 execution 생성 금지).

export const FORCED_RERUN_SUPPORTED = false as const;

export class ForcedRerunUnsupportedError extends Error {
  code = "FORCED_RERUN_UNSUPPORTED" as const;
  constructor() {
    super(
      "forced-rerun 은 현재 스키마에서 미지원(안 C). jobs.pending_execution_reason additive migration 후 " +
        "다음 정상 claim 경로로 활성화 예정 — 관리자 함수가 worker lease 를 직접 발급하지 않는다.",
    );
    this.name = "ForcedRerunUnsupportedError";
  }
}

// 호출 시 즉시 미지원 오류(직접 execution 생성 안 함). 시그니처는 향후 활성화 대비 유지.
export function requestForcedRerun(_jobId: string): never {
  throw new ForcedRerunUnsupportedError();
}
