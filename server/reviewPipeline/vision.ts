import { geminiJson } from "./gemini";
import type { RedactionBox } from "@shared/schema";

/**
 * 후기 자동화 파이프라인의 AI 두뇌 (Google Gemini).
 * - 후기 이미지에서 본문 추출(OCR) + 개인정보 식별 + 문장 다듬기
 * - 게시 제목 5개 / 썸네일 문구 5개 / 썸네일 검색 키워드 생성
 * - 마스킹할 영역(정규화 박스) 추천
 */

export type VisionResult = {
  reviewType: "consultation" | "rename"; // 상담후기(이름분석) | 개명후기
  extractedText: string;          // 이미지에서 읽은 원문(개인정보 포함)
  polishedContent: string;        // 개인정보 제거·다듬은 게시용 본문(마크다운)
  detectedPersonalInfo: string[]; // 발견한 이름/연락처 등(로그·확인용)
  redactionBoxes: RedactionBox[]; // 마스킹할 정규화 박스(0~1)
  titleCandidates: string[];      // 게시 제목 후보 5
  thumbnailTitleCandidates: string[]; // 썸네일에 얹을 짧은 문구 후보 5
  thumbnailKeywords: string[];    // 스톡 이미지 검색 키워드(영문 우선)
};

const SYSTEM = `당신은 "한국이름학교"(작명·이름분석 상담소)의 후기 콘텐츠 편집자입니다.
고객이 보낸 후기 캡처 이미지를 받아, 홈페이지와 블로그에 올릴 수 있도록 가공합니다.

원칙:
- 개인정보(실명, 전화번호, 카카오/인스타 아이디, 주소, 자녀 실명, 계좌)는 본문에서 반드시 제거하거나 익명화(예: "ㅇㅇ님", "아이")합니다.
- 후기의 진심과 핵심 내용은 살리되, 오탈자·구어체를 자연스럽고 정중한 문장으로 다듬습니다. 내용을 과장하거나 없는 사실을 지어내지 않습니다.
- polishedContent는 **2~4개의 짧은 문단**으로 나누고, 문단과 문단 사이는 **반드시 빈 줄(줄바꿈 두 번, \\n\\n)** 로 구분합니다. 한 문단은 2~3문장 정도로.
- 상호는 "한국이름학교"로 표기합니다.
- 모든 출력 텍스트는 한국어입니다(thumbnailKeywords만 영어).
- titleCandidates 와 thumbnailTitleCandidates 는 각각 정확히 5개를 생성합니다.
- thumbnailKeywords: 첫 번째 제목(titleCandidates[0])에서 이미지로 표현할 핵심 단어를 뽑아 영어 스톡 사진 검색어 2~4개로 만듭니다. 구체 명사 우선(예: 자동차→car, 가족→family, 아기→baby), 제목이 추상적이면 분위기 단어(calm, hope 등).
- redactionBoxes(매우 중요): 이미지에 **눈에 보이는** 개인정보를 하나도 빠짐없이 가릴 사각형 목록입니다. 대상 = 실명(고객·자녀·지인 이름), 전화번호, 카카오톡/인스타 아이디·닉네임, 이메일, 주소, 계좌번호, 사람 얼굴. 좌표는 이미지 크기 대비 0~1 로 정규화(x,y=좌상단, w,h=너비/높이).
  · 해당 글자/얼굴을 **완전히 덮도록 넉넉하게**(주변 여백 포함) 박스를 잡으세요. 애매하면 크게.
  · 이미지에 개인정보가 보이는데 박스를 안 만드는 일은 없어야 합니다. 실제로 아무 개인정보도 안 보일 때만 빈 배열.
- reviewType: 후기가 '개명(이름 바꿈)' 경험 위주면 "rename", 이름 분석·작명·상담 경험 위주면 "consultation" 으로 분류합니다.`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    reviewType: { type: "STRING", enum: ["consultation", "rename"] },
    extractedText: { type: "STRING" },
    polishedContent: { type: "STRING" },
    detectedPersonalInfo: { type: "ARRAY", items: { type: "STRING" } },
    redactionBoxes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          x: { type: "NUMBER" },
          y: { type: "NUMBER" },
          w: { type: "NUMBER" },
          h: { type: "NUMBER" },
          reason: { type: "STRING" },
        },
        required: ["x", "y", "w", "h"],
      },
    },
    titleCandidates: { type: "ARRAY", items: { type: "STRING" } },
    thumbnailTitleCandidates: { type: "ARRAY", items: { type: "STRING" } },
    thumbnailKeywords: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["reviewType", "extractedText", "polishedContent", "detectedPersonalInfo", "redactionBoxes", "titleCandidates", "thumbnailTitleCandidates", "thumbnailKeywords"],
};

/** 후기 종류 → 썸네일 라벨 (대괄호 포함) */
export function labelForReviewType(t: string): string {
  return t === "rename" ? "[개명후기]" : "[이름분석 상담후기]";
}

const TITLES_SCHEMA = {
  type: "OBJECT",
  properties: { titles: { type: "ARRAY", items: { type: "STRING" } } },
  required: ["titles"],
};

const KEYWORDS_SCHEMA = {
  type: "OBJECT",
  properties: { keywords: { type: "ARRAY", items: { type: "STRING" } } },
  required: ["keywords"],
};

/** 제목에서 이미지로 표현할 핵심 단어 → 영어 스톡 검색어 2~4개 */
export async function keywordsFromTitle(title: string): Promise<string[]> {
  if (!title || !title.trim()) return [];
  const system = `제목에서 이미지(스톡 사진)로 표현할 핵심 단어를 뽑아, 영어 스톡 검색어 2~4개를 keywords 배열로 출력하세요.
- 구체 명사 우선(예: 자동차→car, 가족→family, 아기→baby, 바다→sea).
- 제목이 추상적이면 분위기 단어(calm, hope, warm 등).
- [대괄호 라벨]이나 상호명(한국이름학교)은 제외.`;
  try {
    const out = await geminiJson<{ keywords: string[] }>(system, [{ text: title }], KEYWORDS_SCHEMA, 200);
    return (out.keywords || []).slice(0, 4);
  } catch {
    return [];
  }
}

/**
 * 후기 본문을 바탕으로 게시 제목 5개를 새로 생성.
 * avoid: 이미 제안한 제목(중복 회피), preferences: 채팅별 취향 지침.
 */
export async function generateMoreTitles(content: string, preferences: string[] = [], avoid: string[] = []): Promise<string[]> {
  const prefBlock = preferences.length ? `\n[사용자 표준 지침 — 반드시 반영]\n${preferences.map(p => `- ${p}`).join("\n")}` : "";
  const avoidBlock = avoid.length ? `\n[이미 제안한 제목 — 이것들과 겹치지 말고 새로운 각도로]\n${avoid.map(t => `- ${t}`).join("\n")}` : "";
  const system = `당신은 "한국이름학교"(작명·이름분석 상담소)의 후기 편집자입니다.
아래 후기 본문을 바탕으로, 홈페이지/블로그 게시글 제목 후보를 정확히 5개 새로 지어 titles 배열로 출력하세요.
- 자연스럽고 클릭하고 싶게. 개인정보(실명 등) 없이. 한국어.
- 내용을 과장하거나 없는 사실을 지어내지 않습니다.${prefBlock}${avoidBlock}`;

  const out = await geminiJson<{ titles: string[] }>(system, [{ text: content || "" }], TITLES_SCHEMA, 500);
  return (out.titles || []).slice(0, 5);
}

/** 이미지 버퍼를 받아 후기 가공 결과를 반환. preferences: 채팅별 표준 지침 */
export async function analyzeReviewImage(imageBuffer: Buffer, mediaType: string, preferences: string[] = []): Promise<VisionResult> {
  const mt = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mediaType) ? mediaType : "image/jpeg";

  const system = preferences.length
    ? `${SYSTEM}\n\n[사용자 표준 지침 — 본문·제목·썸네일 문구에 반드시 반영]\n${preferences.map(p => `- ${p}`).join("\n")}`
    : SYSTEM;

  const out = await geminiJson<VisionResult>(
    system,
    [
      { inline_data: { mime_type: mt, data: imageBuffer.toString("base64") } },
      { text: "이 후기 이미지를 가공해 스키마에 맞는 JSON으로 출력하세요." },
    ],
    SCHEMA,
    2048,
  );

  // 방어적 정규화
  out.reviewType = out.reviewType === "rename" ? "rename" : "consultation";
  out.redactionBoxes = (out.redactionBoxes || []).filter(
    (b) => typeof b.x === "number" && typeof b.y === "number" && b.w > 0 && b.h > 0,
  );
  out.titleCandidates = (out.titleCandidates || []).slice(0, 5);
  out.thumbnailTitleCandidates = (out.thumbnailTitleCandidates || []).slice(0, 5);
  out.thumbnailKeywords = (out.thumbnailKeywords || []).slice(0, 6);
  out.detectedPersonalInfo = out.detectedPersonalInfo || [];
  return out;
}
