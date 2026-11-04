import type { ReactNode } from "react";
import { renderSeoBlocks } from "@/components/SeoBlocks";
import { NameCompareTable, NameSimpleTable } from "@/components/NameCompareTable";
import { FiveEnergies } from "@/components/NameAnalysisBlocks";

// 긴 글을 읽기 좋게(2026-11-04 대표님 '글이 너무 많은데 보기 좋게 한 것 같지 않아').
// 글 안에 '## ' 로 시작하는 줄이 하나라도 있는 글만 이 모양으로 그린다(그 전 글 63편엔 없음 → 예전 그대로).
//   ## 제목 / ## 1. 제목   → 구역 제목(앞에 가는 선). 숫자는 정말 순서인 글에만 쓴다.
//   > 문장                  → 핵심 한 줄(명조 큰 글씨, 왼쪽 청록 선)
//   - 항목                  → 목록
//   그 밖의 문단            → 블로그식 짧은 줄바꿈을 문장 끝에서만 끊고 이어 붙여 화면 폭대로 흐르게
// 📌 한눈에 보기 문단과 ❓ 자주 묻는 질문(그 뒤 🏫 협회 소개까지)은 SeoBlocks 가 그대로 그린다.

const HEAD = /^##\s+/m;
const TOP = "📌 한눈에 보기";
const FAQ = "❓ 자주 묻는 질문";

// 문단 안 줄바꿈은 모두 이어 붙임(문장마다 줄이 바뀌면 목록처럼 보여서) — 문단 나눔은 빈 줄로만
const flow = (t: string) => t.split("\n").map((s) => s.trim()).filter(Boolean).join(" ");

const keep = { wordBreak: "keep-all" as const, overflowWrap: "anywhere" as const };

export const isStructuredArticle = (content: string) => HEAD.test(content);

// structured = 글 전체에 '## ' 가 있는지(그림으로 나뉜 덩어리마다가 아니라 글 단위로 정함)
export function renderArticleBlocks(text: string, key: string, render: (t: string) => ReactNode, structured: boolean): JSX.Element | null {
  if (!structured) return null;
  const paras = text.replace(/\r/g, "").split(/\n[ \t]*\n/).map((p) => p.replace(/^\n+|\n+$/g, "")).filter(Boolean);
  const out: JSX.Element[] = [];
  const faqAt = paras.findIndex((p) => p.startsWith(FAQ));
  const body = faqAt >= 0 ? paras.slice(0, faqAt) : paras;

  body.forEach((p, i) => {
    const k = `${key}-${i}`;
    if (p.startsWith(TOP)) {
      out.push(<div key={k}>{renderSeoBlocks(p, k, render)}</div>);
      return;
    }
    if (p.trim() === "{{비교표:홍길동}}") {
      out.push(<NameCompareTable key={k} />);
      return;
    }
    if (p.trim() === "{{분석표:홍길동}}") {
      out.push(<NameSimpleTable key={k} />);
      return;
    }
    if (p.trim() === "{{다섯에너지}}") {
      out.push(<FiveEnergies key={k} />);
      return;
    }
    const lines = p.split("\n");
    if (/^##\s+/.test(lines[0])) {
      const title = lines[0].replace(/^##\s+/, "");
      const m = title.match(/^(\d+)\.\s*(.+)$/);
      out.push(
        <h2 key={k} className="not-prose mt-12 mb-4 flex items-baseline gap-3 border-t border-slate-200 pt-6 text-[1.3rem] font-extrabold leading-snug text-foreground sm:text-[1.45rem] dark:border-slate-700" style={keep}>
          {m && <span className="text-[1.05rem] font-extrabold tabular-nums text-[#0b7f82] dark:text-[#58C4C4]">{m[1]}</span>}
          <span>{m ? m[2] : title}</span>
        </h2>
      );
      const rest = lines.slice(1).join("\n").trim();
      if (rest) out.push(<p key={`${k}-r`} className="my-0 mb-5 leading-[1.9] text-foreground" style={keep}>{render(flow(rest))}</p>);
      return;
    }
    if (lines.every((l) => l.startsWith(">"))) {
      out.push(
        <blockquote key={k} className="kna-article-quote not-prose my-8 border-l-[3px] border-[#0b7f82] pl-5 text-[1.2rem] font-semibold leading-[1.7] text-foreground sm:text-[1.35rem] dark:border-[#58C4C4]" style={keep}>
          {render(flow(lines.map((l) => l.replace(/^>\s?/, "")).join("\n")))}
        </blockquote>
      );
      return;
    }
    if (lines.every((l) => l.startsWith("- "))) {
      out.push(
        <ul key={k} className="not-prose my-0 mb-5 flex list-none flex-col gap-2 pl-0">
          {lines.map((l, j) => (
            <li key={j} className="flex gap-3 leading-[1.8] text-foreground" style={keep}>
              <span aria-hidden className="mt-[0.75em] h-1.5 w-1.5 flex-none rounded-full bg-[#0b7f82] dark:bg-[#58C4C4]" />
              <span>{render(l.slice(2))}</span>
            </li>
          ))}
        </ul>
      );
      return;
    }
    out.push(<p key={k} className="my-0 mb-5 leading-[1.9] text-foreground" style={keep}>{render(flow(p))}</p>);
  });

  if (faqAt >= 0) {
    const seo = renderSeoBlocks(paras.slice(faqAt).join("\n\n"), `${key}-faq`, render);
    if (seo) out.push(<div key={`${key}-faq`} className="mt-12">{seo}</div>);
  }
  return (
    <div key={key} className="max-w-[38em]">
      <style>{`.kna-nanum-editor .kna-article-quote,.kna-nanum-editor .kna-article-quote *{font-family:'Noto Serif KR',serif !important}`}</style>
      {out}
    </div>
  );
}
