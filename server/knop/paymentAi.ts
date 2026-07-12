// 결제 문자 AI 분석 + 고객/프로젝트 매칭 (Gemini 재사용)
import { geminiJson } from "../reviewPipeline/gemini";
import { db } from "../db";
import { customers, projects, normalizePhone } from "@shared/schema";
import type { ParsedPayment, InboxSuggestion, Customer, Project } from "@shared/schema";
import { eq } from "drizzle-orm";

const PARSE_SYSTEM = `너는 한국 은행 입금 문자와 카드 승인 문자를 분석하는 도우미다.
주어진 문자에서 결제/입금 정보를 정확히 추출해 JSON으로만 답한다.
- isPayment: 입금 또는 카드결제 알림이면 true, 광고/인증번호/기타면 false
- kind: "입금" | "카드결제" | "기타"
- depositorName: 입금자명 또는 카드 사용자명(문자에 나온 이름). 없으면 ""
- amount: 금액(숫자만, 원). 없으면 0
- method: "현금" | "카드" | "기타" (은행 입금이면 현금)
- institution: 은행명 또는 카드사명. 없으면 ""
- occurredAt: 문자에 적힌 날짜/시간 문자열 그대로. 없으면 ""
반드시 지정된 JSON 스키마로만 답한다.`;

const PARSE_SCHEMA = {
  type: "object",
  properties: {
    isPayment: { type: "boolean" },
    kind: { type: "string" },
    depositorName: { type: "string" },
    amount: { type: "integer" },
    method: { type: "string" },
    institution: { type: "string" },
    occurredAt: { type: "string" },
  },
  required: ["isPayment", "kind", "depositorName", "amount", "method"],
};

export async function parsePaymentSms(rawText: string): Promise<ParsedPayment> {
  const out = await geminiJson<ParsedPayment>(
    PARSE_SYSTEM,
    [{ text: rawText }],
    PARSE_SCHEMA,
    512,
  );
  return {
    isPayment: !!out.isPayment,
    kind: out.kind || "기타",
    depositorName: (out.depositorName || "").trim(),
    amount: Number(out.amount) || 0,
    method: out.method || "기타",
    institution: out.institution || "",
    occurredAt: out.occurredAt || "",
  };
}

// 이름 유사도(간단): 완전일치 100, 포함 80, 성(첫글자)일치 40
function nameScore(depositor: string, customerName: string): number {
  const a = depositor.replace(/\s/g, "");
  const b = customerName.replace(/\s/g, "");
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (b.includes(a) || a.includes(b)) return 80;
  if (a[0] === b[0] && a.length >= 2 && b.length >= 2) return 40;
  return 0;
}

// 열린 프로젝트(결제완료 아닌) 우선 가중치
function projectOpenBonus(p: Project): number {
  return p.paymentStatus === "결제완료" ? 0 : 15;
}

export type MatchResult = {
  suggestions: InboxSuggestion[];
  suggestedCustomerId: string | null;
  suggestedProjectId: string | null;
  confidence: number;
};

// 파싱된 입금자명으로 고객/프로젝트 매칭
export async function matchPayment(parsed: ParsedPayment): Promise<MatchResult> {
  const empty: MatchResult = { suggestions: [], suggestedCustomerId: null, suggestedProjectId: null, confidence: 0 };
  if (!db) return empty;

  const allCustomers: Customer[] = await db.select().from(customers);
  const scored = allCustomers
    .map((c) => ({ c, s: nameScore(parsed.depositorName, c.name) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 5);

  const suggestions: InboxSuggestion[] = [];
  for (const { c, s } of scored) {
    const projs: Project[] = await db.select().from(projects).where(eq(projects.customerId, c.id));
    if (projs.length === 0) {
      suggestions.push({ customerId: c.id, customerName: c.name, projectId: null, projectTitle: null, score: s });
      continue;
    }
    for (const p of projs) {
      suggestions.push({
        customerId: c.id,
        customerName: c.name,
        projectId: p.id,
        projectTitle: p.title,
        score: Math.min(100, s + projectOpenBonus(p)),
      });
    }
  }
  suggestions.sort((a, b) => b.score - a.score);

  const top = suggestions[0];
  const second = suggestions[1];
  // 최상위와 2위 점수차가 크고 이름 완전일치면 확신도 높게
  let confidence = 0;
  if (top) {
    confidence = top.score;
    if (second && top.score - second.score < 10) confidence = Math.min(confidence, 60); // 후보 경합 → 낮춤
  }

  return {
    suggestions: suggestions.slice(0, 8),
    suggestedCustomerId: top?.customerId ?? null,
    suggestedProjectId: top?.projectId ?? null,
    confidence,
  };
}
