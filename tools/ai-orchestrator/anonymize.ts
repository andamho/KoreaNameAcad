// 익명화 계층 — Claude/GPT API 로 나가는 모든 텍스트 + 로그에 적용.
//   고객 원문·개인정보 전체를 그대로 API 로 보내지 않는다. 마스킹 안 된 PII 감지 시 API 호출 차단.
//   원문은 로컬에만 유지, 모델에는 필요한 최소 문맥만(마스킹된) 전송.

export interface RedactionResult { text: string; hits: Record<string, number>; }

// PII 패턴(한국). 값은 절대 로그에 남기지 않고 토큰으로 치환.
const PATTERNS: { name: string; re: RegExp; token: string }[] = [
  { name: "email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, token: "[EMAIL]" },
  { name: "rrn", re: /\b\d{6}[-\s]?[1-4]\d{6}\b/g, token: "[RRN]" },              // 주민등록번호
  { name: "card", re: /\b(?:\d[ -]?){13,16}\b/g, token: "[CARD]" },
  { name: "phone", re: /\b0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}\b/g, token: "[PHONE]" }, // 010-1234-5678 등
  { name: "phone_intl", re: /\+82[-\s]?\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}/g, token: "[PHONE]" },
  { name: "account", re: /\b\d{2,3}-\d{2,6}-\d{2,8}\b/g, token: "[ACCOUNT]" },     // 계좌번호 유형
  { name: "address", re: /[가-힣]+(?:특별시|광역시|도)\s?[가-힣]+(?:시|군|구)\s?[가-힣0-9]+(?:읍|면|동|로|길)\s?\d[\d-]*/g, token: "[ADDRESS]" },
];

// 시크릿(키·DSN) — 로그 마스킹 전용(모델 전송엔 애초에 안 넣음).
const SECRETS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{10,}/g,                 // OpenAI
  /sk-ant-[A-Za-z0-9_-]{10,}/g,             // Anthropic
  /postgres(?:ql)?:\/\/[^\s"']+/g,          // DSN
  /npg_[A-Za-z0-9]{6,}/g,                   // Neon password
  /[A-Za-z0-9_.-]+\.neon\.tech(?::\d+)?/g,  // Neon host
  /\b[A-Za-z0-9]{32,}\b/g,                  // 긴 토큰(보수적)
];

// 이름 토큰화: 알려진 고객명 집합을 [NAME_n] 으로 안정 치환(원문 이름 미노출).
export function tokenizeNames(text: string, names: string[]): { text: string; count: number } {
  let out = text, count = 0;
  const sorted = [...new Set(names.filter((n) => n && n.trim().length >= 2))].sort((a, b) => b.length - a.length);
  sorted.forEach((n, i) => {
    const re = new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    out = out.replace(re, () => { count++; return `[NAME_${i + 1}]`; });
  });
  return { text: out, count };
}

// PII 마스킹(모델 전송 전 필수). names 제공 시 이름도 토큰화.
export function redact(text: string, opts: { names?: string[] } = {}): RedactionResult {
  const hits: Record<string, number> = {};
  let out = text ?? "";
  if (opts.names?.length) { const r = tokenizeNames(out, opts.names); out = r.text; if (r.count) hits["name"] = r.count; }
  for (const p of PATTERNS) {
    out = out.replace(p.re, () => { hits[p.name] = (hits[p.name] || 0) + 1; return p.token; });
  }
  return { text: out, hits };
}

// 로그 마스킹 — PII + 시크릿 모두 제거.
export function maskForLog(text: string): string {
  let out = redact(text).text;
  for (const re of SECRETS) out = out.replace(re, "<redacted>");
  return out;
}

// 마스킹 안 된 PII 잔존 여부(모델 전송 직전 최종 검문). true 면 호출 차단.
export function hasUnmaskedPII(text: string): { blocked: boolean; kinds: string[] } {
  const kinds: string[] = [];
  // 토큰([EMAIL] 등)으로 이미 치환된 건 무시하고, 원문 PII 패턴이 남아있으면 차단.
  for (const p of PATTERNS) { p.re.lastIndex = 0; if (p.re.test(text)) kinds.push(p.name); }
  return { blocked: kinds.length > 0, kinds };
}

// 모델 전송용 안전 텍스트 생성 — 마스킹 후에도 PII 남으면 throw(fail-closed).
export function sanitizeForModel(text: string, opts: { names?: string[] } = {}): { text: string; hits: Record<string, number> } {
  const r = redact(text, opts);
  const check = hasUnmaskedPII(r.text);
  if (check.blocked) throw new Error(`익명화 실패 — 마스킹되지 않은 PII 감지(${check.kinds.join(",")}): API 호출 차단`);
  return { text: r.text, hits: r.hits };
}
