/**
 * Google Gemini API 공용 헬퍼 (REST). 추가 SDK 없이 fetch로 호출.
 * - geminiJson: 구조화 JSON 출력(responseSchema) — 비전 추출/의도 해석용
 * - geminiText: 일반 텍스트 출력 — 본문 부분 수정용
 * 키: GEMINI_API_KEY (https://aistudio.google.com 에서 무료 발급)
 */

const MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function apiKey(): string {
  const k = process.env.GEMINI_API_KEY?.trim();
  if (!k) throw new Error("GEMINI_API_KEY 가 설정되지 않았습니다. (https://aistudio.google.com 에서 발급)");
  return k;
}

export type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

type GenConfig = {
  maxOutputTokens?: number;
  responseSchema?: Record<string, any>;
};

async function call(systemText: string, parts: GeminiPart[], cfg: GenConfig): Promise<string> {
  const body: Record<string, any> = {
    system_instruction: { parts: [{ text: systemText }] },
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: cfg.maxOutputTokens ?? 2048,
      // 2.5 flash의 thinking이 출력 토큰을 소모해 JSON이 잘리는 것 방지(비활성화)
      thinkingConfig: { thinkingBudget: 0 },
      ...(cfg.responseSchema
        ? { responseMimeType: "application/json", responseSchema: cfg.responseSchema }
        : {}),
    },
  };

  const res = await fetch(`${BASE}/${MODEL}:generateContent?key=${apiKey()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data: any = await res.json();
  const cand = data.candidates?.[0];
  if (!cand) {
    throw new Error("Gemini 응답이 비어 있습니다." + (data.promptFeedback ? ` (${JSON.stringify(data.promptFeedback)})` : ""));
  }
  const text = (cand.content?.parts || []).map((p: any) => p.text || "").join("").trim();
  if (!text) throw new Error("Gemini 응답 텍스트가 없습니다.");
  return text;
}

/** 구조화 JSON 응답을 파싱해 반환 */
export async function geminiJson<T>(systemText: string, parts: GeminiPart[], responseSchema: Record<string, any>, maxOutputTokens = 2048): Promise<T> {
  let text = await call(systemText, parts, { responseSchema, maxOutputTokens });
  // 방어적 코드펜스 제거
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(text) as T;
  } catch { /* 아래에서 재시도 */ }
  // 앞뒤 잡음 제거 후 첫 { ~ 마지막 } 추출 재시도
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s >= 0 && e > s) {
    try {
      return JSON.parse(text.slice(s, e + 1)) as T;
    } catch { /* 잘림 등 */ }
  }
  throw new Error("Gemini JSON 파싱 실패(응답이 잘렸을 수 있음): " + text.slice(0, 300));
}

/** 일반 텍스트 응답 */
export async function geminiText(systemText: string, prompt: string, maxOutputTokens = 1500): Promise<string> {
  return call(systemText, [{ text: prompt }], { maxOutputTokens });
}
