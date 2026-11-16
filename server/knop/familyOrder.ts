// 등본이 첨부된 가족 상담: 여자 이름 먼저 (대표님 요청 2026-11-17)
// PC 자동분석 프로그램(test-app/email-automator/parser.js orderFamilyWomanFirst)과 같은 규칙이어야
// 고객 이름 = 이름분석 PDF 첫 사람이 되어 분석표가 고객에 자동 연결된다. 한쪽을 고치면 다른 쪽도 고칠 것.
//  · 출생년도로 세대를 나눈다(앞 사람과 16년 이상 차이 나면 다음 세대).
//  · 어른 세대(맨 아래 세대 빼고 전부)는 여자 먼저 → 남자, 같은 성별은 나이 많은 순. 예) 엄마 → 아빠.
//  · 맨 아래 세대(아이들)는 성별 상관없이 큰아이 → 작은아이.
//  · 한 세대뿐(부부만 등)이면 그 세대를 어른으로 보고 여자 먼저.
//  · 성별·출생년도가 하나라도 비어 있으면 신청서 순서 그대로.
export type 가족원 = { name?: string; gender?: string; birthYear?: string | number };

export function orderFamilyWomanFirst<T extends 가족원>(people: T[]): T[] {
  if (!Array.isArray(people) || people.length < 2) return people;
  const isWoman = (g?: string) => /여/.test(g || "");
  const isMan = (g?: string) => /남/.test(g || "");
  // 출생년도는 "1979" 또는 "19791105"(생년월일) 둘 다 온다 → 앞 4자리만
  const year = (p: T) => parseInt(String(p.birthYear ?? "").trim().slice(0, 4)) || 0;
  if (people.some((p) => !year(p) || (!isWoman(p.gender) && !isMan(p.gender)))) return people;

  const byAge = people.map((p, i) => ({ p, i })).sort((a, b) => year(a.p) - year(b.p) || a.i - b.i);
  const gens: { p: T; i: number }[][] = [];
  for (const x of byAge) {
    const last = gens[gens.length - 1];
    if (last && year(x.p) - year(last[last.length - 1].p) < 16) last.push(x);
    else gens.push([x]);
  }
  const out: T[] = [];
  gens.forEach((g, gi) => {
    const kids = gens.length > 1 && gi === gens.length - 1;
    const sorted = kids ? g : [...g.filter((x) => isWoman(x.p.gender)), ...g.filter((x) => isMan(x.p.gender))];
    for (const x of sorted) out.push(x.p);
  });
  return out;
}
