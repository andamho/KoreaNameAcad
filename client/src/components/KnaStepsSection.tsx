import { Calendar, MapPin, Star } from "lucide-react";

export default function KnaStepsSection() {
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

      <div className="relative mx-auto max-w-6xl px-6 pt-24 pb-24 lg:px-8">
        <header className="mx-auto max-w-2xl text-center mb-12 sm:mb-16">
          <p className="text-sm font-medium tracking-wide text-gray-500 dark:text-gray-400">3-Step Flow</p>
          <h2 className="mt-4 text-[25px] sm:text-3xl md:text-4xl font-extrabold tracking-tight text-[#18a999]">
            복잡한 인생 문제,<br className="hidden sm:block" />
            올바른 시작은 하나면 충분합니다
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-gray-600 dark:text-muted-foreground">
            지금은 <span className="font-bold text-gray-800 dark:text-foreground">1단계만</span> 시작하면 됩니다.
          </p>
        </header>

        <div className="relative">
          <div className="absolute inset-0 hidden lg:block pointer-events-none -z-10">
            <div className="absolute left-6 w-[calc(50%-1.5rem)] top-[66%] h-px bg-gray-300 dark:bg-gray-600" />
            <div className="absolute right-6 w-[calc(50%-1.5rem)] top-[33%] h-px bg-gray-300 dark:bg-gray-600" />
          </div>

          <div className="absolute left-6 top-6 bottom-6 w-px border-l-2 border-dotted border-gray-200 dark:border-gray-700 lg:hidden -z-10" />

          <div className="grid gap-8 lg:grid-cols-3 lg:gap-4">
            <StepCard
              step={1}
              icon={<Calendar className="h-6 w-6" />}
              title="일정 예약"
              desc="상담 신청서 작성 후 결제를 완료하시면 가장 빠른 일정으로 예약해 드립니다."
              badge="지금 시작"
              isActive
              footer={
                <>
                  <a href="#consultation" className="flex w-full items-center justify-center rounded-lg bg-gray-900 dark:bg-white px-4 py-2.5 text-sm font-semibold text-white dark:text-gray-900 transition hover:bg-gray-800 dark:hover:bg-gray-100">
                    일정 예약하기
                    <span className="ml-2">→</span>
                  </a>
                  <p className="mt-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400">예상 소요: 1–2분</p>
                </>
              }
            />
            
            <StepCard
              step={2}
              icon={<MapPin className="h-6 w-6" />}
              title="운명 상담"
              desc="고달픈 인생의 이유를 이름 분석 운명 상담을 통해 명확히 찾아드립니다."
              footerLabel="핵심: 원인 규명"
              footerNext="다음: 인생 역전"
            />
            
            <StepCard
              step={3}
              icon={<Star className="h-6 w-6" />}
              title="인생 역전"
              desc="운명상담의 정확도 체험 후, 운이 술술 풀리는 새 이름으로 인생을 역전시켜 드립니다."
              footerLabel="결과: 방향 전환"
              footerNext="완료 ✓"
            />
          </div>

          <div className="mt-8 lg:hidden">
            <div className="mx-auto flex max-w-sm items-center gap-3 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-card px-5 py-2.5 text-sm text-gray-700 dark:text-gray-300 shadow-sm ring-1 ring-gray-100 dark:ring-gray-800">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#18a999] text-white text-[10px] font-bold">!</span>
              <span className="font-semibold">위의 [일정 예약하기] 버튼을 눌러주세요</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

interface StepCardProps {
  step: number;
  icon: React.ReactNode;
  title: string;
  desc: string;
  badge?: string;
  isActive?: boolean;
  footer?: React.ReactNode;
  footerLabel?: string;
  footerNext?: string;
}

function StepCard({ step, icon, title, desc, badge, isActive, footer, footerLabel, footerNext }: StepCardProps) {
  const baseClasses = "group relative flex flex-col rounded-2xl border p-6 shadow-sm transition duration-300";
  const activeClasses = isActive
    ? "border-gray-200 dark:border-gray-700 bg-white dark:bg-card hover:shadow-lg hover:-translate-y-1"
    : "border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-card/60 backdrop-blur opacity-50 hover:bg-white dark:hover:bg-card hover:opacity-100 hover:shadow-md hover:-translate-y-1";

  return (
    <article data-step={step} className={`${baseClasses} ${activeClasses}`}>
      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-transparent transition duration-300 group-hover:ring-[#18a999]/30" />

      <div className="flex items-center gap-4">
        <span className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition duration-300 ${
          isActive 
            ? "bg-[#18a999]/10 text-[#18a999] ring-1 ring-[#18a999]/20"
            : "bg-white dark:bg-gray-800 ring-1 ring-gray-200 dark:ring-gray-700 text-gray-300 dark:text-gray-500 group-hover:bg-[#18a999]/10 group-hover:text-[#18a999] group-hover:ring-[#18a999]/20"
        }`}>
          {icon}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold tracking-wide transition duration-300 ${
              isActive ? "text-[#18a999]" : "text-gray-300 dark:text-gray-500 group-hover:text-[#18a999]"
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
        isActive 
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
          <span className="inline-flex items-center text-xs font-bold text-gray-700 dark:text-gray-300 opacity-0 transition duration-300 group-hover:opacity-100">
            {footerNext} <span className="ml-1">→</span>
          </span>
        </div>
      )}
    </article>
  );
}
