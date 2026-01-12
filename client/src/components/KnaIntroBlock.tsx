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
        <header className="mx-auto max-w-3xl text-center mb-14">
          <h2 className="bg-gradient-to-r from-[#0f766e] to-[#4fd1c5] dark:from-[#58C4C4] dark:to-[#6DD4D4] bg-clip-text text-[25px] font-extrabold leading-tight text-transparent sm:text-3xl md:text-4xl break-keep">
            열심히 노력하며 살아가지만
          </h2>
          <p className="mt-3 text-lg text-muted-foreground break-keep">
            삶이 뜻대로 풀리지 않아 답답하신 마음을 잘 압니다
          </p>
        </header>

        <div className="grid items-start gap-12 md:gap-16 lg:gap-20 md:grid-cols-2 max-w-6xl mx-auto">
          {/* Left: 신뢰 문구 + 슬로건 + SNS */}
          <div className="order-2 md:order-1 text-center md:text-left">
            <p className="text-lg md:text-xl leading-relaxed text-gray-700 dark:text-muted-foreground mb-8">
              한국이름학교는<br />
              <b className="text-gray-900 dark:text-white border-b-2 border-[#56D5DB]/50">18년간 45만 명</b>의 임상 경험을 바탕으로,<br />
              사주 없이 <b className="text-gray-900 dark:text-white border-b-2 border-[#56D5DB]/50">한글·한자 이름만으로</b><br />
              <b className="text-gray-900 dark:text-white border-b-2 border-[#56D5DB]/50">80% 이상의 정확도</b>를 갖춘<br />
              운명상담을 제공합니다.
            </p>
            
            {/* 슬로건 영역 */}
            <div className="border-l-4 border-[#56D5DB] dark:border-[#58C4C4] pl-6 mb-8 text-left">
              <p className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white mb-2 break-keep">
                이름대로 삽니다.
              </p>
              <p className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white mb-4 break-keep">
                이름을 바꾸면, 삶이 바뀝니다.
              </p>
              <p className="text-xl md:text-2xl font-extrabold break-keep">
                <span className="kna-highlight">
                  <span className="kna-shine">이름은 희망입니다.</span>
                </span>
              </p>
            </div>
            
            {/* SNS 팔로워 */}
            <div className="inline-flex items-start gap-3 bg-gray-100/80 dark:bg-card/80 backdrop-blur-sm px-5 py-4 rounded-xl">
              <Star className="h-5 w-5 text-yellow-500 mt-0.5 fill-current flex-shrink-0" />
              <p className="text-sm md:text-base text-gray-700 dark:text-muted-foreground text-left">
                이미 SNS 팔로워 <b className="text-gray-900 dark:text-white">5만 명</b>이 관심을 가지고 있습니다.<br />
                <span className="text-sm opacity-70">(200만 뷰 이상 조회수 다수)</span>
              </p>
            </div>
          </div>

          {/* Right: 실제 후기 박스 */}
          <div className="order-1 md:order-2">
            <div className="relative rounded-2xl border border-gray-200 dark:border-border bg-white dark:bg-card p-6 pt-14 pb-14 shadow-lg">
              {/* 전구 아이콘 */}
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-[#56D5DB] dark:bg-[#58C4C4] flex items-center justify-center shadow-md border-4 border-white dark:border-background">
                <Lightbulb size={22} weight="fill" color="white" />
              </div>
              
              {/* 큰 따옴표 - 상단 */}
              <svg 
                className="absolute top-6 left-4 w-10 h-10 text-[#56D5DB]/60 dark:text-[#58C4C4]/60"
                viewBox="0 0 24 24" 
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"/>
              </svg>
              
              {/* 후기 리스트 */}
              <div className="space-y-3 relative z-10">
                <Testimonial quote="내 삶을 조종한 건 이름이었다니!" />
                <Testimonial quote="개명 전후, 정말 이름대로 살아왔네요." />
                <Testimonial quote="개명 후 6년, 세상에서 가장 행복한 사람" />
              </div>
              
              {/* 큰 따옴표 - 하단 */}
              <svg 
                className="absolute bottom-6 right-4 w-10 h-10 text-[#56D5DB]/60 dark:text-[#58C4C4]/60"
                viewBox="0 0 24 24" 
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M9.983 3v7.391c0 5.704-3.731 9.57-8.983 10.609l-.995-2.151c2.432-.917 3.995-3.638 3.995-5.849h-4v-10h9.983zm14.017 0v7.391c0 5.704-3.748 9.57-9 10.609l-.996-2.151c2.433-.917 3.996-3.638 3.996-5.849h-3.983v-10h9.983z"/>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Testimonial({ quote }: { quote: string }) {
  return (
    <figure className="rounded-xl border border-gray-100 dark:border-border bg-gray-50 dark:bg-card/50 p-4 shadow-sm transition-all hover:translate-x-1 hover:border-[#56D5DB] dark:hover:border-[#58C4C4] hover:text-[#0f766e] dark:hover:text-[#58C4C4] cursor-default">
      <blockquote className="text-base md:text-lg font-semibold text-gray-700 dark:text-muted-foreground">"{quote}"</blockquote>
    </figure>
  );
}
