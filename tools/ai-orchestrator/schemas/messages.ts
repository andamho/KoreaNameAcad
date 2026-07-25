// Claude↔GPT 협업 계약 — 자유 장문 금지, 구조화 JSON 강제. 파싱 실패 시 재요청, 미검증 응답으로 진행 금지.
//   역할: 오케스트레이터=조사·실행·적용·수집. Claude=증거 분석→원인·수정안·검증명령. GPT=검문(질문 금지, required_evidence 반환).
//   Claude Code 내부 도구는 비활성 — Claude 가 직접 파일/셸을 조사한다고 가정하지 않는다.
import { z } from "zod";

export const GPT_VERDICTS = ["approve", "revise", "blocked"] as const;

// Claude(주담당): 오케스트레이터가 준 증거만으로 분석. 장문 자유토론 금지 — 아래 구조만.
export const ClaudeMessageSchema = z.object({
  problem: z.string().min(1),                                   // 현재 확인된 문제
  evidence: z.array(z.string()).max(5).default([]),            // 핵심 증거 최대 5
  root_cause: z.string().default("아직 미확정"),               // 확정 원인 또는 "아직 미확정"
  proposed_changes: z.array(z.string()).max(3).default([]),    // 필수 수정 최대 3(설명)
  // 실제 코드 변경(선택) — 오케스트레이터가 워크스페이스에 적용해 diff 생성(계획만으론 적용 불가).
  file_edits: z.array(z.object({ path: z.string().min(1), content: z.string() })).max(10).default([]),
  commands: z.array(z.string()).max(6).default([]),            // 오케스트레이터가 실행할 명령
  expected_result: z.string().default(""),                     // 수정 후 기대 결과
  remaining_uncertainty: z.array(z.string()).default([]),      // 미해결/추가 확인 필요
});
export type ClaudeMessage = z.infer<typeof ClaudeMessageSchema>;

// GPT(감사자): 질문문 만들지 말 것. 증거 부족이면 required_evidence(≤3) 반환. required_changes ≤3.
export const GptMessageSchema = z.object({
  verdict: z.enum(GPT_VERDICTS),
  reason: z.string().min(1).max(1200),                         // 한 문단 이내
  required_changes: z.array(z.string()).max(3).default([]),
  required_evidence: z.array(z.string()).max(3).default([]),
  goal_satisfied: z.boolean().default(false),
});
export type GptMessage = z.infer<typeof GptMessageSchema>;

function extractJson(raw: string): string | null {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return body.slice(start, end + 1);
}

function parseWith<S extends z.ZodTypeAny>(schema: S, raw: string): { ok: true; value: z.output<S> } | { ok: false; error: string; raw: string } {
  const json = extractJson(raw);
  if (!json) return { ok: false, error: "JSON 블록을 찾지 못함", raw };
  let obj: unknown;
  try { obj = JSON.parse(json); } catch (e: any) { return { ok: false, error: `JSON 파싱 실패: ${e?.message}`, raw }; }
  const r = schema.safeParse(obj);
  if (!r.success) return { ok: false, error: `schema 위반: ${r.error.issues.map((i) => `${i.path.join(".")}:${i.message}`).join("; ")}`, raw };
  return { ok: true, value: r.data as z.output<S> };
}

export const parseClaude = (raw: string) => parseWith(ClaudeMessageSchema, raw);
export const parseGpt = (raw: string) => parseWith(GptMessageSchema, raw);

export const CLAUDE_SCHEMA_HINT = `반드시 아래 JSON 만 출력(코드펜스 허용, 다른 설명·도구 없이). 자유 장문 금지:
{"problem":"현재 문제","evidence":["증거 최대5"],"root_cause":"확정 원인 또는 아직 미확정","proposed_changes":["필수 수정 최대3"],"file_edits":[{"path":"경로","content":"파일 전체 내용"}],"commands":["오케스트레이터가 실행할 명령"],"expected_result":"수정 후 기대 결과","remaining_uncertainty":[]}`;
export const GPT_SCHEMA_HINT = `반드시 아래 JSON 만 출력(코드펜스 허용). 질문문 만들지 말 것 — 증거 부족이면 required_evidence(최대3) 반환. required_changes 최대3:
{"verdict":"approve|revise|blocked","reason":"한 문단 이내","required_changes":[],"required_evidence":[],"goal_satisfied":false}`;
