// 개명 희망사항 후보 찾기: 고객이 보낸 문자 중 '희망사항'으로 보이는 것을 Gemini가 골라줌.
// 하이브리드 — AI가 후보만 제시, 실제 반영(칸에 추가)은 원장님이 클릭으로 확정.
import { knopStore } from "./store";
import { geminiJson } from "../reviewPipeline/gemini";

const SCHEMA = {
  type: "object",
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          reason: { type: "string" }, // 왜 희망사항으로 봤는지 짧게
        },
        required: ["index", "reason"],
      },
    },
  },
  required: ["candidates"],
};

const SYSTEM =
  "당신은 개명 상담 보조입니다. 고객이 보낸 문자 목록에서 '개명 희망사항'에 해당하는 메시지의 index만 고릅니다. " +
  "개명 희망사항 = 원하는 새 이름의 방향(직업·성격·재물·결혼·건강·대인관계·운 등 바라는 삶의 모습, 이름에 담고 싶은 가치·소망). " +
  "단순 인사·감사·일정 조율·짧은 확인 답장('네','감사합니다' 등)·결제 안내는 제외합니다. 애매하면 포함하지 말고 확실한 것만 고릅니다.";

export type WishCandidate = { text: string; at: string | null; reason: string };

export async function findWishCandidates(customerId: string): Promise<WishCandidate[]> {
  const msgs = await knopStore.customerMessages(customerId);
  // 고객이 보낸(받음) 문자만, 너무 짧은 건 제외
  const received = msgs.filter((m) => m.direction === "받음" && (m.body || "").trim().length >= 15);
  if (!received.length) return [];
  const listText = received.map((m, i) => `[${i}] ${(m.body || "").replace(/\s+/g, " ").trim()}`).join("\n");
  const out = await geminiJson<{ candidates: { index: number; reason: string }[] }>(
    SYSTEM,
    [{ text: `아래 고객이 보낸 문자 목록에서 개명 희망사항인 것들의 index를 골라줘.\n\n${listText}` }],
    SCHEMA,
    2048,
  );
  const reasonBy = new Map((out.candidates || []).map((c) => [c.index, c.reason]));
  return received
    .map((m, i) => ({ i, m }))
    .filter(({ i }) => reasonBy.has(i))
    .map(({ i, m }) => ({ text: m.body, at: m.at, reason: reasonBy.get(i) || "" }));
}
