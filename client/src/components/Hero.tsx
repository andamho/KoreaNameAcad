import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import heroImage from "@assets/ChatGPT Image 2025년 10월 8일 오후 09_34_23_1759926875782.png";

export function Hero() {
  const [location, setLocation] = useLocation();
  
  // 인앱 브라우저 전용 페이지 감지
  const isInstagram = location === '/ig';
  const isTikTok = location === '/tt';
  
  // 폰트 크기 결정 (더 보수적으로)
  const h1FontSize = isInstagram 
    ? 'clamp(26px, 5.4vw, 34px)' 
    : isTikTok 
    ? 'clamp(26px, 5.4vw, 34px)'
    : 'clamp(28px, 6.2vw, 40px)';
    
  const pFontSize = isInstagram 
    ? 'clamp(17px, 3.6vw, 21px)' 
    : isTikTok 
    ? 'clamp(17px, 3.6vw, 21px)'
    : 'clamp(18px, 4.2vw, 24px)';

  return (
    <section id="home" className="relative py-20 md:py-32 overflow-hidden">
      <div className="absolute inset-0">
        <img 
          src={heroImage} 
          alt="배경" 
          className="w-full h-full object-cover object-[55%] md:object-[98%]"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-background/50 to-transparent dark:from-background/90 dark:via-background/60 dark:to-transparent" />
      </div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative">
        <div className="text-center max-w-4xl mx-auto space-y-8 hero-wrap">
          <div>
            <h1 className="font-bold tracking-tight break-keep text-center hero-title" style={{fontSize: h1FontSize, lineHeight: '1.18', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center'}} aria-label="고달픈 인생 이름 하나로 이유를 찾고 운이 술술 풀리는 새 이름으로, 인생역전하세요.">
              <span className="text-gray-900 dark:text-white">고달픈 인생</span>
              <span className="text-gray-900 dark:text-white" style={{whiteSpace: 'nowrap'}}>이름 하나로 이유를 찾고</span>
              <span className="kna-highlight">
                <span className="kna-shine">운이 술술 풀리는</span>
              </span>
              <span className="kna-highlight">
                <span className="kna-shine">새 이름으로, 인생역전하세요.</span>
                <span className="kna-underline" aria-hidden="true" />
              </span>
            </h1>
            
            <p className="text-muted-foreground tracking-wide mt-7 hero-sub" style={{fontSize: pFontSize, lineHeight: '1.42'}}>
              한글·한자이름만으로 운명상담<br/>
              [정확도 80% 이상]
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              variant="outline"
              size="lg"
              onClick={() => {
                setLocation('/reviews');
                window.scrollTo(0, 0);
              }}
              data-testid="button-reviews"
              className="min-w-[200px] bg-background/50 backdrop-blur-sm text-lg"
            >
              상담·개명 후기
            </Button>
            <Button
              size="lg"
              onClick={() => {
                setLocation('/services');
                window.scrollTo(0, 0);
              }}
              data-testid="button-consultation"
              className="min-w-[200px] text-lg"
            >
              지금 신청
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
