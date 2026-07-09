// ── ffmpeg 기반 영상 도구 (인스타용 H.264 변환 / 썸네일 프레임 추출) ──
// 로컬(개발)엔 ffmpeg가 PATH에 있음. Cloud Run 배포 시 컨테이너에 ffmpeg 설치 필요.
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import os from "os";
import path from "path";
import fs from "fs/promises";

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { windowsHide: true });
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", (e) => reject(new Error(`ffmpeg 실행 불가: ${e.message}`)));
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg 실패(code ${code}): ${err.slice(-600)}`)),
    );
  });
}

/** 인스타 릴스용 H.264 mp4로 변환 (HEVC 등 → H.264/AAC, faststart) */
export async function transcodeToH264(input: Buffer): Promise<Buffer> {
  const tmp = os.tmpdir();
  const inPath = path.join(tmp, `igin-${randomUUID()}.mp4`);
  const outPath = path.join(tmp, `igout-${randomUUID()}.mp4`);
  await fs.writeFile(inPath, input);
  try {
    await runFfmpeg([
      "-i", inPath,
      "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p",
      "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", // 짝수 치수 보장
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      "-y", outPath,
    ]);
    return await fs.readFile(outPath);
  } finally {
    await fs.unlink(inPath).catch(() => {});
    await fs.unlink(outPath).catch(() => {});
  }
}

/** 지정 시점(초) 프레임을 JPEG로 추출 (유튜브 커스텀 썸네일용) */
export async function extractFrameJpeg(input: Buffer, atSeconds = 0.25): Promise<Buffer> {
  const tmp = os.tmpdir();
  const inPath = path.join(tmp, `frin-${randomUUID()}.mp4`);
  const outPath = path.join(tmp, `frout-${randomUUID()}.jpg`);
  await fs.writeFile(inPath, input);
  try {
    await runFfmpeg([
      "-ss", String(atSeconds),
      "-i", inPath,
      "-frames:v", "1",
      "-q:v", "2",
      "-y", outPath,
    ]);
    return await fs.readFile(outPath);
  } finally {
    await fs.unlink(inPath).catch(() => {});
    await fs.unlink(outPath).catch(() => {});
  }
}
