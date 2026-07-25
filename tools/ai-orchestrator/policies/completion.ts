// 완료·반복 정책 — "프로세스 종료=성공" 금지. 실제 결과(테스트·변경파일·수치) 없으면 완료 판정 불가.
import type { ClaudeMessage, GptMessage } from "../schemas/messages";

export interface RoundRecord {
  round: number;
  claude: ClaudeMessage;
  gpt: GptMessage | null;
  ranTests: boolean;
  testsPassed: boolean | null;
  changedFiles: number;
  failureSignature: string | null; // 동일 실패 반복 감지용
}

export interface LoopConfig { maxRounds: number; qualityKeywords?: string[]; }

// 반복 계속 여부.
export function shouldStop(rounds: RoundRecord[], cfg: LoopConfig): { stop: boolean; reason: string } {
  if (rounds.length >= cfg.maxRounds) return { stop: true, reason: `최대 반복(${cfg.maxRounds}) 도달` };
  // 동일 실패 2회 연속.
  const sigs = rounds.map((r) => r.failureSignature).filter((s): s is string => !!s);
  if (sigs.length >= 2 && sigs[sigs.length - 1] === sigs[sigs.length - 2]) {
    return { stop: true, reason: "동일 실패 2회 반복 — 중단" };
  }
  return { stop: false, reason: "" };
}

// 완료(성공) 판정 — GPT approve + goal_satisfied + 실제 근거 충족.
export function canComplete(rounds: RoundRecord[], task: string, cfg: LoopConfig): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const last = rounds[rounds.length - 1];
  if (!last?.gpt) { return { ok: false, reasons: ["GPT 검문 결과 없음"] }; }
  if (last.gpt.verdict !== "approve") reasons.push(`GPT verdict=${last.gpt.verdict}(approve 아님)`);
  if (!last.gpt.goal_satisfied) reasons.push("GPT goal_satisfied=false");
  // 테스트 없이 완료 금지.
  const anyTests = rounds.some((r) => r.ranTests);
  if (!anyTests) reasons.push("테스트 실행 이력 없음 — 완료 금지");
  if (rounds.some((r) => r.ranTests && r.testsPassed === false) && !(last.ranTests && last.testsPassed)) {
    reasons.push("마지막 라운드 테스트 통과 미확인");
  }
  // 구현 단계인데 변경 파일 0 이면 완료 금지.
  const implemented = rounds.some((r) => r.claude.phase === "implementation" || r.claude.phase === "revision" || r.claude.phase === "test");
  const anyChanges = rounds.some((r) => r.changedFiles > 0);
  if (implemented && !anyChanges) reasons.push("구현/수정 단계인데 변경 파일 0 — 완료 금지");
  // 품질 수치 필요 과제(전사 오타율·영상 품질 등): metrics 없으면 완료 금지.
  const kws = cfg.qualityKeywords ?? ["오타", "오류율", "품질", "wer", "정확", "자막", "누락"];
  const needsMetric = kws.some((k) => task.toLowerCase().includes(k.toLowerCase()));
  const hasMetric = rounds.some((r) => Object.keys(r.claude.metrics || {}).length > 0);
  if (needsMetric && !hasMetric) reasons.push("품질 수치(metrics) 없이 품질 개선 완료 판정 금지");
  return { ok: reasons.length === 0, reasons };
}
