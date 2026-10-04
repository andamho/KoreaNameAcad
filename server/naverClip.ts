// 네이버 클립 설명란 글 만들기 — 영상 대본을 읽고 시청자에게 영상 내용을 설명하는 글 + 해시태그.
// 해시태그 = 필수 2개(코드가 항상 맨 앞에 붙임 → 빠지거나 바뀌지 않음) + 영상 내용에 맞는 해시태그(AI 제안, 코드가 정리).
import crypto from "crypto";
import { geminiJson } from "./reviewPipeline/gemini";

/** 설명란 해시태그 맨 앞에 항상 들어가는 2개(안대장님 지정) */
export const NAVER_CLIP_HASHTAGS = "#한국이름학교 #와츠유어네임이름연구협회";
const REQUIRED_TAGS = NAVER_CLIP_HASHTAGS.split(" ");
/** 내용 해시태그 최대 개수 */
export const MAX_TOPIC_TAGS = 6;
/** 설명란 전체(설명 + 해시태그) 최대 글자 수(안대장님 지정) */
export const MAX_TOTAL_CHARS = 300;
/** 글자 수(한글·이모지 모두 1자로 셈) */
export const charCount = (t: string) => Array.from(t).length;

const SYSTEM = `너는 '한국이름학교(와츠유어네임 이름연구협회)'의 네이버 클립 설명란 글을 쓴다.
영상 대본을 읽고 JSON 으로 두 가지를 낸다.

description: 이 영상이 어떤 내용인지 시청자에게 설명하는 글(한국어)
- 2~4문장, 공백 포함 150~200자. 절대 200자를 넘기지 않는다(해시태그까지 합쳐 300자 제한). 존댓말. 자연스럽고 따뜻한 말투.
- 영상의 핵심 내용과 시청자가 얻을 수 있는 점을 설명한다. 대본의 문장을 그대로 길게 베끼지 않는다.
- 대본에 없는 사실(숫자·통계·사례·인물·경력)은 절대 지어내지 않는다.
- 효과를 단정하거나 과장하지 않는다(예: "반드시 운이 바뀐다" 같은 보장 표현 금지).
- 마지막 문장은 이름에 관심을 갖도록 부드럽게 권하는 한 문장.
- 해시태그(#), 링크, 전화번호, 마크다운, 이모지는 쓰지 않는다.

hashtags: 이 영상 내용에 맞는 해시태그 3~5개(# 없이 짧은 단어만, 띄어쓰기 없이)
- 영상의 주제·핵심 단어·시청자가 검색할 만한 말(예: 이름풀이, 작명, 개명, 수리운, 이름운 등 내용에 해당하는 것).
- '한국이름학교', '와츠유어네임이름연구협회' 는 넣지 않는다(따로 붙인다).
- 내용과 관계없는 유행어·과장 표현은 넣지 않는다.`;

const SCHEMA = {
  type: "object",
  properties: {
    description: { type: "string" },
    hashtags: { type: "array", items: { type: "string" } },
  },
  required: ["description", "hashtags"],
};

/** 설명 글 정리(해시태그·마크다운 제거) */
function cleanBody(aiText: string): string {
  return String(aiText ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/^```[a-z]*\s*|\s*```$/gi, "")
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s+/, "").replace(/\*\*/g, "").trimEnd())
    .map((l) => l.replace(/(^|\s)#[^\s#]+/g, "$1").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 내용 해시태그 정리: # 붙이기, 공백·기호 제거, 필수 태그·중복 제외, 최대 MAX_TOPIC_TAGS 개 */
export function normalizeTopicTags(tags: unknown): string[] {
  const out: string[] = [];
  for (const t of Array.isArray(tags) ? tags : []) {
    const word = String(t ?? "").replace(/^#+/, "").replace(/[^가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9_]/g, "");
    if (!word || word.length > 20) continue;
    const tag = `#${word}`;
    if (REQUIRED_TAGS.includes(tag) || out.includes(tag)) continue;
    out.push(tag);
    if (out.length >= MAX_TOPIC_TAGS) break;
  }
  return out;
}

/** 설명을 글자 수 안으로: 문장 끝(. ? ! … 또는 '요'·'다')에서 자른다. 한 문장도 안 들어가면 글자 단위로 자르고 '…' */
function fitBody(body: string, max: number): string {
  if (max <= 0) return "";
  if (charCount(body) <= max) return body;
  const chars = Array.from(body);
  const cut = chars.slice(0, max).join("");
  let end = -1;
  for (let i = cut.length - 1; i >= 0; i--) {
    const ch = cut[i];
    const next = cut[i + 1];
    if ((".?!…".includes(ch) || "요다".includes(ch)) && (next === undefined || /\s/.test(next))) { end = i + 1; break; }
  }
  if (end > 0 && charCount(cut.slice(0, end).trim()) >= max * 0.5) return cut.slice(0, end).trim();
  return chars.slice(0, Math.max(0, max - 1)).join("").trimEnd() + "…";
}

/**
 * 최종 설명란 글 = 설명 + 빈 줄 + 필수 2개 + 내용 해시태그(순수 함수). 전체 MAX_TOTAL_CHARS 이하.
 * 넘치면 ① 내용 해시태그를 뒤에서부터 줄이고(최소 2개) ② 그래도 넘치면 설명을 문장 단위로 줄인다. 필수 2개는 항상 남긴다.
 */
export function finalizeClipDescription(aiText: string, topicTags: unknown = [], maxTotal = MAX_TOTAL_CHARS): string {
  const body = cleanBody(aiText);
  const topics = normalizeTopicTags(topicTags);
  const join = (b: string, t: string[]) => {
    const tags = [...REQUIRED_TAGS, ...t].join(" ");
    return b ? `${b}\n\n${tags}` : tags;
  };
  for (let n = topics.length; n >= Math.min(2, topics.length); n--) {
    const out = join(body, topics.slice(0, n));
    if (charCount(out) <= maxTotal) return out;
  }
  const t = topics.slice(0, 2);
  const room = maxTotal - charCount(join("", t)) - 2; // 빈 줄 2자
  return join(fitBody(body, room), t);
}

// 같은 대본은 다시 만들지 않는다(서버 메모리 캐시, 최대 50건). "다시 쓰기"는 캐시를 건너뛴다.
const cache = new Map<string, string>();

type Gen = (system: string, prompt: string) => Promise<{ description: string; hashtags: string[] }>;

/** 수정 방향 요청 최대 길이 */
export const MAX_INSTRUCTION_CHARS = 300;

/**
 * @param opts.instruction  안대장님이 적은 수정 방향(예: "더 짧게", "질문으로 시작"). 있으면 이전 글을 이 방향으로 고쳐 쓴다.
 * @param opts.previous     지금 화면의 설명글(수정 방향과 함께 넘김)
 * 요청이 있어도 규칙(대본에 없는 사실 금지·보장 표현 금지·300자·필수 해시태그)은 그대로다 — 충돌하면 규칙 우선.
 */
export async function buildNaverClipDescription(
  title: string, script: string,
  opts: { regenerate?: boolean; instruction?: string; previous?: string; generate?: Gen } = {},
): Promise<string> {
  const s = String(script ?? "").trim();
  if (!s) throw new Error("이 배포에는 대본이 없어 영상 설명을 쓸 수 없습니다.");
  const instruction = Array.from(String(opts.instruction ?? "").trim()).slice(0, MAX_INSTRUCTION_CHARS).join("");
  const previous = Array.from(String(opts.previous ?? "").trim()).slice(0, 1000).join("");
  const key = crypto.createHash("sha256").update(`v3\n${title}\n${s}`).digest("hex");
  if (!opts.regenerate && !instruction && cache.has(key)) return cache.get(key)!;
  const gen: Gen = opts.generate ?? ((sys, p) => geminiJson(sys, [{ text: p }], SCHEMA, 1500, 0.5));
  let prompt = `영상 제목: ${title}\n\n영상 대본:\n${s.slice(0, 6000)}`;
  if (instruction) {
    prompt +=
      (previous ? `\n\n지금 설명글(이전 버전):\n${previous}` : "") +
      `\n\n수정 요청: ${instruction}\n` +
      `위 요청을 반영해 설명글과 해시태그를 다시 쓴다. 단, 시스템 규칙(대본에 없는 사실 금지, 보장·과장 표현 금지, 200자 이내, ` +
      `해시태그 규칙)은 그대로 지킨다. 요청이 규칙과 충돌하면 규칙을 따른다.`;
  }
  const r = await gen(SYSTEM, prompt);
  const text = finalizeClipDescription(r?.description ?? "", r?.hashtags ?? []);
  cache.set(key, text);
  if (cache.size > 50) cache.delete(cache.keys().next().value as string);
  return text;
}
