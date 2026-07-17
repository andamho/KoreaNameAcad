// 교정규칙 검증기 — "반복 횟수"가 아니라 "전역 치환해도 안전한 ASR 오류인가"로 판정.
// 사용자가 전사를 고쳤다는 사실만으로 전역 규칙을 만들지 않는다(문맥 수정/문장 다듬기 분리).
import { FORTUNE_TERMS } from "./fortuneTerms";

// ── 보호 단어 ──
// 오행/십성 등 성명학 기본 용어(원문에 등장하면 학습 금지)
const OHAENG = new Set([
  "목","화","토","금","수","목운","화운","토운","금운","수운",
  "금토수","목화토","비겁","식상","재성","관성","인성","천간","지지","오행","음양",
]);
// 흔한 상용어(전역 치환하면 대화가 망가짐)
const COMMON_STOP = new Set([
  "오늘","내일","어제","지금","이제","그냥","정말","진짜","조금","그런","이런","저런","우리","제가","그게","이게",
  "사람","이름","생각","이야기","말씀","선생","경우","때문","그거","여기","거기","저기","하나","자기","자녀",
  "당신","당신은","좋겠다","겁니다","좋고","하게","대로","이따","오는","위로","말이","그리고","하지만","그래서",
  "있다","없다","하다","되다","같다","보다","주다","오다","가다","좋다","싶다","많다","크다","작다",
]);
// 조사·어미 단독(1글자)은 아래 길이검사에서 이미 걸림. 짧다는 이유만으로 막으면
// "온이→운이" 같은 진짜 ASR 오류까지 막히므로, 실제 사용 여부는 코퍼스 빈도로 판단한다.

// 판정 코드. severity=structural → 구조적으로 위험(=disabled), borderline → 사람 확인(pending+needsReview)
export type ReasonCode =
  | "OK"
  | "SAME" | "TOO_SHORT" | "NOT_HANGUL"
  | "PROTECTED_TERM" | "PROTECTED_OHAENG" | "PROTECTED_COMMON"
  | "CORPUS_COMMON" | "REVERSE_RISK"
  | "CONTEXT_EDIT" | "MULTI_WORD" | "LENGTH_DIFF" | "LOW_SIM"
  | "BORDERLINE";

// 구조적으로 위험 → 자동 disabled (전역 치환하면 안 되는 종류)
const STRUCTURAL: ReadonlySet<ReasonCode> = new Set<ReasonCode>([
  "PROTECTED_TERM","PROTECTED_OHAENG","PROTECTED_COMMON","CORPUS_COMMON","REVERSE_RISK",
  "CONTEXT_EDIT","MULTI_WORD","LOW_SIM","SAME","TOO_SHORT","NOT_HANGUL",
]);
export function isStructural(code: ReasonCode): boolean {
  return STRUCTURAL.has(code);
}

export type RuleVerdict = { ok: boolean; code: ReasonCode; reason?: string; sim: number; borderline?: boolean };

// ── 한글 자모 분해 + 발음 유사도 ──
const CHO = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
const JUNG = ["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"];
const JONG = ["","ㄱ","ㄲ","ㄳ","ㄴ","ㄵ","ㄶ","ㄷ","ㄹ","ㄺ","ㄻ","ㄼ","ㄽ","ㄾ","ㄿ","ㅀ","ㅁ","ㅂ","ㅄ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
function toJamo(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c >= 0xac00 && c <= 0xd7a3) {
      const n = c - 0xac00;
      out += CHO[Math.floor(n / 588)] + JUNG[Math.floor((n % 588) / 28)] + JONG[n % 28];
    } else out += ch;
  }
  return out;
}
function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const t = dp[i];
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return dp[m];
}
export function phonSim(a: string, b: string): number {
  const ja = toJamo(a), jb = toJamo(b);
  const L = Math.max(ja.length, jb.length) || 1;
  return 1 - lev(ja, jb) / L;
}

// 전역 치환 허용 최소 발음 유사도 (권희천→건위천 통과 / 당신은→잠시만 차단)
const MIN_SIM = 0.6;

/**
 * 이 규칙을 전역 교정으로 써도 안전한가?
 * @param corpusFreq 전사문에서 '원문'이 등장한 횟수(정상 단어면 자주 나옴). 없으면 검사 생략.
 */
export function validateRule(wrong: string, right: string, corpusFreq?: number): RuleVerdict {
  const sim = phonSim(wrong, right);
  const F = (code: ReasonCode, reason: string): RuleVerdict => ({ ok: false, code, reason, sim });

  if (!wrong || !right || wrong === right) return F("SAME", "빈 값/동일");
  if (wrong.length < 2) return F("TOO_SHORT", "원문이 너무 짧음(1글자)");
  if (!/[가-힣]/.test(wrong)) return F("NOT_HANGUL", "한글 아님");

  // 1) 보호 단어 — 원문 쪽에 등장하면 학습 금지(구조적 위험)
  if (FORTUNE_TERMS.has(wrong)) return F("PROTECTED_TERM", "보호어: 주역괘·수리운 정식 용어");
  if (OHAENG.has(wrong)) return F("PROTECTED_OHAENG", "보호어: 오행·성명학 기본 용어");
  if (COMMON_STOP.has(wrong)) return F("PROTECTED_COMMON", "보호어: 일반 상용어");

  // 2) 코퍼스 빈도 — 자주 나오면 실제로 쓰이는 정상 단어(전역 치환 금지)
  //    ※ 보조 신호이며 '차단' 방향으로만 쓴다(빈도가 낮다고 통과시키지는 않음).
  if (corpusFreq !== undefined && corpusFreq >= 5)
    return F("CORPUS_COMMON", `정상 단어로 보임(전사문에 ${corpusFreq}회 등장)`);

  // 2-1) 역방향 위험: 흔한 말을 도메인 용어로 바꾸는 규칙(사이→산뢰이, 강사님→간위산)
  if (FORTUNE_TERMS.has(right) && !FORTUNE_TERMS.has(wrong) && corpusFreq !== undefined && corpusFreq >= 2)
    return F("REVERSE_RISK", `역방향 위험: 실제 쓰이는 말(${corpusFreq}회)을 도메인 용어로 치환`);

  // 3) 문맥 수정/문장 다듬기 분리 — 단순 추가·삭제는 ASR 오류가 아님
  if (right.includes(wrong) || wrong.includes(right)) return F("CONTEXT_EDIT", "단어 추가/삭제(문맥 수정)");
  if (/\s/.test(wrong) || /\s/.test(right)) return F("MULTI_WORD", "여러 단어(문장 수정)");

  // 4) 길이 차이 — 지나치면 의미 재작성 (경계값 → 사람 확인)
  if (Math.abs(wrong.length - right.length) > 2)
    return { ok: false, code: "LENGTH_DIFF", reason: `길이 차이 큼(${wrong.length}→${right.length})`, sim, borderline: true };

  // 5) 발음 유사도 — 낮으면 의미 재작성. 도메인 용어라도 이 기준은 우회 못 함.
  if (sim < MIN_SIM) return F("LOW_SIM", `발음 차이 큼(유사도 ${sim.toFixed(2)}) = 의미 재작성`);

  // 경계값(유사도 아슬아슬) → 통과시키되 사람 확인 표시
  if (sim < MIN_SIM + 0.05)
    return { ok: true, code: "BORDERLINE", reason: `경계값(유사도 ${sim.toFixed(2)}) — 확인 권장`, sim, borderline: true };

  return { ok: true, code: "OK", sim };
}

// active 승격: validator 통과 AND 독립 증거(서로 다른 전사) 2건 이상
export const MIN_DISTINCT_SOURCES = 2;
export function shouldActivate(distinctSourceCount: number, v: RuleVerdict): boolean {
  return v.ok && distinctSourceCount >= MIN_DISTINCT_SOURCES;
}
