// 통화 녹음 → mp3 변환(ffmpeg) → Gemini 전사 + 요약
import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { geminiJson } from "../reviewPipeline/gemini";

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { windowsHide: true });
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", (e) => reject(new Error(`ffmpeg 실행 불가: ${e.message}`)));
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg 실패(code ${code}): ${err.slice(-500)}`)),
    );
  });
}

// 어떤 오디오든 Gemini 호환 mp3(모노 16k 64k)로 변환 → 용량도 줄임
async function toMp3(input: Buffer, srcExt: string): Promise<Buffer> {
  const tmp = os.tmpdir();
  // 확장자는 파일명에만 쓰고, 형식은 ffmpeg가 내용으로 자동 판별. 위험문자 제거.
  const safeExt = (srcExt || "").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "bin";
  const inPath = path.join(tmp, `callin-${randomUUID()}.${safeExt}`);
  const outPath = path.join(tmp, `callout-${randomUUID()}.mp3`);
  await fs.writeFile(inPath, input);
  try {
    await runFfmpeg(["-y", "-i", inPath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", outPath]);
    return await fs.readFile(outPath);
  } finally {
    await fs.unlink(inPath).catch(() => {});
    await fs.unlink(outPath).catch(() => {});
  }
}

const SYSTEM = `너는 한국어 전화 상담 녹음을 정리하는 도우미다. 오디오를 듣고:
- transcript: 대화를 최대한 정확히 전사한다. 가능하면 "상담사:", "고객:"으로 화자를 구분한다.
- summary: 상담 핵심을 3~5문장으로 요약한다(고객 고민, 결정사항, 안내 내용 등).
- actionItems: 통화 후 해야 할 일 목록(문자열 배열). 없으면 빈 배열.
- durationNote: 대략적 통화 성격(예: 이름분석 상담, 개명 문의 등). 모르면 "".
반드시 지정된 JSON 스키마로만 답한다. 오디오에 말소리가 없으면 transcript는 "", summary는 "음성 없음".`;

const SCHEMA = {
  type: "object",
  properties: {
    transcript: { type: "string" },
    summary: { type: "string" },
    actionItems: { type: "array", items: { type: "string" } },
    durationNote: { type: "string" },
  },
  required: ["transcript", "summary"],
};

export type CallAnalysis = {
  transcript: string;
  summary: string;
  actionItems: string[];
  durationNote: string;
};

// 이미 전사된 텍스트 → 요약 + 다음 할 일 (Gemini 텍스트, 저렴). 로컬 전사 뒤에 사용.
const SUMMARY_SYSTEM = `너는 한국어 전화 상담 전사본을 정리하는 도우미다. 전사 텍스트를 읽고:
- summary: 상담 핵심을 3~6문장으로 요약(고객 고민, 상담 내용, 결정사항).
- actionItems: 상담 후 해야 할 일(문자열 배열). 없으면 빈 배열.
반드시 지정된 JSON 스키마로만 답한다.`;

const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    actionItems: { type: "array", items: { type: "string" } },
  },
  required: ["summary"],
};

export async function summarizeTranscript(
  transcript: string,
): Promise<{ summary: string; actionItems: string[] }> {
  const text = transcript.trim();
  if (!text) return { summary: "음성 없음", actionItems: [] };
  const out = await geminiJson<{ summary: string; actionItems: string[] }>(
    SUMMARY_SYSTEM,
    [{ text: text.slice(0, 200000) }], // 매우 긴 전사 방어적 컷
    SUMMARY_SCHEMA,
    1024,
  );
  return { summary: out.summary || "", actionItems: Array.isArray(out.actionItems) ? out.actionItems : [] };
}

// 오디오 버퍼 → 전사/요약. srcExt는 원본 확장자(m4a/amr/mp3 등)
export async function transcribeCall(audio: Buffer, srcExt: string): Promise<CallAnalysis> {
  const mp3 = await toMp3(audio, srcExt);
  const base64 = mp3.toString("base64");
  const out = await geminiJson<CallAnalysis>(
    SYSTEM,
    [
      { text: "다음 통화 녹음을 전사하고 요약해줘." },
      { inline_data: { mime_type: "audio/mp3", data: base64 } },
    ],
    SCHEMA,
    4096,
  );
  return {
    transcript: out.transcript || "",
    summary: out.summary || "",
    actionItems: Array.isArray(out.actionItems) ? out.actionItems : [],
    durationNote: out.durationNote || "",
  };
}
