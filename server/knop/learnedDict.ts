// 공유 학습 교정 사전 (KNOP 통화 전사 ↔ 영상편집 봇 공용)
// 저장 위치: <video-caption-bot>/learned_corrections.json  (correct.py 가 같은 파일을 읽음)
// KNOP에서 전사문을 고치면 원본↔수정본 diff로 "틀린말→맞는말"을 자동 학습해 누적.
import { promises as fs } from "fs";
import path from "path";
import { localTranscribeConfig } from "./localTranscribe";

const LEARNED_PATH = path.join(localTranscribeConfig().dir, "learned_corrections.json");

export type CorrectionRule = {
  wrong: string;
  right: string;
  count: number;
  enabled: boolean;
  source: "learned" | "manual";
  createdAt: string;
  updatedAt: string;
};

type Store = { rules: CorrectionRule[] };

export async function loadRules(): Promise<CorrectionRule[]> {
  try {
    const raw = await fs.readFile(LEARNED_PATH, "utf-8");
    const data = JSON.parse(raw) as Store;
    return Array.isArray(data.rules) ? data.rules : [];
  } catch {
    return [];
  }
}

async function saveRules(rules: CorrectionRule[]): Promise<void> {
  await fs.writeFile(LEARNED_PATH, JSON.stringify({ rules }, null, 2), "utf-8");
}

// ── 한글 자모 분해 + 발음 유사도 (오타=발음비슷 필터용) ──
const CHO = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
const JUNG = ["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"];
const JONG = ["","ㄱ","ㄲ","ㄳ","ㄴ","ㄵ","ㄶ","ㄷ","ㄹ","ㄺ","ㄻ","ㄼ","ㄽ","ㄾ","ㄿ","ㅀ","ㅁ","ㅂ","ㅄ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];

function toJamo(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const n = code - 0xac00;
      out += CHO[Math.floor(n / 588)] + JUNG[Math.floor((n % 588) / 28)] + JONG[n % 28];
    } else {
      out += ch;
    }
  }
  return out;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i];
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[m];
}

function phonSim(a: string, b: string): number {
  const ja = toJamo(a), jb = toJamo(b);
  const d = levenshtein(ja, jb);
  const L = Math.max(ja.length, jb.length) || 1;
  return 1 - d / L;
}

const PARTICLES = ["으로","에서","에게","부터","까지","이라","라고","한테","보다","처럼","만큼",
  "은","는","이","가","을","를","에","도","로","의","와","과","만","께","요","고","해","야"];

function stripPunct(t: string): string {
  return t.replace(/^[\s"'(「『]+|[\s.,?!"')」』]+$/g, "");
}

// old/new 가 같은 조사로 끝나면 그 조사를 떼어 핵심어만 남김
function stripCommonParticle(a: string, b: string): [string, string] {
  for (const p of PARTICLES.slice().sort((x, y) => y.length - x.length)) {
    if (a.length > p.length + 1 && b.length > p.length + 1 && a.endsWith(p) && b.endsWith(p)) {
      return [a.slice(0, -p.length), b.slice(0, -p.length)];
    }
  }
  return [a, b];
}

const hasHangul = (s: string) => /[가-힣]/.test(s);

// 단어 배열 diff(LCS) → 치환 블록 목록 [{old:[], new:[]}]
function diffReplaces(oldToks: string[], newToks: string[]): Array<{ o: string[]; n: string[] }> {
  const m = oldToks.length, n = newToks.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = oldToks[i] === newToks[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: Array<{ o: string[]; n: string[] }> = [];
  let i = 0, j = 0;
  let curO: string[] = [], curN: string[] = [];
  const flush = () => {
    if (curO.length || curN.length) out.push({ o: curO, n: curN });
    curO = []; curN = [];
  };
  while (i < m && j < n) {
    if (oldToks[i] === newToks[j]) {
      flush();
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      curO.push(oldToks[i++]);
    } else {
      curN.push(newToks[j++]);
    }
  }
  while (i < m) curO.push(oldToks[i++]);
  while (j < n) curN.push(newToks[j++]);
  flush();
  return out;
}

export type LearnResult = { learned: Array<{ wrong: string; right: string }>; skipped: number };

// 원본 전사 → 수정본 비교 → 오타쌍 학습(누적). 발음유사 1:1 치환만 채택.
export async function learnFromEdit(oldText: string, newText: string): Promise<LearnResult> {
  const result: LearnResult = { learned: [], skipped: 0 };
  const o = (oldText || "").trim();
  const n = (newText || "").trim();
  if (!o || !n || o === n) return result;

  const blocks = diffReplaces(o.split(/\s+/), n.split(/\s+/));
  const rules = await loadRules();
  const byWrong = new Map(rules.map((r) => [r.wrong, r]));
  let changed = false;
  const now = new Date().toISOString();

  for (const b of blocks) {
    // 1:1 단어 치환만(가장 신뢰도 높음)
    if (b.o.length !== 1 || b.n.length !== 1) {
      result.skipped++;
      continue;
    }
    let wrong = stripPunct(b.o[0]);
    let right = stripPunct(b.n[0]);
    [wrong, right] = stripCommonParticle(wrong, right);
    if (!wrong || !right || wrong === right) { result.skipped++; continue; }
    if (wrong.length < 2 || !hasHangul(wrong)) { result.skipped++; continue; } // 너무 짧으면 위험
    if (/^\d+$/.test(wrong) || /^\d+$/.test(right)) { result.skipped++; continue; }
    if (phonSim(wrong, right) < 0.4) { result.skipped++; continue; } // 발음 안 비슷하면 오타 아님(재작성)

    const ex = byWrong.get(wrong);
    if (ex) {
      ex.right = right; // 최신 수정 반영
      ex.count += 1;
      ex.updatedAt = now;
      ex.enabled = true;
    } else {
      const r: CorrectionRule = { wrong, right, count: 1, enabled: true, source: "learned", createdAt: now, updatedAt: now };
      rules.push(r);
      byWrong.set(wrong, r);
    }
    changed = true;
    result.learned.push({ wrong, right });
  }

  if (changed) await saveRules(rules);
  return result;
}

// ── 관리용 ──
export async function listRules(): Promise<CorrectionRule[]> {
  return (await loadRules()).sort((a, b) => b.count - a.count);
}

export async function upsertManualRule(wrong: string, right: string): Promise<CorrectionRule[]> {
  const w = wrong.trim(), r = right.trim();
  if (!w || !r) return loadRules();
  const rules = await loadRules();
  const ex = rules.find((x) => x.wrong === w);
  const now = new Date().toISOString();
  if (ex) {
    ex.right = r; ex.enabled = true; ex.updatedAt = now;
  } else {
    rules.push({ wrong: w, right: r, count: 0, enabled: true, source: "manual", createdAt: now, updatedAt: now });
  }
  await saveRules(rules);
  return rules;
}

export async function setRuleEnabled(wrong: string, enabled: boolean): Promise<void> {
  const rules = await loadRules();
  const ex = rules.find((x) => x.wrong === wrong);
  if (ex) { ex.enabled = enabled; ex.updatedAt = new Date().toISOString(); await saveRules(rules); }
}

export async function deleteRule(wrong: string): Promise<void> {
  const rules = (await loadRules()).filter((x) => x.wrong !== wrong);
  await saveRules(rules);
}

// ── 오류 패턴 분석 / 우선순위 ──
// 공통 접두/접미 제거 후 핵심 치환부만 남김
function coreSub(wrong: string, right: string): { from: string; to: string } {
  let i = 0;
  while (i < wrong.length && i < right.length && wrong[i] === right[i]) i++;
  let j = 0;
  while (j < wrong.length - i && j < right.length - i && wrong[wrong.length - 1 - j] === right[right.length - 1 - j]) j++;
  return { from: wrong.slice(i, wrong.length - j), to: right.slice(i, right.length - j) };
}

// 핵심 치환을 글자 단위 혼동으로 분해(길이 같으면 자리별로)
function charSubs(wrong: string, right: string): Array<{ from: string; to: string }> {
  const { from, to } = coreSub(wrong, right);
  if (!from || !to) return [];
  if (from.length === to.length && from.length > 1) {
    const out: Array<{ from: string; to: string }> = [];
    for (let k = 0; k < from.length; k++) if (from[k] !== to[k]) out.push({ from: from[k], to: to[k] });
    return out;
  }
  return [{ from, to }];
}

export type CorrectionAnalysis = {
  totalRules: number;
  totalHits: number;
  targets: Array<{ right: string; total: number; variants: Array<{ wrong: string; count: number }> }>;
  patterns: Array<{ from: string; to: string; count: number; single: boolean }>;
  top: Array<{ wrong: string; right: string; count: number }>;
};

export async function analyzeRules(): Promise<CorrectionAnalysis> {
  const rules = (await loadRules()).filter((r) => r.enabled);

  // 1) 정답 용어별 묶기 (같은 맞는말로 수렴하는 오타들 = 자주 틀리는 용어)
  const byTarget = new Map<string, { right: string; total: number; variants: Array<{ wrong: string; count: number }> }>();
  for (const r of rules) {
    const g = byTarget.get(r.right) || { right: r.right, total: 0, variants: [] };
    g.total += r.count;
    g.variants.push({ wrong: r.wrong, count: r.count });
    byTarget.set(r.right, g);
  }
  const targets = Array.from(byTarget.values()).sort(
    (a, b) => b.variants.length - a.variants.length || b.total - a.total,
  );

  // 2) 글자 혼동 패턴 (횟수 가중)
  const pat = new Map<string, { from: string; to: string; count: number; single: boolean }>();
  for (const r of rules) {
    for (const s of charSubs(r.wrong, r.right)) {
      const key = s.from + "→" + s.to;
      const ex = pat.get(key) || { from: s.from, to: s.to, count: 0, single: s.from.length === 1 && s.to.length === 1 };
      ex.count += r.count;
      pat.set(key, ex);
    }
  }
  const patterns = Array.from(pat.values()).sort((a, b) => b.count - a.count);

  // 3) 가장 잦은 오타
  const top = [...rules]
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .map((r) => ({ wrong: r.wrong, right: r.right, count: r.count }));

  return {
    totalRules: rules.length,
    totalHits: rules.reduce((s, r) => s + r.count, 0),
    targets,
    patterns,
    top,
  };
}
