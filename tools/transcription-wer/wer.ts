// 통화 전사 WER 측정 — 순수 알고리즘(고객 데이터 무관, 단위테스트 가능).
//   기준(정답)=사람 교정본, 가설(오류)=기계 원본. WER=(S+D+I)/N_ref.
//   한국어는 어절(공백 토큰) 기준 WER + 문자 기준 CER 을 함께 보고(띄어쓰기 민감도 차이).
//   오류 분류는 휴리스틱(조사/어미·띄어쓰기·숫자·기호·이름후보·용어·철자). 원문 단어는 호출측에서 마스킹.

export type Op = "match" | "sub" | "del" | "ins";
export interface AlignedPair { op: Op; ref: string | null; hyp: string | null; }

// 어절 토큰화(공백 분할). 옵션: 문장부호 분리·정규화.
export function tokenizeEojeol(text: string, opts: { stripPunct?: boolean } = {}): string[] {
  let t = (text || "").replace(/\r/g, " ");
  // 문장부호를 토큰 경계로 분리(선택). 기본은 붙여둠(교정본 기준 그대로).
  if (opts.stripPunct) t = t.replace(/[.,!?~…·"'“”‘’()\[\]{}:;]/g, " ");
  return t.split(/\s+/).filter((x) => x.length > 0);
}

// 문자 시퀀스(CER용). 공백 포함/제외 선택.
export function tokenizeChar(text: string, opts: { keepSpace?: boolean } = {}): string[] {
  const t = (text || "").replace(/\r/g, "");
  const s = opts.keepSpace ? t : t.replace(/\s+/g, "");
  return Array.from(s);
}

// Levenshtein DP + backtrace → S/D/I + 정렬쌍. ref=정답, hyp=가설.
export function align(ref: string[], hyp: string[]): { sub: number; del: number; ins: number; matched: number; pairs: AlignedPair[] } {
  const n = ref.length, m = hyp.length;
  const d: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  // backtrace(대각선 우선으로 안정적 정렬)
  let i = n, j = m; const pairs: AlignedPair[] = [];
  let sub = 0, del = 0, ins = 0, matched = 0;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      if (d[i][j] === d[i - 1][j - 1] + cost) {
        if (cost === 0) { pairs.push({ op: "match", ref: ref[i - 1], hyp: hyp[j - 1] }); matched++; }
        else { pairs.push({ op: "sub", ref: ref[i - 1], hyp: hyp[j - 1] }); sub++; }
        i--; j--; continue;
      }
    }
    if (i > 0 && d[i][j] === d[i - 1][j] + 1) { pairs.push({ op: "del", ref: ref[i - 1], hyp: null }); del++; i--; continue; }
    // j > 0
    pairs.push({ op: "ins", ref: null, hyp: hyp[j - 1] }); ins++; j--;
  }
  pairs.reverse();
  return { sub, del, ins, matched, pairs };
}

export interface WerResult {
  refWords: number; hypWords: number;
  sub: number; del: number; ins: number; matched: number;
  wer: number;         // (S+D+I)/N_ref
  pairs: AlignedPair[];
}

export function measureWer(refText: string, hypText: string, opts: { stripPunct?: boolean } = {}): WerResult {
  const ref = tokenizeEojeol(refText, opts);
  const hyp = tokenizeEojeol(hypText, opts);
  const a = align(ref, hyp);
  const wer = ref.length ? (a.sub + a.del + a.ins) / ref.length : 0;
  return { refWords: ref.length, hypWords: hyp.length, sub: a.sub, del: a.del, ins: a.ins, matched: a.matched, wer, pairs: a.pairs };
}

// 문자 오류율(CER) — 띄어쓰기 제외(순수 문자 인식 정확도).
export function measureCer(refText: string, hypText: string): { refChars: number; cer: number; sub: number; del: number; ins: number } {
  const ref = tokenizeChar(refText, { keepSpace: false });
  const hyp = tokenizeChar(hypText, { keepSpace: false });
  const a = align(ref, hyp);
  const cer = ref.length ? (a.sub + a.del + a.ins) / ref.length : 0;
  return { refChars: ref.length, cer, sub: a.sub, del: a.del, ins: a.ins };
}

// ── 오류 분류(휴리스틱) ──
export type ErrorCategory =
  | "spacing"        // 띄어쓰기(어절 병합/분리)
  | "josa-ending"    // 조사/어미(어간 공통, 끝만 다름)
  | "number"         // 숫자 표기
  | "punctuation"    // 문장부호
  | "name-candidate" // 이름/고유명사 후보(호출측에서 사전 대조·마스킹)
  | "term-candidate" // 작명/주역/수리 용어 후보
  | "spelling"       // 철자/음소(발음 유사)
  | "deletion" | "insertion" | "other";

const HANGUL = /[가-힣]/;
const isNumberish = (s: string) => /[0-9]/.test(s) || /^[일이삼사오육칠팔구십백천만억]+$/.test(s);
const stripTail = (s: string) => s.replace(/[.,!?~…·"'“”‘’()\[\]{}:;]/g, "");

// 두 어절이 조사/어미만 다른가(공통 접두 어간 ≥1, 뒤만 다름).
function isJosaEnding(ref: string, hyp: string): boolean {
  const a = stripTail(ref), b = stripTail(hyp);
  if (a === b) return false;
  let k = 0; const min = Math.min(a.length, b.length);
  while (k < min && a[k] === b[k]) k++;
  return k >= 1 && (a.length - k <= 2 && b.length - k <= 2) && HANGUL.test(a) && HANGUL.test(b);
}

export interface CategoryOptions { terms?: Set<string>; names?: Set<string>; }

export function categorize(pair: AlignedPair, opts: CategoryOptions = {}): ErrorCategory {
  if (pair.op === "match") return "other";
  if (pair.op === "del") {
    const r = pair.ref || "";
    if (opts.names && opts.names.has(stripTail(r))) return "name-candidate";
    if (opts.terms && opts.terms.has(stripTail(r))) return "term-candidate";
    if (/^[.,!?~…·"'“”‘’()\[\]{}:;]+$/.test(r)) return "punctuation";
    return "deletion";
  }
  if (pair.op === "ins") {
    const h = pair.hyp || "";
    if (/^[.,!?~…·"'“”‘’()\[\]{}:;]+$/.test(h)) return "punctuation";
    return "insertion";
  }
  // sub
  const r = pair.ref || "", h = pair.hyp || "";
  const rs = stripTail(r), hs = stripTail(h);
  if (opts.names && (opts.names.has(rs) || opts.names.has(hs))) return "name-candidate";
  if (opts.terms && (opts.terms.has(rs) || opts.terms.has(hs))) return "term-candidate";
  if (isNumberish(r) || isNumberish(h)) return "number";
  if (rs.replace(/\s/g, "") === hs.replace(/\s/g, "")) return "spacing";
  if (isJosaEnding(r, h)) return "josa-ending";
  if (/^[.,!?~…·"'“”‘’()\[\]{}:;]+$/.test(r) || /^[.,!?~…·"'“”‘’()\[\]{}:;]+$/.test(h)) return "punctuation";
  return "spelling";
}

export function categorizeAll(pairs: AlignedPair[], opts: CategoryOptions = {}): Record<ErrorCategory, number> {
  const counts = {
    spacing: 0, "josa-ending": 0, number: 0, punctuation: 0, "name-candidate": 0,
    "term-candidate": 0, spelling: 0, deletion: 0, insertion: 0, other: 0,
  } as Record<ErrorCategory, number>;
  for (const p of pairs) { if (p.op === "match") continue; counts[categorize(p, opts)]++; }
  return counts;
}
