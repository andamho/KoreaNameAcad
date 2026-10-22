// 이미 올라간 유튜브 영상의 썸네일만 바꾸기 — 그림 형식 판별·JPEG 변환(2026-10-22, 달토끼 썸네일이 예전 표지로 남던 문제)
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "child_process";

const { imageExt, imageToJpeg } = await import("../../server/videoTools");

// ffmpeg 로 세로 1080×1920 PNG 한 장 만들기(썸네일과 같은 크기)
function makePng(): Buffer {
  const r = spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=1080x1920", "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"], { maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(String(r.stderr));
  return r.stdout;
}

test("그림 형식 판별: PNG·JPG·WebP, 나머지는 null", () => {
  assert.equal(imageExt(makePng()), ".png");
  assert.equal(imageExt(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), ".jpg");
  assert.equal(imageExt(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")])), ".webp");
  assert.equal(imageExt(Buffer.from("ftypisom-mp4-not-image")), null);
  assert.equal(imageExt(Buffer.alloc(0)), null);
});

test("PNG 썸네일 → 유튜브용 JPEG(가로 1280 이하, 2MB 이하, 비율 유지)", async () => {
  const jpg = await imageToJpeg(makePng());
  assert.equal(imageExt(jpg), ".jpg");
  assert.ok(jpg.length < 2 * 1024 * 1024, `${jpg.length}바이트`);
  const p = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", "-i", "-"], { input: jpg });
  const [w, h] = String(p.stdout).trim().split(",").map(Number);
  assert.equal(w, 1080);   // 1280 보다 작으면 그대로
  assert.equal(h, 1920);
});

test("그림이 아니면 거절", async () => {
  await assert.rejects(imageToJpeg(Buffer.from("not an image")), /PNG·JPG·WebP/);
});
