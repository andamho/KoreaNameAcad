import { Gem, Clock, Settings } from "lucide-react";
import { Link } from "wouter";
import IdentityMap from "./IdentityMap";
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
                <p className="text-lg md:text-2xl text-white/90" data-testid="text-pricing-policy">모든 비용은 이름연구협회 규정에 따릅니다</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Pricing Content Section */}
      <section id="pricing" className={`relative overflow-hidden bg-white dark:bg-background ${showHero ? 'kna-pricing-section-hero pt-16 md:pt-24 pb-24' : 'kna-pricing-section'}`}>
        <div className={`kna-pricing-inner relative max-w-6xl mx-auto px-6 lg:px-8 ${showHero ? 'pt-8 sm:pt-10' : 'pt-24 pb-24 lg:pt-48 lg:pb-48'}`}>
          {/* Section header - only shown when Hero is NOT displayed */}
          {!showHero && (
            <div className="text-left mb-12">
              <h2 
                className="text-[25px] md:text-4xl font-extrabold text-[#18a999] dark:text-[#58C4C4] mb-4"
                data-testid="heading-pricing-section"
              >
                비용 및 시간
              </h2>
              <p className="text-lg text-muted-foreground" data-testid="text-pricing-policy-section">모든 비용은 이름연구협회 규정에 따릅니다</p>
            </div>
          )}
          
          {/* Desktop: 2 columns (cards left fixed, identity map right fills rest) / Mobile: stack seamlessly */}
          <div className="flex flex-col lg:flex-row gap-0 lg:items-stretch">
            {/* Pricing Cards - Left on desktop (Glassmorphism style) - fixed width */}
            <div className="relative w-full lg:w-[420px] lg:flex-shrink-0">
              <div 
                className="rounded-3xl rounded-b-none lg:rounded-b-3xl lg:rounded-r-none p-4 sm:p-5 h-full border border-white/10 border-b-0 lg:border-b lg:border-r-0"
                style={{ 
                  background: "rgba(20, 22, 30, 0.9)",
                  backdropFilter: "blur(20px)",
                  WebkitBackdropFilter: "blur(20px)"
                }}
              >
                <div className="space-y-4">
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
            
            {/* Identity Map - Right on desktop, bottom on mobile - fills remaining space */}
            <div className="w-full lg:flex-1 order-last flex items-stretch">
              <div className="w-full">
                <IdentityMap />
              </div>
            </div>
          </div>

          {/* 버튼 영역 */}
          <div className="flex items-center gap-4 mt-10">
            <Link to="/services" onClick={() => window.scrollTo(0, 0)} className="inline-flex items-center justify-center rounded-full bg-gray-900 dark:bg-white px-4 py-1.5 text-sm font-medium text-white dark:text-gray-900 transition hover:bg-gray-800 dark:hover:bg-gray-100">
              지금 신청 <span className="ml-1">›</span>
            </Link>
            <a href="https://pf.kakao.com/_Sxnvbb/chat" target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition">
              카톡 실시간 상담 <span className="ml-0.5">›</span>
            </a>
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
  
  // 섹션별 아이콘: 0=상담비(다이아몬드), 1=시간(시계), 2=번호변경(톱니바퀴)
  const getIcon = () => {
    switch (sectionIndex) {
      case 0:
        return <Gem className="h-5 w-5" aria-hidden="true" />;
      case 1:
        return <Clock className="h-5 w-5" aria-hidden="true" />;
      case 2:
        return <Settings className="h-5 w-5" aria-hidden="true" />;
      default:
        return <Gem className="h-5 w-5" aria-hidden="true" />;
    }
  };
  
  return (
    <div className="space-y-2">
      <h3 
        className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-base lg:text-lg font-semibold text-[#5ce1e6]"
        style={{ background: "rgba(92, 225, 230, 0.1)" }}
        data-testid={`heading-${headingId}`}
      >
        {getIcon()}
        {heading}
      </h3>
      
      <div className="overflow-hidden rounded-xl border border-white/10">
        {/* 테이블 헤더 */}
        <div className="grid grid-cols-12 text-sm lg:text-base font-semibold text-white/60" style={{ background: "rgba(255, 255, 255, 0.05)" }}>
          <div className="col-span-6 sm:col-span-8 px-3 py-2">{columns[0]}</div>
          <div className="col-span-6 sm:col-span-4 px-3 py-2 text-right">{columns[1]}</div>
        </div>
        
        {/* 테이블 바디 */}
        <div className="divide-y divide-white/10">
          {rows.map((row, i) => {
            // 이름궁합, 인스타명, 반려동물, 이름감명은 모바일에서 줄바꿈 방지
            const noBreakItems = ["이름궁합(연인)", "인스타명(감명)", "반려동물(감명)"];
            const nameClass = noBreakItems.includes(row.name) 
              ? "col-span-6 sm:col-span-8 pr-2 text-white/70 leading-snug whitespace-nowrap"
              : "col-span-6 sm:col-span-8 pr-2 text-white/70 leading-snug";
            
            // 이름감명은 특별 처리 (모바일에서 괄호 부분 작게)
            const isNameReview = row.name === "이름감명 (타작명소 이름)";
            
            return (
              <div 
                key={i} 
                className="grid grid-cols-12 px-3 py-2 text-sm lg:text-base transition-colors hover:bg-white/5"
                data-testid={`pricing-row-${sectionIndex}-${i}`}
              >
                <div className={nameClass}>
                  {isNameReview ? (
                    <div className="leading-tight">
                      <span className="text-sm lg:text-base">이름감명</span>
                      <span className="text-xs lg:text-sm whitespace-nowrap"> (타작명소 이름)</span>
                    </div>
                  ) : (
                    row.name
                  )}
                </div>
                <div className="col-span-6 sm:col-span-4 text-right font-semibold text-white break-words">{row.price}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
