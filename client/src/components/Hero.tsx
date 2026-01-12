import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import heroImage from "@assets/ChatGPT Image 2025년 10월 8일 오후 09_34_23_1759926875782.png";

export function Hero() {
  const [location, setLocation] = useLocation();
  
  // 인앱 브라우저 전용 페이지 감지
  const isInstagram = location === '/ig';
  const isTikTok = location === '/tt';
  
  // 폰트 크기 결정 (전체화면에 맞게 확대)
  const h1FontSize = isInstagram 
    ? 'clamp(28px, 6vw, 38px)' 
    : isTikTok 
    ? 'clamp(28px, 6vw, 38px)'
    : 'clamp(34px, 7.5vw, 52px)';
    
  const pFontSize = isInstagram 
    ? 'clamp(18px, 4vw, 23px)' 
    : isTikTok 
    ? 'clamp(18px, 4vw, 23px)'
    : 'clamp(20px, 4.8vw, 28px)';

  return (
    <section id="home" className="relative min-h-screen overflow-hidden flex items-center justify-center z-10" style={{ marginTop: '-80px', paddingTop: '80px' }}>
      <div className="absolute inset-0">
        <img 
          src={heroImage} 
          alt="배경" 
          className="w-full h-full object-cover object-[55%] md:object-[98%]"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background/70 via-background/40 to-transparent dark:from-background/85 dark:via-background/55 dark:to-transparent" />
        {/* Bottom gradient to hide danger section character */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white dark:from-background to-transparent" />
        
        {/* Falling flower petals animation */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(15)].map((_, i) => (
            <div
              key={i}
              className="absolute animate-fall-petal"
              style={{
                left: `${5 + (i * 7) % 90}%`,
                top: `-${10 + (i % 5) * 5}%`,
                animationDelay: `${i * 0.8 + Math.random() * 2}s`,
                animationDuration: `${8 + (i % 5) * 2}s`,
              }}
            >
              <div 
                className="w-3 h-4 rounded-full bg-gradient-to-br from-pink-200/70 to-pink-300/50 dark:from-pink-300/50 dark:to-pink-400/30"
                style={{
                  transform: `rotate(${30 + i * 25}deg) scale(${0.6 + (i % 4) * 0.2})`,
                  borderRadius: '50% 50% 50% 0',
                }}
              />
            </div>
          ))}
        </div>
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
