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
      q: "이름 안 바꿔도, 노력하면 되지 않을까요?",
      a: (
        <>
          아무리 열심히 달려도, 이름에 들어있는 <b>흉운이라는 무거운 타이어</b>를 매단 채로는 한계가 있습니다.<br />
          타이어를 떼어내면 삶이 훨씬 가벼워집니다.
        </>
      ),
    },
    {
      q: "개명하면 진짜 좋아지나요?",
      a: (
        <>
          매년 약 <b>15만 명</b>이 개명합니다. 그래서 문의주신 분들 중에도 개명하신 분들이 많은데 상담해 드리면<br />
          <b>개명 전·후 이름대로 살아온 것</b>에 깜짝 놀랍니다.<br />
          임상을 해보면, 보통 <b>개명 후 2년</b>이면 긍정적 변화가 시작됩니다.
        </>
      ),
    },
    {
      q: "개명 효과가 사람마다 다르던데요?",
      a: (
        <>
          <b>95% 이상의 작명소</b>에는<br />
          한글 이름의 <b>9개 운</b>과 한자 이름의 <b>3개 주역운</b> <b>이론이 없어 흉운이 들어가도 모릅니다.</b><br />
          흉운의 증가 감소에 따라 개명효과가 달라지는겁니다.
        </>
      ),
    },
    {
      q: "개명, 어렵지 않나요?",
      a: (
        <>
          법적 개명은 <b>행복추구권</b>으로 인정돼 절차와 허가가 쉽습니다.<br />
          이름 바꾸기가 번거로워 보이지만, <b>평생 흉운</b>으로 태클 받으며 사는 것보다 훨씬 쉽습니다.
        </>
      ),
    },
  ];

  return (
    <section className="kna-myth-truth-section relative overflow-hidden bg-white dark:bg-background">
      <div className="kna-myth-truth-inner relative max-w-6xl mx-auto px-6 lg:px-8 pt-24 pb-24 lg:pt-48 lg:pb-48">
        <header className="text-left mb-10">
          <span className="text-[13px] font-bold tracking-wider uppercase text-gray-500 dark:text-gray-400 mb-3 block">
            Naming & Destiny FAQ
          </span>
          <h2 className="text-[25px] sm:text-3xl md:text-4xl font-extrabold leading-tight text-[#18a999] dark:text-[#58C4C4] tracking-tight">
            운명의 방향을 바꾸는 선택,<br />개명에 대한 모든 것
          </h2>
        </header>

        <div className="relative">
          {/* 배경 FAQ 텍스트 */}
          <span 
            className="absolute bottom-[-10%] right-[-5%] text-[50vw] md:text-[35vw] font-black text-gray-100 dark:text-gray-800/20 select-none pointer-events-none leading-none rotate-[-15deg]"
            aria-hidden="true"
          >
            FAQ
          </span>
          
          <ul className="relative z-10 space-y-3 border-t border-gray-200 dark:border-border">
            {items.map((it, i) => (
              <AccordionItem key={i} q={it.q} data-testid={`accordion-item-${i}`}>
                {it.a}
              </AccordionItem>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function AccordionItem({ q, children, ...props }: { q: string; children: React.ReactNode; [key: string]: any }) {
  const [open, setOpen] = useState(false);
  
  return (
    <li className="border-b border-gray-200 dark:border-border" {...props}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left py-6 group"
        aria-expanded={open ? "true" : "false"}
        data-testid={`button-accordion-${q.substring(0, 10)}`}
      >
        <span className="text-[21px] md:text-[22px] font-semibold text-gray-900 dark:text-foreground break-keep tracking-tight group-hover:text-[#0ABAB5] dark:group-hover:text-[#58C4C4] transition-colors">{q}</span>
        <span 
          className={`relative w-5 h-5 flex-shrink-0 transition-transform duration-300 ${open ? "rotate-45" : ""}`}
          aria-hidden="true"
        >
          <span className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-0.5 rounded-sm transition-colors ${open ? "bg-gray-900 dark:bg-foreground" : "bg-[#0ABAB5] dark:bg-[#58C4C4]"}`} />
          <span className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-3.5 rounded-sm transition-colors ${open ? "bg-gray-900 dark:bg-foreground" : "bg-[#0ABAB5] dark:bg-[#58C4C4]"}`} />
        </span>
      </button>
      <div 
        className={`overflow-hidden transition-all duration-300 ease-out ${open ? "max-h-96 pb-6" : "max-h-0"}`}
      >
        <div className="text-lg leading-relaxed text-gray-600 dark:text-muted-foreground pr-5">
          {children}
        </div>
      </div>
    </li>
  );
}
