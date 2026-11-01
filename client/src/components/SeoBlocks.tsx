// 글 상세 화면의 AI 검색 칸 꾸미기(2026-10-30 대표님): 글쓰기 직원이 넣는 '📌 한눈에 보기'·'❓ 자주 묻는 질문'이
// 본문과 구별되지 않아서 — 한눈에 보기는 연한 파랑 상자 + 아래 가는 구분선, 자주 묻는 질문은 질문마다 연한 베이지 상자(질문은 굵게).
// 글자(DB 내용)는 그대로 두고 화면에서만 꾸미므로 이미 올린 글에도 똑같이 적용된다. 두 표시가 없는 글은 null(예전 그대로).
import type { ReactNode } from "react";

const TOP = "📌 한눈에 보기";
const FAQ = "❓ 자주 묻는 질문";
const ABOUT = "🏫 협회 소개";

// 상자 안 글 줄 나눔(2026-11-01 대표님 '휴대폰에서 볼 때 한눈에 보기 줄바꿈이 엉망'): 글에는 블로그용으로 30자쯤마다 줄이 나뉘어 들어와서
// 휴대폰의 좁은 상자에서 그 줄이 또 꺾이며 길고 짧게 들쭉날쭉 → 문장이 끝나는 곳에서만 줄을 바꾸고, 나머지는 이어 붙여 화면 폭대로 흐르게.
const flow = (t: string) =>
  t.split("\n").map((s) => s.trim()).filter(Boolean)
    .reduce((acc, line) => (!acc ? line : /[.?!…。][”"’')\]]*$/.test(acc.split("\n").pop() || "") ? `${acc}\n${line}` : `${acc} ${line}`), "");
const keepWords = { wordBreak: "keep-all" as const, overflowWrap: "anywhere" as const };   // 한글 낱말 중간에서 안 끊음

export function renderSeoBlocks(text: string, key: string, render: (t: string) => ReactNode): JSX.Element | null {
  if (!text.includes(TOP) && !text.includes(FAQ)) return null;
  const paras = text.replace(/\r/g, "").split(/\n[ \t]*\n/);   // 윈도 줄끝(\r\n)으로 올라간 글도 있음(30일 글)
  const out: JSX.Element[] = [];
  let plain: string[] = [];
  let inFaq = false;
  const flushPlain = (k: string) => {
    if (!plain.length) return;
    out.push(
      <div key={k} className="text-foreground leading-relaxed whitespace-pre-line">
        {render(plain.join("\n\n"))}
      </div>
    );
    plain = [];
  };
  paras.forEach((para, i) => {
    const p = para.replace(/^\n+|\n+$/g, "");
    const first = p.split("\n")[0].trim();
    if (first.startsWith(TOP)) {
      flushPlain(`${key}-p${i}`);
      inFaq = false;
      out.push(
        <div key={`${key}-top${i}`} className="not-prose">
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-5 py-4 dark:border-sky-900 dark:bg-sky-950/40">
            <div className="mb-2 font-bold text-sky-900 dark:text-sky-200">{first}</div>
            <div className="text-foreground leading-relaxed whitespace-pre-line" style={keepWords}>{render(flow(p.split("\n").slice(1).join("\n")))}</div>
          </div>
          <hr className="my-6 border-t border-border" />
        </div>
      );
      return;
    }
    if (first.startsWith(FAQ)) {
      flushPlain(`${key}-p${i}`);
      inFaq = true;
      out.push(<div key={`${key}-faqh${i}`} className="mt-6 mb-3 font-bold text-foreground">{first}</div>);
      const rest = p.split("\n").slice(1).join("\n").trim();
      if (rest) plain.push(rest);
      return;
    }
    if (inFaq && /^Q\./.test(first)) {
      flushPlain(`${key}-p${i}`);
      const lines = p.split("\n");
      const k = lines.findIndex((l) => /^A\./.test(l.trim()));
      const q = (k > 0 ? lines.slice(0, k) : lines.slice(0, 1)).join(" ");
      const a = k > 0 ? lines.slice(k).join("\n") : lines.slice(1).join("\n");
      out.push(
        <div key={`${key}-qa${i}`} className="not-prose mb-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-900 dark:bg-amber-950/30">
          <div className="mb-1 font-bold text-foreground" style={keepWords}>{q}</div>
          <div className="text-foreground leading-relaxed whitespace-pre-line" style={keepWords}>{render(flow(a))}</div>
        </div>
      );
      return;
    }
    // 협회 소개(2026-10-30): 연한 회색 상자. 예전 글은 '🏫 협회 소개' 제목 없이 소개 문단만 있음
    if (first.startsWith(ABOUT) || (/^와츠유어네임 이름연구협회\(한국이름학교\)는/.test(first) && p.includes("45만"))) {
      flushPlain(`${key}-p${i}`);
      inFaq = false;
      const head = first.startsWith(ABOUT);
      out.push(
        <div key={`${key}-about${i}`} className="not-prose my-4 rounded-xl border border-stone-200 bg-stone-100 px-5 py-4 dark:border-stone-700 dark:bg-stone-800/50">
          {head && <div className="mb-2 font-bold text-foreground">{first}</div>}
          <div className="text-foreground leading-relaxed whitespace-pre-line" style={keepWords}>{render(flow(head ? p.split("\n").slice(1).join("\n") : p))}</div>
        </div>
      );
      return;
    }
    inFaq = false;
    plain.push(p);
  });
  flushPlain(`${key}-end`);
  return <div key={key}>{out}</div>;
}
