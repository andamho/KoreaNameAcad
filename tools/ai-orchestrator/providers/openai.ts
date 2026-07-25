// OpenAI(GPT) 제공자 — SDK 무의존 fetch. **공식 Responses API + 구조화 출력(json_object)** 사용.
//   모델은 env(OPENAI_MODEL)로만 결정(코드 기본값 없음). 키·모델 미설정이면 명확한 오류.
import type { Provider, ProviderRequest } from "./types";

export function resolveOpenAIModel(explicit?: string): string {
  return (explicit || process.env.OPENAI_MODEL || "").trim();
}

// Responses API 응답에서 텍스트 추출(output_text 편의 필드 또는 output[].content[].text).
function extractText(data: any): string {
  if (typeof data?.output_text === "string" && data.output_text) return data.output_text;
  const parts: string[] = [];
  for (const item of data?.output ?? []) {
    for (const c of item?.content ?? []) {
      if (typeof c?.text === "string") parts.push(c.text);
    }
  }
  return parts.join("\n");
}

export function openaiProvider(explicitModel?: string): Provider {
  const model = resolveOpenAIModel(explicitModel);
  return {
    name: "gpt",
    model: model || "(OPENAI_MODEL 미설정)",
    async complete(req: ProviderRequest): Promise<string> {
      const key = (process.env.OPENAI_API_KEY || "").trim();
      if (!key) throw new Error("OPENAI_API_KEY 미설정");
      if (!model) throw new Error("OPENAI_MODEL 미설정 — 사용할 모델을 .env 에 지정하세요(코드 기본값 없음).");
      // Responses API 입력: instructions(system) + input(대화). 구조화 출력=json_object.
      const input = req.messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
      const res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          instructions: req.system,
          input,
          max_output_tokens: req.maxTokens ?? 2048,
          text: { format: { type: "json_object" } }, // 구조화 출력(유효 JSON 보장). 우리 zod 로 재검증.
        }),
      });
      if (!res.ok) throw new Error(`OpenAI Responses API ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data: any = await res.json();
      const text = extractText(data);
      if (!text) throw new Error("OpenAI 응답에 텍스트 없음");
      return text;
    },
  };
}
