// 로컬 faster-whisper large-v3 전사 (video-caption-bot 파이프라인 재사용)
// - 원장님이 만든 transcribe_wx.py(전사) + correct.py(성명학 고정 교정사전) 호출
// - 격리된 임시 작업폴더에서 실행 → 원본 프로젝트 output/ 폴더 안 건드림
// - CPU 무거운 작업이라 직렬 큐로 1건씩 처리
import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const WHISPER_DIR =
  process.env.KNOP_WHISPER_DIR?.trim() || "C:/Users/iimoo/Desktop/video-caption-bot";
const WHISPER_PY =
  process.env.KNOP_WHISPER_PY?.trim() || path.join(WHISPER_DIR, "venv", "Scripts", "python.exe");
const MODEL = process.env.KNOP_WHISPER_MODEL?.trim() || "large-v3";
const DEVICE = process.env.KNOP_WHISPER_DEVICE?.trim() || "cuda"; // GPU 기본, 실패 시 스크립트가 cpu 폴백
const COMPUTE = process.env.KNOP_WHISPER_COMPUTE?.trim() || "float16";
// KNOP 전용 GPU 전사 스크립트 (원장님 영상 파이프라인 미변경). venv 파이썬으로 실행.
const GPU_SCRIPT = fileURLToPath(new URL("./py/transcribe_gpu.py", import.meta.url));

export function localTranscribeConfig() {
  return { dir: WHISPER_DIR, py: WHISPER_PY, model: MODEL, device: DEVICE, compute: COMPUTE };
}

export async function localTranscribeAvailable(): Promise<boolean> {
  try {
    await fs.access(WHISPER_PY);
    await fs.access(GPU_SCRIPT);
    return true;
  } catch {
    return false;
  }
}

function run(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, windowsHide: true });
    let err = "";
    const timer = setTimeout(() => {
      p.kill();
      reject(new Error(`전사 시간초과(${Math.round(timeoutMs / 1000)}s)`));
    }, timeoutMs);
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`실행 불가: ${e.message}`));
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`종료코드 ${code}: ${err.slice(-500)}`));
    });
  });
}

function ffmpegToWav(input: Buffer, srcExt: string, outPath: string): Promise<void> {
  const tmp = os.tmpdir();
  const safeExt = (srcExt || "").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "bin";
  const inPath = path.join(tmp, `trin-${randomUUID()}.${safeExt}`);
  return (async () => {
    await fs.writeFile(inPath, input);
    try {
      await run(
        "ffmpeg",
        ["-y", "-i", inPath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", outPath],
        os.tmpdir(),
        10 * 60 * 1000,
      );
    } finally {
      await fs.unlink(inPath).catch(() => {});
    }
  })();
}

// 직렬 큐: 무거운 CPU 전사를 1건씩
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job);
  // 큐 체인이 실패로 멈추지 않게
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export type LocalTranscript = {
  text: string;
  words: Array<{ word: string; start: number; end: number; speaker?: string }>;
};

// 대본 없는 통화도 주역/수리 용어 교정이 되게: fortune_terms.json 전체 용어를
// 가짜 대본(output/script.txt)으로 넣어 domain_snap의 '대본 게이트'를 전체 용어로 통과시킴.
// (원장님 원본 파이프라인 수정 없이, 격리 폴더에 입력만 제공)
async function prepareDomainTerms(job: string): Promise<number> {
  try {
    const src = path.join(WHISPER_DIR, "fortune_terms.json");
    const raw = await fs.readFile(src, "utf-8");
    const data = JSON.parse(raw);
    const terms: string[] = Array.isArray(data?.all)
      ? data.all
      : [...(data?.gwae || []), ...(data?.suri || [])];
    if (!terms.length) return 0;
    // correct.py 의 domain_snap 은 cwd 의 fortune_terms.json + output/script.txt 를 참조
    await fs.copyFile(src, path.join(job, "fortune_terms.json"));
    await fs.writeFile(path.join(job, "output", "script.txt"), terms.join("\n"), "utf-8");
    return terms.length;
  } catch (e: any) {
    console.error(`[KNOP] 주역/수리 용어 준비 실패(교정 생략): ${e?.message}`);
    return 0;
  }
}

// 오디오 버퍼 → 격리 폴더에서 large-v3 전사 + 성명학 교정(고정사전 + 주역/수리) → 전사 텍스트
export async function transcribeLocal(audio: Buffer, srcExt: string): Promise<LocalTranscript> {
  return enqueue(async () => {
    const job = path.join(os.tmpdir(), `knop-tr-${randomUUID()}`);
    const outDir = path.join(job, "output"); // 스크립트가 output/ 상대경로 사용
    await fs.mkdir(outDir, { recursive: true });
    const wav = path.join(job, "audio.wav");
    const wordsJson = path.join(job, "words.json");
    try {
      await ffmpegToWav(audio, srcExt, wav);
      const termCount = await prepareDomainTerms(job);
      if (termCount) console.log(`[KNOP] 주역/수리 용어 ${termCount}개 교정 활성화(대본 없이)`);
      // 1) 전사 (faster-whisper large-v3, GPU) — 4시간까지 고려해 넉넉히 3시간 타임아웃
      await run(
        WHISPER_PY,
        [GPU_SCRIPT, wav, wordsJson, MODEL, DEVICE, COMPUTE],
        job,
        180 * 60 * 1000,
      );
      // 2) 성명학 고정 교정사전 적용 (대본 없는 통화는 domain_snap은 자동 no-op)
      await run(WHISPER_PY, [path.join(WHISPER_DIR, "correct.py"), wordsJson], job, 5 * 60 * 1000).catch(
        (e) => {
          // 교정 실패해도 전사 자체는 살림
          console.error(`[KNOP] 통화 교정 단계 실패(전사는 유지): ${e.message}`);
        },
      );
      const raw = await fs.readFile(wordsJson, "utf-8");
      const parsed = JSON.parse(raw) as LocalTranscript;
      return {
        text: (parsed.text || "").trim(),
        words: Array.isArray(parsed.words) ? parsed.words : [],
      };
    } finally {
      await fs.rm(job, { recursive: true, force: true }).catch(() => {});
    }
  });
}
