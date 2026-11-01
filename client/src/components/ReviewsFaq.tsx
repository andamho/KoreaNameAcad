// 후기 모아보기 맨 위 '상담' 자주 묻는 질문(2026-11-01 대표님): 후기마다 같은 질문을 넣으면 같은 글이 25번 반복되므로 이 화면에 딱 한 번.
// 메인 화면 FAQ(KnaMythTruthSection)는 '개명' 질문이라, 여기는 겹치지 않게 '상담' 질문만. 모양은 메인과 같은 펼치는 방식.
import { useState } from "react";
import { FaqLd } from "@/components/FaqLd";

const ITEMS = [
  { q: "이름분석 상담은 무엇을 보나요? 사주나 얼굴도 보나요?",
    a: "사주도, 얼굴도 보지 않습니다. 한글 이름과 한자 이름만으로 그 사람의 성향과 지나온 흐름, 앞으로의 시기를 봅니다. 18년간 45만 명 이상을 임상했고, 정확도는 80% 이상입니다." },
  { q: "이름만 보고 어떻게 지나온 일까지 알 수 있나요?",
    a: "이름에는 16가지 운과 7가지 시기가 담겨 있습니다. 그 운과 시기를 보면 어떤 성향으로 어떤 일을 겪어 왔는지가 드러납니다. 후기에 \"제 인생이 담겨 있어 놀랐다\"는 말씀이 많은 까닭입니다." },
  { q: "상담을 받으면 꼭 개명해야 하나요?",
    a: "아닙니다. 상담이 먼저이고 개명은 그다음입니다. 지금 이름의 운을 확인하신 뒤, 그대로 살지 바꿔서 다르게 살아 볼지는 직접 선택하시면 됩니다." },
  { q: "가족이나 아이 이름도 함께 볼 수 있나요?",
    a: "네. 가족은 서로 운을 주고받는 운명공동체라, 함께 보면 더 잘 보입니다." },
  { q: "제 나이에 개명하기엔 너무 늦지 않았을까요?",
    a: "늦지 않습니다. 제 어머니는 81세에 개명하셨고, 지금 90세로 정정하십니다." },
];

export default function ReviewsFaq() {
  return (
    <section className="bg-white dark:bg-background">
      <div className="max-w-3xl mx-auto px-6 lg:px-8 py-14 md:py-20">
        <header className="text-left mb-8">
          <span className="text-[0.8125rem] font-bold tracking-wider uppercase text-gray-500 dark:text-gray-400 mb-3 block">Consultation FAQ</span>
          <h2 className="text-[1.5625rem] sm:text-3xl font-extrabold leading-tight text-[#18a999] dark:text-[#58C4C4] tracking-tight break-keep">
            상담 전에 가장 많이 물으시는 것
          </h2>
        </header>
        <ul className="space-y-3 border-t border-gray-200 dark:border-border">
          {ITEMS.map((it, i) => <Item key={i} q={it.q} a={it.a} />)}
        </ul>
      </div>
      <FaqLd items={ITEMS} />
    </section>
  );
}

function Item({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-b border-gray-200 dark:border-border">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open ? "true" : "false"}
        className="flex w-full items-center justify-between gap-3 text-left py-5 group">
        <span className="text-[1.1875rem] md:text-[1.3125rem] font-semibold text-gray-900 dark:text-foreground break-keep tracking-tight group-hover:text-[#0ABAB5] dark:group-hover:text-[#58C4C4] transition-colors">{q}</span>
        <span className={`relative w-5 h-5 flex-shrink-0 transition-transform duration-300 ${open ? "rotate-45" : ""}`} aria-hidden="true">
          <span className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-0.5 rounded-sm ${open ? "bg-gray-900 dark:bg-foreground" : "bg-[#0ABAB5] dark:bg-[#58C4C4]"}`} />
          <span className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-3.5 rounded-sm ${open ? "bg-gray-900 dark:bg-foreground" : "bg-[#0ABAB5] dark:bg-[#58C4C4]"}`} />
        </span>
      </button>
      <div className={`overflow-hidden transition-all duration-300 ease-out ${open ? "max-h-96 pb-5" : "max-h-0"}`}>
        <p className="text-base md:text-lg leading-relaxed text-gray-600 dark:text-muted-foreground pr-5 break-keep">{a}</p>
      </div>
    </li>
  );
}
