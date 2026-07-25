// CLI --mock 데모 시나리오 — 실제 코드 작업 1건(add 구현+테스트)을 Claude↔GPT 2라운드 자동 왕복으로 완료.
//   round1: Claude analysis(미완) → GPT revise(필수 수정). round2: Claude 구현+테스트(GPT 지적 반영) → GPT approve.
export const demoClaudeResponses: string[] = [
  JSON.stringify({
    phase: "analysis",
    summary: "원인 후보: add 함수가 없어 합산 검증 불가",
    evidence: ["워크스페이스에 add.js 없음"],
    files_to_change: ["add.js"],
    file_edits: [],
    commands: [],
    risks: ["미구현 상태로 완료 판정 금지"],
    metrics: {},
    needs_human_approval: false,
    approval_reason: null,
  }),
  JSON.stringify({
    phase: "test",
    summary: "GPT 지적 반영: add 구현 + node --test 로 검증",
    evidence: ["GPT required_changes 반영: 구현+테스트 추가", "테스트로 실제 동작 검증"],
    files_to_change: ["add.cjs", "add.test.cjs"],
    file_edits: [
      { path: "add.cjs", content: "module.exports = (a, b) => a + b;\n" },
      { path: "add.test.cjs", content: "const assert = require('node:assert');\nconst add = require('./add.cjs');\nassert.equal(add(1, 2), 3);\nassert.equal(add(-1, 1), 0);\nconsole.log('TESTS: 2 passed');\n" },
    ],
    commands: ["node add.test.cjs"],
    risks: [],
    metrics: { tests_passed: 1 },
    needs_human_approval: false,
    approval_reason: null,
  }),
];

export const demoGptResponses: string[] = [
  JSON.stringify({
    verdict: "revise",
    findings: ["구현·테스트가 없어 원인 분석이 검증되지 않음"],
    required_changes: ["add.js 를 구현하고 node --test 로 통과 증명"],
    missing_evidence: ["테스트 실행 결과"],
    goal_satisfied: false,
    needs_human_approval: false,
  }),
  JSON.stringify({
    verdict: "approve",
    findings: [],
    required_changes: [],
    missing_evidence: [],
    goal_satisfied: true,
    needs_human_approval: false,
  }),
];

export const DEMO_TASK = "add(a,b) 합산 함수를 구현하고 node --test 로 검증하라";
