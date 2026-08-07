// ── 유튜브 커스텀 썸네일 재시도 정책 (순수 모듈) ─────────────────────────────
// DB·네트워크를 모른다. HTTP 호출은 전부 주입받는다 → 목킹 없이 전 분기를 테스트할 수 있다.
//
// 배경: 2026-08-07 배포에서 영상 업로드는 성공했는데 thumbnails.set 만 403 forbidden 이 났다.
// 같은 토큰·스코프·엔드포인트로 나중에 다시 호출하니 200 이었다(실측). 즉 그 시점의 일시적 거부다.
// 원인은 확정되지 않았으므로, 재시도로 흡수하면서 진단 자료(영상 처리 상태)를 함께 남긴다.
//
// 불변식
//  · 최초 1회 + 재시도 2회 = 총 3회를 절대 넘지 않는다
//  · 모르는 오류는 재시도하지 않는다(기본 금지)
//  · 썸네일이 끝내 실패해도 영상 게시 상태는 건드리지 않는다(호출부 계약)

/** 재시도 간격. 인덱스 = 방금 끝난 시도 번호 - 1 */
export const THUMBNAIL_RETRY_DELAYS_MS = [10_000, 30_000] as const;

/** 최초 포함 최대 시도 횟수 */
export const MAX_THUMBNAIL_ATTEMPTS = 1 + THUMBNAIL_RETRY_DELAYS_MS.length; // 3

/** 오류 원문 저장 상한(로그 폭주 방지) */
export const MAX_ERROR_BODY_CHARS = 500;

/** 시도 이력 보관 상한 */
export const MAX_ATTEMPT_RECORDS = 3;

/** 상태가 같아도 이 reason 이면 기다려도 안 풀린다 → 재시도 금지 */
const NEVER_RETRY_REASONS = new Set([
  "quotaExceeded",
  "dailyLimitExceeded",
  "uploadRateLimitExceeded",
  "insufficientPermissions",
  "authError",
]);

/** 일시적 서버측 오류 */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

/** thumbnails.set 실패를 구조적으로 전달한다(문자열 검색으로 분류하지 않기 위함) */
export class YoutubeThumbnailError extends Error {
  /** HTTP 상태. 네트워크 실패·타임아웃이면 null */
  readonly status: number | null;
  /** YouTube 오류 reason(errors[0].reason). 없으면 null */
  readonly reason: string | null;
  /** 응답 원문(잘라서 보관) */
  readonly bodyText: string;
  /** 연결 실패·타임아웃 여부 */
  readonly networkFailure: boolean;

  constructor(opts: { status: number | null; reason: string | null; bodyText: string; networkFailure?: boolean }) {
    super(`썸네일 설정 실패: ${opts.status ?? "network"}${opts.reason ? ` (${opts.reason})` : ""}`);
    this.name = "YoutubeThumbnailError";
    this.status = opts.status;
    this.reason = opts.reason;
    this.bodyText = opts.bodyText.slice(0, MAX_ERROR_BODY_CHARS);
    this.networkFailure = opts.networkFailure ?? opts.status === null;
  }
}

/** 응답 본문에서 YouTube 오류 reason 추출. 파싱 실패는 null(=모름 → 재시도 금지 쪽으로 흐른다) */
export function parseYoutubeErrorReason(bodyText: string): string | null {
  try {
    const j = JSON.parse(bodyText);
    const r = j?.error?.errors?.[0]?.reason;
    return typeof r === "string" && r ? r : null;
  } catch {
    return null;
  }
}

/**
 * 재시도해도 되는 실패인가.
 * 금지 reason 을 먼저 본다 — 429 라도 quotaExceeded 면 재시도하지 않는다.
 */
export function isRetryableThumbnailFailure(e: {
  status: number | null;
  reason: string | null;
  networkFailure?: boolean;
}): boolean {
  if (e.reason && NEVER_RETRY_REASONS.has(e.reason)) return false;
  if (e.networkFailure || e.status === null) return true; // 연결 실패·타임아웃
  if (e.status === 403) return e.reason === "forbidden"; // 정확히 이 reason 일 때만
  if (RETRYABLE_STATUSES.has(e.status)) return true;
  return false; // 400/401/404 및 알 수 없는 상태 → 기본 금지
}

/** JPEG SOF 마커에서 해상도 추출. 실패하면 null(진단용이므로 실패해도 흐름에 영향 없음) */
export function readJpegSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    // SOF0~SOF15 중 DHT(c4)·JPG(c8)·DAC(cc) 제외
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

export type YoutubeVideoState = {
  uploadStatus?: string | null;
  processingStatus?: string | null;
  processingFailureReason?: string | null;
};

/** 시도 1건의 기록. 시각은 UTC ISO 하나만 정본으로 남긴다(KST 는 표시할 때 변환) */
export type ThumbnailAttempt = {
  videoId: string;
  attempt: number;
  atUtc: string;
  jpegSha256: string;
  jpegBytes: number;
  jpegSize: string | null;
  ok: boolean;
  httpStatus?: number | null;
  reason?: string | null;
  networkFailure?: boolean;
  retryable?: boolean;
  errorBody?: string;
  videoState?: YoutubeVideoState | null;
};

export type ThumbnailRunResult = { ok: boolean; attempts: ThumbnailAttempt[] };

/**
 * 최초 1회 + 조건부 재시도 2회.
 * 이미지 Buffer 는 호출부가 한 번만 만들어 넘긴다 — 매 시도 같은 바이트를 쓴다(SHA-256 동일).
 * setThumbnail 은 실패 시 YoutubeThumbnailError 를 던져야 한다.
 */
export async function setThumbnailWithRetry(opts: {
  videoId: string;
  image: Buffer;
  jpegSha256: string;
  setThumbnail: (videoId: string, image: Buffer) => Promise<void>;
  getVideoState: (videoId: string) => Promise<YoutubeVideoState | null>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}): Promise<ThumbnailRunResult> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = opts.now ?? (() => new Date());
  const size = readJpegSize(opts.image);
  const jpegSize = size ? `${size.width}x${size.height}` : null;
  const attempts: ThumbnailAttempt[] = [];

  for (let attempt = 1; attempt <= MAX_THUMBNAIL_ATTEMPTS; attempt++) {
    const base = {
      videoId: opts.videoId,
      attempt,
      atUtc: now().toISOString(),
      jpegSha256: opts.jpegSha256,
      jpegBytes: opts.image.length,
      jpegSize,
    };
    try {
      await opts.setThumbnail(opts.videoId, opts.image);
      attempts.push({ ...base, ok: true, httpStatus: 200 });
      return { ok: true, attempts };
    } catch (e: any) {
      const err: YoutubeThumbnailError =
        e instanceof YoutubeThumbnailError
          ? e
          : new YoutubeThumbnailError({ status: null, reason: null, bodyText: String(e?.message ?? e), networkFailure: true });
      const retryable = isRetryableThumbnailFailure(err);

      // 재시도 가능한 실패일 때만 영상 상태를 조회한다(진단 자료). 조회 실패는 흐름을 막지 않는다.
      let videoState: YoutubeVideoState | null = null;
      if (retryable) {
        videoState = await opts.getVideoState(opts.videoId).catch(() => null);
      }

      attempts.push({
        ...base,
        ok: false,
        httpStatus: err.status,
        reason: err.reason,
        networkFailure: err.networkFailure,
        retryable,
        errorBody: err.bodyText,
        videoState,
      });

      if (!retryable) break;
      const delay = THUMBNAIL_RETRY_DELAYS_MS[attempt - 1];
      if (delay === undefined) break; // 시도 상한 소진
      await sleep(delay);
    }
  }
  return { ok: false, attempts };
}

/**
 * error_log 구조적 병합. 기존 내용을 덮어쓰지 않고, 썸네일 시도 이력만 상한을 건다.
 *
 * clearKeys: 이번에 해결된 오류 키를 명시적으로 지운다.
 *   단순 spread 만 하면 과거 error_log 의 thumbnail 값이 되살아난다 —
 *   재시도로 성공했는데 옛 실패 기록이 남는 것을 막기 위한 장치다.
 *
 * 어떤 입력(null · 빈 문자열 · 정상 JSON · 레거시 일반 문자열 · 깨진 JSON)에도 던지지 않는다.
 * 로그 병합 실패가 영상 배포 실패로 번지면 안 되기 때문이다.
 */
export function mergeErrorLog(
  prev: string | null | undefined,
  patch: Record<string, unknown>,
  opts?: { clearKeys?: string[] },
): string {
  try {
    let base: Record<string, unknown> = {};
    if (prev && String(prev).trim() !== "") {
      try {
        const p = JSON.parse(prev);
        base =
          p && typeof p === "object" && !Array.isArray(p)
            ? { ...p }
            : { previousRaw: String(prev).slice(0, MAX_ERROR_BODY_CHARS) };
      } catch {
        // 레거시 일반 문자열 · 깨진 JSON — 잃지 않되 길이는 제한한다
        base = { previousRaw: String(prev).slice(0, MAX_ERROR_BODY_CHARS) };
      }
    }

    const prevAttempts = Array.isArray(base.thumbnailAttempts) ? (base.thumbnailAttempts as unknown[]) : [];
    const newAttempts = Array.isArray(patch.thumbnailAttempts) ? (patch.thumbnailAttempts as unknown[]) : [];

    // 해결된 키는 기존 값까지 확실히 제거한다(부활 방지)
    for (const k of opts?.clearKeys ?? []) delete base[k];

    const merged: Record<string, unknown> = { ...base, ...patch };
    for (const k of opts?.clearKeys ?? []) delete merged[k];

    if (prevAttempts.length || newAttempts.length) {
      merged.thumbnailAttempts = [...prevAttempts, ...newAttempts].slice(-MAX_ATTEMPT_RECORDS);
    }
    return JSON.stringify(merged);
  } catch {
    // 최후 방어: 병합이 어떤 이유로든 실패해도 이번 결과만이라도 남긴다
    try {
      return JSON.stringify(patch);
    } catch {
      return "{}";
    }
  }
}
