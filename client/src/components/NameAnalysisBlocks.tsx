// 이름분석학 글 속 그림을 코드로(2026-11-04 대표님 '이미지 생성 말고 코딩으로 바꿔').
//   {{다섯에너지}} → 이름분석학이 보는 5가지 에너지(한글 60% / 한자 40% 막대 포함). 문구는 원래 그림 그대로.
//   ({{분석표:홍길동}} 은 '심플하게' 말씀에 따라 NameCompareTable 의 NameSimpleTable 로)

const keep = { wordBreak: "keep-all" as const };

const ENERGIES: { name: string; desc: string; pct?: number }[] = [
  { name: "오행 에너지", desc: "관계운, 궁합, 자식운, 건강운" },
  { name: "한글이름 에너지", desc: "삶의 외형적인 모습", pct: 60 },
  { name: "한자이름 에너지", desc: "삶의 내면적인 모습", pct: 40 },
  { name: "수리운 에너지", desc: "성격, 적성, 건강, 성공, 재물, 학업" },
  { name: "주역괘운 에너지", desc: "숨겨진 성격, 적성, 건강, 성공, 재물" },
];

export function FiveEnergies() {
  return (
    <figure className="not-prose my-10">
      <figcaption className="mb-4 text-[1.3rem] font-extrabold leading-snug text-foreground sm:text-[1.45rem]" style={keep}>
        이름분석학이 보는 다섯 가지 에너지
      </figcaption>
      <dl className="m-0 divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-700 dark:border-slate-700">
        {ENERGIES.map((e) => (
          <div key={e.name} className="grid gap-1 py-4 sm:grid-cols-[11rem_1fr] sm:gap-6">
            <dt className="text-base font-extrabold text-[#0b7f82] dark:text-[#58C4C4]">{e.name}</dt>
            <dd className="m-0 min-w-0" style={keep}>
              {e.pct != null ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-baseline gap-3">
                    <span className="text-2xl font-extrabold tabular-nums text-foreground">{e.pct}%</span>
                    <span className="text-[0.95rem] text-foreground">영향 · {e.desc}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden>
                    <div className="h-2 rounded-full bg-[#0b7f82] dark:bg-[#58C4C4]" style={{ width: `${e.pct}%` }} />
                  </div>
                </div>
              ) : (
                <span className="text-[0.95rem] leading-relaxed text-foreground">{e.desc}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}

// 글 속 이름 숫자표(2026-11-05 대표님 '모든 홈페이지 글에 같은 디자인') — 예전 글의 굵은 숫자 줄을 표로.
//   {{이름표
//   김선태 40세 | 11 10 11 16 | 택화혁 택화혁 택뢰수
//   金善泰 | 21 20 17 29 | 뇌풍항 뇌천대장 뇌풍항
//   }}
// 한 줄 = 한 이름. 둘째 칸 = 숫자(크게), 셋째 칸 = 괘. 칸 수는 글마다 달라도 됨.
export const isNameNumbers = (p: string) => /^\{\{이름표\s*\n[\s\S]*\}\}\s*$/.test(p.trim());

const cellOn = "bg-[#e8f5f4] text-[#0b5f62] dark:bg-[#56D5DB]/15 dark:text-[#7fe0e4]";

function Row({ items, big }: { items: string[]; big?: boolean }) {
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((t, i) => (
        <div
          key={i}
          className={`flex items-center justify-center rounded px-1 text-center ${cellOn} ${
            big ? "h-12 text-xl font-extrabold tabular-nums sm:h-14 sm:text-[1.6rem]" : "min-h-10 py-1 text-[0.9rem] font-bold leading-tight sm:min-h-11 sm:text-base"
          }`}
          style={keep}
        >
          {t}
        </div>
      ))}
    </div>
  );
}

export function NameNumbers({ text }: { text: string }) {
  const rows = text
    .trim()
    .replace(/^\{\{이름표\s*/, "")
    .replace(/\}\}\s*$/, "")
    .split("\n")
    .map((l) => l.split("|").map((c) => c.trim()))
    .filter((c) => c[0]);
  return (
    <figure className="not-prose my-8 max-w-md border border-slate-200 border-t-[3px] border-t-[#0b7f82] bg-white px-4 pb-5 pt-2 sm:px-5 dark:border-slate-700 dark:border-t-[#58C4C4] dark:bg-slate-900">
      {rows.map(([name, nums = "", gwae = ""], i) => (
        <div key={i} className="mt-3 flex flex-col gap-1">
          <div className={`mb-1 text-lg font-extrabold text-foreground ${/[\u4e00-\u9fff]/.test(name) ? "kna-cmp-hanja" : ""}`}>{name}</div>
          {nums && <Row items={nums.split(/\s+/)} big />}
          {gwae && <Row items={gwae.split(/\s+/)} />}
        </div>
      ))}
      <style>{`.kna-nanum-editor .kna-cmp-hanja,.kna-cmp-hanja{font-family:'Noto Sans KR',sans-serif !important}`}</style>
    </figure>
  );
}
