import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { clearScrollPosition } from "@/hooks/use-scroll-restore";
import mainbgmobile from "@/assets/mainbgmobile";
import bgmaindesk from "@/assets/bgmaindesk";

const heroImageMobile = mainbgmobile;
const heroImageDesktop = bgmaindesk;

// 모바일/데스크탑 이미지 즉시 프리로드
const mobilePreload = new Image();
mobilePreload.src = heroImageMobile;
const desktopPreload = new Image();
desktopPreload.src = heroImageDesktop;

export function Hero() {
  const [location, setLocation] = useLocation();
  const [imageLoaded, setImageLoaded] = useState(() => mobilePreload.complete);
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 768);

  // 화면 크기 감지
  useEffect(() => {
    const checkDesktop = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);

  // 이미지 로드 완료 감지
  useEffect(() => {
    if (mobilePreload.complete) { setImageLoaded(true); return; }
    mobilePreload.onload = () => setImageLoaded(true);
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
    : 'clamp(44px, 9.2vw, 65px)';
  
  // 데스크탑 전용 20% 증가된 폰트 크기
  const h1FontSizeDesktop = 'clamp(52px, 11.3vw, 78px)';
    
  const pFontSize = isInstagram 
    ? 'clamp(14px, 3.2vw, 18px)' 
    : isTikTok 
    ? 'clamp(14px, 3.2vw, 18px)'
    : 'clamp(16px, 3.8vw, 22px)';
  
  const pFontSizeDesktop = 'clamp(19px, 4.6vw, 27px)';

  return (
    <section id="home" className="relative min-h-screen overflow-hidden flex items-center justify-center" style={{ marginTop: '-80px', paddingTop: '80px', backgroundColor: '#eee5d5' }}>
      <div className="absolute inset-0">
        <img
          src={isDesktop ? heroImageDesktop : heroImageMobile}
          alt="배경"
          className={`w-full h-full object-cover object-[55%] md:object-center ${imageLoaded ? 'opacity-100' : 'opacity-0 transition-opacity duration-300'}`}
          fetchPriority="high"
          loading="eager"
          decoding="sync"
        />
        {/* 산 그림.
            예전에는 배경 이미지 안에 그려져 있었는데, 배경이 object-cover 라
            가로 폭을 바꿔도 배율이 그대로여서 글자만 작아지고 산은 그대로였다.
            별도 요소로 올리고 폭을 vw 로 잡아 글자와 같이 커지고 작아지게 한다.
            위치·크기는 예전 산이 있던 자리 그대로(데스크탑 좌17.34% 상19.91% 폭12.86%). */}
        <img
          src="/main-mountain.webp"
          alt=""
          aria-hidden="true"
          className="absolute select-none pointer-events-none
            left-[32.03%] top-[18%] w-[31.63vw]
            md:left-[10%] md:top-[19.91%] md:w-[12.86vw]"
          loading="eager"
          fetchPriority="high"
          decoding="sync"
        />
        {/* Bottom gradient to hide danger section character */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white dark:from-background to-transparent" />
      </div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative h-full flex items-center justify-center">
        <div className="text-center max-w-4xl mx-auto space-y-8 hero-wrap">
          <div>
            <h1 className="font-bold tracking-tight break-keep text-center hero-title" style={{fontSize: h1FontSize, lineHeight: '1.2', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15em'}} aria-label="이름이 맑아야 인생이 맑다 이름 안에 너 있다">
              {/* 위 두 줄이 강조(티파니·굵게), 아래 한 줄은 검정·보통 굵기 */}
              <span className="kna-highlight">
                <span className="kna-tiffany">이름이 맑아야</span>
              </span>
              <span className="kna-highlight">
                <span className="kna-tiffany">인생이 맑다</span>
              </span>
              {/* 이 줄만 절반 크기. 위 두 줄과 떨어뜨리고 아래 안내문에 붙인다. */}
              <span className="font-normal text-gray-900 dark:text-white" style={{whiteSpace: 'nowrap', fontSize: '0.5em', marginTop: '1.3em', position: 'relative'}}>
                이름 안에 너 있다
                {/* 아래 안내문과의 사이 딱 중간에 오는 가로줄(문구 길이에 맞춤) */}
                <span className="kna-underline-plain" aria-hidden="true" />
              </span>
            </h1>
            
            <p className="text-muted-foreground tracking-wide mt-[18px] hero-sub" style={{fontSize: pFontSize, lineHeight: '1.42'}}>
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
