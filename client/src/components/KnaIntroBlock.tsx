// 미리보기 전용: 인트로 한 블록만 렌더
// 사용법: 페이지 어디서나 <KnaIntroBlock /> 단독 사용

export default function KnaIntroBlock() {
  return (
    <section className="relative mx-auto my-10 max-w-5xl rounded-2xl border border-gray-200 dark:border-border bg-white/90 dark:bg-card/90 p-6 shadow-sm md:p-8">
      <div className="grid items-start gap-8 md:grid-cols-2">
        {/* Left: 타이틀 & 신뢰 문구 */}
        <div>
          {/* 타이틀 색상: 첨부 이미지 톤 (#1BA89C) */}
          <h2 className="text-2xl font-extrabold leading-tight tracking-tight text-[#1BA89C] dark:text-[#58C4C4] sm:text-3xl">
            열심히 노력하며 살아가지만
          </h2>
          <p className="mt-2 text-base leading-relaxed text-gray-700 dark:text-muted-foreground">
            삶이 뜻대로 풀리지 않아 답답하신 마음을 압니다.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-gray-700 dark:text-muted-foreground">
            한국이름학교는 <b>17년</b>간 <b>43만 명+</b>의 임상 경험을 바탕으로, <b>사주 없이</b> <b>한글·한자 이름만</b>으로 <b>80%+</b>의 정확도를 갖춘 운명 상담을 제공합니다.
          </p>
          <p className="mt-6 text-base font-semibold text-[#0f766e] dark:text-[#58C4C4]">이름은 희망입니다.</p>
        </div>

        {/* Right: 실제 후기 */}
        <div className="space-y-3">
          <Testimonial quote="내 삶을 조종한 건 이름이었다니!" />
          <Testimonial quote="신점보다 훨씬 신뢰가 갑니다." />
          <Testimonial quote="개명 전후, 정말 이름대로 살아왔네요." />
        </div>
      </div>
    </section>
  );
}

function Testimonial({ quote }: { quote: string }) {
  return (
    <figure className="rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card p-4 shadow-sm">
      <blockquote className="text-sm text-gray-700 dark:text-muted-foreground">"{quote}"</blockquote>
    </figure>
  );
}
