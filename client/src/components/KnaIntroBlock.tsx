// 미리보기 전용: 인트로 한 블록만 렌더
// 사용법: 페이지 어디서나 <KnaIntroBlock /> 단독 사용

import { Star } from "lucide-react";

export default function KnaIntroBlock() {
  return (
    <section className="kna-intro-block relative overflow-hidden bg-white dark:bg-background text-gray-900 dark:text-foreground">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-[#7fe1d3]/20 dark:bg-[#58C4C4]/20 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-[#0f766e]/10 dark:bg-[#45B8B8]/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 py-16 sm:py-20 lg:px-8">
        <header className="mx-auto max-w-3xl text-center">
          <h2 className="mt-4 bg-gradient-to-r from-[#0f766e] to-[#4fd1c5] dark:from-[#58C4C4] dark:to-[#6DD4D4] bg-clip-text text-[25px] font-extrabold leading-tight text-transparent sm:text-3xl md:text-4xl break-keep">
            열심히 노력하며 살아가지만
          </h2>
          <p className="mt-3 text-lg md:text-[22px] text-muted-foreground break-keep">
            삶이 뜻대로 풀리지 않아 답답하신 마음을 잘 압니다
          </p>
        </header>

        <div className="mt-10 max-w-5xl mx-auto rounded-2xl border border-gray-200 dark:border-border bg-white/90 dark:bg-card/90 p-6 shadow-sm md:p-8">
          <div className="grid items-start gap-8 md:grid-cols-2">
            {/* Left: 신뢰 문구 */}
            <div className="order-1">
              <p className="text-lg md:text-xl leading-relaxed text-gray-700 dark:text-muted-foreground">
                한국이름학교는<br />
                <b>17년</b>간 <b>43만 명</b>의 임상 경험을 바탕으로,<br />
                <b>사주 없이</b> <b>한글·한자 이름만</b>으로<br />
                <b>80% 이상의 정확도</b>를 갖춘 <b>운명상담</b>을 제공합니다.
              </p>
              <p className="mt-6 text-lg md:text-2xl font-bold break-keep">
                <span className="kna-highlight">
                  <span className="kna-shine">이름은 희망입니다.</span>
                </span>
              </p>
            </div>

            {/* Right: 실제 후기 */}
            <div className="space-y-3 order-2">
              <Testimonial quote="내 삶을 조종한 건 이름이었다니!" />
              <Testimonial quote="신점보다 훨씬 신뢰가 갑니다." />
              <Testimonial quote="개명 전후, 정말 이름대로 살아왔네요." />
            </div>

            {/* SNS 팔로워 (모바일에서는 후기 다음) */}
            <div className="order-3 md:col-span-2">
              <p className="text-base md:text-lg text-gray-700 dark:text-muted-foreground flex items-start gap-2">
                <Star className="md:hidden h-5 w-5 text-yellow-500 mt-0.5 fill-current" />
                <span className="hidden md:inline text-[#0f766e] dark:text-[#58C4C4] mt-0.5">⭐</span>
                <span>
                  이미 SNS 팔로워 <b>5만 명</b>이 관심을 가지고 있습니다.<br />
                  (200만 뷰 이상 조회수 다수)
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Testimonial({ quote }: { quote: string }) {
  return (
    <figure className="rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card p-4 shadow-sm">
      <blockquote className="text-lg md:text-lg text-[#0f766e] dark:text-[#58C4C4]">"{quote}"</blockquote>
    </figure>
  );
}
