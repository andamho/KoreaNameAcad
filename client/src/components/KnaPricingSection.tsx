const pricingData = {
  sections: [
    {
      heading: "이름분석 상담비",
      columns: ["항목", "금액"],
      rows: [
        { name: "이름분석", price: "6만원" },
        { name: "이름감명(타작명소 이름)", price: "2만원" },
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
        { name: "전화번호 변경", price: "35만원" },
        { name: "여권이름 변경", price: "35만원" },
        { name: "차량번호 변경", price: "35만원" },
      ],
    },
  ],
};

export default function KnaPricingSection() {
  return (
    <section id="pricing" className="py-16 md:py-24 bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <header className="text-center mb-12">
          <h2 
            className="mt-4 bg-gradient-to-r from-[#0f766e] to-[#4fd1c5] dark:from-[#58C4C4] dark:to-[#6DD4D4] bg-clip-text text-2xl font-extrabold leading-tight text-transparent sm:text-3xl md:text-4xl"
            data-testid="heading-pricing"
          >
            비용 및 시간
          </h2>
          <p className="mt-3 text-lg text-muted-foreground" data-testid="text-pricing-policy">⚖️ 모든 비용은 이름연구협회 규정에 따릅니다</p>
        </header>

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
        className="inline-flex items-center gap-2 rounded-xl bg-[#e0f5f2] dark:bg-[#0f766e]/20 px-4 py-2 text-2xl font-semibold text-[#0f766e] dark:text-[#58C4C4]"
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
            const noBreakItems = ["이름궁합(연인)", "인스타명(감명)", "반려동물(감명)", "이름감명(타작명소 이름)"];
            const nameClass = noBreakItems.includes(row.name) 
              ? "col-span-6 sm:col-span-8 pr-2 text-muted-foreground leading-relaxed tracking-wide whitespace-nowrap"
              : "col-span-6 sm:col-span-8 pr-2 text-muted-foreground leading-relaxed tracking-wide";
            
            return (
              <div 
                key={i} 
                className="grid grid-cols-12 px-4 py-3 sm:py-4 hover-elevate text-[18px]"
                data-testid={`pricing-row-${sectionIndex}-${i}`}
              >
                <div className={nameClass}>{row.name}</div>
                <div className="col-span-6 sm:col-span-4 text-right font-semibold text-foreground break-words">{row.price}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
