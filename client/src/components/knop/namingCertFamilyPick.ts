// 가족 작명 — 가족끼리 같은 글이 겹치지 않게 수리 문단을 나눠 넣는 규칙 (2026-11-11 대표님)
//   · 겹침의 기준은 '같은 숫자'가 아니라 '같은 글'. 23에 글이 두 가지면 23-1, 23-2 로 부르고,
//     한 사람이 23-1 을 쓰면 다른 사람은 23-2 를 쓴다("너가 알아서 따로 넣어줘. 겹치지 않게").
//   · 글이 하나뿐인 숫자를 두 사람이 쓰게 되면, 고를 수 있는 다른 운으로 바꾼다. 그래도 안 되면 겹친 채로 두고 화면이 알린다.
//   · 한 사람 화면과 같은 바탕 규칙: 같은 쪽에서 같은 숫자는 한 번, 한글 쪽에 나온 숫자는 한문 쪽에서 뺌(3개가 안 되면 도로 채움), 쪽마다 3개.
import type { Plan, Row } from "./namingCertShared";

export type FamPick = { hg: boolean[]; hn: boolean[]; pan: Record<number, number> };

/** 글이 있는 판만 */
export const textVariants = (r: Row) => r.판목록.filter((v) => !!v.글);
/** 23-1, 23-2 … 글이 하나뿐이면 그냥 23. 순서는 '수리운 정리' 문서에 적힌 순서. */
export const varLabel = (r: Row, idx: number) => {
  const t = textVariants(r);
  const k = t.findIndex((v) => v.idx === idx);
  return t.length > 1 && k >= 0 ? `${r.수}-${k + 1}` : `${r.수}`;
};
/** 이 줄에서 지금 쓰는 판(고른 것 → 기본 → 글 있는 첫 판) */
export const chosenIdx = (r: Row, pan: Record<number, number>) => {
  const t = textVariants(r);
  const want = pan[r.수] ?? r.기본판;
  return t.some((v) => v.idx === want) ? want : t[0]?.idx ?? -1;
};

/** 고를 수 있는 줄. blocked = 한글 쪽에 나온 숫자(한문 쪽에서만 넘김) */
export function eligibleRows(rows: Row[], blocked: number[]): boolean[] {
  const base = rows.map((r, i) => rows.findIndex((x) => x.수 === r.수) === i && textVariants(r).length > 0);
  const ok = base.map((b, i) => b && !blocked.includes(rows[i].수));
  for (let i = 0; i < rows.length && ok.filter(Boolean).length < 3; i++) if (base[i] && !ok[i]) ok[i] = true;
  return ok;
}

const subsets = (idx: number[], k: number): number[][] => {
  if (k <= 0 || idx.length === 0) return [[]];
  if (idx.length <= k) return [idx];
  const out: number[][] = [];
  const go = (start: number, cur: number[]) => {
    if (cur.length === k) { out.push(cur); return; }
    for (let i = start; i < idx.length; i++) go(i + 1, [...cur, idx[i]]);
  };
  go(0, []);
  return out;
};

/** 한 사람이 실제로 쓰는 글: 숫자 → 판 순번 */
export function usedOf(plan: Plan, pick: FamPick): Map<number, number> {
  const m = new Map<number, number>();
  const add = (rows: Row[], on: boolean[]) => rows.forEach((r, i) => { if (on[i]) { const v = chosenIdx(r, pick.pan); if (v >= 0) m.set(r.수, v); } });
  add(plan.전체.한글, pick.hg); add(plan.전체.한자, pick.hn);
  return m;
}
const keyOf = (n: number, idx: number) => `${n}-${idx}`;

/** 다른 가족이 쓴 글(taken)을 피해서 이 사람의 문단을 고른다 */
function bestFor(plan: Plan, taken: Set<string>): FamPick {
  const hgRows = plan.전체.한글, hnRows = plan.전체.한자;
  const idxOf = (ok: boolean[]) => ok.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
  const hgIdx = idxOf(eligibleRows(hgRows, [])), hnIdx = idxOf(eligibleRows(hnRows, plan.한글수리));
  let best: { cost: number; pick: FamPick } | null = null;
  for (const hs of subsets(hgIdx, 3)) {
    for (const ns of subsets(hnIdx, 3)) {
      // 도구가 혼자일 때 고르는 기본 줄(넣음)에서 벗어날수록 손해
      let cost = 10 * (hs.filter((i) => !hgRows[i].넣음).length + ns.filter((i) => !hnRows[i].넣음).length);
      const pan: Record<number, number> = {};
      const rows = [...hs.map((i) => hgRows[i]), ...ns.map((i) => hnRows[i])];
      for (const r of rows) {
        if (pan[r.수] !== undefined) continue;
        let bv = -1, bc = Infinity;
        for (const v of textVariants(r)) {
          // '손볼 글'(문서에 추가·확인요망 표시가 남은 글)은 겹치는 것보다 나쁘다 → 저절로는 넣지 않는다. '글이 짧음' 같은 표시는 겹침보다는 낫다.
          const c = (taken.has(keyOf(r.수, v.idx)) ? 1000 : 0) + (/손볼/.test(v.확인 || "") ? 5000 : v.확인 ? 50 : 0) + (v.idx === r.기본판 ? 0 : 1);
          if (c < bc) { bc = c; bv = v.idx; }
        }
        pan[r.수] = bv; cost += bc;
      }
      if (!best || cost < best.cost) best = { cost, pick: { hg: hgRows.map((_, i) => hs.includes(i)), hn: hnRows.map((_, i) => ns.includes(i)), pan } };
    }
  }
  return best!.pick;
}

/** 가족 모두의 문단을 겹치지 않게 나눈다. 앞사람부터 기본대로 넣고, 뒷사람이 비켜 간다. */
export function assignFamily(plans: Array<Plan | undefined>): FamPick[] {
  const empty = (): FamPick => ({ hg: [], hn: [], pan: {} });
  const picks = plans.map(empty);
  const takenBut = (me: number, upto = plans.length) => {
    const t = new Set<string>();
    plans.forEach((p, j) => { if (p && j !== me && j < upto) usedOf(p, picks[j]).forEach((v, n) => t.add(keyOf(n, v))); });
    return t;
  };
  plans.forEach((p, i) => { if (p) picks[i] = bestFor(p, takenBut(i, i)); });
  // 뒷사람이 비킬 곳이 없었으면 앞사람이 비켜 줄 수 있는지 몇 번 더 본다
  for (let round = 0; round < 4; round++) {
    let changed = false;
    plans.forEach((p, i) => {
      if (!p) return;
      const next = bestFor(p, takenBut(i));
      if (JSON.stringify(next) !== JSON.stringify(picks[i])) { picks[i] = next; changed = true; }
    });
    if (!changed) break;
  }
  return picks;
}

/** 숫자마다 누가 어느 글을 쓰는지 — 화면에서 '같은 글'(빨강)과 '다른 글'(초록)을 가리는 데 쓴다 */
export function usersByNumber(plans: Array<Plan | undefined>, picks: FamPick[]): Map<number, Array<{ m: number; idx: number }>> {
  const out = new Map<number, Array<{ m: number; idx: number }>>();
  plans.forEach((p, m) => {
    if (!p || !picks[m]) return;
    usedOf(p, picks[m]).forEach((idx, n) => { out.set(n, [...(out.get(n) || []), { m, idx }]); });
  });
  return out;
}
