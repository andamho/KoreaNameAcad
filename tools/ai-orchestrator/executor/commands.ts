// 명령 실행기 — safety allowlist 통과분만 실행. 출력은 마스킹. 타임아웃. blocked 는 실행하지 않고 사유 반환.
import fs from "fs";
import { spawnSync } from "child_process";
import { classifyCommand } from "../policies/safety";
import { maskForLog } from "../anonymize";

// 실제 bash 실행 파일 해석 — env(AI_ORCHESTRATOR_BASH) 우선, Windows=Git Bash 후보, 그 외 PATH의 bash.
export function resolveBash(): string {
  const explicit = (process.env.AI_ORCHESTRATOR_BASH || "").trim();
  if (explicit && (explicit === "bash" || fs.existsSync(explicit))) return explicit;
  if (process.platform === "win32") {
    for (const c of ["C:/Program Files/Git/bin/bash.exe", "C:/Program Files (x86)/Git/bin/bash.exe", `${process.env.LOCALAPPDATA || ""}/Programs/Git/bin/bash.exe`]) {
      try { if (fs.existsSync(c)) return c; } catch { /* */ }
    }
  }
  return "bash"; // PATH 가정
}

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
  // ★bash 로 실행 — 영상 파이프라인 명령이 POSIX 경로(`./venv/Scripts/python.exe`)라 Windows cmd.exe(shell:true)에선 실패한다.
  //   allowlist 로 이미 검증된 cmd 를 bash -c 인자로 전달(shell 문자열 결합 아님). Windows=Git Bash, Unix=/bin/bash.
  const r = spawnSync(resolveBash(), ["-c", cmd], { cwd: opts.cwd, encoding: "utf-8", timeout: opts.timeoutMs ?? 120000, maxBuffer: 16 * 1024 * 1024, killSignal: "SIGKILL", windowsHide: true });
  const raw = r.error ? `${(r.error as any).message ?? r.error}\n${r.stdout ?? ""}${r.stderr ?? ""}` : `${r.stdout ?? ""}${r.stderr ?? ""}`;
  return {
    cmd: shown, executed: true, blocked: false, reason: "allowed",
    code: r.status ?? (r.error ? -1 : null),
    output: maskForLog(raw).slice(0, 20000),
  };
}
