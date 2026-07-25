// Claude Code 헤드리스 provider — Max 구독 인증으로 동작(Anthropic API 크레딧 불요). 공식 경로만.
//   보안 하드닝:
//   1) 자식 env 에서 ANTHROPIC_API_KEY **무조건 제거**(잘못된 키가 API 과금 경로로 새는 것 방지) → 구독 강제.
//   2) shell 문자열 결합 금지 — spawnSync 인자 배열, 프롬프트는 **stdin** 으로(명령 주입 방지).
//   3) 고정 옵션: -p --output-format json --max-turns <N> --permission-mode plan (분석/검문=plan, 수정 권한 없음).
//      코드 수정·명령은 orchestrator 안전 executor 만 담당(Claude Code 에 무제한 Bash/파일수정 권한 금지).
//   4) --dangerously-skip-permissions 사용 금지.
//   5) 타임아웃·출력크기 제한·비정상 종료 시 자식 종료·exit/stderr 마스킹.
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import type { Provider, ProviderRequest } from "./types";
import { maskForLog } from "../anonymize";

export function resolveClaudeBin(): string {
  const home = os.homedir();
  const cands = process.platform === "win32"
    ? [path.join(home, ".local", "bin", "claude.exe"), path.join(process.env.LOCALAPPDATA || "", "Programs", "claude", "claude.exe"), path.join(process.env.APPDATA || "", "npm", "claude.cmd")]
    : [path.join(home, ".local", "bin", "claude"), "/usr/local/bin/claude", "/opt/homebrew/bin/claude"];
  for (const c of cands) { try { if (c && fs.existsSync(c)) return c; } catch { /* */ } }
  return "claude"; // PATH 가정
}

export function buildClaudeCodePrompt(req: ProviderRequest): string {
  const convo = req.messages.map((m) => `[${m.role.toUpperCase()}]\n${m.content}`).join("\n\n");
  return `[SYSTEM]\n${req.system}\n\n${convo}\n\n반드시 위 지시대로 **JSON 만** 출력하라(설명·도구사용 없이).`;
}

export function resolveClaudeCodeModel(explicit?: string): string {
  return (explicit || process.env.ANTHROPIC_MODEL || "").trim(); // 비우면 구독 기본 모델
}

// 구독 강제 env(자식용). ANTHROPIC_API_KEY 제거는 항상.
function childEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.ANTHROPIC_API_KEY;   // ★잘못된/만료 키가 API 과금 경로로 가는 것 차단
  delete env.ANTHROPIC_AUTH_TOKEN;
  return env;
}

function baseArgs(model: string, permissionMode: "plan" | "default"): string[] {
  const maxTurns = String(Number(process.env.CLAUDE_CODE_MAX_TURNS || 12));
  const args = ["-p", "--output-format", "json", "--max-turns", maxTurns, "--permission-mode", permissionMode];
  if (model) args.push("--model", model);
  return args;
}

// 격리 cwd(빈 임시폴더) + plan 모드 → Claude Code 가 실제 워크스페이스를 읽거나 수정하지 않음.
function runClaude(bin: string, args: string[], input: string): { status: number | null; stdout: string; stderr: string; error?: Error } {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cc-iso-"));
  try {
    const r = spawnSync(bin, args, {
      cwd, env: childEnv(), input, encoding: "utf-8",
      timeout: Number(process.env.CLAUDE_CODE_TIMEOUT_MS || 180000),
      killSignal: "SIGKILL",                      // 타임아웃 시 자식 강제 종료
      maxBuffer: 16 * 1024 * 1024,                // 출력 크기 제한
      shell: false,                               // ★shell 결합 금지
      windowsHide: true,
    });
    return { status: r.status, stdout: r.stdout || "", stderr: maskForLog(r.stderr || ""), error: r.error as Error | undefined };
  } finally { try { fs.rmSync(cwd, { recursive: true, force: true }); } catch { /* */ } }
}

export interface ClaudeCodePreflight { installed: boolean; version: string; jsonOk: boolean; noApiKeyPath: boolean; ok: boolean; reason: string; }

// 시작 전 실제 인증/설치 검사 — 키/토큰 원문 미출력.
export function claudeCodePreflight(model?: string): ClaudeCodePreflight {
  const bin = resolveClaudeBin();
  const base: ClaudeCodePreflight = { installed: false, version: "", jsonOk: false, noApiKeyPath: !process.env.ANTHROPIC_API_KEY, ok: false, reason: "" };
  // 1) 설치/버전.
  const v = spawnSync(bin, ["--version"], { env: childEnv(), encoding: "utf-8", timeout: 20000, shell: false, windowsHide: true });
  if (v.error || v.status !== 0) return { ...base, reason: `Claude Code 미설치/PATH 불가: ${maskForLog(String((v.error as any)?.message || v.stderr || "not found")).slice(0, 120)}` };
  base.installed = true; base.version = (v.stdout || "").trim().split(/\s+/).slice(0, 2).join(" ");
  // 2) 구독 인증 + JSON 출력(짧은 확인).
  const r = runClaude(bin, baseArgs(resolveClaudeCodeModel(model), "plan"), "정확히 JSON 만 출력: {\"ok\":true}");
  if (r.error || r.status !== 0) return { ...base, reason: `claude -p 실행 실패(로그인/plan 확인): exit=${r.status} ${r.stderr.slice(0, 140)}` };
  let jsonOk = false; try { const s = r.stdout.indexOf("{"), e = r.stdout.lastIndexOf("}"); const d = JSON.parse(r.stdout.slice(s, e + 1)); jsonOk = !!(d && (typeof d.result === "string" || typeof d.ok !== "undefined")); } catch { /* */ }
  base.jsonOk = jsonOk;
  base.ok = base.installed && jsonOk;
  base.reason = base.ok ? `정상 — Claude Code ${base.version}, 구독 경로(API 키 제거), JSON 출력 OK` : "응답을 받았으나 JSON 파싱 실패(--output-format json/plan 확인)";
  return base;
}

export function claudeCodeProvider(explicitModel?: string): Provider {
  const model = resolveClaudeCodeModel(explicitModel);
  const bin = resolveClaudeBin();
  return {
    name: "claude-code",
    model: model || "claude-code(구독 기본 모델)",
    async complete(req: ProviderRequest): Promise<string> {
      const r = runClaude(bin, baseArgs(model, "plan"), buildClaudeCodePrompt(req));
      if (r.error) throw new Error(`claude 실행 실패(설치/PATH 확인): ${maskForLog(String((r.error as any).message || r.error)).slice(0, 160)}`);
      if (r.status !== 0) throw new Error(`claude -p 실패(exit ${r.status}): ${r.stderr.slice(0, 200)}`);
      let data: any; try { data = JSON.parse(r.stdout); } catch { throw new Error("claude -p 출력 JSON 파싱 실패(--output-format json 확인)"); }
      const text = typeof data?.result === "string" ? data.result : (typeof data?.text === "string" ? data.text : "");
      if (!text) throw new Error("claude -p 응답에 result 없음");
      return text;
    },
  };
}
