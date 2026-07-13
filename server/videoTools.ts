// ── ffmpeg 기반 영상 도구 (인스타용 H.264 변환 / 썸네일 프레임 추출) ──
// 진단 강화판: 종료 code+signal, 실행시간, 입력 ffprobe, 출력크기, stderr tail을 기록.
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import os from "os";
import path from "path";
import fs from "fs/promises";
import { ObjectStorageService, validateR2VideoKey } from "./object_storage/objectStorage";

interface FfResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  stderrTail: string;
}

function sysDiag(): string {
  const mem = process.memoryUsage();
  return (
    `rss=${(mem.rss / 1024 / 1024).toFixed(0)}MB ` +
    `freemem=${(os.freemem() / 1024 / 1024).toFixed(0)}/${(os.totalmem() / 1024 / 1024).toFixed(0)}MB ` +
    `uptime=${process.uptime().toFixed(0)}s`
  );
}

/**
 * ffmpeg 실행 — 자체 timeout/kill 없음(확인용).
 * error/close 이벤트를 단일 settle 가드로 처리(Promise 1회만 종료).
 * 종료 code+signal+killed+pid+실행시간+stderr(마지막 ~30KB)를 반환/에러에 포함.
 * args엔 임시파일 경로만 들어감(서명URL·토큰 없음 → 로그 안전).
 */
function runFfmpeg(args: string[], label: string): Promise<FfResult> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    let p: ReturnType<typeof spawn>;
    try {
      p = spawn("ffmpeg", args, { windowsHide: true });
    } catch (e: any) {
      return finish(() => reject(new Error(`[${label}] ffmpeg spawn 예외: ${e?.message}`)));
    }
    const pid = p.pid;
    let err = "";
    p.stderr?.on("data", (d) => {
      err += d.toString();
      if (err.length > 30000) err = err.slice(-30000); // 마지막 ~30KB만 보존(메모리 폭증 방지)
    });
    p.on("error", (e: any) => {
      finish(() => reject(new Error(`[${label}] ffmpeg spawn error: ${e?.message} (errno=${e?.code}) pid=${pid}`)));
    });
    p.on("close", (code, signal) => {
      const durationMs = Date.now() - start;
      const stderrTail = err.split("\n").slice(-60).join("\n"); // 마지막 60줄
      // Railway 로그에도 남김 (원인 확정용 핵심: signal/killed)
      console.log(
        `[ffmpeg:${label}] pid=${pid} code=${code} signal=${signal} killed=${p.killed} dur=${(durationMs / 1000).toFixed(1)}s ${sysDiag()}`,
      );
      finish(() => {
        if (code === 0) {
          resolve({ code, signal, durationMs, stderrTail });
        } else {
          reject(new Error(
            `[${label}] ffmpeg 실패 code=${code} signal=${signal} killed=${p.killed} pid=${pid} ` +
            `실행=${(durationMs / 1000).toFixed(1)}s ${sysDiag()}\n--- stderr(tail 60줄) ---\n${stderrTail}`,
          ));
        }
      });
    });
  });
}

/** ffprobe로 입력 파일 정보(코덱/해상도/길이/비트레이트) 요약. 실패해도 문자열만 반환. */
async function ffprobeInfo(filePath: string): Promise<string> {
  return new Promise((resolve) => {
    try {
      const p = spawn(
        "ffprobe",
        [
          "-v", "error",
          "-show_entries",
          "stream=codec_type,codec_name,width,height,duration,bit_rate:format=duration,size,bit_rate",
          "-of", "default=noprint_wrappers=1",
          "-i", filePath,
        ],
        { windowsHide: true },
      );
      let out = "";
      p.stdout?.on("data", (d) => (out += d.toString()));
      p.stderr?.on("data", (d) => (out += d.toString()));
      p.on("error", () => resolve("(ffprobe 실행불가)"));
      p.on("close", () => resolve(out.trim().replace(/\s*\n\s*/g, " | ")));
    } catch {
      resolve("(ffprobe 예외)");
    }
  });
}

// 공통 ffmpeg 변환 args (다운스케일·코덱). preset/threads는 아직 미확정(Railway 진단 후 결정).
// 비율 보존 + 가로≤1080·세로≤1920 캡 + 업스케일 금지 + 짝수치수(force_divisible_by=2). 크롭·패딩·왜곡 없음.
// 검증: 4320x5760→1080x1440, 720x4000→346x1920, 4000x720→1080x194, 720x1280→720x1280(업스케일X).
function transcodeArgs(inPath: string, outPath: string): string[] {
  return [
    "-i", inPath,
    "-vf", "scale=w='min(iw,1080)':h='min(ih,1920)':force_original_aspect_ratio=decrease:force_divisible_by=2",
    "-c:v", "libx264", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    "-y", outPath,
  ];
}

// 출력 파일 크기 상한(비정상 폭주 방지). 1080p 60초면 보통 수십 MB.
const MAX_OUTPUT_BYTES = 200 * 1024 * 1024;

// ── 동시 대용량 변환 제한(1개) — 같은 서버에서 여러 변환 동시 실행 방지(메모리/CPU 폭주 방지) ──
let transcodeInFlight = 0;
const MAX_CONCURRENT_TRANSCODE = 1;

/**
 * 로컬 파일을 H.264 mp4로 변환하는 공통 코어(Buffer/R2 경로가 함께 사용).
 * inputPath는 이미 로컬에 준비된 파일. 출력 임시파일은 이 함수가 만들고 지움.
 * 동시성 제한 적용. 진단(입력ffprobe/code/signal/시간/출력크기) 로깅.
 */
export async function transcodeFileToH264(
  inputPath: string,
  opts?: { onPhase?: (p: string) => void },
): Promise<Buffer> {
  if (transcodeInFlight >= MAX_CONCURRENT_TRANSCODE) {
    throw new Error(`변환 동시 실행 한도 초과(${MAX_CONCURRENT_TRANSCODE}) — 잠시 후 재시도`);
  }
  transcodeInFlight++;
  const outPath = path.join(os.tmpdir(), `igout-${randomUUID()}.mp4`);
  opts?.onPhase?.("probing");
  const inInfo = await ffprobeInfo(inputPath);
  console.log(`[transcode] 시작 입력파일=${inputPath} 정보={ ${inInfo} } ${sysDiag()}`);
  try {
    opts?.onPhase?.("transcoding");
    const r = await runFfmpeg(transcodeArgs(inputPath, outPath), "transcode");
    const st = await fs.stat(outPath);
    if (st.size > MAX_OUTPUT_BYTES) {
      throw new Error(`출력이 너무 큼(${(st.size / 1024 / 1024).toFixed(0)}MB > ${MAX_OUTPUT_BYTES / 1024 / 1024}MB)`);
    }
    const out = await fs.readFile(outPath);
    console.log(`[transcode] 성공 출력=${(out.length / 1024 / 1024).toFixed(1)}MB 실행=${(r.durationMs / 1000).toFixed(1)}s`);
    return out;
  } catch (e: any) {
    let outInfo = "출력없음";
    try {
      const st = await fs.stat(outPath);
      outInfo = `출력 ${(st.size / 1024 / 1024).toFixed(2)}MB`;
    } catch {
      /* 출력파일 없음 */
    }
    throw new Error(`${e?.message}\n[진단] 입력 { ${inInfo} } | ${outInfo}`);
  } finally {
    transcodeInFlight--;
    await fs.unlink(outPath).catch(() => {});
  }
}

/**
 * 인스타/틱톡용 H.264 mp4로 변환 (Buffer 입력 — 기존 계약 유지).
 * 소용량용. 대용량 원본은 transcodeR2VideoToH264(스트리밍) 권장.
 */
export async function transcodeToH264(input: Buffer): Promise<Buffer> {
  const inPath = path.join(os.tmpdir(), `igin-${randomUUID()}.mp4`);
  await fs.writeFile(inPath, input);
  try {
    return await transcodeFileToH264(inPath);
  } finally {
    await fs.unlink(inPath).catch(() => {});
  }
}

/**
 * R2 영상 키로부터 직접 변환 (대용량 원본 스트리밍 — 전체 Buffer 미생성, A 방식).
 * 검증된 R2 키만 허용(SSRF/경로 안전) → SDK로 스트림→임시입력파일 → 공통 코어.
 * 다운로드/변환 시간 분리, 스트림 실패와 인코딩 실패 구분.
 */
export async function transcodeR2VideoToH264(
  r2Key: string,
  opts?: { onPhase?: (p: string) => void },
): Promise<Buffer> {
  const key = validateR2VideoKey(r2Key);
  const inPath = path.join(os.tmpdir(), `igin-${randomUUID()}.mp4`);
  const store = new ObjectStorageService();
  try {
    opts?.onPhase?.("downloading");
    let dl;
    try {
      dl = await store.streamObjectToFile(key, inPath, { maxBytes: 2 * 1024 * 1024 * 1024 });
    } catch (e: any) {
      throw new Error(`R2 다운로드 실패: ${e?.message}`); // 인코딩 실패와 명확히 구분
    }
    if (dl.contentType && !dl.contentType.startsWith("video/")) {
      throw new Error(`영상이 아님(ContentType=${dl.contentType})`);
    }
    console.log(`[transcode:R2] 다운로드 ${(dl.bytes / 1024 / 1024).toFixed(1)}MB ${dl.downloadMs}ms type=${dl.contentType}`);
    return await transcodeFileToH264(inPath, opts);
  } finally {
    await fs.unlink(inPath).catch(() => {});
  }
}

/** 지정 시점(초) 프레임을 JPEG로 추출 (유튜브 커스텀 썸네일용) */
export async function extractFrameJpeg(input: Buffer, atSeconds = 0.25): Promise<Buffer> {
  const tmp = os.tmpdir();
  const inPath = path.join(tmp, `frin-${randomUUID()}.mp4`);
  const outPath = path.join(tmp, `frout-${randomUUID()}.jpg`);
  await fs.writeFile(inPath, input);
  try {
    await runFfmpeg(["-ss", String(atSeconds), "-i", inPath, "-frames:v", "1", "-q:v", "2", "-y", outPath], "thumbnail");
    return await fs.readFile(outPath);
  } finally {
    await fs.unlink(inPath).catch(() => {});
    await fs.unlink(outPath).catch(() => {});
  }
}
