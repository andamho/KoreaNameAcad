// mock 제공자 — API 키 없이 전체 흐름을 검증(E2E). 스크립트된 응답을 순서대로 반환.
import type { Provider, ProviderRequest } from "./types";

export function makeMockProvider(name: string, responses: string[], model = "mock"): Provider {
  let i = 0;
  const calls: ProviderRequest[] = [];
  const p: Provider & { calls: ProviderRequest[] } = {
    name, model, calls,
    async complete(req: ProviderRequest): Promise<string> {
      calls.push(req);
      const r = responses[Math.min(i, responses.length - 1)];
      i += 1;
      return r;
    },
  };
  return p;
}

// 응답 함수형 mock(직전 요청을 보고 동적으로 응답 — GPT 지적 반영 여부 검증용).
export function makeReactiveMock(name: string, fn: (turn: number, req: ProviderRequest) => string, model = "mock"): Provider {
  let turn = 0;
  return { name, model, async complete(req) { const r = fn(turn, req); turn += 1; return r; } };
}
