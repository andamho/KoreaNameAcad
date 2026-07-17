// 전사문 코퍼스 단어 빈도 — "이 말이 실제로 자주 쓰이는 정상 단어인가?" 판단용.
// 자주 나오는 말을 전역 치환하면 대화가 망가지므로, 교정규칙 검증에서 이 빈도를 본다.
// 10분 캐시(전사문은 자주 안 바뀜).
import { db } from "../db";
import { calls } from "@shared/schema";
import { isNotNull } from "drizzle-orm";

let cache: { at: number; freq: Map<string, number> } | null = null;
const TTL = 10 * 60 * 1000;

const strip = (w: string) => w.replace(/^[\s"'(「『]+|[\s.,?!"')」』]+$/g, "");

// 조사·어미를 뗀 어간도 같이 센다.
// (예: "사이에/사이가/사이를" → "사이" 도 카운트. 안 그러면 흔한 말인데 빈도 0으로 잡혀 위험 규칙이 통과함)
const PARTICLES = [
  "으로써","으로서","이라고","라고","에서는","에게서","이라는","라는","까지","부터","에서","에게","한테","보다",
  "처럼","만큼","으로","이나","이란","이며","이고","이지","입니다","이다","은","는","이","가","을","를","에","의",
  "도","로","와","과","만","께","요","고","야","라","나","든","지",
];
function stems(w: string): string[] {
  const out = [w];
  for (const p of PARTICLES) {
    if (w.length > p.length + 1 && w.endsWith(p)) out.push(w.slice(0, -p.length));
  }
  return out;
}

async function build(): Promise<Map<string, number>> {
  const freq = new Map<string, number>();
  if (!db) return freq;
  try {
    const rows = await db.select({ t: calls.transcriptText }).from(calls).where(isNotNull(calls.transcriptText));
    for (const r of rows) {
      for (const raw of (r.t || "").split(/\s+/)) {
        const w = strip(raw);
        if (!w) continue;
        for (const s of stems(w)) if (s) freq.set(s, (freq.get(s) || 0) + 1);
      }
    }
  } catch (e: any) {
    console.error(`[KOP] 코퍼스 빈도 계산 실패: ${e?.message}`);
  }
  return freq;
}

export async function corpusFreqMap(): Promise<Map<string, number>> {
  if (cache && Date.now() - cache.at < TTL) return cache.freq;
  const freq = await build();
  cache = { at: Date.now(), freq };
  return freq;
}

// 단어 하나의 전사문 등장 횟수
export async function corpusFreq(word: string): Promise<number> {
  const m = await corpusFreqMap();
  return m.get(word) || 0;
}

export function invalidateCorpusFreq(): void {
  cache = null;
}
