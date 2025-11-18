import { useState } from "react";

export default function KnaMythTruthSection() {
  const items = [
    {
      q: "이름이 같으면 삶도 같은가요?",
      a: (
        <>
          같은 한글 이름이라도 <b>한자가 다르면 운명</b>이 달라집니다. <br />
          <b>한 획</b> 차이로 운이 확 바뀌고, <b>운명공동체인 가족</b>에 따라 삶은 더욱 달라집니다.
        </>
      ),
    },
    {
      q: "노력하면 되지 않을까요?",
      a: (
        <>
          아무리 열심히 달려도, 이름에 들어있는 <b>흉운이라는 무거운 타이어</b>를 매단 채로는 한계가 있습니다.
        </>
      ),
    },
    {
      q: "개명하면 진짜 좋아지나요?",
      a: (
        <>
          매년 약 <b>15만 명</b>이 개명합니다. 그래서 문의주신 분들 중에도 개명하신 분들이 많은데 상담해 드리면 <b>개명 전·후 이름대로 살아온 것</b>에 깜짝 놀랍니다. <br />
          임상을 해보면, 보통 <b>개명 후 2년</b>이면 긍정적 변화가 시작됩니다.
        </>
      ),
    },
    {
      q: "개명 효과가 사람마다 다르던데요?",
      a: (
        <>
          <b>95% 이상의 작명소</b>에는<br />
          한글 이름의 <b>9개 운</b>과 한자 이름의 <b>3개 주역운</b> 이론이 없어 흉운이 들어가도 모릅니다.<br />
          흉운의 증가 감소에 따라 개명효과가 달라지는겁니다.
        </>
      ),
    },
    {
      q: "개명, 어렵지 않나요?",
      a: (
        <>
          법적 개명은 <b>행복추구권</b>으로 인정돼 절차와 허가가 쉽습니다. 이름 바꾸기가 번거로워 보이지만,
          <b> 평생 흉운</b>으로 태클 받으며 사는 것보다 훨씬 쉽습니다.
        </>
      ),
    },
  ];

  return (
    <section className="kna-myth-truth-section relative overflow-hidden py-16 md:py-24 bg-muted/30">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[#7fe1d3]/20 dark:bg-[#58C4C4]/20 blur-3xl" />
      </div>
      <div className="relative max-w-5xl mx-auto px-6 lg:px-8">
        <header className="text-center">
          <h2 className="mt-4 bg-gradient-to-r from-[#0f766e] to-[#4fd1c5] dark:from-[#58C4C4] dark:to-[#6DD4D4] bg-clip-text text-[25px] font-extrabold leading-tight text-transparent sm:text-3xl md:text-4xl">
            궁금하셨죠? 솔직하게 답합니다
          </h2>
        </header>

        <ul className="mt-10 space-y-3">
          {items.map((it, i) => (
            <AccordionItem key={i} q={it.q} data-testid={`accordion-item-${i}`}>
              {it.a}
            </AccordionItem>
          ))}
        </ul>
      </div>
    </section>
  );
}

function AccordionItem({ q, children, ...props }: { q: string; children: React.ReactNode; [key: string]: any }) {
  const [open, setOpen] = useState(false);
  
  return (
    <li className="rounded-2xl border border-gray-200 dark:border-border bg-white dark:bg-card p-4 shadow-sm transition hover:shadow-md" {...props}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open ? "true" : "false"}
        data-testid={`button-accordion-${q.substring(0, 10)}`}
      >
        <span className="text-[21px] md:text-[22px] font-semibold text-gray-900 dark:text-foreground break-keep">{q}</span>
        <span 
          className={`inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
            open 
              ? "bg-[#0f766e] dark:bg-[#58C4C4] text-white" 
              : "bg-[#7fe1d3]/40 dark:bg-[#58C4C4]/40 text-[#0f766e] dark:text-[#58C4C4]"
          }`} 
          aria-hidden="true"
        >
          {open ? "−" : "+"}
        </span>
      </button>
      {open && (
        <div className="mt-3 border-t border-dashed border-gray-200 dark:border-border pt-3 text-lg md:text-lg leading-relaxed text-gray-700 dark:text-muted-foreground">
          {children}
        </div>
      )}
    </li>
  );
}
