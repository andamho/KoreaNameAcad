// Claude↔GPT 협업 루프 — 오케스트레이터가 조사·실행·수집을 전담하고, 두 모델은 구조화 JSON 으로만 판단.
//   규칙: 모델끼리 사용자처럼 문답 반복 금지 · GPT 는 질문 대신 required_evidence(≤3) · 오케스트레이터가 증거 수집 →
//   다음 Claude 입력에 최신 정보만 전달(전체 이력 아님) · 기본 2·최대 3라운드 · 같은 명령/수정 2회 실패 → blocked ·
//   선택 개선은 backlog 기록 · 시간 상한 초과 시 자동 중단 · GPT approve 만으로 성공 판정 금지(엄격 게이트).
import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { Provider, Msg } from "./providers/types";
import { Workspace } from "./executor/workspace";
import { runCommand } from "./executor/commands";
import { parseClaude, parseGpt, CLAUDE_SCHEMA_HINT, GPT_SCHEMA_HINT, type ClaudeMessage, type GptMessage } from "./schemas/messages";
import { sanitizeForModel, maskForLog } from "./anonymize";
import { shouldStop, canComplete, classifyTest, extractTestCount, extractGoldenPass, signatureOf, type RoundRecord } from "./policies/completion";

export type Outcome = "complete" | "blocked" | "needs-human" | "max-rounds" | "stopped" | "paused" | "error";

export interface OrchestratorOptions {
  task: string;
  claude: Provider;
  gpt: Provider;
  workspace: Workspace;
  runDir: string;
  maxRounds?: number;            // 기본 2, 최대 3
  names?: string[];
  commandTimeoutMs?: number;
  maxWallMs?: number;            // 시간 상한(초과 시 자동 중단)
  requireGolden?: boolean;       // 영상 과제: 골든 회귀 실행+통과 필수
  targetVideo?: { originalVideo: string; scriptPath?: string; projectPath?: string; regionStart?: number; regionEnd?: number; expected?: string; resultGlob?: string };
  pauseCheck?: () => boolean;
  now?: () => string;
  nowMs?: () => number;
}

export interface RunResult {
  runId: string; outcome: Outcome; rounds: number; reportPath: string;
  models: { claude: string; gpt: string };
  humanApproval?: { needed: boolean; reason: string };
}

const CLAUDE_SYSTEM = `당신은 주담당 엔지니어(Claude)다. 저장소를 직접 조사하지 않는다 — 오케스트레이터가 제공한 증거·diff·테스트 결과만으로 원인과 최소 수정안, 검증 명령을 작성한다. 추측 수정·과도한 기반공사 금지. 자유 장문 금지, 구조화 JSON 만. ${CLAUDE_SCHEMA_HINT}`;
const GPT_SYSTEM = `당신은 감사자(GPT)다. Claude 분석·수정안·실제 diff·테스트 결과를 검문한다. 질문문을 만들지 말 것 — 증거가 부족하면 required_evidence(최대3)로 무엇이 필요한지만 반환한다. required_changes 최대3. 골든 회귀·자막 시각/텍스트 품질·회귀 위험을 검토하고, 실제 테스트가 통과·목표 달성했을 때만 approve+goal_satisfied=true. ${GPT_SCHEMA_HINT}`;

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
function writeJson(p: string, obj: unknown) { fs.writeFileSync(p, JSON.stringify(obj, null, 2)); }
function appendJsonl(p: string, obj: unknown) { fs.appendFileSync(p, JSON.stringify(obj) + "\n"); }

async function callStructured<T>(
  provider: Provider, system: string, messages: Msg[], parse: (raw: string) => { ok: true; value: T } | { ok: false; error: string; raw: string },
  log: (ev: unknown) => void,
): Promise<{ value: T } | { providerError: string } | null> {
  let msgs = messages;
  for (let attempt = 0; attempt < 3; attempt++) {
    let raw: string;
    try { raw = await provider.complete({ system, messages: msgs }); }
    catch (e: any) { const kind = e?.kind ? `[${e.kind}] ` : ""; const pe = kind + maskForLog(String(e?.message ?? e)).slice(0, 200); log({ provider: provider.name, attempt, ok: false, providerError: pe }); return { providerError: pe }; }
    const r = parse(raw);
    if (r.ok) { log({ provider: provider.name, attempt, ok: true }); return { value: r.value }; }
    log({ provider: provider.name, attempt, ok: false, error: r.error });
    msgs = [...msgs, { role: "assistant", content: maskForLog(raw) }, { role: "user", content: `이전 응답이 schema 위반이다(${r.error}). 설명 없이 정확한 JSON 만 다시 출력하라.` }];
  }
  return null;
}

// 규칙3: GPT required_evidence 중 워크스페이스 파일 경로면 읽어 수집(마스킹·절단). 서술형은 다음 Claude 가 commands 로 수집.
function gatherEvidence(ws: Workspace, required: string[]): { collected: { name: string; content: string }[]; pending: string[] } {
  const collected: { name: string; content: string }[] = []; const pending: string[] = [];
  for (const req of required.slice(0, 3)) {
    const rel = req.trim().replace(/^["'`]|["'`]$/g, "");
    const abs = path.resolve(ws.root, rel);
    try {
      if (abs.startsWith(path.resolve(ws.root)) && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        collected.push({ name: rel, content: maskForLog(fs.readFileSync(abs, "utf-8")).slice(0, 2500) });
        continue;
      }
    } catch { /* */ }
    pending.push(req);
  }
  return { collected, pending };
}

export async function runOrchestration(opts: OrchestratorOptions): Promise<RunResult> {
  const now = opts.now ?? (() => new Date().toISOString());
  const nowMs = opts.nowMs ?? (() => Date.now());
  const maxRounds = Math.min(3, Math.max(1, opts.maxRounds ?? 2));        // 기본 2, 최대 3
  const maxWallMs = opts.maxWallMs ?? Number(process.env.AI_ORCHESTRATOR_MAX_WALL_MS || 1_800_000);
  const runId = path.basename(opts.runDir);
  fs.mkdirSync(opts.runDir, { recursive: true });
  const P = (f: string) => path.join(opts.runDir, f);
  const transcript = P("transcript.jsonl");
  const startMs = nowMs();
  writeJson(P("task.json"), { runId, task: opts.task, startedAt: now(), models: { claude: opts.claude.model, gpt: opts.gpt.model }, maxRounds, targetVideo: opts.targetVideo ?? null });

  const claudeMsgs: ClaudeMessage[] = []; const gptMsgs: GptMessage[] = []; const rounds: RoundRecord[] = [];
  const backlog: string[] = [];
  let lastGpt: GptMessage | null = null; let lastTestOutput = ""; let lastDiff = ""; let lastTestStatus = "none"; let lastExit: number | null = null;
  let gathered: { name: string; content: string }[] = [];
  let humanApproval = { needed: false, reason: "" };

  const resultFilesExist = () => {
    if (!opts.targetVideo?.resultGlob) return false;
    try { return fs.existsSync(path.resolve(opts.workspace.root, opts.targetVideo.resultGlob)); } catch { return false; }
  };
  const loopCfg = { maxRounds, requireGolden: !!opts.requireGolden || !!opts.targetVideo, targetVideoSpecified: !!opts.targetVideo, resultFilesExist, beforeAfterProvided: false };

  const finish = (oc: Outcome): RunResult => {
    if (backlog.length) fs.writeFileSync(P("backlog.md"), "# 선택 개선 backlog(실행 안 함)\n\n" + backlog.map((b) => `- ${maskForLog(b)}`).join("\n") + "\n");
    fs.writeFileSync(P("final-report.md"), renderReport(opts.task, runId, rounds, oc, humanApproval, { claude: opts.claude.model, gpt: opts.gpt.model }, opts.targetVideo));
    writeJson(P("claude-analysis.json"), claudeMsgs); writeJson(P("gpt-review.json"), gptMsgs);
    return { runId, outcome: oc, rounds: rounds.length, reportPath: P("final-report.md"), models: { claude: opts.claude.model, gpt: opts.gpt.model }, humanApproval: humanApproval.needed ? humanApproval : undefined };
  };
  const blockHuman = (reason: string, oc: Outcome = "blocked"): RunResult => { humanApproval = { needed: true, reason }; return finish(oc); };

  for (let round = 1; round <= maxRounds; round++) {
    if (opts.pauseCheck?.()) { appendJsonl(transcript, { ts: now(), kind: "paused", round }); return finish("paused"); }
    if (nowMs() - startMs > maxWallMs) { appendJsonl(transcript, { ts: now(), kind: "time-cap", elapsedMs: nowMs() - startMs }); return blockHuman(`시간 상한(${Math.round(maxWallMs / 1000)}s) 초과 — 현재 증거로 중단`, "stopped"); }

    // ── Claude (최신 컨텍스트만) ──
    const claudeUser = buildClaudeInput(opts.task, round, lastGpt, lastDiff, lastTestOutput, lastTestStatus, gathered);
    let sIn: { text: string; hits: Record<string, number> };
    try { sIn = sanitizeForModel(claudeUser, { names: opts.names }); }
    catch (e: any) { appendJsonl(transcript, { ts: now(), kind: "pii-blocked", stage: "claude", error: e?.message }); return blockHuman("익명화되지 않은 PII 감지 — API 전송 차단"); }
    appendJsonl(transcript, { ts: now(), kind: "claude-request", round, redactions: sIn.hits });
    const cRes = await callStructured(opts.claude, CLAUDE_SYSTEM, [{ role: "user", content: sIn.text }], parseClaude, (ev) => appendJsonl(transcript, { ts: now(), kind: "claude-parse", ...(ev as object) }));
    if (!cRes) return blockHuman("Claude 응답 schema 강제 실패(3회)");
    if ("providerError" in cRes) return blockHuman(`Claude provider 오류: ${cRes.providerError}`);
    const claude = cRes.value; claudeMsgs.push(claude); writeJson(P("claude-analysis.json"), claudeMsgs);
    appendJsonl(transcript, { ts: now(), kind: "claude-message", round, root_cause: maskForLog(claude.root_cause), n_changes: claude.proposed_changes.length, n_cmds: claude.commands.length, n_edits: claude.file_edits.length });
    claude.remaining_uncertainty.forEach((u) => backlog.push(`[round${round}] ${u}`)); // 선택/미해결 → backlog

    const reviewGpt = async (promptText: string, phaseLabel: "pre" | "final"): Promise<{ gpt: GptMessage } | { fail: string }> => {
      let s: { text: string; hits: Record<string, number> };
      try { s = sanitizeForModel(promptText, { names: opts.names }); } catch (e: any) { return { fail: "익명화되지 않은 PII 감지 — API 전송 차단" }; }
      appendJsonl(transcript, { ts: now(), kind: "gpt-request", round, phase: phaseLabel, redactions: s.hits });
      const g = await callStructured(opts.gpt, GPT_SYSTEM, [{ role: "user", content: s.text }], parseGpt, (ev) => appendJsonl(transcript, { ts: now(), kind: "gpt-parse", phase: phaseLabel, ...(ev as object) }));
      if (!g) return { fail: "GPT 응답 schema 강제 실패(3회)" };
      if ("providerError" in g) return { fail: `GPT provider 오류: ${g.providerError}` };
      gptMsgs.push(g.value); writeJson(P("gpt-review.json"), gptMsgs);
      appendJsonl(transcript, { ts: now(), kind: "gpt-message", round, phase: phaseLabel, verdict: g.value.verdict, goal_satisfied: g.value.goal_satisfied, required_changes: g.value.required_changes, required_evidence: g.value.required_evidence });
      return { gpt: g.value };
    };

    // ── file_edits 는 즉시 적용하지 않는다: GPT **사전 검문** 승인 후에만 오케스트레이터가 검증·적용 ──
    if (claude.file_edits.length) {
      const pre = await reviewGpt(buildGptPreInput(opts.task, claude), "pre");
      if ("fail" in pre) return blockHuman(pre.fail);
      const g = pre.gpt;
      if (g.verdict !== "approve") {
        lastGpt = g;
        rounds.push({ round, claude, gpt: g, testStatus: "none", testCount: 0, exitCode: null, goldenPass: null, changedFiles: 0, commandSignature: null, failureSignature: signatureOf([claude.root_cause, claude.proposed_changes, g.required_changes]) });
        if (g.verdict === "blocked") return blockHuman(`GPT 사전검문 blocked: ${maskForLog(g.reason).slice(0, 200)}`);
        const evx = gatherEvidence(opts.workspace, g.required_evidence); gathered = evx.collected;
        const st = shouldStop(rounds, loopCfg); if (st.stop) return blockHuman(st.reason, st.blocked ? "blocked" : "stopped");
        continue; // 승인 안 됨 → 적용 없이 다음 라운드에서 수정안 갱신
      }
      // 승인됨 → 오케스트레이터가 경로·해시·허용 작업 검증 후 적용(모델이 직접 수정하지 않음).
      try {
        opts.workspace.assertNotMain();
        const applied = opts.workspace.applyEdits(claude.file_edits);
        const hashes = claude.file_edits.map((e) => ({ path: e.path, sha256: sha256(e.content).slice(0, 16), bytes: e.content.length }));
        appendJsonl(transcript, { ts: now(), kind: "edits-applied", approved_by: "gpt-pre", files: applied, hashes });
      } catch (e: any) { return blockHuman(`수정 적용 차단(검증 실패): ${e?.message}`); }
    }

    // ── commands(테스트·읽기, allowlist) 실행 ──
    let testStatus: ReturnType<typeof classifyTest> = "none"; let testCount = 0; let goldenPass: boolean | null = null; let cmdSig: string | null = null; let blockedCmd: string | null = null;
    for (const cmd of claude.commands.slice(0, 6)) {
      const res = runCommand(cmd, { cwd: opts.workspace.root, timeoutMs: opts.commandTimeoutMs });
      appendJsonl(transcript, { ts: now(), kind: "command", cmd: res.cmd, executed: res.executed, blocked: res.blocked, reason: res.reason, code: res.code });
      if (res.blocked) { blockedCmd = res.reason; continue; }
      const st = classifyTest(cmd, res.executed, res.blocked, res.code, res.output);
      if (st !== "none") { testStatus = st; lastTestOutput = res.output; lastExit = res.code; testCount = extractTestCount(res.output); const g = extractGoldenPass(cmd, res.output, res.code); if (g !== null) goldenPass = g; cmdSig = signatureOf([cmd]); }
    }
    fs.writeFileSync(P("tests.log"), lastTestOutput); lastTestStatus = testStatus;
    const d = opts.workspace.diff(); lastDiff = d.patch; fs.writeFileSync(P("git-diff.patch"), d.patch);
    if (blockedCmd) return blockHuman(`금지 명령 요청 차단(사람 승인 필요): ${blockedCmd}`);

    // ── GPT **최종** 검문 (diff + 테스트 결과) ──
    const finalR = await reviewGpt(buildGptInput(opts.task, claude, d.patch, testStatus, lastTestOutput, lastExit, goldenPass), "final");
    if ("fail" in finalR) return blockHuman(finalR.fail);
    const gpt = finalR.gpt; lastGpt = gpt;

    const failureSignature = gpt.verdict !== "approve" ? signatureOf([claude.root_cause, claude.proposed_changes, d.patch.slice(0, 400), gpt.required_changes]) : null;
    const changedFiles = d.changedFiles.length;
    rounds.push({ round, claude, gpt, testStatus, testCount, exitCode: lastExit, goldenPass, changedFiles, commandSignature: cmdSig, failureSignature });

    if (gpt.verdict === "blocked") return blockHuman(`GPT verdict=blocked: ${maskForLog(gpt.reason).slice(0, 200)}`, "blocked");

    // ── 엄격 완료 판정 ──
    const comp = canComplete(rounds, loopCfg);
    if (gpt.verdict === "approve" && comp.ok) return finish("complete");
    appendJsonl(transcript, { ts: now(), kind: "not-complete", reasons: comp.reasons });

    // 규칙3: required_evidence 수집 → 다음 Claude 입력에 반영.
    const ev = gatherEvidence(opts.workspace, gpt.required_evidence);
    gathered = ev.collected;
    if (ev.pending.length) appendJsonl(transcript, { ts: now(), kind: "evidence-pending", items: ev.pending });

    const stop = shouldStop(rounds, loopCfg);
    if (stop.stop) return blockHuman(stop.reason, stop.blocked ? "blocked" : "stopped");
  }
  return blockHuman(`최대 ${maxRounds}라운드 후 미해결 — 미충족: ${canComplete(rounds, loopCfg).reasons.join(", ")}`, "max-rounds");
}

// 규칙6: 전체 이력 대신 현재 목표·최신 증거·최신 diff·최신 테스트·직전 판정만.
function buildClaudeInput(task: string, round: number, lastGpt: GptMessage | null, diff: string, testOut: string, testStatus: string, gathered: { name: string; content: string }[]): string {
  const parts = [`[현재 목표]\n${task}`];
  if (round === 1) parts.push("[요청] 제공된 증거만으로 원인 후보와 최소 수정안, 검증 명령(commands)을 구조화 JSON 으로. 코드 수정이 필요하면 file_edits 에 전체 내용.");
  else {
    parts.push(`[직전 GPT 판정] verdict=${lastGpt?.verdict}\n필수 수정(≤3): ${JSON.stringify(lastGpt?.required_changes ?? [])}\n필요 증거(≤3): ${JSON.stringify(lastGpt?.required_evidence ?? [])}\nGPT 사유: ${maskForLog(lastGpt?.reason ?? "")}`);
    if (testStatus !== "none") parts.push(`[최신 테스트 상태] ${testStatus}\n${maskForLog(testOut).slice(0, 1800)}`);
    if (diff) parts.push(`[최신 diff]\n${maskForLog(diff).slice(0, 1800)}`);
    if (gathered.length) parts.push(`[오케스트레이터 수집 증거]\n${gathered.map((g) => `# ${g.name}\n${g.content}`).join("\n\n").slice(0, 4000)}`);
    parts.push("[요청] 위 최신 정보만 반영해 갱신된 원인·수정안·검증명령을 구조화 JSON 으로(반복 주장 금지).");
  }
  return parts.join("\n\n");
}

// 사전 검문: 아직 적용 안 된 **수정 계획**(proposed_changes + file_edits 미리보기)을 검문. 승인 시에만 적용.
function buildGptPreInput(task: string, claude: ClaudeMessage): string {
  const editsPreview = claude.file_edits.map((e) => `# ${e.path} (${e.content.length}바이트)\n${maskForLog(e.content).slice(0, 800)}`).join("\n\n");
  return [
    `[현재 목표]\n${task}`,
    `[Claude 수정 계획 — 아직 적용 안 됨]\nproblem=${claude.problem}\nroot_cause=${claude.root_cause}\nproposed_changes=${JSON.stringify(claude.proposed_changes)}\nexpected_result=${claude.expected_result}`,
    `[적용 예정 file_edits 미리보기]\n${maskForLog(editsPreview).slice(0, 3000)}`,
    "이 수정 계획을 **적용하기 전에** 검문하라: 추측 수정·회귀 위험·과도한 변경·골든 훼손 가능성. 안전하고 근거 있으면 approve, 아니면 revise(required_changes ≤3)/blocked. 질문문 금지, 증거 부족이면 required_evidence(≤3). goal_satisfied 는 여기선 false.",
  ].join("\n\n");
}

function buildGptInput(task: string, claude: ClaudeMessage, diff: string, testStatus: string, testOut: string, exitCode: number | null, goldenPass: boolean | null): string {
  return [
    `[현재 목표]\n${task}`,
    `[Claude 판단]\nproblem=${claude.problem}\nroot_cause=${claude.root_cause}\nproposed_changes=${JSON.stringify(claude.proposed_changes)}\nexpected_result=${claude.expected_result}\nevidence=${JSON.stringify(claude.evidence)}`,
    `[최신 테스트] 상태=${testStatus} exit=${exitCode} goldenPass=${goldenPass}\n${maskForLog(testOut).slice(0, 2000)}`,
    `[최신 diff]\n${maskForLog(diff).slice(0, 2500)}`,
    "위를 검문하라. 질문문 금지 — 증거 부족이면 required_evidence(≤3). 실제 테스트 통과·목표 달성 시에만 approve+goal_satisfied=true.",
  ].join("\n\n");
}

function renderReport(task: string, runId: string, rounds: RoundRecord[], outcome: Outcome, human: { needed: boolean; reason: string }, models: { claude: string; gpt: string }, targetVideo?: OrchestratorOptions["targetVideo"]): string {
  const L: string[] = [`# AI 협업 실행 보고 — ${runId}`, ""];
  L.push(`- 대상: ${maskForLog(task).slice(0, 200)}`);
  L.push(`- 실제 대상 영상: ${targetVideo ? maskForLog(targetVideo.originalVideo) : "**미지정**(골든 회귀 확인 범위)"}`);
  L.push(`- 모델: Claude=${models.claude} · GPT=${models.gpt}`);
  L.push(`- 결과: **${outcome}** · 라운드: ${rounds.length}`);
  if (human.needed) L.push(`- 사람 개입/사유: ${maskForLog(human.reason)}`);
  L.push("");
  for (const r of rounds) {
    L.push(`## 라운드 ${r.round}`);
    L.push(`- Claude: 문제=${maskForLog(r.claude.problem)} · 원인=${maskForLog(r.claude.root_cause)}`);
    if (r.claude.proposed_changes.length) L.push(`  - 제안 수정: ${r.claude.proposed_changes.map(maskForLog).join(" / ")}`);
    L.push(`  - 변경파일 ${r.changedFiles} · 테스트 상태=${r.testStatus}(개수 ${r.testCount}, exit ${r.exitCode}) · 골든 ${r.goldenPass}`);
    if (r.gpt) { L.push(`- GPT: verdict=**${r.gpt.verdict}** goal_satisfied=${r.gpt.goal_satisfied} — ${maskForLog(r.gpt.reason).slice(0, 200)}`); if (r.gpt.required_changes.length) L.push(`  - 필수 수정: ${r.gpt.required_changes.map(maskForLog).join(" / ")}`); if (r.gpt.required_evidence.length) L.push(`  - 필요 증거: ${r.gpt.required_evidence.map(maskForLog).join(" / ")}`); }
    L.push("");
  }
  return L.join("\n");
}
