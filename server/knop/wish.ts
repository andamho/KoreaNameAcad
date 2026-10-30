// 개명 희망사항 후보 찾기: 고객이 보낸 문자 중 '희망사항'으로 보이는 것을 Gemini가 골라줌.
// 하이브리드 — AI가 후보만 제시, 실제 반영(칸에 추가)은 원장님이 클릭으로 확정.
// + 새로 들어온 문자는 자동 반영(autoWishFromSms) — 원장님 지시(2026-10-30).
import { sql } from "drizzle-orm";
import { db } from "../db";
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

// ── 자동 반영: 고객이 보낸 새 문자가 희망사항이면 고객정보 '개명 희망사항' 칸에 이어붙인다 ──
// 원장님 지시(2026-10-30): 고객이 희망사항을 문자로 보내면 손으로 옮기지 않아도 들어가게.
// 문자 저장 직후(afterSmsSaved — 폰 매크로·노트북 휴대폰과 연결 공통)에 한 건씩 돈다.
// 희망사항은 길게 쓰므로 짧은 답장('네 알겠습니다' 등)은 AI 를 부르지 않는다.
const AUTO_MIN_LEN = 40;

const ONE_SCHEMA = {
  type: "object",
  properties: { isWish: { type: "boolean" }, reason: { type: "string" } },
  required: ["isWish", "reason"],
};

export async function autoWishFromSms(phone: string, body: string): Promise<{ customerId: string; added: boolean } | null> {
  const text = (body || "").trim();
  if (!db || text.length < AUTO_MIN_LEN) return null;
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  // 같은 번호 고객이 여럿이면(가족·중복 등록) 가장 최근에 손댄 고객
  const cu: any = await db.execute(sql`
    SELECT id, naming_wish FROM customers
    WHERE deleted_at IS NULL AND (normalized_phone = ${digits} OR regexp_replace(phone,'[^0-9]','','g') = ${digits})
    ORDER BY updated_at DESC LIMIT 1`);
  const c = cu.rows?.[0];
  if (!c) return null;
  if (String(c.naming_wish || "").includes(text)) return { customerId: c.id, added: false }; // 이미 들어 있음

  const out = await geminiJson<{ isWish: boolean; reason: string }>(
    SYSTEM,
    [{ text: `고객이 보낸 문자 한 건이야. 개명 희망사항이면 isWish=true.\n\n${text}` }],
    ONE_SCHEMA,
    512,
  );
  if (!out?.isWish) return { customerId: c.id, added: false };

  // 기존 내용 뒤에 한 줄 띄우고 붙인다(화면의 '희망사항에 저장'과 같은 방식). 같은 글이 있으면 다시 안 붙임.
  const up: any = await db.execute(sql`
    UPDATE customers
    SET naming_wish = CASE WHEN coalesce(btrim(naming_wish),'') = '' THEN ${text} ELSE rtrim(naming_wish) || E'\n\n' || ${text} END,
        updated_at = now()
    WHERE id = ${c.id} AND position(${text} in coalesce(naming_wish,'')) = 0
    RETURNING id`);
  const added = (up.rows?.length || 0) > 0;
  if (added) console.log(`[KOP] 개명 희망사항 자동 반영: 고객 ${c.id} (${text.length}자) — ${out.reason}`);
  return { customerId: c.id, added };
}
