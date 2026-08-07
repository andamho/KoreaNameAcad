// ── 인스타 게시 상태기계 (순수 함수) ────────────────────────────────────────
// DB·네트워크를 모르는 순수 판정부. 이렇게 떼어놔야 목킹 없이 전 분기를 테스트할 수 있다.
//
// check_attempt 정의(오프바이원 방지): "완료된 유예 재조회 횟수".
//   최초 ERROR 수신 = 0 · 30초 조회 후 = 1 · 60초 후 = 2 · 120초 후 = 3(소진)

/** 유예 재조회 간격(ms). 인덱스 = 현재 check_attempt */
export const GRACE_DELAYS_MS = [30_000, 60_000, 120_000] as const;

/** IG 컨테이너 TTL. 이 시간을 넘기면 EXPIRED 로 본다 */
export const CONTAINER_TTL_MS = 24 * 3600 * 1000;

/** 리스 유효기간 */
export const LEASE_MS = 5 * 60_000;

export type IgStatusCode = "IN_PROGRESS" | "FINISHED" | "ERROR" | "PUBLISHED" | "EXPIRED" | string;

export type PublicationView = {
  state: "publishing" | "published" | "publish_unknown";
  creationId: string | null;
  containerCreatedAt: Date | null;
  checkAttempt: number;
  mediaId: string | null;
};

export type Action =
  /** 게시 완료로 확정. media_id 를 못 찾아도 재게시하지 않는다 */
  | { kind: "finalize_published"; mediaId: string | null; reason: string }
  /** 기존 creation_id 로 media_publish */
  | { kind: "publish_existing"; creationId: string }
  /** 유예 재조회 예약 */
  | { kind: "schedule_recheck"; delayMs: number; nextAttempt: number }
  /** 유예 소진 → 최종 실패 */
  | { kind: "fail_final"; reason: string }
  /** 기존 컨테이너 만료 → 교체 허용(펜싱 UPDATE 로만) */
  | { kind: "replace_container"; reason: string }
  /** 손대지 말고 중단 */
  | { kind: "abort"; reason: string };

/** 컨테이너가 TTL 을 넘겼는가 (IG 가 EXPIRED 를 안 줄 때의 보조 판정) */
export function isContainerExpired(containerCreatedAt: Date | null, now: Date): boolean {
  if (!containerCreatedAt) return false;
  return now.getTime() - containerCreatedAt.getTime() > CONTAINER_TTL_MS;
}

/**
 * 컨테이너 상태 조회 결과 + 현재 publication 으로 다음 행동을 정한다.
 * 여기서 절대 하지 않는 것: PUBLISHED 인데 media_id 를 못 찾았다고 다시 publish 하기.
 */
export function decideNextAction(pub: PublicationView, statusCode: IgStatusCode, now: Date): Action {
  // 이미 끝난 건 무조건 중단 (중복 게시 방지의 첫 관문)
  if (pub.state === "published") {
    return { kind: "abort", reason: "이미 게시 완료(published)" };
  }
  if (!pub.creationId) {
    return { kind: "abort", reason: "creation_id 없음 — 확인할 컨테이너가 없다" };
  }

  switch (statusCode) {
    case "PUBLISHED":
      // 역조회 실패해도 published 로 확정한다. media_id 는 NULL 로 남긴다.
      return {
        kind: "finalize_published",
        mediaId: pub.mediaId,
        reason: pub.mediaId ? "컨테이너 PUBLISHED" : "컨테이너 PUBLISHED (media_id 미상 — 재게시 금지)",
      };

    case "FINISHED":
      return { kind: "publish_existing", creationId: pub.creationId };

    case "EXPIRED":
      return { kind: "replace_container", reason: "컨테이너 EXPIRED" };

    case "IN_PROGRESS":
    case "ERROR": {
      if (isContainerExpired(pub.containerCreatedAt, now)) {
        return { kind: "replace_container", reason: "컨테이너 생성 후 24시간 초과" };
      }
      const next = pub.checkAttempt + 1;
      if (next > GRACE_DELAYS_MS.length) {
        return {
          kind: "fail_final",
          reason: `유예 재조회 ${GRACE_DELAYS_MS.length}회 소진 — 마지막 상태 ${statusCode}`,
        };
      }
      return { kind: "schedule_recheck", delayMs: GRACE_DELAYS_MS[pub.checkAttempt], nextAttempt: next };
    }

    default:
      // 모르는 상태값을 성공으로 오해하지 않는다
      return { kind: "abort", reason: `알 수 없는 status_code=${statusCode}` };
  }
}

/** video_jobs.ig_status 는 기존 어휘만 쓴다(신규 값 저장 금지). 화면 호환용 요약 사본 */
export function toLegacyJobStatus(state: PublicationView["state"]): "retrying" | "published" | "failed" {
  if (state === "published") return "published";
  return "retrying"; // publishing / publish_unknown 은 아직 진행 중 → 종결 상태로 보이면 안 된다
}
