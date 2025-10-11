import { useLocation } from "wouter";

interface KnaPricingSectionProps {
  onOpenDialog: (type: "analysis" | "naming") => void;
}

export default function KnaPricingSection({ onOpenDialog }: KnaPricingSectionProps) {
  const [, setLocation] = useLocation();

  const scrollToFamily = () => {
    window.history.pushState({}, "", "/#pricing");
    setLocation("/detail-info#family-policy");
  };

  const openAnalysisForm = () => {
    onOpenDialog("analysis");
  };

  const openNamingForm = () => {
    onOpenDialog("naming");
  };

  return (
    <section className="py-16 md:py-24 bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <header className="text-center">
          <h2 className="mt-4 bg-gradient-to-r from-[#0f766e] to-[#4fd1c5] dark:from-[#58C4C4] dark:to-[#6DD4D4] bg-clip-text text-2xl font-extrabold leading-tight text-transparent sm:text-3xl md:text-4xl">
            비용
          </h2>
          <p className="mt-3 text-lg text-muted-foreground">⚖️ 모든 비용은 이름연구협회 규정에 따릅니다</p>
        </header>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <PriceCard
            title="이름분석"
            highlight="추천"
            price={
              <>
                <b className="text-xl">₩60,000</b>
                <span className="ml-1 text-lg text-muted-foreground">/ 1명</span>
              </>
            }
            desc="이름대로 살고 있음을 증명해드립니다"
            bullets={[
              <>
                <span className="text-orange-600 dark:text-orange-400">등본상 가족 상담원칙으로 진행</span>
                <button 
                  onClick={scrollToFamily} 
                  className="ml-1 font-semibold text-[#0f766e] dark:text-[#58C4C4] hover:underline"
                  data-testid="link-family-policy"
                >
                  자세히 보기 →
                </button>
              </>,
              "등본상 가족 3명 : ₩180,000"
            ]}
            linkText="신청하기 →"
            onLinkClick={openAnalysisForm}
          />

          <PriceCard
            title="이름감명"
            price={
              <>
                <b className="text-xl">₩20,000</b>
                <span className="ml-1 text-lg text-muted-foreground">/ 1개</span>
              </>
            }
            desc="타 작명소에서 받은 이름의 적합도를 점검합니다"
            bullets={[
              <span className="text-orange-600 dark:text-orange-400">현재 사용하는 이름 분석 진행 필수</span>,
              "현재 이름운에 맞는 새 이름이 좋은 이름"
            ]}
            linkText="신청하기 →"
            onLinkClick={openNamingForm}
          />

          <PriceCard
            title="개명작명"
            price={<span className="text-lg text-muted-foreground">정확도 체험 후 안내</span>}
            desc={<span className="text-orange-600 dark:text-orange-400">이름 분석 상담으로 정확도를 체험하신 후 진행해드립니다.</span>}
            bullets={[
              "보통 3개의 이름 후보 제시",
              "기존 이름운과 희망사항 10가지를 반영한 최고의 작명"
            ]}
          />

          <PriceCard
            title="상호작명"
            price={<span className="text-lg text-muted-foreground">업체 규모에 따라 상이</span>}
            desc="브랜드/업종/확장 계획을 반영한 상호 작명"
            bullets={[
              "법인/개인/프랜차이즈 구분",
              "상표/도메인 가용성 고려"
            ]}
          />
        </div>
      </div>
    </section>
  );
}

interface PriceCardProps {
  title: string;
  price: React.ReactNode;
  desc: React.ReactNode;
  bullets?: React.ReactNode[];
  highlight?: string;
  linkText?: string;
  onLinkClick?: () => void;
}

function PriceCard({ title, price, desc, bullets, highlight, linkText, onLinkClick }: PriceCardProps) {
  return (
    <article className={`group relative rounded-2xl border border-gray-200 dark:border-border bg-white dark:bg-card p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
      highlight ? "ring-2 ring-[#7fe1d3]/60 dark:ring-[#58C4C4]/60" : "ring-1 ring-transparent"
    }`}>
      {highlight && (
        <span className="absolute -top-3 left-4 inline-flex items-center rounded-full bg-[#7fe1d3] dark:bg-[#58C4C4] px-3 py-1 text-sm font-semibold text-[#053b37] dark:text-[#0f766e] shadow">
          {highlight}
        </span>
      )}
      <header className="flex items-end justify-between">
        <h3 className="text-[22px] font-semibold text-foreground">{title}</h3>
        <div className="text-right">{price}</div>
      </header>
      <p className="mt-3 text-lg leading-relaxed text-gray-700 dark:text-muted-foreground">{desc}</p>
      {bullets && bullets.length > 0 && (
        <ul className="mt-4 space-y-2 text-lg text-gray-700 dark:text-muted-foreground">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2">
              <Dot />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
      {linkText && onLinkClick && (
        <div className="mt-5 text-right">
          <button
            onClick={onLinkClick}
            className="inline-flex items-center gap-1 text-lg font-semibold text-[#0f766e] dark:text-[#58C4C4] hover:underline"
            data-testid={`button-price-${title}`}
          >
            {linkText}
          </button>
        </div>
      )}
    </article>
  );
}

function Dot() {
  return (
    <svg viewBox="0 0 8 8" className="mt-2 h-2 w-2 flex-none" aria-hidden="true">
      <circle cx="4" cy="4" r="4" fill="currentColor" className="text-[#0f766e] dark:text-[#58C4C4]" />
    </svg>
  );
}
