// 미리보기 전용: 인트로 한 블록만 렌더
// 사용법: 페이지 어디서나 <KnaIntroBlock /> 단독 사용

import { Star } from "lucide-react";
import { Lightbulb } from "@phosphor-icons/react";

export default function KnaIntroBlock() {
  return (
    <section className="kna-intro-block relative overflow-hidden bg-white dark:bg-background text-gray-900 dark:text-foreground">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[#7fe1d3]/20 dark:bg-[#58C4C4]/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[#0f766e]/10 dark:bg-[#45B8B8]/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 pt-[174px] pb-16 sm:pt-[190px] sm:pb-20 lg:px-8">
        <header className="mx-auto max-w-3xl text-center">
          <h2 className="bg-gradient-to-r from-[#0f766e] to-[#4fd1c5] dark:from-[#58C4C4] dark:to-[#6DD4D4] bg-clip-text text-[25px] font-extrabold leading-tight text-transparent sm:text-3xl md:text-4xl break-keep">
            열심히 노력하며 살아가지만
          </h2>
          <p className="mt-3 text-lg text-muted-foreground break-keep">
            삶이 뜻대로 풀리지 않아 답답하신 마음을 잘 압니다
          </p>
        </header>

        <div className="mt-10 max-w-5xl mx-auto rounded-2xl border border-gray-200 dark:border-border bg-white/90 dark:bg-card/90 p-6 shadow-sm md:p-8">
          <div className="grid items-start gap-8 md:grid-cols-2">
            {/* Left: 신뢰 문구 */}
            <div className="order-1">
              <p className="text-lg leading-relaxed text-gray-700 dark:text-muted-foreground">
                한국이름학교는<br />
                <b>18년</b>간 <b>45만 명</b>의 임상 경험을 바탕으로,<br />
                <b>사주 없이</b> <b>한글·한자 이름만</b>으로<br />
                <b>80% 이상의 정확도</b>를 갖춘 <b>운명상담</b>을 제공합니다.
              </p>
            </div>

            {/* Right: 실제 후기 - 전체를 감싸는 큰 쌍따옴표 카드 */}
            <div className="order-2">
              <div className="relative rounded-2xl border border-[#56D5DB]/30 dark:border-[#58C4C4]/30 bg-gradient-to-br from-[#56D5DB]/5 to-[#7fe1d3]/10 dark:from-[#58C4C4]/10 dark:to-[#45B8B8]/5 p-5 pt-10 pb-[72px]">
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-[#56D5DB] dark:bg-[#58C4C4] flex items-center justify-center shadow-sm">
                  <Lightbulb size={20} weight="light" color="white" />
                </div>
                <svg 
                  className="absolute top-4 left-4 w-8 h-8 text-[#56D5DB] dark:text-[#58C4C4] opacity-80"
                  viewBox="0 0 24 24" 
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"/>
                </svg>
                <div className="space-y-3">
                  <Testimonial quote="내 삶을 조종한 건 이름이었다니!" />
                  <Testimonial quote="개명 전후, 정말 이름대로 살아왔네요." />
                  <Testimonial quote="개명 후 6년, 세상에서 가장 행복한 사람" />
                </div>
                <svg 
                  className="absolute bottom-6 right-4 w-8 h-8 text-[#56D5DB] dark:text-[#58C4C4] opacity-80"
                  viewBox="0 0 24 24" 
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M9.983 3v7.391c0 5.704-3.731 9.57-8.983 10.609l-.995-2.151c2.432-.917 3.995-3.638 3.995-5.849h-4v-10h9.983zm14.017 0v7.391c0 5.704-3.748 9.57-9 10.609l-.996-2.151c2.433-.917 3.996-3.638 3.996-5.849h-3.983v-10h9.983z"/>
                </svg>
              </div>
              <p className="!mt-8 text-lg font-bold break-keep">
                이름대로 삽니다.<br />
                이름을 바꾸면, 삶이 바뀝니다.
              </p>
              <p className="!mt-8 text-xl font-bold break-keep">
                <span className="kna-highlight">
                  <span className="kna-shine">이름은 희망입니다.</span>
                </span>
              </p>
            </div>

            {/* SNS 팔로워 (모바일에서는 후기 다음) */}
            <div className="order-3 md:col-span-2">
              <p className="text-base text-gray-700 dark:text-muted-foreground flex items-start gap-2">
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
