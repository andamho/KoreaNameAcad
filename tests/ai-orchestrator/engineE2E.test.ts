// AI 협업 엔진 mock E2E — 새 계약: 2단계 GPT 검문(사전/최종), file_edits 승인 후 적용, 엄격 완료·안전차단·마스킹.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runOrchestration } from "../../tools/ai-orchestrator/orchestrator";
import { createTempWorkspace } from "../../tools/ai-orchestrator/executor/workspace";
import { makeMockProvider, makeReactiveMock } from "../../tools/ai-orchestrator/providers/mock";
import { demoClaudeResponses, demoGptResponses, DEMO_TASK } from "../../tools/ai-orchestrator/scenarios";

function setup() { const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-run-")); return { runDir, ws: createTempWorkspace(path.join(runDir, "workspace")) }; }
const read = (p: string) => fs.readFileSync(p, "utf-8");
const claudeMsg = (o: object) => JSON.stringify({ problem: "p", evidence: [], root_cause: "c", proposed_changes: [], file_edits: [], commands: [], expected_result: "", remaining_uncertainty: [], ...o });
const gptMsg = (o: object) => JSON.stringify({ verdict: "revise", reason: "r", required_changes: [], required_evidence: [], goal_satisfied: false, ...o });

describe("AI 협업 엔진 — 새 계약 mock E2E", () => {
  test("Claude→GPT사전검문→적용→테스트→GPT최종검문 → complete (1라운드, 실제 코드+테스트)", async () => {
    const { runDir, ws } = setup();
    const claude = makeMockProvider("mock-claude", demoClaudeResponses);
    const gpt = makeMockProvider("mock-gpt", demoGptResponses); // [사전 approve, 최종 approve]
    const r = await runOrchestration({ task: DEMO_TASK, claude, gpt, workspace: ws, runDir, maxRounds: 2 });
    assert.equal(r.outcome, "complete", `outcome=${r.outcome}`);
    assert.ok(fs.existsSync(path.join(ws.root, "add.cjs")), "승인된 수정만 적용됨");
    assert.match(read(path.join(runDir, "tests.log")), /TESTS: 2 passed/);
    // 사전+최종 2회 GPT 검문 기록.
    const tr = read(path.join(runDir, "transcript.jsonl"));
    assert.match(tr, /"kind":"edits-applied".*"approved_by":"gpt-pre"/);
    assert.match(tr, /"phase":"pre"/); assert.match(tr, /"phase":"final"/);
  });

  test("GPT 사전검문 revise → 수정 적용 안 함(추측 수정 차단)", async () => {
    const { runDir, ws } = setup();
    const claude = makeMockProvider("mock-claude", [claudeMsg({ file_edits: [{ path: "danger.cjs", content: "x" }], commands: [] })]);
    const gpt = makeMockProvider("mock-gpt", [gptMsg({ verdict: "revise", required_changes: ["근거 부족 — 증거 먼저"] })]);
    const r = await runOrchestration({ task: "테스트", claude, gpt, workspace: ws, runDir, maxRounds: 1 });
    assert.ok(!fs.existsSync(path.join(ws.root, "danger.cjs")), "사전검문 미승인 → 적용 안 됨");
    assert.notEqual(r.outcome, "complete");
  });

  test("GPT 지적(required_changes/evidence)이 다음 Claude 입력에 자동 반영", async () => {
    const { runDir, ws } = setup();
    let round2Input = "";
    const claude = makeReactiveMock("mock-claude", (turn, req) => {
      if (turn === 1) round2Input = req.messages.map((m) => m.content).join("\n");
      // round1: 편집 없이 명령만 → 사전검문 없음, 최종검문에서 revise.
      return claudeMsg({ commands: ["ls"], problem: turn === 0 ? "초기" : "재분석" });
    });
    const gpt = makeMockProvider("mock-gpt", [gptMsg({ verdict: "revise", required_changes: ["add.cjs 를 구현하라"], required_evidence: ["output/script.txt"] })]);
    await runOrchestration({ task: "데모", claude, gpt, workspace: ws, runDir, maxRounds: 2 });
    assert.ok(round2Input.includes("add.cjs 를 구현하라"), "required_changes 자동 포함");
    assert.ok(round2Input.includes("output/script.txt"), "required_evidence 자동 포함");
  });

  test("금지 명령 → 자동 실행 차단(blocked, 사람 승인)", async () => {
    const { runDir, ws } = setup();
    const claude = makeMockProvider("mock-claude", [claudeMsg({ commands: ["git push origin main"] })]);
    const gpt = makeMockProvider("mock-gpt", [gptMsg({})]);
    const r = await runOrchestration({ task: "배포", claude, gpt, workspace: ws, runDir, maxRounds: 2 });
    assert.equal(r.outcome, "blocked");
    assert.ok(r.humanApproval?.needed);
    assert.match(read(path.join(runDir, "transcript.jsonl")), /"blocked":true/);
  });

  test("골든 필수 과제에서 골든 미실행 → 완료 안 됨", async () => {
    const { runDir, ws } = setup();
    // 편집 없이 non-test 명령 → 최종 approve 여도 골든 미통과 → complete 아님.
    const claude = makeMockProvider("mock-claude", [claudeMsg({ commands: ["ls"] })]);
    const gpt = makeMockProvider("mock-gpt", [gptMsg({ verdict: "approve", goal_satisfied: true })]);
    const r = await runOrchestration({ task: "영상 골든", claude, gpt, workspace: ws, runDir, maxRounds: 1, requireGolden: true });
    assert.notEqual(r.outcome, "complete", "골든 미통과인데 complete 되면 안 됨");
  });

  test("로그·보고서에 키·개인정보 원문 없음(마스킹)", async () => {
    const { runDir, ws } = setup();
    const claude = makeMockProvider("mock-claude", demoClaudeResponses);
    const gpt = makeMockProvider("mock-gpt", demoGptResponses);
    const r = await runOrchestration({ task: "전화 010-1234-5678, 키 sk-ant-ABCDEFGHIJKLMNOP 금지", claude, gpt, workspace: ws, runDir, maxRounds: 2 });
    assert.equal(r.outcome, "complete");
    for (const f of ["transcript.jsonl", "final-report.md"]) {
      const b = read(path.join(runDir, f));
      assert.ok(!b.includes("010-1234-5678") && !b.includes("sk-ant-ABCDEFGHIJKLMNOP"), `${f} 유출`);
    }
    assert.match(read(path.join(runDir, "transcript.jsonl")), /"redactions":\{[^}]*"phone"/);
  });

  test("일시정지 → paused", async () => {
    const { runDir, ws } = setup();
    const r = await runOrchestration({ task: DEMO_TASK, claude: makeMockProvider("c", demoClaudeResponses), gpt: makeMockProvider("g", demoGptResponses), workspace: ws, runDir, maxRounds: 2, pauseCheck: () => true });
    assert.equal(r.outcome, "paused");
  });
});
