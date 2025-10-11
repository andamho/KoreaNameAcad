export default function KnaStepsSection() {
  return (
    <section className="py-16 md:py-24 bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <header className="text-center">
          <h2 className="mt-4 bg-gradient-to-r from-[#0f766e] to-[#4fd1c5] dark:from-[#58C4C4] dark:to-[#6DD4D4] bg-clip-text text-[25px] font-extrabold leading-tight text-transparent sm:text-3xl md:text-4xl">
            참 쉽습니다
          </h2>
          <p className="mt-2 text-lg text-muted-foreground">
            하나씩만 천천히 따라 와주세요
          </p>
        </header>

        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          <Step 
            number={1} 
            title="일정 예약" 
            desc="상담 신청서 작성 후 입금하시면 가장 빠른 일정으로 예약해 드립니다." 
          />
          <Step 
            number={2} 
            title="운명 상담" 
            desc="고달픈 인생의 이유를 이름 분석 운명 상담을 통해 명확히 찾아드립니다." 
          />
          <Step 
            number={3} 
            title="인생 역전" 
            desc="정확도 체험 후, 운이 술술 풀리는 새 이름으로 인생을 역전시켜 드립니다." 
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
        <span className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[#7fe1d3]/30 dark:bg-[#58C4C4]/30 text-base font-bold text-[#0f766e] dark:text-[#58C4C4]">
          {number}
        </span>
        <h3 className="text-[21px] md:text-[22px] font-semibold break-keep">{title}</h3>
      </div>
      <p className="mt-3 text-lg md:text-lg leading-relaxed text-gray-700 dark:text-muted-foreground">{desc}</p>
    </li>
  );
}
