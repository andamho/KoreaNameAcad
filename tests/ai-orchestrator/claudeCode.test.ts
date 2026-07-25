// Claude Code(구독) provider — 프롬프트 조립·바이너리 탐색·모델 env·구독 점검 경로(실제 claude 실행 없이).
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { buildClaudeCodePrompt, resolveClaudeBin, resolveClaudeCodeModel, claudeCodePreflight } from "../../tools/ai-orchestrator/providers/claudeCode";
import { checkProvider } from "../../tools/ai-orchestrator/providers/check";
import type { Provider } from "../../tools/ai-orchestrator/providers/types";

afterEach(() => { delete process.env.ANTHROPIC_MODEL; });

describe("claude-code provider — 헬퍼", () => {
  test("프롬프트 조립: system+대화+JSON 강제", () => {
    const p = buildClaudeCodePrompt({ system: "SYS텍스트", messages: [{ role: "user", content: "USER텍스트" }] });
    assert.match(p, /\[SYSTEM\]\nSYS텍스트/);
    assert.match(p, /\[USER\]\nUSER텍스트/);
    assert.match(p, /JSON 만/);
  });
  test("바이너리 경로 반환(문자열)", () => { assert.equal(typeof resolveClaudeBin(), "string"); assert.ok(resolveClaudeBin().length > 0); });
  test("모델은 env 반영, 미설정 시 빈값(구독 기본 모델)", () => {
    assert.equal(resolveClaudeCodeModel(), "");
    process.env.ANTHROPIC_MODEL = "claude-y"; assert.equal(resolveClaudeCodeModel(), "claude-y");
    assert.equal(resolveClaudeCodeModel("explicit"), "explicit");
  });
  test("preflight: claude 미설치 환경이면 installed=false + 사람이 읽는 사유(키 원문 없음)", () => {
    const pf = claudeCodePreflight();
    assert.equal(typeof pf.installed, "boolean");
    assert.equal(typeof pf.ok, "boolean");
    // 이 CI/셸엔 claude 바이너리가 없으므로 미설치로 판정되고 사유가 채워진다(설치된 환경이면 ok 가능).
    if (!pf.installed) assert.match(pf.reason, /미설치|PATH|not found|실행 실패/);
    assert.ok(!/sk-ant-|npg_/.test(pf.reason), "키 원문 미출력");
  });
});

describe("check-providers — 구독(키 불요) 경로", () => {
  test("keyEnv='' 이면 키 검사 생략(구독) + 구조화 응답 성공 시 ok", async () => {
    const fake: Provider = { name: "claude-code", model: "claude-code(구독 기본 모델)", async complete() { return '{"ok":true}'; } };
    const c = await checkProvider("claude", fake, ""); // 구독
    assert.equal(c.keyPresent, true); assert.equal(c.ok, true); assert.equal(c.reachable, true);
  });
  test("구독인데 claude 미설치/미로그인 → 사람이 읽는 실패 사유", async () => {
    const fake: Provider = { name: "claude-code", model: "claude-code(구독 기본 모델)", async complete() { throw new Error("claude 실행 실패(설치/PATH 확인): spawn claude ENOENT"); } };
    const c = await checkProvider("claude", fake, "");
    assert.equal(c.ok, false);
    assert.match(c.reason, /호출 실패|실행 실패|ENOENT/);
  });
});
