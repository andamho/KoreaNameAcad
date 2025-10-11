import { AlertTriangle, Lightbulb } from "lucide-react";

export default function KnaDangerSection() {
  return (
    <section className="relative overflow-hidden bg-white dark:bg-background text-gray-900 dark:text-foreground">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[#7fe1d3]/25 dark:bg-[#58C4C4]/25 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[#0f766e]/10 dark:bg-[#45B8B8]/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 py-16 sm:py-20 lg:px-8">
        <header className="mx-auto max-w-3xl text-center">
          <h2 className="mt-4 bg-gradient-to-r from-[#0f766e] to-[#4fd1c5] dark:from-[#58C4C4] dark:to-[#6DD4D4] bg-clip-text text-2xl font-extrabold leading-tight text-transparent sm:text-3xl md:text-4xl flex items-center justify-center gap-3">
            <AlertTriangle className="h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0 text-orange-600 dark:text-orange-400" strokeWidth={2.5} />
            <span>이름 이렇게 지으면 위험합니다</span>
          </h2>
        </header>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <QA
            q="비용을 먼저 물어보시나요?"
            a={<>비용은 아껴도,<br/>대가는 더 비싸집니다</>}
          />
          <QA
            q="사주보고 한자이름만 지으셨나요?"
            a={<>한글 이름의 운이 무너지면,<br/>삶이 비틀립니다</>}
          />
          <QA
            q="후기도 안 보고 맡기셨나요?"
            a={<>검증 없는 작명,<br/>고생은 당사자의 몫입니다</>}
          />
        </div>

        <section aria-labelledby="why-title" className="mt-12 rounded-2xl border border-gray-200 dark:border-border bg-white/80 dark:bg-card/80 p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <Lightbulb className="mt-1 h-6 w-6 flex-shrink-0 text-[#0f766e] dark:text-[#58C4C4]" strokeWidth={2} />
            <div className="flex-1">
              <h3 id="why-title" className="text-2xl font-semibold">이름운이 중요한 이유</h3>
              <div className="mt-2 grid gap-4 md:grid-cols-2">
                <Note title="이름운 = 인생의 결과" desc="열심히만 산다고 잘 사는 게 아닙니다" />
                <Note title="잘못 지은 이름" desc="평생을 괴롭힙니다" />
                <Note title="가족은 운명공동체" desc="한 사람의 이름이 가족 전체에 영향을 줍니다" />
                <Note title="실제 후기 검증" desc="유명세나 말이 아닌, 결과로 증명된 곳을 선택하세요" />
              </div>
            </div>
          </div>
        </section>

      </div>
    </section>
  );
}

function QA({ q, a }: { q: string; a: React.ReactNode }) {
  return (
    <article className="group relative rounded-2xl border border-gray-200 dark:border-border bg-white dark:bg-card p-6 shadow-sm ring-1 ring-transparent transition hover:-translate-y-0.5 hover:shadow-md hover:ring-[#7fe1d3]/60 dark:hover:ring-[#58C4C4]/60 border-l-4 border-l-[#7fe1d3] dark:border-l-[#58C4C4]">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-6 w-6 flex-shrink-0 text-amber-500" strokeWidth={2} />
        <div>
          <p className="text-[22px] font-semibold text-gray-900 dark:text-foreground">"{q}"</p>
          <p className="mt-1 text-lg leading-relaxed text-gray-700 dark:text-muted-foreground">→ {a}</p>
        </div>
      </div>
    </article>
  );
}

function Note({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-border bg-gradient-to-br from-white to-gray-50 dark:from-card dark:to-muted p-4 shadow-sm">
      <h4 className="text-[22px] font-semibold">{title}</h4>
      <p className="mt-1 text-lg text-gray-700 dark:text-muted-foreground">→ {desc}</p>
    </div>
  );
}
