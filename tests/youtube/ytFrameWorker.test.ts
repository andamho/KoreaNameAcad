// PC 워커의 순수 판정 로직(대상 ID 추출·제목 대조·썸네일 판정) — 에뮬레이터·네트워크 없이
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

// @ts-ignore — .mjs 도구 모듈
const { extractVideoId, normTitle, parseSec } = await import("../../tools/yt-frame-worker/appiumFlow.mjs");

test("재생 위치 라벨: 1분·1초 단수 표기도 읽는다(78초 영상에서 실패했던 사례)", () => {
  assert.deepEqual(parseSec("Playhead selected at 0 minutes 0 seconds out of 1 minute 18 seconds"), { at: 0, total: 78 });
  assert.deepEqual(parseSec("Playhead selected at 0 minutes 0 seconds out of 0 minutes 20 seconds"), { at: 0, total: 20 });
  assert.deepEqual(parseSec("Playhead selected at 1 minute 1 second out of 2 minutes 5 seconds"), { at: 61, total: 125 });
  assert.equal(parseSec("something else"), null);
});
// @ts-ignore
const { decideThumb, measure, jpegSize, T } = await import("../../tools/yt-frame-worker/thumbCompare.mjs");

test("클립보드 링크에서 영상 ID 추출", () => {
  assert.equal(extractVideoId("https://youtube.com/shorts/1URVAWMel3I?si=abc"), "1URVAWMel3I");
  assert.equal(extractVideoId("https://youtu.be/noakxef4gqk"), "noakxef4gqk");
  assert.equal(extractVideoId("https://www.youtube.com/watch?v=EyQ0Zjrw3n4&t=1"), "EyQ0Zjrw3n4");
  assert.equal(extractVideoId("EMPTY"), null);
  assert.equal(extractVideoId("https://youtube.com/shorts/1URVAWMel3IX"), null, "12자는 ID 아님");
});

test("제목 대조는 공백만 무시하고 글자는 정확히", () => {
  assert.equal(normTitle(" 내 이름에  물거품이? #작명 "), normTitle("내 이름에 물거품이? #작명"));
  assert.notEqual(normTitle("내 이름에 물거품이?"), normTitle("내 이름에 물거품이? #작명"));
  assert.equal(normTitle(""), "");
});

// 2026-10-03 공개 쇼츠 183개 실측 중 육안으로 정답을 확인한 사례(지표: 첫프레임 차이 / 자동후보 최소 차이 / 첫장면↔자동후보)
const CASES: [string, number, number, number, "match" | "mismatch" | "uncertain"][] = [
  // 첫 장면이 썸네일인 영상(육안 확인)
  ["vQBovY_R-6M 어두운 수중(타 채널)", 2.6, 15.2, 12.7, "match"],
  ["-awffPQo4Rk 고양이, 본편과 배경 같음", 3.6, 10.2, 12.2, "match"],
  ["noakxef4gqk 물거품(밝은 실내·글자)", 6.7, 32.6, 26.6, "match"],
  ["yKZy7Dmb0Ms 밝은 단색 배경·꽃", 4.3, 21, 19.1, "match"],
  ["_1JPjGUfLzI 야외 실사(타 채널)", 9.9, 43.9, 41.8, "match"],
  ["A0E63mzLMzw 일러스트·큰 글자", 12, 69.8, 72.4, "match"],
  // 첫 장면 아님(육안 확인)
  ["_dOumHL-sl8 표 화면, 자동 프레임 그대로", 21.7, 0, 20.8, "mismatch"],
  ["XBiB_m8vCTg 바닷속(타 채널)", 40.9, 0, 37.6, "mismatch"],
  ["KpBmWno2GJc 인물, 첫 장면=본편과 비슷", 42, 0, 5.9, "mismatch"],
  ["vpFgsAnihY8 노을 실루엣(타 채널)", 44.3, 51.4, 3.3, "mismatch"],
  // 판단 애매 → 성공으로 치지 않음
  ["s9HlSciter0 첫 장면과 본편이 거의 같음", 5.6, 1.9, 5.6, "uncertain"],
  ["RYx1TiWMK6A 같은 접시, 손만 다름(타 채널)", 10.5, 15.8, 16.5, "uncertain"],
  ["MQDhSpErlv4 실제로는 일치지만 차이 16.6", 16.6, 51.1, 47.5, "uncertain"],
  ["fQRIbiTcWuQ 첫 장면 위에 글자 얹힘", 25.7, 62.8, 53.6, "uncertain"],
];

test("썸네일 판정: 육안 확인 사례 그대로 + 애매하면 uncertain", () => {
  for (const [name, dFrame0, nearestAuto, f0Auto, want] of CASES) {
    assert.equal(decideThumb({ dFrame0, nearestAuto, f0Auto }).kind, want, name);
  }
});

test("썸네일 판정: 자동 프레임과 같은 썸네일은 절대 일치가 아니다", () => {
  for (let d = 0; d <= T.MATCH_MAX; d += 0.5) {
    assert.notEqual(decideThumb({ dFrame0: d, nearestAuto: d, f0Auto: 50 }).kind, "match");
    assert.notEqual(decideThumb({ dFrame0: d, nearestAuto: 0, f0Auto: 50 }).kind, "match");
  }
});

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
test("measure: 합성 이미지(초록 첫 장면 vs 자홍 본편)", { skip: !hasFfmpeg && "ffmpeg 없음" }, async () => {
  const mk = (args: string[]) => spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", ...args, "-frames:v", "1", "-f", "mjpeg", "pipe:1"]).stdout as Buffer;
  const frame0 = mk(["-i", "color=c=0x00AA00:s=270x480,drawbox=x=60:y=150:w=150:h=60:color=white:t=fill"]);
  const green = mk(["-i", "color=c=black:s=480x360,drawbox=x=139:y=0:w=202:h=360:color=0x00AA00:t=fill,drawbox=x=184:y=112:w=112:h=45:color=white:t=fill"]);
  const magenta = mk(["-i", "color=c=black:s=480x360,drawbox=x=139:y=0:w=202:h=360:color=0xCC00CC:t=fill,drawbox=x=184:y=112:w=112:h=45:color=white:t=fill"]);
  assert.deepEqual(jpegSize(frame0), { w: 270, h: 480 });
  const ok = await measure({ cur: green, frame0, autos: [magenta] });
  assert.equal(decideThumb(ok).kind, "match", JSON.stringify(ok));
  const ng = await measure({ cur: magenta, frame0, autos: [magenta] });
  assert.equal(decideThumb(ng).kind, "mismatch", JSON.stringify(ng));
});
