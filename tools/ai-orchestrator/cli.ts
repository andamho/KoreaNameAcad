// AI 오케스트레이터 CLI — npm run ai:orchestrate -- --task "..." [--mock] [--workspace <path>] [--max-rounds N]
//   실제 모드: ANTHROPIC_API_KEY + OPENAI_API_KEY 필요(없으면 1회 안내 후 종료).
//   --mock: 키 없이 데모 시나리오로 전체 흐름 검증(.ai-runs/<id>/ 로그 생성).
import "dotenv/config";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { runOrchestration } from "./orchestrator";
import { Workspace, createTempWorkspace } from "./executor/workspace";
import { makeMockProvider } from "./providers/mock";
import { anthropicProvider } from "./providers/claude";
import { claudeCodeProvider, claudeCodePreflight } from "./providers/claudeCode";
import { openaiProvider } from "./providers/openai";
import { checkProvider, renderChecks } from "./providers/check";
import type { Provider } from "./providers/types";
import { demoClaudeResponses, demoGptResponses, DEMO_TASK } from "./scenarios";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

// Claude 측 provider 선택: --claude-provider api|claude-code. **기본값 claude-code**(Max 구독).
//   Anthropic API 방식은 CLAUDE_PROVIDER=api 또는 --claude-provider api 로만.
function resolveClaudeSide(): { provider: Provider; keyEnv: string; kind: string } {
  const kind = ((arg("claude-provider") || process.env.CLAUDE_PROVIDER || "claude-code")).trim();
  if (kind === "api") return { provider: anthropicProvider(arg("claude-model")), keyEnv: "ANTHROPIC_API_KEY", kind };
  return { provider: claudeCodeProvider(arg("claude-model")), keyEnv: "", kind: "claude-code" };
}

async function main(): Promise<number> {
  // 실제 사전 점검(설치·인증·모델·구조화). 키/토큰 원문 미출력.
  if (flag("check-providers")) {
    const side = resolveClaudeSide();
    console.log(`[check-providers] Claude 경로: ${side.kind === "claude-code" ? "Claude Code(Max 구독, API 크레딧 불요)" : "Anthropic API(크레딧)"}`);
    let claudeOk: boolean;
    if (side.kind === "claude-code") {
      const pf = claudeCodePreflight(arg("claude-model"));
      console.log(`  - claude(구독): ${pf.ok ? "✅ OK" : "❌ 실패"} · 설치=${pf.installed ? pf.version : "없음"} · API키제거=${pf.noApiKeyPath ? "예(구독)" : "아니오(키 우선됨 — unset 필요)"} · JSON=${pf.jsonOk ? "OK" : "-"}`);
      console.log(`      → ${pf.reason}`);
      claudeOk = pf.ok;
    } else {
      const c = await checkProvider("claude", side.provider, side.keyEnv);
      console.log(renderChecks([c]));
      claudeOk = c.ok;
    }
    const g = await checkProvider("gpt", openaiProvider(arg("openai-model")), "OPENAI_API_KEY");
    console.log(renderChecks([g]));
    return claudeOk && g.ok ? 0 : 2;
  }

  const mock = flag("mock");
  const task = arg("task") || (mock ? DEMO_TASK : "");
  if (!task) { console.error("❌ --task \"작업 목표\" 필요"); return 1; }
  const maxRounds = Number(arg("max-rounds") || process.env.AI_ORCHESTRATOR_MAX_ROUNDS || 5);
  const runId = arg("run-id") || `run-${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomBytes(2).toString("hex")}`;
  const runDir = path.join(repoRoot, ".ai-runs", runId);
  const names = (arg("names") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const pauseCheck = () => { try { return JSON.parse(fs.readFileSync(path.join(runDir, "control.json"), "utf-8"))?.command === "pause"; } catch { return false; } };

  let claude, gpt, workspace: Workspace;
  if (mock) {
    claude = makeMockProvider("mock-claude", demoClaudeResponses);
    gpt = makeMockProvider("mock-gpt", demoGptResponses);
    workspace = createTempWorkspace(path.join(runDir, "workspace"));
    console.log(`[ai] mock 모드 — 데모 코드 작업으로 자동 왕복 검증(키 불필요). runId=${runId}`);
  } else {
    const claudeSide = resolveClaudeSide();
    // GPT 는 항상 OpenAI 키+모델 필요. Claude 는 api 면 키+모델, claude-code 면 구독(키 불요).
    const gptReady = !!(process.env.OPENAI_API_KEY || "").trim() && !!(process.env.OPENAI_MODEL || "").trim();
    const claudeApiReady = claudeSide.kind !== "api" || (!!(process.env.ANTHROPIC_API_KEY || "").trim() && !!(process.env.ANTHROPIC_MODEL || "").trim());
    if (!gptReady || !claudeApiReady) {
      console.error("❌ 실제 모드 준비 미완. .env 설정(값은 서호님만 입력, 저장소·로그 금지):");
      console.error(`   Claude 경로=${claudeSide.kind === "claude-code" ? "Claude Code(Max 구독) — 키 불요, 'claude login' 필요" : "Anthropic API — ANTHROPIC_API_KEY + ANTHROPIC_MODEL 필요"}`);
      console.error("   GPT: OPENAI_API_KEY + OPENAI_MODEL 필요");
      console.error("   점검: npm run ai:orchestrate -- --check-providers   ·   키 없이 흐름검증: --mock");
      return 2;
    }
    claude = claudeSide.provider;
    gpt = openaiProvider(arg("openai-model"));
    console.log(`[ai] Claude 경로=${claudeSide.kind}`);
    const wsPath = arg("workspace") || repoRoot;
    workspace = new Workspace(wsPath);
    try { workspace.assertNotMain(); }
    catch (e: any) { console.error(`❌ ${e?.message}`); return 3; }
    console.log(`[ai] 실제 모드 — Claude=${claude.model} · GPT=${gpt.model} · workspace=${path.basename(wsPath)} · runId=${runId}`);
  }

  const result = await runOrchestration({ task, claude, gpt, workspace, runDir, maxRounds, names, pauseCheck });
  console.log(`[ai] 결과: ${result.outcome} · 라운드 ${result.rounds} · 모델 Claude=${result.models.claude}/GPT=${result.models.gpt}`);
  if (result.humanApproval?.needed) console.log(`[ai] ⚠️ 사람 승인 필요: ${result.humanApproval.reason}`);
  console.log(`[ai] 보고서: ${result.reportPath}`);
  return result.outcome === "complete" ? 0 : (result.outcome === "needs-human" || result.outcome === "blocked" ? 10 : 1);
}

const isDirect = process.argv[1] && /cli\.(ts|js)$/.test(process.argv[1].replace(/\\/g, "/"));
if (isDirect) { main().then((c) => process.exit(c)); }
export { main };
