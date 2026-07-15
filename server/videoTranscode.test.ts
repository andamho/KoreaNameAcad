// transcodeFileToH264 실경로 테스트 — ffmpeg로 합성영상 생성 → 변환 → ffprobe로 검증.
// 실행: node --import tsx/esm --test server/videoTranscode.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "child_process";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { transcodeFileToH264 } from "./videoTools";

function tmp(ext: string) {
  return path.join(os.tmpdir(), `trtest-${randomUUID()}.${ext}`);
}
function clean(p: string) { try { if (existsSync(p)) unlinkSync(p); } catch { /* ignore */ } }

// WxH 합성영상 생성. audio=true면 무음 오디오 트랙 추가.
function synth(w: number, h: number, audio: boolean): string {
  const out = tmp("mp4");
  const args = [
    "-f", "lavfi", "-i", `testsrc=size=${w}x${h}:rate=15:duration=0.5`,
  ];
  if (audio) args.push("-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-shortest");
  // 입력은 일부러 HEVC로 만들어 재변환 경로를 밟게 함
  args.push("-c:v", "libx265", "-pix_fmt", "yuv420p");
  if (audio) args.push("-c:a", "aac");
  args.push("-y", out);
  const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error("synth 실패: " + (r.stderr || "").slice(-500));
  return out;
}

// 변환 출력(Buffer)의 코덱/해상도/오디오 유무 반환
function probe(buf: Buffer): { w: number; h: number; vcodec: string; hasAudio: boolean } {
  const p = tmp("mp4");
  writeFileSync(p, buf);
  try {
    const r = spawnSync("ffprobe", [
      "-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height",
      "-of", "default=noprint_wrappers=1", p,
    ], { encoding: "utf8" });
    const out = r.stdout || "";
    const wsm = out.match(/width=(\d+)/);
    const hsm = out.match(/height=(\d+)/);
    const vc = out.match(/codec_name=(\w+)/);
    return {
      w: wsm ? +wsm[1] : 0,
      h: hsm ? +hsm[1] : 0,
      vcodec: vc ? vc[1] : "",
      hasAudio: /codec_type=audio/.test(out),
    };
  } finally { clean(p); }
}

async function run(w: number, h: number, audio: boolean) {
  const inp = synth(w, h, audio);
  try {
    const out = await transcodeFileToH264(inp);
    return probe(out);
  } finally { clean(inp); }
}

test("1080x1920 + 오디오 → h264 유지 + 오디오 보존 + 캡 이내", async () => {
  const r = await run(1080, 1920, true);
  assert.equal(r.vcodec, "h264");
  assert.ok(r.hasAudio, "오디오 트랙 보존되어야 함");
  assert.ok(r.w <= 1080 && r.h <= 1920, `캡 초과: ${r.w}x${r.h}`);
  assert.equal(r.w, 1080); assert.equal(r.h, 1920);
});

test("오디오 없는 영상 → 에러 없이 h264 (오디오 없음)", async () => {
  const r = await run(1080, 1920, false);
  assert.equal(r.vcodec, "h264");
  assert.equal(r.hasAudio, false);
});

test("3:4 (1500x2000) → 가로 1080 캡, 비율 유지 → 1080x1440", async () => {
  const r = await run(1500, 2000, false);
  assert.equal(r.w, 1080);
  assert.equal(r.h, 1440);
});

test("9:16 720x1280 → 업스케일 안 함 → 720x1280 유지", async () => {
  const r = await run(720, 1280, false);
  assert.equal(r.w, 720);
  assert.equal(r.h, 1280);
});

test("극단 세로 400x3000 → 세로 1920 캡 → 짝수치수", async () => {
  const r = await run(400, 3000, false);
  assert.ok(r.h <= 1920, `세로 캡 초과: ${r.h}`);
  assert.ok(r.w % 2 === 0 && r.h % 2 === 0, `짝수 치수 아님: ${r.w}x${r.h}`);
  // 400/3000 비율로 세로 1920이면 가로 = round(400*1920/3000)=256(짝수)
  assert.equal(r.h, 1920);
  assert.equal(r.w, 256);
});
