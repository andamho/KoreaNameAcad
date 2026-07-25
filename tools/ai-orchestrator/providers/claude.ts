// Anthropic(Claude) 제공자 — SDK 의존 없이 fetch 로 Messages API 호출. 키는 env(ANTHROPIC_API_KEY).
//   ⚠️ orchestrator 가 전송 전 익명화(anonymize)를 이미 적용한다. 여기서는 원문 로그 금지.
import type { Provider, ProviderRequest } from "./types";

const DEFAULT_MODEL = process.env.AI_ORCHESTRATOR_CLAUDE_MODEL || "claude-opus-4-8";

export function anthropicProvider(model = DEFAULT_MODEL): Provider {
  return {
    name: "claude",
    model,
    async complete(req: ProviderRequest): Promise<string> {
      const key = (process.env.ANTHROPIC_API_KEY || "").trim();
      if (!key) throw new Error("ANTHROPIC_API_KEY 미설정 — 실제 Claude 호출 불가(mock 사용 또는 키 설정).");
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model,
          max_tokens: req.maxTokens ?? 4096,
          system: req.system,
          messages: req.messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data: any = await res.json();
      const text = (data?.content ?? []).filter((b: any) => b?.type === "text").map((b: any) => b.text).join("\n");
      if (!text) throw new Error("Anthropic 응답에 text 없음");
      return text;
    },
  };
}
