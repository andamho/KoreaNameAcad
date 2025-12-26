import pricingCharacterImage from "@assets/KakaoTalk_20251226_150428417_1766729101276.png";

const pricingData = {
  sections: [
    {
      heading: "이름분석 상담비",
      columns: ["항목", "금액"],
      rows: [
        { name: "이름분석", price: "6만원" },
        { name: "이름감명 (타작명소 이름)", price: "2만원" },
        { name: "이름궁합(연인)", price: "10만원" },
        { name: "인스타명(감명)", price: "2만원" },
        { name: "반려동물(감명)", price: "2만원" },
      ],
    },
    {
      heading: "상담소요시간",
      columns: ["인원", "시간"],
      rows: [
        { name: "1명", price: "1시간" },
        { name: "2명", price: "1.5시간" },
        { name: "3명", price: "2시간" },
        { name: "4명", price: "2.5시간" },
      ],
    },
    {
      heading: "번호변경 여권이름",
      columns: ["항목", "금액"],
      rows: [
        { name: "전화번호", price: "35만원" },
        { name: "여권이름", price: "35만원" },
        { name: "차량번호", price: "35만원" },
      ],
    },
  ],
};

interface KnaPricingSectionProps {
  showHero?: boolean;
}

export default function KnaPricingSection({ showHero = false }: KnaPricingSectionProps) {
  return (
    <>
      {/* Hero Section with Tiffany Blue gradient - only shown when showHero is true */}
      {showHero && (
        <section className="relative overflow-hidden bg-gradient-to-br from-[#0f766e] to-[#4fd1c5] dark:from-[#0a5850] dark:to-[#3ba89e] py-16 md:py-24">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzBoLTR2NGg0di00em0wLThoLTR2NGg0di00em04IDhoLTR2NGg0di00em0tOCA4aC00djRoNHYtNHptOCAwaC00djRoNHYtNHptMC04aC00djRoNHYtNHptOC04aC00djRoNHYtNHptMCA4aC00djRoNHYtNHptLTggMGgtNHY0aDR2LTR6bTggOGgtNHY0aDR2LTR6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-20"></div>
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12">
              <img 
                src={pricingCharacterImage}
                alt="비용 안내 캐릭터"
                className="w-auto h-40 md:h-56 flex-shrink-0 order-1 md:order-2"
              />
              <div className="text-center md:text-left order-2 md:order-1">
                <h1 
                  className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white mb-4"
                  data-testid="heading-pricing"
                >
                  비용 및 시간
                </h1>
                <p className="text-lg md:text-2xl text-white/90" data-testid="text-pricing-policy">⚖️ 모든 비용은 이름연구협회 규정에 따릅니다</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Pricing Content Section */}
      <section id="pricing" className="kna-pricing-section relative overflow-hidden py-16 md:py-24 bg-background">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-[#7fe1d3]/20 dark:bg-[#58C4C4]/20 blur-3xl" />
        </div>
        <div className="relative max-w-5xl mx-auto px-6 lg:px-8">
          {/* Section header - only shown when Hero is NOT displayed */}
          {!showHero && (
            <div className="text-center mb-12">
              <h2 
                className="text-[25px] md:text-4xl font-extrabold text-[#0f766e] dark:text-[#58C4C4] mb-4"
                data-testid="heading-pricing-section"
              >
                비용 및 시간
              </h2>
              <p className="text-[18px] md:text-xl text-muted-foreground" data-testid="text-pricing-policy-section">⚖️ 모든 비용은 이름연구협회 규정에 따릅니다</p>
            </div>
          )}
          <div className="relative mx-auto w-full max-w-4xl">
          {/* 장식용 코너 점들 */}
          <div className="absolute -left-3 -top-3 h-3 w-3 rounded-full bg-[#0f766e] dark:bg-[#58C4C4] shadow-sm" aria-hidden="true" />
          <div className="absolute -right-3 -top-3 h-3 w-3 rounded-full bg-[#0f766e] dark:bg-[#58C4C4] shadow-sm" aria-hidden="true" />
          <div className="absolute -left-3 -bottom-3 h-3 w-3 rounded-full bg-[#0f766e] dark:bg-[#58C4C4] shadow-sm" aria-hidden="true" />
          <div className="absolute -right-3 -bottom-3 h-3 w-3 rounded-full bg-[#0f766e] dark:bg-[#58C4C4] shadow-sm" aria-hidden="true" />
          
          <div className="rounded-3xl border border-border bg-card shadow-xl p-6 sm:p-8">
            <div className="space-y-8">
              {pricingData.sections.map((section, sectionIdx) => (
                <PricingTable
                  key={sectionIdx}
                  sectionIndex={sectionIdx}
                  heading={section.heading}
                  columns={section.columns}
                  rows={section.rows}
                />
              ))}
            </div>
          </div>
          </div>
        </div>
      </section>
    </>
  );
}

interface PricingTableProps {
  sectionIndex: number;
  heading: string;
  columns: string[];
  rows: { name: string; price: string }[];
}

function PricingTable({ sectionIndex, heading, columns, rows }: PricingTableProps) {
  const headingId = heading.replace(/\s+/g, '-').toLowerCase();
  
  return (
    <div className="space-y-3">
      <h3 
        className="inline-flex items-center gap-2 rounded-xl bg-[#e0f5f2] dark:bg-[#0f766e]/20 px-4 py-2 text-[21px] md:text-2xl font-semibold text-[#0f766e] dark:text-[#58C4C4]"
        data-testid={`heading-${headingId}`}
      >
        <svg 
          className="h-5 w-5" 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
        {heading}
      </h3>
      
      <div className="overflow-hidden rounded-2xl border border-border">
        {/* 테이블 헤더 */}
        <div className="grid grid-cols-12 bg-muted/80 dark:bg-muted/40 text-[18px] font-semibold text-muted-foreground">
          <div className="col-span-6 sm:col-span-8 px-4 py-3">{columns[0]}</div>
          <div className="col-span-6 sm:col-span-4 px-4 py-3 text-right">{columns[1]}</div>
        </div>
        
        {/* 테이블 바디 */}
        <div className="divide-y divide-border bg-card">
          {rows.map((row, i) => {
            // 이름궁합, 인스타명, 반려동물, 이름감명은 모바일에서 줄바꿈 방지
            const noBreakItems = ["이름궁합(연인)", "인스타명(감명)", "반려동물(감명)"];
            const nameClass = noBreakItems.includes(row.name) 
              ? "col-span-6 sm:col-span-8 pr-2 text-muted-foreground leading-relaxed tracking-wide whitespace-nowrap"
              : "col-span-6 sm:col-span-8 pr-2 text-muted-foreground leading-relaxed tracking-wide";
            
            // 이름감명은 특별 처리 (모바일에서 괄호 부분 작게)
            const isNameReview = row.name === "이름감명 (타작명소 이름)";
            
            return (
              <div 
                key={i} 
                className="grid grid-cols-12 px-4 py-3 sm:py-4 hover-elevate text-[18px]"
                data-testid={`pricing-row-${sectionIndex}-${i}`}
              >
                <div className={nameClass}>
                  {isNameReview ? (
                    <div className="leading-[1.1]">
                      <div className="text-[18px] md:text-[18px]">이름감명</div>
                      <div className="text-sm md:text-[18px] whitespace-nowrap md:inline">(타작명소 이름)</div>
                    </div>
                  ) : (
                    row.name
                  )}
                </div>
                <div className="col-span-6 sm:col-span-4 text-right font-semibold text-foreground break-words">{row.price}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
