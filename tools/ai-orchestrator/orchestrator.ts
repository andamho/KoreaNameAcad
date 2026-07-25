// Claude↔GPT 자동 협업 루프 — 서호님이 중간 전달자가 되지 않도록 두 모델을 API 로 자동 왕복시킨다.
//   Claude(주담당): 조사·원인·수정·테스트. GPT(감사자): 증거부족·추측차단·회귀·diff·테스트 검문·목표 판정.
//   GPT 지적은 자동으로 Claude 다음 입력에 포함. schema 강제(미검증 응답으로 진행 금지). 전 과정 로그.
//   전송 전 익명화(PII 차단). 금지 명령/작업은 자동 차단(blocked) 후 사람 승인 요청.
import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { Provider, Msg } from "./providers/types";
import { Workspace } from "./executor/workspace";
import { runCommand } from "./executor/commands";
import { parseClaude, parseGpt, CLAUDE_SCHEMA_HINT, GPT_SCHEMA_HINT, type ClaudeMessage, type GptMessage } from "./schemas/messages";
import { sanitizeForModel, maskForLog } from "./anonymize";
import { shouldStop, canComplete, type RoundRecord } from "./policies/completion";

export type Outcome = "complete" | "blocked" | "needs-human" | "max-rounds" | "stopped" | "paused" | "error";

export interface OrchestratorOptions {
  task: string;
  claude: Provider;
  gpt: Provider;
  workspace: Workspace;
  runDir: string;
  maxRounds?: number;
  names?: string[];              // 익명화용 알려진 고객명
  qualityKeywords?: string[];
  commandTimeoutMs?: number;
  pauseCheck?: () => boolean;    // true 면 라운드 사이에 멈춤(일시정지)
  now?: () => string;            // 테스트 결정성
}

export interface RunResult {
  runId: string; outcome: Outcome; rounds: number; reportPath: string;
  models: { claude: string; gpt: string };
  humanApproval?: { needed: boolean; reason: string };
}

const CLAUDE_SYSTEM = `당신은 코드 문제를 해결하는 주담당 엔지니어(Claude)다. 저장소와 실제 로그를 조사하고 원인 후보를 근거와 함께 제시하며, 필요한 최소 수정만 하고 테스트로 검증한다. 추측 수정 금지, 과도한 기반공사 금지. GPT 감사자의 지적이 주어지면 반드시 반영한다. ${CLAUDE_SCHEMA_HINT}`;
const GPT_SYSTEM = `당신은 감사자(GPT)다. Claude 의 원인 분석에 증거가 부족한지, 추측 수정인지, 설계 누락·기존 골든 회귀 위험·과도한 기반공사가 없는지, git diff·테스트가 실제 문제를 검증하는지 검문한다. 근거가 부족하면 revise 로 필수 수정을 요구한다. 목표가 실제로 달성됐을 때만 approve + goal_satisfied=true. ${GPT_SCHEMA_HINT}`;

function writeJson(p: string, obj: unknown) { fs.writeFileSync(p, JSON.stringify(obj, null, 2)); }
function appendJsonl(p: string, obj: unknown) { fs.appendFileSync(p, JSON.stringify(obj) + "\n"); }

// schema 강제 호출 — 파싱 실패 시 오류를 붙여 최대 2회 재요청. 끝까지 실패하면 null.
async function callStructured<T>(
  provider: Provider, system: string, messages: Msg[], parse: (raw: string) => { ok: true; value: T } | { ok: false; error: string; raw: string },
  log: (ev: unknown) => void,
): Promise<{ value: T; raw: string } | null> {
  let msgs = messages;
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await provider.complete({ system, messages: msgs });
    const masked = maskForLog(raw);
    const r = parse(raw);
    if (r.ok) { log({ provider: provider.name, attempt, ok: true, response: maskForLog(JSON.stringify(r.value)) }); return { value: r.value, raw: masked }; }
    log({ provider: provider.name, attempt, ok: false, error: r.error });
    msgs = [...msgs, { role: "assistant", content: masked }, { role: "user", content: `이전 응답이 schema 위반이다(${r.error}). 설명 없이 정확한 JSON 만 다시 출력하라.` }];
  }
  return null;
}

export async function runOrchestration(opts: OrchestratorOptions): Promise<RunResult> {
  const now = opts.now ?? (() => new Date().toISOString());
  const maxRounds = opts.maxRounds ?? Number(process.env.AI_ORCHESTRATOR_MAX_ROUNDS || 5);
  const runId = path.basename(opts.runDir);
  fs.mkdirSync(opts.runDir, { recursive: true });
  const P = (f: string) => path.join(opts.runDir, f);
  const transcript = P("transcript.jsonl");
  writeJson(P("task.json"), { runId, task: opts.task, startedAt: now(), models: { claude: opts.claude.model, gpt: opts.gpt.model }, maxRounds });

  const claudeMsgs: ClaudeMessage[] = [];
  const gptMsgs: GptMessage[] = [];
  const rounds: RoundRecord[] = [];
  let lastGpt: GptMessage | null = null;
  let lastTestOutput = "";
  let lastDiff = "";
  let outcome: Outcome = "max-rounds";
  let humanApproval = { needed: false, reason: "" };

  const finish = (oc: Outcome): RunResult => {
    outcome = oc;
    const report = renderReport(opts.task, runId, rounds, oc, humanApproval, { claude: opts.claude.model, gpt: opts.gpt.model });
    fs.writeFileSync(P("final-report.md"), report);
    writeJson(P("claude-analysis.json"), claudeMsgs);
    writeJson(P("gpt-review.json"), gptMsgs);
    return { runId, outcome: oc, rounds: rounds.length, reportPath: P("final-report.md"), models: { claude: opts.claude.model, gpt: opts.gpt.model }, humanApproval: humanApproval.needed ? humanApproval : undefined };
  };

  for (let round = 1; round <= maxRounds; round++) {
    if (opts.pauseCheck?.()) { appendJsonl(transcript, { ts: now(), kind: "paused", round }); return finish("paused"); }

    // ── Claude ──
    const claudeUser = buildClaudeInput(opts.task, round, lastGpt, lastDiff, lastTestOutput);
    let sanitized: { text: string; hits: Record<string, number> };
    try { sanitized = sanitizeForModel(claudeUser, { names: opts.names }); }
    catch (e: any) { appendJsonl(transcript, { ts: now(), kind: "pii-blocked", stage: "claude-input", error: e?.message }); humanApproval = { needed: true, reason: "익명화되지 않은 PII 감지 — API 전송 차단" }; return finish("blocked"); }
    appendJsonl(transcript, { ts: now(), kind: "claude-request", round, redactions: sanitized.hits });
    const cRes = await callStructured(opts.claude, CLAUDE_SYSTEM, [{ role: "user", content: sanitized.text }], parseClaude, (ev) => appendJsonl(transcript, { ts: now(), kind: "claude-parse", ...(ev as object) }));
    if (!cRes) { humanApproval = { needed: true, reason: "Claude 응답 schema 강제 실패(3회) — 진행 불가" }; return finish("blocked"); }
    const claude = cRes.value; claudeMsgs.push(claude);
    writeJson(P("claude-analysis.json"), claudeMsgs);
    appendJsonl(transcript, { ts: now(), kind: "claude-message", round, phase: claude.phase, summary: maskForLog(claude.summary) });

    if (claude.needs_human_approval || claude.phase === "blocked") {
      humanApproval = { needed: true, reason: claude.approval_reason || `Claude phase=${claude.phase}` };
      rounds.push({ round, claude, gpt: null, ranTests: false, testsPassed: null, changedFiles: 0, failureSignature: null });
      return finish(claude.phase === "blocked" ? "blocked" : "needs-human");
    }

    // ── 실행(수정 적용 + 명령) ──
    let changedFiles = 0; let ranTests = false; let testsPassed: boolean | null = null; let blockedCmd: string | null = null;
    if (claude.file_edits.length) {
      try { opts.workspace.assertNotMain(); const w = opts.workspace.applyEdits(claude.file_edits); appendJsonl(transcript, { ts: now(), kind: "edits-applied", files: w }); }
      catch (e: any) { humanApproval = { needed: true, reason: `수정 적용 차단: ${e?.message}` }; rounds.push({ round, claude, gpt: null, ranTests, testsPassed, changedFiles, failureSignature: "edit-blocked" }); return finish("blocked"); }
    }
    const cmdResults: ReturnType<typeof runCommand>[] = [];
    for (const cmd of claude.commands) {
      const res = runCommand(cmd, { cwd: opts.workspace.root, timeoutMs: opts.commandTimeoutMs });
      cmdResults.push(res);
      appendJsonl(transcript, { ts: now(), kind: "command", cmd: res.cmd, executed: res.executed, blocked: res.blocked, reason: res.reason, code: res.code });
      if (res.blocked) { blockedCmd = res.reason; }
      if (res.executed && /test|pytest|--test/i.test(cmd)) { ranTests = true; testsPassed = res.code === 0; lastTestOutput = res.output; }
    }
    fs.writeFileSync(P("tests.log"), lastTestOutput);
    const d = opts.workspace.diff(); lastDiff = d.patch; changedFiles = d.changedFiles.length;
    fs.writeFileSync(P("git-diff.patch"), d.patch);

    if (blockedCmd) {
      humanApproval = { needed: true, reason: `금지 명령 요청 차단: ${blockedCmd}` };
      rounds.push({ round, claude, gpt: null, ranTests, testsPassed, changedFiles, failureSignature: "cmd-blocked" });
      return finish("blocked");
    }

    // ── GPT 검문 ──
    const gptUser = buildGptInput(opts.task, claude, d.patch, lastTestOutput, ranTests, testsPassed);
    let gsan: { text: string; hits: Record<string, number> };
    try { gsan = sanitizeForModel(gptUser, { names: opts.names }); }
    catch (e: any) { appendJsonl(transcript, { ts: now(), kind: "pii-blocked", stage: "gpt-input", error: e?.message }); humanApproval = { needed: true, reason: "익명화되지 않은 PII 감지 — API 전송 차단" }; return finish("blocked"); }
    appendJsonl(transcript, { ts: now(), kind: "gpt-request", round, redactions: gsan.hits });
    const gRes = await callStructured(opts.gpt, GPT_SYSTEM, [{ role: "user", content: gsan.text }], parseGpt, (ev) => appendJsonl(transcript, { ts: now(), kind: "gpt-parse", ...(ev as object) }));
    if (!gRes) { humanApproval = { needed: true, reason: "GPT 응답 schema 강제 실패(3회) — 진행 불가" }; return finish("blocked"); }
    const gpt = gRes.value; gptMsgs.push(gpt); lastGpt = gpt;
    writeJson(P("gpt-review.json"), gptMsgs);
    appendJsonl(transcript, { ts: now(), kind: "gpt-message", round, verdict: gpt.verdict, goal_satisfied: gpt.goal_satisfied, required_changes: gpt.required_changes });

    const failureSignature = gpt.verdict === "revise" ? crypto.createHash("sha256").update(JSON.stringify(gpt.required_changes) + (testsPassed === false ? lastTestOutput.slice(0, 500) : "")).digest("hex").slice(0, 16) : null;
    rounds.push({ round, claude, gpt, ranTests, testsPassed, changedFiles, failureSignature });

    if (gpt.needs_human_approval) { humanApproval = { needed: true, reason: "GPT 가 사람 승인 필요 판정" }; return finish("needs-human"); }
    if (gpt.verdict === "blocked") { humanApproval = { needed: true, reason: "GPT verdict=blocked" }; return finish("blocked"); }

    // 완료 판정.
    const comp = canComplete(rounds, opts.task, { maxRounds, qualityKeywords: opts.qualityKeywords });
    if (gpt.verdict === "approve" && comp.ok) { return finish("complete"); }
    appendJsonl(transcript, { ts: now(), kind: "not-complete", reasons: comp.reasons });

    // 중단 규칙(동일 실패 반복·최대).
    const stop = shouldStop(rounds, { maxRounds, qualityKeywords: opts.qualityKeywords });
    if (stop.stop) { humanApproval = { needed: true, reason: stop.reason }; return finish("stopped"); }
    // 다음 라운드: GPT 지적을 Claude 입력에 자동 포함(lastGpt 사용).
  }
  return finish("max-rounds");
}

function buildClaudeInput(task: string, round: number, lastGpt: GptMessage | null, lastDiff: string, lastTest: string): string {
  const parts = [`[작업 목표]\n${task}`];
  if (round === 1) parts.push("[단계] 저장소·로그를 조사해 원인 후보와 근거를 제시하고(analysis), 필요한 최소 수정 계획을 제안하라.");
  else {
    parts.push("[GPT 감사자 지적 — 반드시 반영]");
    parts.push(`필수 수정: ${JSON.stringify(lastGpt?.required_changes ?? [])}`);
    parts.push(`누락 근거: ${JSON.stringify(lastGpt?.missing_evidence ?? [])}`);
    parts.push(`지적: ${JSON.stringify(lastGpt?.findings ?? [])}`);
    parts.push("위 지적을 반영해 코드 수정(file_edits)과 검증 테스트(commands)를 수행하라(implementation/test/revision).");
    if (lastTest) parts.push(`[직전 테스트 출력(마스킹)]\n${maskForLog(lastTest).slice(0, 1500)}`);
    if (lastDiff) parts.push(`[직전 변경 diff(마스킹)]\n${maskForLog(lastDiff).slice(0, 1500)}`);
  }
  return parts.join("\n\n");
}

function buildGptInput(task: string, claude: ClaudeMessage, diff: string, testOut: string, ranTests: boolean, testsPassed: boolean | null): string {
  return [
    `[작업 목표]\n${task}`,
    `[Claude 판단]\nphase=${claude.phase}\nsummary=${claude.summary}\nevidence=${JSON.stringify(claude.evidence)}\nfiles_to_change=${JSON.stringify(claude.files_to_change)}\nrisks=${JSON.stringify(claude.risks)}\nmetrics=${JSON.stringify(claude.metrics)}`,
    `[테스트] 실행=${ranTests} 통과=${testsPassed}\n${maskForLog(testOut).slice(0, 2000)}`,
    `[git diff(마스킹)]\n${maskForLog(diff).slice(0, 3000)}`,
    "위를 검문하라. 증거 부족·추측 수정·회귀 위험·테스트가 실제 문제를 검증하는지 판정하고, 목표 달성 시에만 approve+goal_satisfied=true.",
  ].join("\n\n");
}

function renderReport(task: string, runId: string, rounds: RoundRecord[], outcome: Outcome, human: { needed: boolean; reason: string }, models: { claude: string; gpt: string }): string {
  const lines: string[] = [];
  lines.push(`# AI 협업 실행 보고 — ${runId}`, "");
  lines.push(`- 작업: ${maskForLog(task)}`);
  lines.push(`- 모델: Claude=${models.claude} · GPT=${models.gpt}`);
  lines.push(`- 결과: **${outcome}** · 자동 왕복 라운드: ${rounds.length}`);
  if (human.needed) lines.push(`- 사람 승인 필요: ${human.reason}`);
  lines.push("");
  for (const r of rounds) {
    lines.push(`## 라운드 ${r.round}`);
    lines.push(`- Claude(${r.claude.phase}): ${maskForLog(r.claude.summary)}`);
    if (r.claude.metrics && Object.keys(r.claude.metrics).length) lines.push(`  - 수치: ${JSON.stringify(r.claude.metrics)}`);
    lines.push(`  - 변경 파일: ${r.changedFiles} · 테스트: 실행=${r.ranTests} 통과=${r.testsPassed}`);
    if (r.gpt) {
      lines.push(`- GPT: verdict=**${r.gpt.verdict}** · goal_satisfied=${r.gpt.goal_satisfied}`);
      if (r.gpt.required_changes.length) lines.push(`  - 필수 수정 요구: ${r.gpt.required_changes.map((x) => maskForLog(x)).join(" / ")}`);
      if (r.gpt.findings.length) lines.push(`  - 지적: ${r.gpt.findings.map((x) => maskForLog(x)).join(" / ")}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
