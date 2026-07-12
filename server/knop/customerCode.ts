// 고객번호 K26-0102 = 2026년 01월 02번째 의뢰고객. 개명·번호변경에도 안 바뀌는 불변 앵커.
export type ParsedCode = { year: number; month: number; seq: number; code: string };

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// (연도, 월, 순번) → "K26-0102"
export function formatCode(year: number, month: number, seq: number): string {
  return `K${pad2(year % 100)}-${pad2(month)}${pad2(seq)}`;
}

// "K26-0102 홍길동" 등에서 고객번호 추출. 그냥 날짜 "260711"과 구분하려고 K 또는 하이픈 필수.
export function parseCode(raw: string): ParsedCode | null {
  const s = (raw || "").trim();
  const m = s.match(/K\s*(\d{2})\s*-?\s*(\d{2})(\d+)/i) || s.match(/(\d{2})-(\d{2})(\d+)/);
  if (!m) return null;
  const year = 2000 + parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const seq = parseInt(m[3], 10);
  if (month < 1 || month > 12) return null;
  return { year, month, seq, code: formatCode(year, month, seq) };
}

// 코드의 월 접두(순번 앞부분) — 같은 달 카운트용. "K26-07"
export function monthPrefix(year: number, month: number): string {
  return `K${pad2(year % 100)}-${pad2(month)}`;
}
