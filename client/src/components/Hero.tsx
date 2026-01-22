import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { clearScrollPosition } from "@/hooks/use-scroll-restore";

export function Hero() {
  const [location, setLocation] = useLocation();
  const [imageLoaded, setImageLoaded] = useState(false);
  
  // 이미지 프리로드
  useEffect(() => {
    const img = new Image();
    img.src = "/bank-card-bg-opt.webp";
    img.onload = () => setImageLoaded(true);
    // 이미 캐시된 경우
    if (img.complete) setImageLoaded(true);
  }, []);
  
  // 인앱 브라우저 전용 페이지 감지
  const isInstagram = location === '/ig';
  const isTikTok = location === '/tt';
  
  // 폰트 크기 결정 (전체화면에 맞게 확대)
  // 데스크탑: 20% 증가 (52px → 62px, 34px → 41px)
  // 모바일: 기존 유지 (34px ~ 52px)
  // 모바일: 10% 축소 (34px → 31px, 52px → 47px)
  const h1FontSize = isInstagram 
    ? 'clamp(25px, 5.4vw, 34px)' 
    : isTikTok 
    ? 'clamp(25px, 5.4vw, 34px)'
    : 'clamp(31px, 6.8vw, 47px)';
  
  // 데스크탑 전용 20% 증가된 폰트 크기
  const h1FontSizeDesktop = 'clamp(41px, 9vw, 62px)';
    
  const pFontSize = isInstagram 
    ? 'clamp(14px, 3.2vw, 18px)' 
    : isTikTok 
    ? 'clamp(14px, 3.2vw, 18px)'
    : 'clamp(16px, 3.8vw, 22px)';
  
  const pFontSizeDesktop = 'clamp(19px, 4.6vw, 27px)';

  return (
    <section id="home" className="relative min-h-screen overflow-hidden flex items-center justify-center" style={{ marginTop: '-80px', paddingTop: '80px' }}>
      <div className="absolute inset-0">
        <img 
          src="/bank-card-bg-opt.webp" 
          alt="배경" 
          className={`w-full h-full object-cover object-center transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          style={{ willChange: 'opacity' }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background/70 via-background/40 to-transparent dark:from-background/85 dark:via-background/55 dark:to-transparent" />
        {/* Bottom gradient to hide danger section character */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white dark:from-background to-transparent" />
        
        {/* Falling flower petals animation - 110 random positions */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(7)].map((_, i) => {
            const positions = [3,6,9,12,15,18,21,24,27,30,33,36,39,42,45,48,51,54,57,60,63,66,69,72,75,78,81,84,87,90,93,96,
              5,8,11,14,17,20,23,26,29,32,35,38,41,44,47,50,53,56,59,62,65,68,71,74,77,80,83,86,89,92,95,
              4,7,10,13,16,19,22,25,28,31,34,37,40,43,46,49,52,55,58,61,64,67,70,73,76,79,82,85,88,91,94,97,
              2,98,1,99,100,101,102,103,104,105,106,107,108,109,110];
            const randomIndex = Math.floor(Math.random() * 110);
            const leftPos = positions[randomIndex] % 100;
            const randomDelay = Math.random() * 8;
            const randomDuration = 8 + Math.random() * 6;
            const randomRotate = Math.floor(Math.random() * 360);
            const randomScale = 0.5 + Math.random() * 0.7;
            
            return (
              <div
                key={i}
                className="absolute animate-fall-petal"
                style={{
                  left: `${leftPos}%`,
                  top: `-${5 + Math.random() * 10}%`,
                  animationDelay: `${randomDelay}s`,
                  animationDuration: `${randomDuration}s`,
                }}
              >
                <div 
                  className="w-3 h-4 rounded-full bg-gradient-to-br from-pink-200/70 to-pink-300/50 dark:from-pink-300/50 dark:to-pink-400/30"
                  style={{
                    transform: `rotate(${randomRotate}deg) scale(${randomScale})`,
                    borderRadius: '50% 50% 50% 0',
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative h-full flex items-center justify-center">
        <div className="text-center max-w-4xl mx-auto space-y-8 hero-wrap">
          <div>
            <h1 className="font-bold tracking-tight break-keep text-center hero-title" style={{fontSize: h1FontSize, lineHeight: '1.2', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15em'}} aria-label="고달픈 인생 이름 하나로 이유를 찾고 운이 술술 풀리는 새 이름으로, 인생역전하세요.">
              <span className="text-white">고달픈 인생</span>
              <span className="text-white" style={{whiteSpace: 'nowrap'}}>이름 하나로 이유를 찾고</span>
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
          
          <div className="flex flex-row items-center justify-center gap-4">
            <button
              onClick={() => setLocation('/services')}
              data-testid="button-apply-now"
              className="px-4 py-1.5 bg-black text-white font-medium rounded-full text-sm hover:bg-gray-800 transition-colors flex items-center gap-0.5"
            >
              지금 신청 <span>›</span>
            </button>
            <button
              onClick={() => { clearScrollPosition("/reviews"); setLocation('/reviews'); }}
              data-testid="button-reviews"
              className="text-black dark:text-gray-900 font-medium text-sm hover:opacity-70 transition-opacity flex items-center gap-0.5"
            >
              후기 보기 <span>›</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
