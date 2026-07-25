// AI 협업 엔진 mock E2E — 키 없이 Claude↔GPT 자동 왕복·안전차단·스키마 재요청·반복종료·로그 프라이버시 검증.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runOrchestration } from "../../tools/ai-orchestrator/orchestrator";
import { createTempWorkspace } from "../../tools/ai-orchestrator/executor/workspace";
import { makeMockProvider, makeReactiveMock } from "../../tools/ai-orchestrator/providers/mock";
import { demoClaudeResponses, demoGptResponses, DEMO_TASK } from "../../tools/ai-orchestrator/scenarios";

function tmp(prefix: string) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }
function setup() {
  const runDir = tmp("ai-run-");
  const ws = createTempWorkspace(path.join(runDir, "workspace"));
  return { runDir, ws };
}
const read = (p: string) => fs.readFileSync(p, "utf-8");

describe("AI 협업 엔진 — mock E2E", () => {
  test("Claude→GPT→Claude 자동 왕복 2라운드 → GPT approve → complete (실제 코드+테스트)", async () => {
    const { runDir, ws } = setup();
    const claude = makeMockProvider("mock-claude", demoClaudeResponses);
    const gpt = makeMockProvider("mock-gpt", demoGptResponses);
    const r = await runOrchestration({ task: DEMO_TASK, claude, gpt, workspace: ws, runDir, maxRounds: 5 });
    assert.equal(r.outcome, "complete", `outcome=${r.outcome}`);
    assert.equal(r.rounds, 2, "2라운드 자동 왕복");
    // 실제 코드 작업 수행: 파일 생성 + 테스트 통과.
    assert.ok(fs.existsSync(path.join(ws.root, "add.cjs")), "add.cjs 생성됨");
    const diff = read(path.join(runDir, "git-diff.patch"));
    assert.ok(diff.includes("add.cjs"), "diff 에 변경 반영");
    const tests = read(path.join(runDir, "tests.log"));
    assert.match(tests, /TESTS: 2 passed/);
    // 로그 산출물 존재.
    for (const f of ["task.json", "transcript.jsonl", "claude-analysis.json", "gpt-review.json", "final-report.md"]) {
      assert.ok(fs.existsSync(path.join(runDir, f)), `${f} 생성됨`);
    }
    assert.match(read(path.join(runDir, "final-report.md")), /complete|approve/i);
  });

  test("GPT 수정 요구가 Claude 다음 입력에 자동 포함(전달자 없이)", async () => {
    const { runDir, ws } = setup();
    let round2Input = "";
    const claude = makeReactiveMock("mock-claude", (turn, req) => {
      if (turn === 1) round2Input = req.messages.map((m) => m.content).join("\n");
      return demoClaudeResponses[Math.min(turn, demoClaudeResponses.length - 1)];
    });
    const gpt = makeMockProvider("mock-gpt", demoGptResponses);
    const r = await runOrchestration({ task: DEMO_TASK, claude, gpt, workspace: ws, runDir, maxRounds: 5 });
    assert.equal(r.outcome, "complete");
    assert.ok(round2Input.includes("add.js 를 구현"), "GPT required_changes 가 Claude 2라운드 입력에 포함됨");
    assert.ok(/GPT 감사자 지적/.test(round2Input), "지적 섹션 자동 주입");
  });

  test("금지 명령 요청 → 자동 실행 차단 + 사람 승인(blocked)", async () => {
    const { runDir, ws } = setup();
    const badClaude = JSON.stringify({ phase: "implementation", summary: "배포 시도", evidence: [], files_to_change: [], file_edits: [], commands: ["git push origin main"], risks: [], metrics: {}, needs_human_approval: false, approval_reason: null });
    const claude = makeMockProvider("mock-claude", [badClaude]);
    const gpt = makeMockProvider("mock-gpt", [demoGptResponses[0]]);
    const r = await runOrchestration({ task: "배포하라", claude, gpt, workspace: ws, runDir, maxRounds: 5 });
    assert.equal(r.outcome, "blocked");
    assert.ok(r.humanApproval?.needed, "사람 승인 필요 표시");
    // 실제로 push 안 됨 — transcript 에 blocked 기록.
    assert.match(read(path.join(runDir, "transcript.jsonl")), /"blocked":true/);
  });

  test("스키마 위반 응답 → 자동 재요청 후 진행(미검증 응답으로 넘어가지 않음)", async () => {
    const { runDir, ws } = setup();
    // 1턴째 깨진 응답, 2턴째 정상.
    const claude = makeReactiveMock("mock-claude", (turn) => turn === 0 ? "그냥 텍스트, JSON 아님" : demoClaudeResponses[0]);
    const gpt = makeMockProvider("mock-gpt", [demoGptResponses[1]]); // approve (analysis 만으로는 완료 안 되지만 재요청 동작 확인이 목적)
    const r = await runOrchestration({ task: "테스트", claude, gpt, workspace: ws, runDir, maxRounds: 1 });
    // 재요청이 동작해 파싱 성공 → claude-analysis 에 1건 기록.
    const ca = JSON.parse(read(path.join(runDir, "claude-analysis.json")));
    assert.ok(ca.length >= 1, "재요청 후 유효 메시지 파싱됨");
    assert.match(read(path.join(runDir, "transcript.jsonl")), /"kind":"claude-parse".*"ok":false/);
  });

  test("동일 실패 2회 반복 → 안전 종료(stopped)", async () => {
    const { runDir, ws } = setup();
    const stuckClaude = JSON.stringify({ phase: "revision", summary: "동일 시도", evidence: ["x"], files_to_change: ["a.js"], file_edits: [{ path: "a.js", content: "// x\n" }], commands: ["node --test"], risks: [], metrics: {}, needs_human_approval: false, approval_reason: null });
    const reviseGpt = JSON.stringify({ verdict: "revise", findings: ["동일 문제"], required_changes: ["같은 수정 필요"], missing_evidence: [], goal_satisfied: false, needs_human_approval: false });
    const claude = makeMockProvider("mock-claude", [stuckClaude]);
    const gpt = makeMockProvider("mock-gpt", [reviseGpt]);
    const r = await runOrchestration({ task: "무한 반복 방지", claude, gpt, workspace: ws, runDir, maxRounds: 5 });
    assert.equal(r.outcome, "stopped");
    assert.match(r.humanApproval?.reason || "", /동일 실패 2회/);
  });

  test("로그·보고서에 API 키·개인정보 원문 없음(마스킹)", async () => {
    const { runDir, ws } = setup();
    const taskWithSecret = "전화 010-1234-5678 관련 작업. 키 sk-ant-ABCDEFGHIJKLMNOP 노출 금지";
    const claude = makeMockProvider("mock-claude", demoClaudeResponses);
    const gpt = makeMockProvider("mock-gpt", demoGptResponses);
    const r = await runOrchestration({ task: taskWithSecret, claude, gpt, workspace: ws, runDir, maxRounds: 5, names: [] });
    assert.equal(r.outcome, "complete");
    for (const f of ["transcript.jsonl", "final-report.md", "task.json"]) {
      const body = read(path.join(runDir, f));
      // task.json 은 원문 task 를 저장하지만(사용자 입력), 전화/키는 보고서·transcript 에서 마스킹돼야 한다.
      if (f !== "task.json") {
        assert.ok(!body.includes("010-1234-5678"), `${f} 에 전화번호 원문 유출`);
        assert.ok(!body.includes("sk-ant-ABCDEFGHIJKLMNOP"), `${f} 에 API 키 원문 유출`);
      }
    }
    // 전송 요청 시 마스킹 기록(redactions>0).
    assert.match(read(path.join(runDir, "transcript.jsonl")), /"redactions":\{[^}]*"phone"/);
  });

  test("일시정지(pauseCheck) → paused 로 안전 종료", async () => {
    const { runDir, ws } = setup();
    const claude = makeMockProvider("mock-claude", demoClaudeResponses);
    const gpt = makeMockProvider("mock-gpt", demoGptResponses);
    const r = await runOrchestration({ task: DEMO_TASK, claude, gpt, workspace: ws, runDir, maxRounds: 5, pauseCheck: () => true });
    assert.equal(r.outcome, "paused");
  });
});
