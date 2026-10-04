// 네이버 클립 설명란 글 만들기 — 영상 대본을 읽고 시청자에게 영상 내용을 설명하는 글을 쓰고,
// 끝에 필수 해시태그를 항상 붙인다(해시태그는 AI 가 아니라 코드가 붙인다 → 빠지거나 바뀌지 않음).
import crypto from "crypto";
import { geminiText } from "./reviewPipeline/gemini";

/** 설명란 맨 끝에 항상 들어가는 해시태그(안대장님 지정) */
export const NAVER_CLIP_HASHTAGS = "#한국이름학교 #와츠유어네임이름연구협회";

const SYSTEM = `너는 '한국이름학교(와츠유어네임 이름연구협회)'의 네이버 클립 설명란 글을 쓴다.
영상 대본을 읽고, 이 영상이 어떤 내용인지 시청자에게 설명하는 글을 한국어로 쓴다.

규칙:
- 3~6문장, 250~450자 안팎. 존댓말. 자연스럽고 따뜻한 말투.
- 영상의 핵심 내용과 시청자가 얻을 수 있는 점을 설명한다. 대본의 문장을 그대로 길게 베끼지 않는다.
- 대본에 없는 사실(숫자·통계·사례·인물·경력)은 절대 지어내지 않는다.
- 효과를 단정하거나 과장하지 않는다(예: "반드시 운이 바뀐다" 같은 보장 표현 금지).
- 마지막 문장은 이름에 관심을 갖도록 부드럽게 권하는 한 문장.
- 해시태그(#), 링크, 전화번호, 마크다운(**, - 목록 등)은 쓰지 않는다. 이모지는 쓰지 않거나 최대 1개.
- 글만 출력한다(제목·머리말·따옴표 없이).`;

/** AI 출력 정리 + 필수 해시태그 붙이기(순수 함수) */
export function finalizeClipDescription(aiText: string): string {
  const body = String(aiText ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/^```[a-z]*\s*|\s*```$/gi, "")
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s+/, "").replace(/\*\*/g, "").trimEnd())
    // AI 가 해시태그를 넣었으면 지운다(해시태그는 아래에서 정해진 것만 붙임)
    .map((l) => l.replace(/(^|\s)#[^\s#]+/g, "$1").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return body ? `${body}\n\n${NAVER_CLIP_HASHTAGS}` : NAVER_CLIP_HASHTAGS;
}

// 같은 대본은 다시 만들지 않는다(서버 메모리 캐시, 최대 50건). "다시 쓰기"는 캐시를 건너뛴다.
const cache = new Map<string, string>();

export async function buildNaverClipDescription(
  title: string, script: string, opts: { regenerate?: boolean; generate?: (system: string, prompt: string) => Promise<string> } = {},
): Promise<string> {
  const s = String(script ?? "").trim();
  if (!s) throw new Error("이 배포에는 대본이 없어 영상 설명을 쓸 수 없습니다.");
  const key = crypto.createHash("sha256").update(`${title}\n${s}`).digest("hex");
  if (!opts.regenerate && cache.has(key)) return cache.get(key)!;
  const gen = opts.generate ?? ((sys: string, p: string) => geminiText(sys, p, 1200));
  const prompt = `영상 제목: ${title}\n\n영상 대본:\n${s.slice(0, 6000)}`;
  const text = finalizeClipDescription(await gen(SYSTEM, prompt));
  cache.set(key, text);
  if (cache.size > 50) cache.delete(cache.keys().next().value as string);
  return text;
}
