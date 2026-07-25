// Anthropic(Claude) 제공자 — SDK 무의존 fetch. 모델은 **env(ANTHROPIC_MODEL)로만** 결정(코드 기본값 없음).
//   키·모델 미설정이면 명확한 오류. orchestrator 가 전송 전 익명화하므로 여기서 원문 로그 금지.
import type { Provider, ProviderRequest } from "./types";

export function resolveClaudeModel(explicit?: string): string {
  return (explicit || process.env.ANTHROPIC_MODEL || "").trim();
}

export function anthropicProvider(explicitModel?: string): Provider {
  const model = resolveClaudeModel(explicitModel);
  return {
    name: "claude",
    model: model || "(ANTHROPIC_MODEL 미설정)",
    async complete(req: ProviderRequest): Promise<string> {
      const key = (process.env.ANTHROPIC_API_KEY || "").trim();
      if (!key) throw new Error("ANTHROPIC_API_KEY 미설정");
      if (!model) throw new Error("ANTHROPIC_MODEL 미설정 — 사용할 모델을 .env 에 지정하세요(코드 기본값 없음).");
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
