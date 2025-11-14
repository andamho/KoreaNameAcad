import { AlertTriangle, Zap, OctagonAlert } from "lucide-react";

export default function KnaDangerSection() {
  return (
    <section className="kna-danger-section relative overflow-hidden bg-white dark:bg-background text-gray-900 dark:text-foreground">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[#7fe1d3]/25 dark:bg-[#58C4C4]/25 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[#0f766e]/10 dark:bg-[#45B8B8]/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 py-16 sm:py-20 lg:px-8">
        <header className="mx-auto max-w-3xl text-center">
          <h2 className="mt-4 bg-gradient-to-r from-[#0f766e] to-[#4fd1c5] dark:from-[#58C4C4] dark:to-[#6DD4D4] bg-clip-text text-[25px] font-extrabold leading-tight text-transparent sm:text-3xl md:text-4xl flex items-center justify-center gap-3">
            <AlertTriangle className="hidden md:flex h-[39px] w-[39px] sm:h-[42px] sm:w-[42px] md:h-[50px] md:w-[50px] flex-shrink-0 fill-orange-600 dark:fill-orange-500 stroke-white dark:stroke-white" strokeWidth={2.7} strokeLinecap="round" strokeLinejoin="round" />
            <span>이름, 모르면 위험합니다</span>
          </h2>
        </header>

        <section aria-labelledby="power-title" className="mt-10">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-600 dark:bg-orange-500 flex-shrink-0">
              <Zap className="h-6 w-6 fill-orange-600 dark:fill-orange-500 stroke-white dark:stroke-white" strokeWidth={2.5} />
            </div>
            <h3 id="power-title" className="text-[21px] md:text-[22px] font-semibold">이름은 힘이 셉니다</h3>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Note title="운칠기삼(運七技三), 운이 70%입니다" desc="이름의 강력한 운을 모른 채 30%의 노력만으로는 인생이 바뀌지 않습니다." />
            <Note title="안 좋은 이름에 바람 잘 날 없다" desc="안좋은 이름은 평생을 따라 다니며 괴롭힙니다." />
            <Note title="가족은 운명공동체" desc="이름은 자신뿐만 아니라 가족 전체에 영향을 미칩니다." />
          </div>
        </section>

        <section aria-labelledby="danger-title" className="mt-8">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-600 dark:bg-orange-500 flex-shrink-0">
              <OctagonAlert className="h-6 w-6 fill-orange-600 dark:fill-orange-500 stroke-white dark:stroke-white" strokeWidth={2.5} />
            </div>
            <h3 id="danger-title" className="text-[21px] md:text-[22px] font-semibold">이러시면 안됩니다</h3>
          </div>
          <div className="mt-4 grid gap-6 md:grid-cols-3">
            <QA
              q="비용을 먼저 물어보시나요?"
              a={<>비용을 아끼려다,<br/><span className="text-orange-600 dark:text-orange-400">더 비싼 대가를 치릅니다.</span></>}
            />
            <QA
              q="사주 기반 작명소를 알아보고 계신가요?"
              a={<>그곳은 한글이름 작명이론이 없습니다.<br/>한글 이름의 운이 무너지면,<br/>삶이 흔들립니다.</>}
            />
            <QA
              q="후기도 안 보고 맡기셨나요?"
              a={<>검증 없는 작명,<br/><span className="text-orange-600 dark:text-orange-400">고생은 결국 본인의 몫입니다.</span></>}
            />
          </div>
        </section>

      </div>
    </section>
  );
}

function QA({ q, a }: { q: string; a: React.ReactNode }) {
  return (
    <article className="group relative rounded-2xl border border-gray-200 dark:border-border bg-orange-50/50 dark:bg-orange-950/10 p-6 shadow-sm ring-1 ring-transparent transition hover:-translate-y-0.5 hover:shadow-md">
      <p className="text-[21px] md:text-[22px] font-semibold text-gray-900 dark:text-foreground break-keep">"{q}"</p>
      <p className="mt-2 text-lg md:text-lg leading-relaxed text-gray-700 dark:text-muted-foreground">{a}</p>
    </article>
  );
}

function Note({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card p-4 shadow-sm">
      <h4 className="text-[21px] md:text-[22px] font-semibold break-keep">{title}</h4>
      <p className="mt-2 text-lg md:text-lg text-gray-700 dark:text-muted-foreground">{desc}</p>
    </div>
  );
}
