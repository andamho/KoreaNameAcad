import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesPII } from "../../server/reviewPipeline/ocr";
import { remapToCrop, headerBand } from "../../server/reviewPipeline/maskBoxes";

test("matchesPII: 3글자 이상은 1글자 오독 허용 (최주희 → OCR 최수희)", () => {
  assert.equal(matchesPII("최수희", "최주희"), true);
  assert.equal(matchesPII("최주흐", "최주희"), true);
  assert.equal(matchesPII("260664", "260604"), true);
});

test("matchesPII: 기존 포함 매칭 유지 (조사·성 분리)", () => {
  assert.equal(matchesPII("주희가", "주희"), true);
  assert.equal(matchesPII("주희", "최주희"), true);
});

test("matchesPII: 2글자·일반 단어는 오독 허용 안 함", () => {
  assert.equal(matchesPII("수희", "주희"), false);
  assert.equal(matchesPII("최수호", "최주희"), false);
  assert.equal(matchesPII("이름의", "최주희"), false);
  assert.equal(matchesPII("알게되었구요", "최주희"), false);
});

test("remapToCrop: 원본 좌표 → 잘린 이미지 좌표", () => {
  const b = { x: 0.1, y: 0.5, w: 0.2, h: 0.1 };
  const m = remapToCrop(b, { image: 0, top: 200, bottom: 800 })!;
  assert.ok(Math.abs(m.y - 0.5) < 1e-9);          // (0.5-0.2)/0.6
  assert.ok(Math.abs(m.h - 0.1 / 0.6) < 1e-9);
  assert.equal(m.x, 0.1);
  assert.equal(remapToCrop({ x: 0, y: 0.05, w: 0.1, h: 0.05 }, { image: 0, top: 200, bottom: 800 }), null); // 잘려나간 구간
  assert.deepEqual(remapToCrop(b, undefined), b);
});

test("headerBand: 채팅 캡처(crop.top>0)만 헤더 띠, 너비 전체", () => {
  assert.equal(headerBand(undefined, 0), null);
  assert.equal(headerBand({ image: 0, top: 0, bottom: 1000 }, 0), null);
  const band = headerBand({ image: 1, top: 60, bottom: 1000 }, 1)!;
  assert.equal(band.x, 0); assert.equal(band.w, 1); assert.equal(band.y, 0); assert.equal(band.image, 1);
  assert.ok(band.h >= 0.035 && band.h <= 0.25);
  // 짧게 잘린 이미지일수록 헤더가 차지하는 비율이 커진다
  const short = headerBand({ image: 0, top: 100, bottom: 400 }, 0)!;
  assert.ok(short.h > band.h);
});
