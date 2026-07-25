// 완료·반복 정책 — "GPT approve = 즉시 성공" 금지. 실제 테스트 실행·통과·골든·(대상영상 시) 결과까지 충족해야 성공.
import crypto from "crypto";
import type { ClaudeMessage, GptMessage } from "../schemas/messages";

export type TestStatus = "none" | "not_started" | "environment_error" | "failed" | "passed";

// 명령 실행 결과 → 테스트 상태 구분. (test_failed 와 test_not_started/environment_error 를 분리)
export function classifyTest(cmd: string, executed: boolean, blocked: boolean, exitCode: number | null, output: string): TestStatus {
  const isTest = /test|pytest|--test|regression|골든|golden/i.test(cmd);
  if (!isTest) return "none";
  if (blocked || !executed) return "not_started";                 // 명령 자체가 실행 안 됨
  const envErr = /command not found|not recognized|no such file|ENOENT|ModuleNotFoundError|cannot find|은\(는\) 내부 또는 외부|Traceback \(most recent call last\)[\s\S]*(ImportError|FileNotFoundError)/i.test(output);
  if (envErr && exitCode !== 0) return "environment_error";        // 환경 문제(테스트 로직 실패 아님)
  return exitCode === 0 ? "passed" : "failed";
}

// 테스트 개수 추정(예: "16/16", "N passed", "[PASS] xN"). 0 이면 개수 미확인.
export function extractTestCount(output: string): number {
  const frac = output.match(/(\d+)\s*\/\s*(\d+)/);            // 16/16
  if (frac) return parseInt(frac[2], 10);
  const passed = output.match(/(\d+)\s*(passed|pass|PASS)/);
  if (passed) return parseInt(passed[1], 10);
  const bracket = (output.match(/\[PASS\]/g) || []).length;
  return bracket;
}

// 골든 회귀 통과 여부(골든 테스트 출력 기준). null = 골든 아님/미확인.
export function extractGoldenPass(cmd: string, output: string, exitCode: number | null): boolean | null {
  if (!/regression|골든|golden/i.test(cmd)) return null;
  if (exitCode !== 0) return false;
  return /골든 유지|all pass|전부 통과|\b(\d+)\/\1\b/i.test(output) || /16\/16/.test(output);
}

export interface RoundRecord {
  round: number;
  claude: ClaudeMessage;
  gpt: GptMessage | null;
  testStatus: TestStatus;
  testCount: number;
  exitCode: number | null;
  goldenPass: boolean | null;
  changedFiles: number;
  commandSignature: string | null;   // 같은 명령 2회 실패 감지
  failureSignature: string | null;   // 같은 주장·증거·diff 반복 감지
}

export interface LoopConfig {
  maxRounds: number;                  // 기본 2, 최대 3
  requireGolden?: boolean;            // 영상 과제: 골든 회귀 실행+통과 필수
  targetVideoSpecified?: boolean;     // 실제 대상 영상 지정 여부
  resultFilesExist?: () => boolean;   // 대상영상 결과 파일 존재 확인
  beforeAfterProvided?: boolean;      // 문제 구간 수정 전후 수치/결과 확인됨
}

export function signatureOf(parts: unknown[]): string {
  return crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
}

// 반복 중단: 최대 라운드 / 같은 명령 2회 실패 / 같은 주장·증거·diff 반복.
export function shouldStop(rounds: RoundRecord[], cfg: LoopConfig): { stop: boolean; blocked: boolean; reason: string } {
  if (rounds.length >= cfg.maxRounds) return { stop: true, blocked: false, reason: `최대 ${cfg.maxRounds}라운드 도달` };
  // 같은 명령이 두 번 실패(test failed/env/not_started) → blocked.
  const failedCmds = rounds.filter((r) => ["failed", "environment_error", "not_started"].includes(r.testStatus) && r.commandSignature).map((r) => r.commandSignature);
  const dupFailCmd = failedCmds.find((s, i) => failedCmds.indexOf(s) !== i);
  if (dupFailCmd) return { stop: true, blocked: true, reason: "같은 명령/수정이 2회 실패 — 무한 재시도 금지, blocked" };
  // 같은 주장·증거·diff 2회 반복.
  const sigs = rounds.map((r) => r.failureSignature).filter((s): s is string => !!s);
  if (sigs.length >= 2 && sigs[sigs.length - 1] === sigs[sigs.length - 2]) return { stop: true, blocked: true, reason: "동일 주장·증거·diff 반복 — blocked" };
  return { stop: false, blocked: false, reason: "" };
}

// 최종 성공 게이트(전부 충족해야 complete). 하나라도 미충족이면 revise/blocked.
export function canComplete(rounds: RoundRecord[], cfg: LoopConfig): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const last = rounds[rounds.length - 1];
  if (!last?.gpt) return { ok: false, reasons: ["GPT 검문 없음"] };
  if (last.gpt.verdict !== "approve") reasons.push(`verdict=${last.gpt.verdict}(approve 아님)`);
  if (!last.gpt.goal_satisfied) reasons.push("goal_satisfied=false");
  // 테스트 실제 시작·개수·exit0.
  const passedRound = [...rounds].reverse().find((r) => r.testStatus === "passed");
  if (!passedRound) {
    const anyTest = rounds.some((r) => r.testStatus !== "none");
    reasons.push(anyTest ? `테스트 통과 라운드 없음(마지막 상태=${last.testStatus})` : "테스트가 실제로 시작된 적 없음");
  } else {
    if (passedRound.testCount < 1) reasons.push("테스트 개수 확인 불가(≥1 필요)");
    if (passedRound.exitCode !== 0) reasons.push("테스트 exit code ≠ 0");
  }
  // 골든 회귀: 돌았으면 반드시 pass. 영상 과제(requireGolden)면 실행+통과 필수.
  const goldenRun = rounds.some((r) => r.goldenPass !== null);
  const goldenOk = rounds.some((r) => r.goldenPass === true);
  if (goldenRun && !goldenOk) reasons.push("골든 회귀 미통과");
  if (cfg.requireGolden && !goldenOk) reasons.push("골든 회귀 미실행/미통과(영상 과제 필수)");
  // 실제 대상 영상 지정 시: 결과 파일 존재 + 전후 수치.
  if (cfg.targetVideoSpecified) {
    if (!(cfg.resultFilesExist?.() ?? false)) reasons.push("대상영상 결과 파일 없음");
    if (!cfg.beforeAfterProvided) reasons.push("문제 구간 수정 전후 수치/결과 미확인");
  }
  return { ok: reasons.length === 0, reasons };
}
