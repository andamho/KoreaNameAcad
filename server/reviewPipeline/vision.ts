import { geminiJson, type GeminiPart } from "./gemini";
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
  imageOrder?: number[];          // 게시 이미지 순서(내용→증빙)
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
- redactionBoxes(매우 중요): 이미지에 **눈에 보이는** 개인정보를 하나도 빠짐없이 가릴 박스 목록입니다. 대상 = 실명(고객·자녀·지인 이름), 전화번호, 카카오톡/인스타 아이디·닉네임, 이메일, 주소, 계좌번호, 사람 얼굴.
  · 각 박스는 box_2d = [ymin, xmin, ymax, xmax] 형식이며 각 값은 이미지 대비 0~1000 정규화 정수입니다(왼쪽 위가 0,0).
  · **이름/번호가 적힌 글자 줄 전체를 정확히 감싸도록** 박스를 잡으세요. 글자보다 살짝 크게 잡아 완전히 덮이게 합니다.
  · 이미지에 개인정보가 보이는데 박스를 안 만드는 일은 없어야 합니다. 실제로 아무 개인정보도 안 보일 때만 빈 배열.
- reviewType: 후기가 '개명(이름 바꿈)' 경험 위주면 "rename", 이름 분석·작명·상담 경험 위주면 "consultation" 으로 분류합니다.

[여러 장이 올라온 경우]
- 이미지들은 (1) 후기 본문이 한 장에 안 들어가 이어지는 페이지이거나, (2) 후기가 진짜임을 증빙하려고 첨부한 이미지(내용 일부만 보이거나 다른 대화가 섞임)일 수 있습니다.
- 모든 장에서 후기 본문 내용을 추출하고, 이어지는 내용은 순서대로 자연스럽게 이어 하나의 polishedContent로 통합합니다(중복 짜깁기 금지).
- 개인정보는 모든 장(본문·증빙 포함)에서 빠짐없이 redactionBoxes로 마스킹하고, 각 박스에 image(0부터) 인덱스를 반드시 넣습니다.
- imageOrder: 후기 본문이 온전히 담긴 장을 내용 순서대로 먼저 나열하고, 그다음에 증빙용(일부만/대화 섞인) 장을 나열합니다.`;

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
          box_2d: {
            type: "ARRAY", items: { type: "INTEGER" },
            description: "가릴 영역 박스 [ymin, xmin, ymax, xmax], 각 값은 이미지 크기 대비 0~1000 정규화.",
          },
          reason: { type: "STRING" },
          image: { type: "INTEGER", description: "몇 번째 이미지인지(0부터). 여러 장일 때 필수." },
        },
        required: ["box_2d"],
      },
    },
    titleCandidates: { type: "ARRAY", items: { type: "STRING" } },
    thumbnailTitleCandidates: { type: "ARRAY", items: { type: "STRING" } },
    thumbnailKeywords: { type: "ARRAY", items: { type: "STRING" } },
    imageOrder: {
      type: "ARRAY", items: { type: "INTEGER" },
      description: "게시할 이미지 최종 순서(인덱스 0부터). 후기 본문이 온전히 담긴 장을 내용 순서대로 먼저, 증빙용(내용 일부만/대화 섞임) 장을 뒤에.",
    },
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

const NAMESTORY_SCHEMA = {
  type: "OBJECT",
  properties: {
    titleCandidates: { type: "ARRAY", items: { type: "STRING" } },
    thumbnailTitleCandidates: { type: "ARRAY", items: { type: "STRING" } },
    thumbnailKeywords: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["titleCandidates", "thumbnailTitleCandidates", "thumbnailKeywords"],
};

/** 이름이야기(사용자가 쓴 글) → 제목5·썸네일문구5·썸네일 검색어. 글 내용은 바꾸지 않음. */
export async function analyzeNameStoryText(text: string, preferences: string[] = []): Promise<{ titleCandidates: string[]; thumbnailTitleCandidates: string[]; thumbnailKeywords: string[] }> {
  const prefBlock = preferences.length ? `\n[사용자 표준 지침 — 제목·문구에 반영]\n${preferences.map(p => `- ${p}`).join("\n")}` : "";
  const system = `당신은 "한국이름학교"의 "이름이야기" 콘텐츠 편집자입니다. 아래 글을 바탕으로 게시용 메타데이터만 생성하세요(글 내용 자체는 바꾸지 않음).
- titleCandidates: 게시글 제목 후보 정확히 5개. 자연스럽고 클릭하고 싶게. 한국어.
- thumbnailTitleCandidates: 썸네일에 크게 얹을 짧은 문구 정확히 5개(각 6~16자).
- thumbnailKeywords: 첫 제목(titleCandidates[0])의 핵심 단어를 영어 스톡 사진 검색어 2~4개로. 구체 명사 우선.${prefBlock}`;
  const out = await geminiJson<{ titleCandidates: string[]; thumbnailTitleCandidates: string[]; thumbnailKeywords: string[] }>(
    system, [{ text: text || "" }], NAMESTORY_SCHEMA, 700,
  );
  return {
    titleCandidates: (out.titleCandidates || []).slice(0, 5),
    thumbnailTitleCandidates: (out.thumbnailTitleCandidates || []).slice(0, 5),
    thumbnailKeywords: (out.thumbnailKeywords || []).slice(0, 6),
  };
}

/** 사용자가 띄어쓰기로 입력한 키워드(한글 등)를 영어 스톡 검색어로 변환 */
export async function toEnglishKeywords(input: string): Promise<string[]> {
  const t = (input || "").trim();
  if (!t) return [];
  const system = `사용자가 띄어쓰기로 나열한 이미지 검색 키워드를 영어 스톡 사진 검색어로 변환하세요.
- 각 단어를 자연스러운 영어로(예: 축소판→miniature, 하늘→sky, 바다→sea, 가족→family). 이미 영어면 그대로.
- keywords 배열로 출력.`;
  try {
    const out = await geminiJson<{ keywords: string[] }>(system, [{ text: t }], KEYWORDS_SCHEMA, 200);
    const kw = (out.keywords || []).map((k) => k.trim()).filter(Boolean);
    return kw.length ? kw.slice(0, 6) : t.split(/\s+/).slice(0, 6);
  } catch {
    return t.split(/\s+/).slice(0, 6);
  }
}

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

/** 후기 본문 기반으로 썸네일에 얹을 짧은 문구 5개를 새로 생성 */
export async function generateMoreThumbnailTitles(content: string, preferences: string[] = [], avoid: string[] = []): Promise<string[]> {
  const prefBlock = preferences.length ? `\n[사용자 표준 지침 — 반드시 반영]\n${preferences.map(p => `- ${p}`).join("\n")}` : "";
  const avoidBlock = avoid.length ? `\n[이미 제안한 문구 — 겹치지 말고 새로운 각도로]\n${avoid.map(t => `- ${t}`).join("\n")}` : "";
  const system = `당신은 "한국이름학교" 후기 썸네일 카피라이터입니다.
아래 후기 본문을 바탕으로, 썸네일 이미지에 크게 얹을 짧고 임팩트 있는 문구를 정확히 5개 새로 지어 titles 배열로 출력하세요.
- 각 6~16자 정도로 짧게, 클릭하고 싶게. 개인정보 없이. 한국어.
- 과장하거나 없는 사실을 지어내지 않습니다.${prefBlock}${avoidBlock}`;
  const out = await geminiJson<{ titles: string[] }>(system, [{ text: content || "" }], TITLES_SCHEMA, 400);
  return (out.titles || []).slice(0, 5);
}

/** 여러 장(또는 한 장)의 후기 이미지를 함께 분석해 통합 결과를 반환. preferences: 채팅별 표준 지침 */
export async function analyzeReviewImages(imageBuffers: Buffer[], mediaType: string, preferences: string[] = []): Promise<VisionResult> {
  const mt = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mediaType) ? mediaType : "image/jpeg";
  const n = imageBuffers.length;

  const system = preferences.length
    ? `${SYSTEM}\n\n[사용자 표준 지침 — 본문·제목·썸네일 문구에 반드시 반영]\n${preferences.map(p => `- ${p}`).join("\n")}`
    : SYSTEM;

  const parts: GeminiPart[] = [];
  imageBuffers.forEach((buf, i) => {
    parts.push({ text: `[이미지 ${i}]` });
    parts.push({ inline_data: { mime_type: mt, data: buf.toString("base64") } });
  });
  parts.push({
    text: n > 1
      ? `위 ${n}장은 한 후기(고객 한 명)의 이미지들입니다. 내용을 모두 추출·통합하고, 각 redactionBox에 image 인덱스(0~${n - 1})를 넣고, imageOrder(내용 장 먼저 → 증빙 장 뒤)를 채워 스키마 JSON으로 출력하세요.`
      : "이 후기 이미지를 가공해 스키마에 맞는 JSON으로 출력하세요.",
  });

  const out = await geminiJson<VisionResult>(system, parts, SCHEMA, n > 1 ? 6000 : 2500);

  // 방어적 정규화
  out.reviewType = out.reviewType === "rename" ? "rename" : "consultation";
  // box_2d([ymin,xmin,ymax,xmax] 0~1000) → 내부 x,y,w,h(0~1) 변환
  const rawBoxes: any[] = (out as any).redactionBoxes || [];
  out.redactionBoxes = rawBoxes.map((b) => {
    let x: number, y: number, w: number, h: number;
    if (Array.isArray(b.box_2d) && b.box_2d.length === 4) {
      const ymin = Number(b.box_2d[0]), xmin = Number(b.box_2d[1]), ymax = Number(b.box_2d[2]), xmax = Number(b.box_2d[3]);
      x = Math.min(xmin, xmax) / 1000; y = Math.min(ymin, ymax) / 1000;
      w = Math.abs(xmax - xmin) / 1000; h = Math.abs(ymax - ymin) / 1000;
    } else {
      x = Number(b.x); y = Number(b.y); w = Number(b.w); h = Number(b.h);
    }
    const image = typeof b.image === "number" && b.image >= 0 && b.image < n ? b.image : 0;
    return { x, y, w, h, reason: b.reason, image } as RedactionBox;
  }).filter((b) => Number.isFinite(b.x) && Number.isFinite(b.y) && b.w > 0 && b.h > 0);
  out.titleCandidates = (out.titleCandidates || []).slice(0, 5);
  out.thumbnailTitleCandidates = (out.thumbnailTitleCandidates || []).slice(0, 5);
  out.thumbnailKeywords = (out.thumbnailKeywords || []).slice(0, 6);
  out.detectedPersonalInfo = out.detectedPersonalInfo || [];
  // imageOrder 정규화: 유효 인덱스만, 누락분은 뒤에 원래 순서로 채움
  const order = (out.imageOrder || []).filter((i) => Number.isInteger(i) && i >= 0 && i < n);
  const seen = new Set(order);
  for (let i = 0; i < n; i++) if (!seen.has(i)) order.push(i);
  out.imageOrder = order;
  return out;
}
