// Claude↔GPT 대화 계약 — 자유 장문 금지, JSON schema 강제. 파싱 실패 시 재요청(호출측), 미검증 응답으로 다음 단계 진행 금지.
import { z } from "zod";

export const CLAUDE_PHASES = ["analysis", "implementation", "test", "revision", "blocked", "complete"] as const;
export const GPT_VERDICTS = ["approve", "revise", "blocked"] as const;

// Claude(주담당): 조사·원인·수정계획·구현·테스트·실패분석.
export const ClaudeMessageSchema = z.object({
  phase: z.enum(CLAUDE_PHASES),
  summary: z.string().min(1),
  evidence: z.array(z.string()).default([]),
  files_to_change: z.array(z.string()).default([]),
  // 실제 코드 수정(선택) — executor 가 워크스페이스에 적용해 diff 생성.
  file_edits: z.array(z.object({ path: z.string().min(1), content: z.string() })).default([]),
  commands: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  // 측정 수치(전사/영상 등 목표 수치) — 완료 판정에 사용. 자유 텍스트 금지.
  metrics: z.record(z.string(), z.number()).default({}),
  needs_human_approval: z.boolean().default(false),
  approval_reason: z.string().nullable().default(null),
});
export type ClaudeMessage = z.infer<typeof ClaudeMessageSchema>;

// GPT(조건부 감사자): 원인분석 검문·설계누락·과도기초공사 차단·회귀위험·diff·테스트·목표달성 판정.
export const GptMessageSchema = z.object({
  verdict: z.enum(GPT_VERDICTS),
  findings: z.array(z.string()).default([]),
  required_changes: z.array(z.string()).default([]),
  missing_evidence: z.array(z.string()).default([]),
  goal_satisfied: z.boolean().default(false),
  needs_human_approval: z.boolean().default(false),
});
export type GptMessage = z.infer<typeof GptMessageSchema>;

// 관용 파싱: ```json 코드펜스/앞뒤 잡텍스트 제거 후 첫 {...} 블록만 파싱.
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

// 스키마 안내 문자열(프롬프트에 삽입 — 모델이 정확한 JSON 을 내도록).
export const CLAUDE_SCHEMA_HINT = `반드시 아래 JSON 만 출력(코드펜스 허용, 다른 설명 금지):
{"phase":"analysis|implementation|test|revision|blocked|complete","summary":"짧은 핵심","evidence":["근거"],"files_to_change":["경로"],"file_edits":[{"path":"경로","content":"전체 파일 내용"}],"commands":["실행할 안전한 명령"],"risks":["위험"],"metrics":{"wer":0.05},"needs_human_approval":false,"approval_reason":null}`;
export const GPT_SCHEMA_HINT = `반드시 아래 JSON 만 출력(코드펜스 허용, 다른 설명 금지):
{"verdict":"approve|revise|blocked","findings":["문제점"],"required_changes":["필수 수정"],"missing_evidence":["누락 근거"],"goal_satisfied":false,"needs_human_approval":false}`;
