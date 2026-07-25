// OpenAI(GPT) 제공자 — SDK 의존 없이 fetch 로 Chat Completions API 호출. 키는 env(OPENAI_API_KEY).
//   ⚠️ orchestrator 가 전송 전 익명화(anonymize)를 이미 적용한다. 여기서는 원문 로그 금지.
import type { Provider, ProviderRequest } from "./types";

const DEFAULT_MODEL = process.env.AI_ORCHESTRATOR_OPENAI_MODEL || "gpt-4o";

export function openaiProvider(model = DEFAULT_MODEL): Provider {
  return {
    name: "gpt",
    model,
    async complete(req: ProviderRequest): Promise<string> {
      const key = (process.env.OPENAI_API_KEY || "").trim();
      if (!key) throw new Error("OPENAI_API_KEY 미설정 — 실제 GPT 호출 불가(mock 사용 또는 키 설정).");
      const messages = [{ role: "system", content: req.system }, ...req.messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }))];
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: req.maxTokens ?? 2048, response_format: { type: "json_object" } }),
      });
      if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data: any = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      if (!text) throw new Error("OpenAI 응답에 content 없음");
      return text;
    },
  };
}
