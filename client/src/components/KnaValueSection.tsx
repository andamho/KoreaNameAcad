import React from "react";
import { Lock, Equal, Link2 } from "lucide-react";

export default function KnaValueSection() {
  return (
    <section className="kna-value-section relative overflow-hidden bg-white dark:bg-background text-gray-900 dark:text-foreground">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-[#7fe1d3]/20 dark:bg-[#58C4C4]/20 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-[#0f766e]/10 dark:bg-[#45B8B8]/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 pt-[174px] pb-16 sm:pt-[190px] sm:pb-20 lg:px-8">
        <header className="mx-auto max-w-3xl text-center">
          <h2 className="bg-gradient-to-r from-[#0f766e] to-[#4fd1c5] dark:from-[#58C4C4] dark:to-[#6DD4D4] bg-clip-text text-[25px] font-extrabold leading-tight text-transparent sm:text-3xl md:text-4xl">왜 한국이름학교인가?</h2>
          <p className="mt-3 text-lg text-muted-foreground">전국 최다 후기로 검증된,<br className="md:hidden" /> 가장 신뢰받는 이름 분석</p>
        </header>

        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <ValueCard
            icon={<ShieldIcon className="h-6 w-6 flex-shrink-0 text-[#0f766e] dark:text-[#58C4C4]" />}
            title="신뢰의 증거"
            desc="전국 최다 후기로 검증된 만족도를 확인하세요"
          />
          <ValueCard
            icon={<SearchIcon className="h-6 w-6 flex-shrink-0 text-[#0f766e] dark:text-[#58C4C4]" />}
            title="근본 원인 발견"
            desc="반복되는 어려움의 이유를 이름에서 명확히 찾아드립니다."
          />
          <ValueCard
            icon={<Equal className="h-6 w-6 flex-shrink-0 text-[#0f766e] dark:text-[#58C4C4]" />}
            title="이름 · 삶 일치 증명"
            desc="이름대로 살고 있음을 구체적으로 보여드립니다."
          />
          <ValueCard
            icon={<Link2 className="h-6 w-6 flex-shrink-0 text-[#0f766e] dark:text-[#58C4C4]" />}
            title="개명 전·후 삶 증명"
            desc="개명하셨다면 전·후 이름대로 살았다는 걸 증명해드립니다."
          />
          <ValueCard
            icon={<FamilyIcon className="h-6 w-6 flex-shrink-0 text-[#0f766e] dark:text-[#58C4C4]" />}
            title="가족 이해 향상"
            desc="이름을 통해 서로의 장점과 문제의 뿌리를 알아 관계가 개선됩니다."
          />
          <ValueCard
            icon={<SparkIcon className="h-6 w-6 flex-shrink-0 text-[#0f766e] dark:text-[#58C4C4]" />}
            title="강점과 재능 발견"
            desc="당신이 몰랐던 본연의 장점을 알려드립니다."
          />
        </div>

        <section className="mt-12 rounded-2xl border border-[#56D5DB] bg-[#56D5DB] p-6 shadow-lg shadow-[#56D5DB]/40">
          <h3 className="text-[21px] md:text-[22px] font-bold tracking-tight text-white break-keep flex items-center gap-2">
            <span className="animate-pulse-scale-white"><Lock className="h-6 w-6 md:h-7 md:w-7 text-white flex-shrink-0" /></span>
            <span className="md:whitespace-nowrap">두 번의 확인, 평생의 안심</span>
          </h3>
          <ul className="mt-4 space-y-3">
            <li className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-white text-sm font-bold text-[#56D5DB]">1</span>
              <span className="text-lg md:text-lg text-white">상담·개명 후기 기반 1차 검증</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-white text-sm font-bold text-[#56D5DB]">2</span>
              <span className="text-lg md:text-lg text-white">이름만으로 운명상담 통해 2차 검증</span>
            </li>
          </ul>
        </section>
      </div>
    </section>
  );
}

function ValueCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <article className="group relative rounded-2xl border border-gray-200 dark:border-border bg-white dark:bg-card p-6 shadow-sm ring-1 ring-transparent transition hover:-translate-y-0.5 hover:shadow-md hover:ring-[#7fe1d3]/60 dark:hover:ring-[#58C4C4]/60">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-[#7fe1d3]/25 dark:bg-[#58C4C4]/25 animate-pulse-glow-teal">{icon}</div>
        <div>
          <h3 className="text-[21px] md:text-[22px] font-semibold text-foreground break-keep">{title}</h3>
          <p className="mt-1 text-lg md:text-lg leading-relaxed text-gray-700 dark:text-muted-foreground">{desc}</p>
        </div>
      </div>
    </article>
  );
}

function ShieldIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={props.className} aria-hidden>
      <path d="M12 3l7 4v5a9 9 0 0 1-7 8 9 9 0 0 1-7-8V7l7-4Z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={props.className} aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-3.4-3.4" />
    </svg>
  );
}

function SparkIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={props.className} aria-hidden>
      <path d="M12 2v6M12 16v6M2 12h6M16 12h6M5 5l4 4M15 15l4 4M19 5l-4 4M5 19l4-4" />
    </svg>
  );
}

function FamilyIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={props.className} aria-hidden>
      <circle cx="6" cy="8" r="2.5" />
      <circle cx="18" cy="8" r="2.5" />
      <path d="M6 11c-2.5 0-4 1.5-4 3.5v1.5h8v-1.5c0-2-1.5-3.5-4-3.5z" />
      <path d="M18 11c-2.5 0-4 1.5-4 3.5v1.5h8v-1.5c0-2-1.5-3.5-4-3.5z" />
      <path d="M8 12.5c1.5 1 4.5 1 6 0" strokeLinecap="round" />
    </svg>
  );
}

function MatchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={props.className} aria-hidden>
      <path d="M4 12a8 8 0 0 0 16 0" />
      <path d="M9 9l3 3-3 3M15 9l-3 3 3 3" />
    </svg>
  );
}

function TimelineIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={props.className} aria-hidden>
      <circle cx="6" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="18" cy="12" r="2" />
      <path d="M6 12h6m0 0h6" />
    </svg>
  );
}
