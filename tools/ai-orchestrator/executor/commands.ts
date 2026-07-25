// 명령 실행기 — safety allowlist 통과분만 실행. 출력은 마스킹. 타임아웃. blocked 는 실행하지 않고 사유 반환.
import { spawnSync } from "child_process";
import { classifyCommand } from "../policies/safety";
import { maskForLog } from "../anonymize";

export interface CommandResult {
  cmd: string;               // 표시용(원문 명령 — secret 없음 전제, 마스킹 적용)
  executed: boolean;
  blocked: boolean;
  reason: string;
  code: number | null;
  output: string;            // stdout+stderr 마스킹본(길이 제한)
}

export function runCommand(cmd: string, opts: { cwd: string; timeoutMs?: number } ): CommandResult {
  const verdict = classifyCommand(cmd);
  const shown = maskForLog(cmd);
  if (verdict.category === "blocked") {
    return { cmd: shown, executed: false, blocked: true, reason: verdict.reason, code: null, output: "" };
  }
  const r = spawnSync(cmd, { cwd: opts.cwd, shell: true, encoding: "utf-8", timeout: opts.timeoutMs ?? 120000, maxBuffer: 8 * 1024 * 1024 });
  const raw = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  return {
    cmd: shown, executed: true, blocked: false, reason: "allowed",
    code: r.status ?? (r.error ? -1 : null),
    output: maskForLog(raw).slice(0, 20000),
  };
}
