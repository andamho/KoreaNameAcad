// CLI --mock 데모 — 실제 코드 작업 1건을 새 계약(구조화 + 2단계 GPT 검문)으로 완료.
//   Claude(수정계획+file_edits) → GPT 사전검문 approve → 적용+테스트 → GPT 최종검문 approve → complete.
export const demoClaudeResponses: string[] = [
  JSON.stringify({
    problem: "add 합산 함수가 없어 검증 불가",
    evidence: ["워크스페이스에 add.cjs 없음"],
    root_cause: "add 함수 미구현",
    proposed_changes: ["add.cjs 구현", "add.test.cjs 로 검증"],
    file_edits: [
      { path: "add.cjs", content: "module.exports = (a, b) => a + b;\n" },
      { path: "add.test.cjs", content: "const assert = require('node:assert');\nconst add = require('./add.cjs');\nassert.equal(add(1,2),3);\nassert.equal(add(-1,1),0);\nconsole.log('TESTS: 2 passed');\n" },
    ],
    commands: ["node add.test.cjs"],
    expected_result: "TESTS: 2 passed, exit 0",
    remaining_uncertainty: [],
  }),
];

export const demoGptResponses: string[] = [
  // 사전 검문(수정 계획 — 적용 전)
  JSON.stringify({ verdict: "approve", reason: "최소·안전한 구현이며 회귀 위험 없음. 적용 후 테스트로 검증.", required_changes: [], required_evidence: [], goal_satisfied: false }),
  // 최종 검문(diff + 테스트 결과)
  JSON.stringify({ verdict: "approve", reason: "테스트 2건 통과(exit 0), 목표 달성.", required_changes: [], required_evidence: [], goal_satisfied: true }),
];

export const DEMO_TASK = "add(a,b) 합산 함수를 구현하고 node 로 검증하라";
