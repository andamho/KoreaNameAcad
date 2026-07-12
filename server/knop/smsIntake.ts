// 문자 → 달력 자동 등록: 연락처 이름 파싱 + 문자 대화 분석(Gemini) + 상담 이벤트 초안
// 연락처 이름 형식: "홍길동 260711" (이름 + 등록일YYMMDD), 뒤에 "홍익" 등 추가 가능
import { geminiJson } from "../reviewPipeline/gemini";
import type { CalEvent } from "./calendar";

export type ParsedContact = { name: string; regDate: string | null; hongik: boolean; extra: string };

// 6자리(YYMMDD)가 실제 날짜면 "20YY-MM-DD" 반환, 아니면 null (달마다·날마다 달라지는 등록일)
export function yymmddToDate(d6: string): string | null {
  if (!/^\d{6}$/.test(d6)) return null;
  const mm = +d6.slice(2, 4);
  const dd = +d6.slice(4, 6);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `20${d6.slice(0, 2)}-${d6.slice(2, 4)}-${d6.slice(4, 6)}`;
}

// "홍길동 260711 홍익" → { name:"홍길동", regDate:"2026-07-11", hongik:true, extra:"" }
export function parseContact(raw: string): ParsedContact {
  const s = (raw || "").trim();
  const name = s.match(/^([가-힣]{2,4})/)?.[1] || "";
  // 유효한 날짜인 6자리만 등록일로 인정
  let d6 = "";
  let regDate: string | null = null;
  for (const m of Array.from(s.matchAll(/\d{6}/g))) {
    const iso = yymmddToDate(m[0]);
    if (iso) {
      d6 = m[0];
      regDate = iso;
      break;
    }
  }
  const hongik = /홍익/.test(s);
  const extra = s
    .replace(name, "")
    .replace(d6, "")
    .replace(/홍익/g, "")
    .trim();
  return { name, regDate, hongik, extra };
}

// 신규 고객 판별: 연락처 저장명이 "이름 + 등록일(YYMMDD)"(홍길동 260711)로 시작할 때만 진짜 의뢰인.
// 날짜는 등록 연월일이라 매번 다름 → 6자리가 '실제 날짜(월1~12,일1~31)'인지 검증.
// (그 형태가 아니면 스팸·지인·업체 등으로 보고 무시)
export function isClientContact(raw: string): boolean {
  const m = (raw || "").trim().match(/^[가-힣]{2,4}\s*(\d{6})/);
  return !!(m && yymmddToDate(m[1]));
}

export type ThreadAnalysis = {
  consultDate: string; // YYYY-MM-DD (확정 예정일), 없으면 ""
  consultTime: string; // HH:MM, 없으면 ""
  summary: string;
  confidence: "high" | "medium" | "low";
};

const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    consultDate: { type: "string", description: "상담 예정일 YYYY-MM-DD. 대화에서 합의된 날짜만. 불명확하면 빈 문자열" },
    consultTime: { type: "string", description: "상담 시간 HH:MM(24시간). 불명확하면 빈 문자열" },
    summary: { type: "string", description: "상담 진행상황 한 줄 요약(한국어)" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["consultDate", "consultTime", "summary", "confidence"],
};

export async function analyzeThread(contact: ParsedContact, phone: string, messages: string): Promise<ThreadAnalysis> {
  const sys = `너는 한국이름학교(작명·개명 상담소)의 상담일정 비서다.
의뢰인과 주고받은 문자 대화를 읽고, 확정된 '상담 예정 날짜/시간'을 정확히 뽑아라.
- 대화에서 서로 "언제/몇 시에 하자"고 합의된 일정만 유효하다.
- 확정되지 않았으면 consultDate/consultTime을 빈 문자열("")로 둔다. 추측하지 마라.
- 상대적 표현("내일","모레","다음주 화요일")은 대화 맥락과 등록일 기준으로 실제 날짜로 환산하라.
- summary는 진행상황 한 줄(한국어).
참고정보 → 의뢰인 이름: ${contact.name || "불명"}, 등록일: ${contact.regDate || "불명"}, 전화: ${phone || "불명"}`;
  return geminiJson<ThreadAnalysis>(sys, [{ text: messages }], ANALYSIS_SCHEMA, 800);
}

// "14:00"→"14", "14:30"→"1430" (달력 제목 규칙: 앞부분이 시간)
export function timeToTitleDigits(t: string): string {
  const m = (t || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "";
  return m[2] === "00" ? m[1] : `${m[1]}${m[2]}`;
}

// 상담 이벤트 초안 (개명여부/인원은 비워둠 → 원장님이 채움)
export function buildConsultEventDraft(p: {
  name: string;
  date: string;
  time: string;
  phone: string;
  hongik: boolean;
  summary?: string;
  code?: string | null;
}): CalEvent {
  const digits = timeToTitleDigits(p.time);
  const title = digits ? `${digits} ${p.name}` : p.name;
  const codeTag = p.code ? `[${p.code}] ` : "";
  return {
    date: p.date,
    title,
    cat: "상담",
    clientPhone: p.phone,
    hongik: p.hongik,
    gaemyeong: 0,
    memo: `${codeTag}KNOP 문자 자동등록${p.summary ? " · " + p.summary : ""}`,
  };
}
