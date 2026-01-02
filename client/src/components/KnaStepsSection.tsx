export default function KnaStepsSection() {
  return (
    <section id="services" className="kna-steps-section relative overflow-hidden pb-16 md:pb-24 bg-background">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-[#7fe1d3]/20 dark:bg-[#58C4C4]/20 blur-3xl" />
      </div>
      <div className="kna-steps-inner relative max-w-5xl mx-auto px-6 lg:px-8 pt-[174px] sm:pt-[190px]">
        <header className="text-center">
          <h2 className="text-[25px] font-extrabold leading-tight sm:text-3xl md:text-4xl">
            <span className="bg-gradient-to-r from-[#0f766e] to-[#4fd1c5] dark:from-[#58C4C4] dark:to-[#6DD4D4] bg-clip-text text-transparent">막막했던 인생의 답,</span>
            <br className="sm:hidden" />
            <span className="text-[#FFB800]"> 단 3단계</span>
            <span className="bg-gradient-to-r from-[#0f766e] to-[#4fd1c5] dark:from-[#58C4C4] dark:to-[#6DD4D4] bg-clip-text text-transparent">면 충분합니다</span>
          </h2>
          <p className="mt-2 text-lg text-muted-foreground">
            하나씩만 천천히 따라 와주세요
          </p>
        </header>

        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          <Step 
            number={1} 
            title="일정 예약" 
            desc="상담 신청서 작성 후 결제를 완료하시면 가장 빠른 일정으로 예약해 드립니다." 
          />
          <Step 
            number={2} 
            title="운명 상담" 
            desc="고달픈 인생의 이유를 이름 분석 운명 상담을 통해 명확히 찾아드립니다." 
          />
          <Step 
            number={3} 
            title="인생 역전" 
            desc="운명상담의 정확도 체험 후, 운이 술술 풀리는 새 이름으로 인생을 역전시켜 드립니다." 
          />
        </ol>
      </div>
    </section>
  );
}

function Step({ number, title, desc }: { number: number; title: string; desc: string }) {
  return (
    <li className="group rounded-2xl border border-gray-200 dark:border-border bg-white dark:bg-card p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#FFB800] text-[21px] font-bold text-white">
          {number}
        </span>
        <h3 className="text-[21px] md:text-[22px] font-semibold break-keep">{title}</h3>
      </div>
      <p className="mt-3 text-lg md:text-lg leading-relaxed text-gray-700 dark:text-muted-foreground">{desc}</p>
    </li>
  );
}
