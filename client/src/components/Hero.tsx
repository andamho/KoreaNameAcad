import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { clearScrollPosition } from "@/hooks/use-scroll-restore";

// 최적화된 WebP 이미지
const heroImageMobile = "/hero-bg-opt.webp";
const heroImageDesktop = "/hero-desktop-bg.webp";

export function Hero() {
  const [location, setLocation] = useLocation();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  
  // 화면 크기 감지
  useEffect(() => {
    const checkDesktop = () => setIsDesktop(window.innerWidth >= 768);
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);
  
  // 이미지 프리로드
  useEffect(() => {
    const img = new Image();
    img.src = isDesktop ? heroImageDesktop : heroImageMobile;
    img.onload = () => setImageLoaded(true);
    if (img.complete) setImageLoaded(true);
  }, [isDesktop]);
  
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
          src={isDesktop ? heroImageDesktop : heroImageMobile} 
          alt="배경" 
          className={`w-full h-full object-cover object-[55%] md:object-center transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          style={{ willChange: 'opacity' }}
          fetchPriority="high"
          loading="eager"
          decoding="async"
        />
        {/* 모바일에서만 그라데이션 오버레이 */}
        {!isDesktop && (
          <div className="absolute inset-0 bg-gradient-to-r from-background/70 via-background/40 to-transparent dark:from-background/85 dark:via-background/55 dark:to-transparent" />
        )}
        {/* Bottom gradient to hide danger section character */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white dark:from-background to-transparent" />
      </div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative h-full flex items-center justify-center">
        <div className="text-center max-w-4xl mx-auto space-y-8 hero-wrap">
          <div>
            <h1 className="font-bold tracking-tight break-keep text-center hero-title" style={{fontSize: h1FontSize, lineHeight: '1.2', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15em'}} aria-label="고달픈 인생 이름 하나로 이유를 찾고 운이 술술 풀리는 새 이름으로, 인생역전하세요.">
              <span className="text-gray-900 dark:text-white">고달픈 인생</span>
              <span className="text-gray-900 dark:text-white" style={{whiteSpace: 'nowrap'}}>이름 하나로 이유를 찾고</span>
              <span className="kna-highlight">
                <span className={isDesktop ? "kna-shine-dark" : "kna-shine"}>운이 술술 풀리는</span>
              </span>
              <span className="kna-highlight">
                <span className={isDesktop ? "kna-shine-dark" : "kna-shine"}>새 이름으로, 인생역전하세요.</span>
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
