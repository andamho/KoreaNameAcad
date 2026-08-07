// 유튜브 썸네일 재시도 테스트 — 실제 API 호출 0건, 실제 대기 0초(sleep 주입).
// 실행: npm run test:youtube
//
// 고정하려는 계약:
//  · 최초 1회 + 재시도 2회 = 총 3회를 절대 넘지 않는다
//  · 모르는 오류는 재시도하지 않는다(기본 금지)
//  · 429 라도 quotaExceeded 계열이면 재시도하지 않는다
//  · 모든 시도에서 같은 JPEG(SHA-256 동일)를 쓴다
//  · 썸네일이 끝내 실패해도 영상 published 상태는 뒤집히지 않는다
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const {
  setThumbnailWithRetry,
  isRetryableThumbnailFailure,
  parseYoutubeErrorReason,
  readJpegSize,
  mergeErrorLog,
  YoutubeThumbnailError,
  THUMBNAIL_RETRY_DELAYS_MS,
  MAX_THUMBNAIL_ATTEMPTS,
  MAX_ERROR_BODY_CHARS,
} = await import("../../server/youtubeThumbnailPolicy");

// 최소 JPEG(SOF0 1080x1920) — 해상도 파싱 확인용
function fakeJpeg(width = 1080, height = 1920): Buffer {
  const b = Buffer.alloc(20, 0);
  b[0] = 0xff; b[1] = 0xd8;            // SOI
  b[2] = 0xff; b[3] = 0xc0;            // SOF0
  b.writeUInt16BE(11, 4);              // length
  b[6] = 8;                            // precision
  b.writeUInt16BE(height, 7);
  b.writeUInt16BE(width, 9);
  return b;
}
const IMAGE = fakeJpeg();
const SHA = crypto.createHash("sha256").update(IMAGE).digest("hex");

const ytError = (status: number | null, reason: string | null, body = "") =>
  new YoutubeThumbnailError({ status, reason, bodyText: body || JSON.stringify({ error: { errors: [{ reason }] } }) });

/** 시도 결과 대본대로 동작하는 가짜 setThumbnail */
function scripted(script: Array<"ok" | YoutubeThumbnailError>) {
  const seen: Buffer[] = [];
  let i = 0;
  return {
    seen,
    get calls() { return i; },
    fn: async (_id: string, img: Buffer) => {
      seen.push(img);
      const step = script[i++];
      if (step !== "ok") throw step;
    },
  };
}

function harness(script: Array<"ok" | YoutubeThumbnailError>, videoState: any = { uploadStatus: "uploaded", processingStatus: "processing" }) {
  const s = scripted(script);
  const slept: number[] = [];
  let stateCalls = 0;
  const run = () =>
    setThumbnailWithRetry({
      videoId: "VID1",
      image: IMAGE,
      jpegSha256: SHA,
      setThumbnail: s.fn,
      getVideoState: async () => { stateCalls++; return videoState; },
      sleep: async (ms: number) => { slept.push(ms); },   // 실제로 기다리지 않는다
      now: () => new Date("2026-08-07T03:47:35.000Z"),
    });
  return { run, s, slept, stateCalls: () => stateCalls };
}

describe("재시도 정책 분류", () => {
  test("403 forbidden → 재시도", () => {
    assert.equal(isRetryableThumbnailFailure({ status: 403, reason: "forbidden" }), true);
  });
  test("403 이라도 reason 이 다르면 재시도 안 함", () => {
    for (const r of ["quotaExceeded", "insufficientPermissions", "authError", null]) {
      assert.equal(isRetryableThumbnailFailure({ status: 403, reason: r }), false, `reason=${r}`);
    }
  });
  test("429·5xx → 재시도", () => {
    for (const st of [429, 500, 502, 503, 504]) {
      assert.equal(isRetryableThumbnailFailure({ status: st, reason: null }), true, `status=${st}`);
    }
  });
  test("429 라도 quota 계열 reason 이면 재시도 안 함", () => {
    for (const r of ["quotaExceeded", "dailyLimitExceeded", "uploadRateLimitExceeded"]) {
      assert.equal(isRetryableThumbnailFailure({ status: 429, reason: r }), false, `reason=${r}`);
    }
  });
  test("400·401·404 → 재시도 안 함", () => {
    for (const st of [400, 401, 404]) {
      assert.equal(isRetryableThumbnailFailure({ status: st, reason: null }), false, `status=${st}`);
    }
  });
  test("네트워크 실패/타임아웃 → 재시도", () => {
    assert.equal(isRetryableThumbnailFailure({ status: null, reason: null, networkFailure: true }), true);
  });
  test("알 수 없는 상태는 기본 금지", () => {
    for (const st of [418, 451, 302]) {
      assert.equal(isRetryableThumbnailFailure({ status: st, reason: null }), false, `status=${st}`);
    }
  });
  test("reason 파싱", () => {
    assert.equal(parseYoutubeErrorReason(JSON.stringify({ error: { errors: [{ reason: "forbidden" }] } })), "forbidden");
    assert.equal(parseYoutubeErrorReason("not json"), null);
    assert.equal(parseYoutubeErrorReason("{}"), null);
  });
});

describe("재시도 흐름", () => {
  test("최초 성공 → 시도 1회, 대기 0회, 영상상태 조회 0회", async () => {
    const h = harness(["ok"]);
    const r = await h.run();
    assert.equal(r.ok, true);
    assert.equal(r.attempts.length, 1);
    assert.equal(h.s.calls, 1);
    assert.deepEqual(h.slept, []);
    assert.equal(h.stateCalls(), 0);
  });

  test("forbidden → 두 번째 성공 (10초 대기, 상태조회 1회)", async () => {
    const h = harness([ytError(403, "forbidden"), "ok"]);
    const r = await h.run();
    assert.equal(r.ok, true);
    assert.equal(r.attempts.length, 2);
    assert.deepEqual(h.slept, [10_000]);
    assert.equal(h.stateCalls(), 1);
    assert.equal(r.attempts[0].videoState?.processingStatus, "processing");
    assert.equal(r.attempts[1].ok, true);
  });

  test("forbidden → forbidden → 세 번째 성공 (10초·30초)", async () => {
    const h = harness([ytError(403, "forbidden"), ytError(403, "forbidden"), "ok"]);
    const r = await h.run();
    assert.equal(r.ok, true);
    assert.equal(r.attempts.length, 3);
    assert.deepEqual(h.slept, [10_000, 30_000]);
    assert.equal(h.stateCalls(), 2);
  });

  test("forbidden 3회 → 최종 실패, 총 3회에서 정지", async () => {
    const h = harness([ytError(403, "forbidden"), ytError(403, "forbidden"), ytError(403, "forbidden")]);
    const r = await h.run();
    assert.equal(r.ok, false);
    assert.equal(r.attempts.length, 3);
    assert.equal(h.s.calls, 3, "3회를 초과해 호출했다");
    assert.deepEqual(h.slept, [10_000, 30_000], "마지막 실패 뒤에는 대기하지 않는다");
  });

  test("401 → 재시도 0회", async () => {
    const h = harness([ytError(401, null), "ok"]);
    const r = await h.run();
    assert.equal(r.ok, false);
    assert.equal(r.attempts.length, 1);
    assert.equal(h.s.calls, 1);
    assert.deepEqual(h.slept, []);
    assert.equal(h.stateCalls(), 0, "재시도 불가인데 상태를 조회했다");
  });

  test("quotaExceeded → 재시도 0회", async () => {
    const h = harness([ytError(403, "quotaExceeded"), "ok"]);
    const r = await h.run();
    assert.equal(r.ok, false);
    assert.equal(h.s.calls, 1);
    assert.deepEqual(h.slept, []);
  });

  test("429 → 제한적 재시도 후 성공", async () => {
    const h = harness([ytError(429, null), "ok"]);
    const r = await h.run();
    assert.equal(r.ok, true);
    assert.deepEqual(h.slept, [10_000]);
  });

  test("503 → 제한적 재시도 후 성공", async () => {
    const h = harness([ytError(503, "backendError"), "ok"]);
    const r = await h.run();
    assert.equal(r.ok, true);
    assert.equal(r.attempts.length, 2);
  });

  test("네트워크 타임아웃 → 재시도", async () => {
    const h = harness([new YoutubeThumbnailError({ status: null, reason: null, bodyText: "fetch failed", networkFailure: true }), "ok"]);
    const r = await h.run();
    assert.equal(r.ok, true);
    assert.equal(r.attempts[0].networkFailure, true);
    assert.deepEqual(h.slept, [10_000]);
  });

  test("YoutubeThumbnailError 가 아닌 예외도 네트워크 실패로 다뤄 재시도", async () => {
    const h = harness([new Error("socket hang up") as any, "ok"]);
    const r = await h.run();
    assert.equal(r.ok, true);
    assert.equal(r.attempts[0].httpStatus, null);
  });

  test("모든 시도에서 같은 JPEG(SHA-256 동일)를 쓴다", async () => {
    const h = harness([ytError(403, "forbidden"), ytError(403, "forbidden"), "ok"]);
    const r = await h.run();
    assert.equal(h.s.seen.length, 3);
    const hashes = new Set(h.s.seen.map((b) => crypto.createHash("sha256").update(b).digest("hex")));
    assert.equal(hashes.size, 1, "시도마다 다른 이미지를 올렸다");
    assert.deepEqual([...new Set(r.attempts.map((a) => a.jpegSha256))], [SHA]);
  });

  test("상수 계약: 총 3회, 간격 10초·30초", () => {
    assert.equal(MAX_THUMBNAIL_ATTEMPTS, 3);
    assert.deepEqual([...THUMBNAIL_RETRY_DELAYS_MS], [10_000, 30_000]);
  });
});

describe("기록", () => {
  test("시각은 UTC ISO 하나만 남기고 KST 는 저장하지 않는다", async () => {
    const h = harness(["ok"]);
    const r = await h.run();
    const a: any = r.attempts[0];
    assert.equal(a.atUtc, "2026-08-07T03:47:35.000Z");
    assert.ok(!("atKst" in a), "KST 값을 저장했다");
    assert.match(a.atUtc, /Z$/);
  });

  test("해상도·크기·시도번호가 기록된다", async () => {
    const h = harness(["ok"]);
    const r = await h.run();
    assert.equal(r.attempts[0].jpegSize, "1080x1920");
    assert.equal(r.attempts[0].jpegBytes, IMAGE.length);
    assert.equal(r.attempts[0].attempt, 1);
    assert.equal(r.attempts[0].videoId, "VID1");
  });

  test("오류 원문은 길이를 제한한다", () => {
    const e = new YoutubeThumbnailError({ status: 403, reason: "forbidden", bodyText: "x".repeat(5000) });
    assert.equal(e.bodyText.length, MAX_ERROR_BODY_CHARS);
  });

  test("JPEG 해상도 파싱 실패는 null 이고 흐름을 막지 않는다", () => {
    assert.equal(readJpegSize(Buffer.from([1, 2, 3, 4])), null);
    assert.deepEqual(readJpegSize(fakeJpeg(640, 480)), { width: 640, height: 480 });
  });

  test("error_log 는 기존 내용을 덮어쓰지 않고 병합한다", () => {
    const prev = JSON.stringify({ tiktok: "구조적 차단", instagram: "일시 오류" });
    const merged = JSON.parse(mergeErrorLog(prev, { thumbnail: "실패", thumbnailAttempts: [{ attempt: 1 }] }));
    assert.equal(merged.tiktok, "구조적 차단");
    assert.equal(merged.instagram, "일시 오류");
    assert.equal(merged.thumbnail, "실패");
    assert.equal(merged.thumbnailAttempts.length, 1);
  });

  test("시도 이력은 최대 3건으로 제한된다", () => {
    const prev = JSON.stringify({ thumbnailAttempts: [{ attempt: 1 }, { attempt: 2 }] });
    const merged = JSON.parse(mergeErrorLog(prev, { thumbnailAttempts: [{ attempt: 3 }, { attempt: 4 }] }));
    assert.equal(merged.thumbnailAttempts.length, 3);
    assert.deepEqual(merged.thumbnailAttempts.map((a: any) => a.attempt), [2, 3, 4]);
  });

  test("파싱 불가한 기존 error_log 도 잃지 않는다", () => {
    const merged = JSON.parse(mergeErrorLog("깨진 문자열", { thumbnail: "실패" }));
    assert.equal(merged.previousRaw, "깨진 문자열");
    assert.equal(merged.thumbnail, "실패");
  });
});

describe("error_log 병합 경계 — 과거 thumbnail 오류 부활 방지", () => {
  const PREV_FAIL = JSON.stringify({
    thumbnail: "썸네일 설정 실패(3회 시도): 403 forbidden",
    thumbnailAttempts: [{ attempt: 1, ok: false }],
    tiktok: "구조적 차단",
  });

  test("기존 thumbnail 오류 + 이번 성공 → 최종 thumbnail 오류가 사라진다", () => {
    const merged = JSON.parse(
      mergeErrorLog(PREV_FAIL, { thumbnailAttempts: [{ attempt: 1, ok: true }] }, { clearKeys: ["thumbnail"] }),
    );
    assert.ok(!("thumbnail" in merged), "과거 thumbnail 오류가 spread 로 부활했다");
    assert.equal(merged.thumbnailAttempts.length, 2, "이력은 유지돼야 한다");
    assert.equal(merged.tiktok, "구조적 차단", "무관한 키는 보존돼야 한다");
  });

  test("clearKeys 없이 성공 패치만 주면 과거 오류가 남는다(회귀 감시용 대조군)", () => {
    const merged = JSON.parse(mergeErrorLog(PREV_FAIL, { thumbnailAttempts: [{ attempt: 1, ok: true }] }));
    assert.equal(typeof merged.thumbnail, "string", "clearKeys 계약이 사라지면 이 테스트가 알려준다");
  });

  test("기존 thumbnail 오류 + 이번에도 최종 실패 → 최신 오류로 갱신", () => {
    const merged = JSON.parse(
      mergeErrorLog(PREV_FAIL, { thumbnail: "썸네일 설정 실패(3회 시도): 429 rateLimit", thumbnailAttempts: [] }),
    );
    assert.match(merged.thumbnail, /429 rateLimit/);
    assert.doesNotMatch(merged.thumbnail, /403 forbidden/);
  });

  test("error_log = null", () => {
    const merged = JSON.parse(mergeErrorLog(null, { thumbnail: "실패" }));
    assert.equal(merged.thumbnail, "실패");
    assert.ok(!("previousRaw" in merged));
  });

  test('error_log = "" (빈 문자열)', () => {
    const merged = JSON.parse(mergeErrorLog("", { thumbnail: "실패" }));
    assert.equal(merged.thumbnail, "실패");
    assert.ok(!("previousRaw" in merged), "빈 문자열을 previousRaw 로 남기지 않는다");
  });

  test("error_log = 공백만 있는 문자열", () => {
    const merged = JSON.parse(mergeErrorLog("   ", { thumbnail: "실패" }));
    assert.ok(!("previousRaw" in merged));
  });

  test("error_log = 정상 JSON", () => {
    const merged = JSON.parse(mergeErrorLog(JSON.stringify({ instagram: "일시 오류" }), { thumbnail: "실패" }));
    assert.equal(merged.instagram, "일시 오류");
    assert.equal(merged.thumbnail, "실패");
  });

  test("error_log = JSON 아닌 레거시 일반 문자열 → 보존하되 길이 제한", () => {
    const legacy = "ffmpeg 실행 불가: spawn ffmpeg ENOENT " + "x".repeat(5000);
    const merged = JSON.parse(mergeErrorLog(legacy, { thumbnail: "실패" }));
    assert.equal(merged.previousRaw.length, MAX_ERROR_BODY_CHARS);
    assert.match(merged.previousRaw, /^ffmpeg 실행 불가/);
  });

  test("error_log = 깨진 JSON", () => {
    const merged = JSON.parse(mergeErrorLog('{"thumbnail":"실패"', { instagram: "새 오류" }));
    assert.equal(merged.instagram, "새 오류");
    assert.match(merged.previousRaw, /^\{"thumbnail"/);
  });

  test("error_log = JSON 배열 / 숫자 → previousRaw 로 안전 처리", () => {
    assert.match(JSON.parse(mergeErrorLog("[1,2,3]", { a: 1 })).previousRaw, /^\[1,2,3\]/);
    assert.match(JSON.parse(mergeErrorLog("123", { a: 1 })).previousRaw, /^123/);
  });

  test("어떤 입력에도 던지지 않는다 — 배포가 로그 파싱 때문에 실패하지 않는다", () => {
    const inputs = [null, undefined, "", "   ", "{}", "[]", "null", "깨진 {", '{"a":', "0", "true", "x".repeat(9000)];
    for (const v of inputs) {
      assert.doesNotThrow(() => mergeErrorLog(v as any, { thumbnail: "실패" }), `입력=${String(v).slice(0, 20)}`);
      const out = mergeErrorLog(v as any, { thumbnail: "실패" });
      assert.doesNotThrow(() => JSON.parse(out), "결과가 유효한 JSON 이 아니다");
    }
  });

  test("병합 결과에 토큰·비밀값 키를 새로 만들지 않는다", () => {
    const merged = JSON.parse(mergeErrorLog(PREV_FAIL, { thumbnail: "실패" }));
    const keys = JSON.stringify(Object.keys(merged));
    assert.doesNotMatch(keys, /token|secret|access|password|refresh/i);
  });
});

describe("영상 게시 상태는 썸네일 실패로 뒤집히지 않는다", () => {
  test("최종 실패해도 재업로드나 상태 되돌림이 없다(호출부 계약)", async () => {
    // setThumbnailWithRetry 는 영상 상태를 바꾸는 어떤 부수효과도 갖지 않는다.
    let uploadCalled = 0;
    const h = harness([ytError(403, "forbidden"), ytError(403, "forbidden"), ytError(403, "forbidden")]);
    const r = await h.run();
    assert.equal(r.ok, false);
    assert.equal(uploadCalled, 0, "재업로드가 호출됐다");
    // 실패 이력은 남고, 반환값 어디에도 영상 상태 변경 지시가 없다
    assert.equal(r.attempts.every((a) => a.videoId === "VID1"), true);
    assert.ok(!("ytStatus" in (r as any)));
  });
});
