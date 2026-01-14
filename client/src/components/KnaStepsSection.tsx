import { Calendar, MapPin, Star } from "lucide-react";
import { Link } from "wouter";
import { forwardRef, useEffect, useRef, useState } from "react";

interface StepCardProps {
  step: number;
  icon: React.ReactNode;
  title: string;
  desc: string;
  badge?: string;
  isActive?: boolean;
  isScrollActive?: boolean;
  footer?: React.ReactNode;
  footerLabel?: string;
  footerNext?: string;
}

const StepCard = forwardRef<HTMLElement, StepCardProps>(
  ({ step, icon, title, desc, badge, isActive, isScrollActive, footer, footerLabel, footerNext }, ref) => {
    const isHighlighted = isActive || isScrollActive;
    
    const baseClasses = "group relative flex flex-col rounded-2xl border p-6 transition duration-300";
    const stateClasses = isActive
      ? "border-gray-200 dark:border-gray-700 bg-white dark:bg-card shadow-sm hover:shadow-lg hover:-translate-y-1 opacity-100"
      : isScrollActive
        ? "border-gray-200 dark:border-gray-700 bg-white dark:bg-card shadow-md -translate-y-1 opacity-100"
        : "border-gray-200 dark:border-gray-700 bg-white dark:bg-card shadow-sm opacity-50 hover:opacity-100 hover:shadow-md hover:-translate-y-1";

    return (
      <article 
        ref={ref} 
        data-step={step} 
        className={`${baseClasses} ${stateClasses}`}
      >
        <div className={`pointer-events-none absolute inset-0 rounded-2xl ring-1 transition duration-300 ${
          isScrollActive ? "ring-[#18a999]/30" : "ring-transparent group-hover:ring-[#18a999]/30"
        }`} />

        <div className="flex items-center gap-4">
          <span className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition duration-300 ${
            isHighlighted 
              ? "bg-[#18a999]/10 text-[#18a999] ring-1 ring-[#18a999]/20"
              : "bg-white dark:bg-gray-800 ring-1 ring-gray-200 dark:ring-gray-700 text-gray-300 dark:text-gray-500 group-hover:bg-[#18a999]/10 group-hover:text-[#18a999] group-hover:ring-[#18a999]/20"
          }`}>
            {icon}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold tracking-wide transition duration-300 ${
                isHighlighted ? "text-[#18a999]" : "text-gray-300 dark:text-gray-500 group-hover:text-[#18a999]"
              }`}>
                STEP 0{step}
              </span>
              {badge && (
                <span className="inline-flex items-center rounded-full bg-gray-900 dark:bg-white px-2 py-0.5 text-[11px] font-bold text-white dark:text-gray-900">
                  {badge}
                </span>
              )}
            </div>
            <h3 className="mt-1 text-[21px] md:text-[22px] font-semibold tracking-tight text-gray-900 dark:text-foreground">{title}</h3>
          </div>
        </div>

        <p className={`mt-4 flex-grow text-lg leading-relaxed transition duration-300 ${
          isHighlighted 
            ? "text-gray-700 dark:text-muted-foreground" 
            : "text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-muted-foreground"
        }`}>
          {desc}
        </p>

        {footer ? (
          <div className="mt-6 border-t border-gray-100 dark:border-gray-700 pt-5 relative z-10">
            {footer}
          </div>
        ) : (
          <div className="mt-6 flex items-center justify-between border-t border-gray-100 dark:border-gray-700 pt-5">
            <span className="text-xs font-medium text-gray-400 dark:text-gray-500">{footerLabel}</span>
            <span className={`inline-flex items-center text-xs font-bold text-gray-700 dark:text-gray-300 transition duration-300 ${
              isScrollActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}>
              {footerNext}
            </span>
          </div>
        )}
      </article>
    );
  }
);

StepCard.displayName = "StepCard";

export default function KnaStepsSection() {
  const [activeCards, setActiveCards] = useState<Set<number>>(new Set());
  const cardsRef = useRef<(HTMLElement | null)[]>([]);
  const [isMobile, setIsMobile] = useState(false);

  // 모바일 감지
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // 모바일에서만 스크롤 기반 활성화
  useEffect(() => {
    if (!isMobile) {
      setActiveCards(new Set());
      return;
    }

    let observer: IntersectionObserver | null = null;

    // DOM이 완전히 렌더링된 후 observer 설정
    const timeoutId = setTimeout(() => {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const step = Number(entry.target.getAttribute("data-step"));
            if (step === 2 || step === 3) {
              setActiveCards((prev) => {
                const next = new Set(prev);
                // 35% 이상 보일 때만 활성화
                if (entry.intersectionRatio >= 0.35) {
                  next.add(step);
                } else {
                  next.delete(step);
                }
                return next;
              });
            }
          });
        },
        { threshold: [0, 0.2, 0.35, 0.5], rootMargin: "-15% 0px -25% 0px" }
      );

      cardsRef.current.forEach((card) => {
        if (card) observer!.observe(card);
      });
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      if (observer) observer.disconnect();
    };
  }, [isMobile]);

  return (
    <section id="services" className="kna-steps-section relative isolate overflow-hidden bg-white dark:bg-background">
      <div className="absolute inset-0 -z-10">
        <div 
          className="absolute inset-0 opacity-60 dark:opacity-30"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(15, 23, 42, 0.06) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(15, 23, 42, 0.06) 1px, transparent 1px)
            `,
            backgroundSize: '48px 48px',
            backgroundPosition: 'center',
            maskImage: 'radial-gradient(60% 60% at 50% 40%, #000 50%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(60% 60% at 50% 40%, #000 50%, transparent 100%)'
          }}
        />
        <div 
          className="absolute -top-24 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full blur-[40px] opacity-55"
          style={{
            background: `
              radial-gradient(circle at 30% 30%, rgba(14,165,233,.35), transparent 55%),
              radial-gradient(circle at 70% 60%, rgba(99,102,241,.28), transparent 55%),
              radial-gradient(circle at 40% 80%, rgba(34,197,94,.18), transparent 55%)
            `
          }}
        />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-700 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-700 to-transparent" />
      </div>

      <div className="kna-steps-inner relative mx-auto max-w-6xl px-6 pt-24 pb-24 lg:pt-48 lg:pb-48 lg:px-8">
        <header className="text-left mb-12 sm:mb-16">
          <p className="text-sm font-medium tracking-wide text-gray-500 dark:text-gray-400">3-Step Flow</p>
          <h2 className="mt-4 text-[25px] sm:text-3xl md:text-4xl font-extrabold tracking-tight text-[#18a999]">
            복잡한 인생 문제,<br />
            올바른 시작은 하나면 충분합니다
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-gray-600 dark:text-muted-foreground">
            지금은 <span className="font-bold text-gray-800 dark:text-foreground">1단계만</span> 시작하면 됩니다.
          </p>
        </header>

        <div className="relative">
          {/* 데스크톱: 카드 사이 짧은 연결선 */}
          <div className="absolute inset-0 hidden lg:flex items-center pointer-events-none -z-10">
            {/* 카드1-카드2 사이 연결선 */}
            <div className="absolute left-[calc(33.333%-8px)] w-4 top-1/2 h-px bg-gray-300 dark:bg-gray-600" />
            {/* 카드2-카드3 사이 연결선 */}
            <div className="absolute left-[calc(66.666%-8px)] w-4 top-1/2 h-px bg-gray-300 dark:bg-gray-600" />
          </div>

          {/* 모바일: 세로 점선 */}
          <div className="absolute left-6 top-6 bottom-6 w-px border-l-2 border-dotted border-gray-200 dark:border-gray-700 lg:hidden -z-10" />

          <div className="grid gap-8 lg:grid-cols-3 lg:gap-4">
            <StepCard
              ref={(el) => { cardsRef.current[0] = el; }}
              step={1}
              icon={<Calendar className="h-6 w-6" />}
              title="일정 예약"
              desc="상담 신청서 작성 후 결제를 완료하시면 가장 빠른 일정으로 예약해 드립니다."
              badge="지금 시작"
              isActive
              footer={
                <>
                  <div className="flex items-center justify-center gap-4">
                    <Link to="/services" onClick={() => window.scrollTo(0, 0)} className="inline-flex items-center justify-center rounded-full bg-gray-900 dark:bg-white px-4 py-1.5 text-sm font-medium text-white dark:text-gray-900 transition hover:bg-gray-800 dark:hover:bg-gray-100">
                      지금 신청 <span className="ml-1">›</span>
                    </Link>
                  </div>
                  <p className="mt-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400">예상 소요: 1–2분</p>
                </>
              }
            />
            
            <StepCard
              ref={(el) => { cardsRef.current[1] = el; }}
              step={2}
              icon={<MapPin className="h-6 w-6" />}
              title="운명 상담"
              desc="고달픈 인생의 이유를 이름 분석 운명 상담을 통해 명확히 찾아드립니다."
              footerLabel="핵심: 원인 규명"
              footerNext="다음: 인생 역전 >"
              isScrollActive={activeCards.has(2)}
            />
            
            <StepCard
              ref={(el) => { cardsRef.current[2] = el; }}
              step={3}
              icon={<Star className="h-6 w-6" />}
              title="인생 역전"
              desc="운명상담의 정확도 체험 후, 운이 술술 풀리는 새 이름으로 인생을 역전시켜 드립니다."
              footerLabel="결과: 방향 전환"
              footerNext="완료 ✓"
              isScrollActive={activeCards.has(3)}
            />
          </div>

          <div className="mt-8 lg:hidden">
            <div className="mx-auto flex max-w-sm items-center gap-3 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-card px-5 py-2.5 text-sm text-gray-700 dark:text-gray-300 shadow-sm ring-1 ring-gray-100 dark:ring-gray-800">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#18a999] text-white text-[10px] font-bold">!</span>
              <span className="font-semibold">위의 [지금 신청] 버튼을 눌러주세요</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
