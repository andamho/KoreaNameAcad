import type { ReactNode } from "react";

// 글 속 '같은 이름, 보는 운이 다릅니다' 비교표(2026-11-04 대표님 — 홍길동 분석 그림을 이미지 말고 코드로, 세련되게).
// 글 내용(DB)에 한 줄로 {{비교표:홍길동}} 을 넣으면 그 자리에 이 표가 그려진다(화면에서만 바꿈).
// 왼쪽 = 협회(모든 칸), 오른쪽 = 95% 작명소(한글 칸·주역괘운 칸·오행 칸이 비고 '없음' 표시가 빈 칸 정가운데).
// 좌우 표는 칸 높이를 고정해 크기가 똑같다. 휴대폰은 위아래, 넓은 화면은 좌우.
// 같은 날 디자인 점검: 바깥 상자·제목 위 작은 글·제목 속 색 강조·그림자를 빼고, 가는 테두리 두 칸 + 협회 쪽만 위에 청록 선.

const MARK = /\{\{비교표:홍길동\}\}/;

const HONG = {
  han: { name: "홍길동", ohaeng: "토 / 목 → 화", nums: ["11", "13", "14", "19"], gwae: ["풍화가인", "풍수환", "풍천소축"] },
  hanja: { name: "洪吉童", nums: ["18", "16", "22", "28"], gwae: ["지택림", "지수사", "지뢰복"] },
};

const filled = "bg-[#e8f5f4] text-[#0b5f62] dark:bg-[#56D5DB]/15 dark:text-[#7fe0e4]";
// 빨강 = 95% 작명소(대표 그림의 '中' 도장과 같은 색, 2026-11-04 대표님) — 제목·한자 숫자 네 칸·위쪽 선에만
const filledRed = "bg-[#fbeeec] text-[#c0392b] dark:bg-[#c0392b]/15 dark:text-[#f08a7e]";
const empty = "kna-cmp-empty";   // 회색 빗금(아래 <style>)

function NoneLabel({ children, small }: { children: ReactNode; small?: boolean }) {
  return (
    <span
      className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-white/95 font-bold text-slate-500 dark:bg-slate-900/95 dark:text-slate-400 ${
        small ? "px-2 py-0.5 text-[0.72rem]" : "px-3 py-1 text-[0.82rem] sm:text-sm"
      }`}
    >
      {children}
    </span>
  );
}

function Cells({ items, on, big, red }: { items: string[]; on: boolean; big?: boolean; red?: boolean }) {
  return (
    <div className={`grid gap-1 ${items.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
      {items.map((t) => (
        <div
          key={t}
          className={`flex items-center justify-center rounded ${big ? "h-12 text-xl font-extrabold tabular-nums sm:h-14 sm:text-[1.6rem]" : "h-10 text-[0.95rem] font-bold sm:h-11 sm:text-base"} ${
            on ? (red ? filledRed : filled) : empty
          }`}
        >
          {on ? t : null}
        </div>
      ))}
    </div>
  );
}

function Side({ ours }: { ours: boolean }) {
  const { han, hanja } = HONG;
  return (
    <div
      className={`border bg-white px-4 pb-5 pt-4 sm:px-5 dark:bg-slate-900 ${
        ours
          ? "border-slate-200 border-t-[3px] border-t-[#0b7f82] dark:border-slate-700 dark:border-t-[#58C4C4]"
          : "border-slate-200 border-t-[3px] border-t-[#c0392b] dark:border-slate-700 dark:border-t-[#e06b5e]"
      }`}
    >
      <div className={`mb-4 whitespace-nowrap text-base font-extrabold sm:text-lg ${ours ? "text-[#0b7f82] dark:text-[#58C4C4]" : "text-[#c0392b] dark:text-[#f08a7e]"}`}>
        {ours ? "와츠유어네임 이름연구협회" : "95% 작명소"}
      </div>

      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-lg font-extrabold text-foreground">{han.name}</span>
        {ours ? (
          <span className={`flex h-8 w-36 items-center justify-center rounded text-sm font-bold ${filled}`}>{han.ohaeng}</span>
        ) : (
          <span className={`relative h-8 w-36 rounded ${empty}`}>
            <NoneLabel small>작명 이론 없음</NoneLabel>
          </span>
        )}
      </div>
      <div className="relative flex flex-col gap-1">
        <Cells items={han.nums} on={ours} big />
        <Cells items={han.gwae} on={ours} />
        {!ours && <NoneLabel>한글 이론 없음</NoneLabel>}
      </div>

      <div className="kna-cmp-hanja mb-2 mt-5 flex h-8 items-center text-lg font-extrabold text-foreground">{hanja.name}</div>
      <div className="flex flex-col gap-1">
        <Cells items={hanja.nums} on big red={!ours} />
        <div className="relative">
          <Cells items={hanja.gwae} on={ours} />
          {!ours && <NoneLabel>주역괘운 없음</NoneLabel>}
        </div>
      </div>
    </div>
  );
}

export function NameCompareTable() {
  return (
    <figure className="not-prose my-10">
      <style>{`
        .kna-cmp-empty{background:repeating-linear-gradient(-45deg,#f1f3f3 0 6px,#e5e9e9 6px 12px)}
        .dark .kna-cmp-empty{background:repeating-linear-gradient(-45deg,#1f2a2a 0 6px,#263333 6px 12px)}
        /* 글 본문은 나눔스퀘어를 !important 로 씌우는데 그 글꼴엔 한자가 없어 洪吉童 이 빈칸으로 나옴 → 한자만 Noto Sans KR(index.html 에서 이미 불러옴) */
        .kna-nanum-editor .kna-cmp-hanja,.kna-cmp-hanja{font-family:'Noto Sans KR',sans-serif !important}
      `}</style>
      <figcaption className="mb-4 text-[1.3rem] font-extrabold leading-snug text-foreground sm:text-[1.45rem]" style={{ wordBreak: "keep-all" }}>
        같은 홍길동, 보는 운이 다릅니다
      </figcaption>
      <div className="grid gap-3 md:grid-cols-2">
        <Side ours />
        <Side ours={false} />
      </div>
      <p className="mt-4 text-[0.95rem] leading-relaxed text-muted-foreground" style={{ wordBreak: "keep-all" }}>
        보는 운이 다르면, 짓는 이름도 다릅니다.
      </p>
    </figure>
  );
}

// 예전 모양 글(## 없는 글)에서 {{비교표:홍길동}} 이 있으면 앞뒤 글과 표를 나눠 그린다. 없으면 null.
export function renderNameCompare(text: string, key: string, renderText: (t: string, k: string) => ReactNode): JSX.Element | null {
  if (!MARK.test(text)) return null;
  const [before, ...rest] = text.split(MARK);
  const after = rest.join("");
  return (
    <div key={key}>
      {before.trim() && renderText(before.replace(/\n+$/, ""), `${key}-b`)}
      <NameCompareTable />
      {after.trim() && renderText(after.replace(/^\n+/, ""), `${key}-a`)}
    </div>
  );
}
