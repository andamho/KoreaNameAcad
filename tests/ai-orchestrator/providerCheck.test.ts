// --check-providers + 모델 env 분리 검증(실제 API 없이).
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { checkProvider, renderChecks } from "../../tools/ai-orchestrator/providers/check";
import { resolveClaudeModel } from "../../tools/ai-orchestrator/providers/claude";
import { resolveOpenAIModel, openaiProvider } from "../../tools/ai-orchestrator/providers/openai";
import type { Provider } from "../../tools/ai-orchestrator/providers/types";

const ENV = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_MODEL", "OPENAI_MODEL"];
afterEach(() => { for (const k of ENV) delete process.env[k]; });

describe("모델은 env 로만 결정(코드 기본값 없음)", () => {
  test("resolveClaudeModel/OpenAIModel 은 env 반영, 미설정 시 빈값", () => {
    assert.equal(resolveClaudeModel(), "");
    process.env.ANTHROPIC_MODEL = "claude-x"; assert.equal(resolveClaudeModel(), "claude-x");
    assert.equal(resolveOpenAIModel(), "");
    process.env.OPENAI_MODEL = "gpt-x"; assert.equal(resolveOpenAIModel(), "gpt-x");
    // 명시 인자가 env 보다 우선.
    assert.equal(resolveClaudeModel("explicit"), "explicit");
  });
  test("모델 미설정이면 호출 시 명확한 오류(기본값 단정 안 함)", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const p = openaiProvider();
    await assert.rejects(() => p.complete({ system: "s", messages: [{ role: "user", content: "x" }] }), /OPENAI_MODEL 미설정/);
  });
});

describe("checkProvider — 키 원문 미출력·사람이 읽는 사유", () => {
  test("키 없음 → keyPresent=false, 명확 사유", async () => {
    const fake: Provider = { name: "gpt", model: "(OPENAI_MODEL 미설정)", async complete() { return "{}"; } };
    const c = await checkProvider("gpt", fake, "OPENAI_API_KEY");
    assert.equal(c.keyPresent, false); assert.equal(c.ok, false);
    assert.match(c.reason, /OPENAI_API_KEY 미설정/);
  });
  test("키·모델 있음 + 구조화 응답 성공 → ok", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const fake: Provider = { name: "gpt", model: "gpt-x", async complete() { return '{"ok":true}'; } };
    const c = await checkProvider("gpt", fake, "OPENAI_API_KEY");
    assert.equal(c.ok, true); assert.equal(c.reachable, true); assert.equal(c.structuredOk, true);
  });
  test("호출 오류 → 사람이 읽는 사유로 변환(키 원문 없음)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-secret-xyz";
    const fake: Provider = { name: "claude", model: "claude-x", async complete() { throw new Error("Anthropic API 404: model not found"); } };
    const c = await checkProvider("claude", fake, "ANTHROPIC_API_KEY");
    assert.equal(c.ok, false);
    assert.match(c.reason, /모델에 접근 불가/);
    const rendered = renderChecks([c]);
    assert.ok(!rendered.includes("sk-secret-xyz"), "키 원문 미출력");
  });
});
