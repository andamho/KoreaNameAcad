// 유튜브 영상 처리 상태 판정 — 장면 선택 작업을 워커에게 넘겨도 되는지 결정한다.
// (보관 패치의 판정 함수 중 필요한 것만 옮겨 왔다. 썸네일 재설정·예약 재확인 코드는 가져오지 않음)
import type { YoutubeVideoState } from "../youtubeThumbnailPolicy";

/**
 * 처리 상태 조회 결과. "조회 실패"와 "처리 실패"를 반드시 구분한다.
 *  ok           — 조회 성공
 *  not_found    — 조회는 됐으나 영상이 없음(삭제 등)
 *  lookup_error — 조회 자체 실패(네트워크·권한·5xx). 처리 상태는 모름
 */
export type ProcessingCheck =
  | { kind: "ok"; state: YoutubeVideoState & { privacyStatus?: string | null; title?: string | null } }
  | { kind: "not_found" }
  | { kind: "lookup_error"; error: string };

/** 처리 완료 — processingStatus=succeeded, 또는 그 값이 없을 때 uploadStatus=processed */
export function isProcessingDone(st: YoutubeVideoState): boolean {
  if (st.processingStatus === "succeeded") return true;
  if (!st.processingStatus && st.uploadStatus === "processed") return true;
  return false;
}

/** 처리 실패 확정 — 기다려도 장면을 고를 수 없는 상태 */
export function isProcessingFailed(st: YoutubeVideoState): boolean {
  return (
    st.processingStatus === "failed" ||
    st.processingStatus === "terminated" ||
    st.uploadStatus === "failed" ||
    st.uploadStatus === "rejected" ||
    st.uploadStatus === "deleted"
  );
}
