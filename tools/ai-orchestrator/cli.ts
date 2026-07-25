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
import { openaiProvider } from "./providers/openai";
import { demoClaudeResponses, demoGptResponses, DEMO_TASK } from "./scenarios";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main(): Promise<number> {
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
    const hasKeys = !!(process.env.ANTHROPIC_API_KEY || "").trim() && !!(process.env.OPENAI_API_KEY || "").trim();
    if (!hasKeys) {
      console.error("❌ 실제 모드에는 API 키가 필요합니다(한 번만 설정).");
      console.error("   .env 에 다음을 추가하세요(값은 서호님만 입력, 저장소·로그에 남기지 마세요):");
      console.error("     ANTHROPIC_API_KEY=sk-ant-...");
      console.error("     OPENAI_API_KEY=sk-...");
      console.error("   그 전까지는 키 없이 흐름을 검증하려면: npm run ai:orchestrate -- --task \"...\" --mock");
      return 2;
    }
    claude = anthropicProvider();
    gpt = openaiProvider();
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
