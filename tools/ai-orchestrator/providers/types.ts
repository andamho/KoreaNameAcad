// 모델 제공자 인터페이스 — orchestrator 는 이 인터페이스만 의존(실제 API/mock 교체 가능).
export type Role = "system" | "user" | "assistant";
export interface Msg { role: Role; content: string; }
export interface ProviderRequest { system: string; messages: Msg[]; maxTokens?: number; }
export interface Provider {
  readonly name: string;   // "claude" | "gpt" | "mock-claude" ...
  readonly model: string;  // 실제 사용 모델 id(보고용)
  complete(req: ProviderRequest): Promise<string>;
}
