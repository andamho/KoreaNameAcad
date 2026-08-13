import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { clearScrollPosition } from "@/hooks/use-scroll-restore";
import mainbgmobile from "@/assets/mainbgmobile";
import bgmaindesk from "@/assets/bgmaindesk";
import maincloud from "@/assets/maincloud";

const heroImageMobile = mainbgmobile;
const heroImageDesktop = bgmaindesk;

// 모바일/데스크탑 이미지 즉시 프리로드
const mobilePreload = new Image();
mobilePreload.src = heroImageMobile;
const desktopPreload = new Image();
desktopPreload.src = heroImageDesktop;
// 구름도 배경과 같이 코드 안에 넣어 뒀다. 파일로 두면 화면이 그려진 뒤에야
// 따로 받아오느라 한 박자 늦게 떴다.
const cloudPreload = new Image();
cloudPreload.src = maincloud;

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
    : 'clamp(40px, 11.7vw, 65px)';
  
  // 데스크탑 전용 20% 증가된 폰트 크기
  const h1FontSizeDesktop = 'clamp(52px, 11.3vw, 78px)';
    
  const pFontSize = isInstagram 
    ? 'clamp(14px, 3.2vw, 18px)' 
    : isTikTok 
    ? 'clamp(14px, 3.2vw, 18px)'
    : 'clamp(16px, 3.8vw, 22px)';
  
  const pFontSizeDesktop = 'clamp(19px, 4.6vw, 27px)';

  return (
    <section id="home" className="relative min-h-[100svh] md:min-h-screen overflow-hidden flex items-center justify-center" style={{ marginTop: '-80px', paddingTop: '80px', backgroundColor: '#eee5d5' }}>
      <div className="absolute inset-0">
        <img
          src={isDesktop ? heroImageDesktop : heroImageMobile}
          alt="배경"
          className={`w-full h-full object-cover object-[55%] md:object-center ${imageLoaded ? 'opacity-100' : 'opacity-0 transition-opacity duration-300'}`}
          fetchPriority="high"
          loading="eager"
          decoding="sync"
        />
        {/* 구름 그림(예전 산 자리 그대로 — 좌10% 상19.91% 폭12.86%).
            배경이 object-cover 라 배경 안에 그려 넣으면 가로 폭을 바꿔도 배율이
            그대로여서 글자만 작아진다. 그래서 별도 요소로 올리고 폭을 vw 로 잡아
            글자와 같이 커지고 작아지게 한다.
            속이 비어 있는 선 그림 그대로 쓴다(원장님 선택). 연한 하늘 배경에
            흰 선이 묻히지 않도록 그림자만 살짝 준다.
            속을 옅게 채운 것도 만들어 뒀다 — main-cloud-filled.webp.
            그림은 배경과 같이 코드 안에 넣었다(assets/maincloud). 파일로 두면
            첫 화면이 그려진 뒤에야 따로 받아오느라 한 박자 늦게 떴다. */}
        <img
          src={maincloud}
          alt=""
          aria-hidden="true"
          className="hidden md:block absolute select-none pointer-events-none
            md:left-[10%] md:top-[19.91%] md:w-[12.86vw]"
          style={{ filter: 'drop-shadow(0 3px 5px rgba(2, 90, 110, 0.35))' }}
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
            {/* 모바일 전용 구름 — 글자 바로 위에 붙여 간격을 항상 35px 로 유지한다.
                예전처럼 화면 높이 비율로 띄우면 폰 길이에 따라 24~74px 로 달라졌다. */}
            <img
              src={maincloud}
              alt=""
              aria-hidden="true"
              className="md:hidden mx-auto select-none pointer-events-none w-[25.3vw] mb-[35px]"
              style={{
                filter: 'drop-shadow(0 3px 5px rgba(2, 90, 110, 0.35))',
                /* 가운데에서 오른쪽으로 밀고 살짝 위로.
                   19.7vw 면 구름 오른쪽 끝이 '맑아야' 끝에 딱 맞고, 거기서
                   '야' 한 글자 폭의 1/3(3.45vw)만큼 더 내보낸다.
                   transform 이라 글자 위치는 그대로 두고 구름만 움직인다. */
                transform: 'translate(23.15vw, -10px)',
              }}
              loading="eager"
              fetchPriority="high"
              decoding="sync"
            />
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
            
            <p className="text-muted-foreground tracking-wide mt-[1.125rem] hero-sub" style={{fontSize: pFontSize, lineHeight: '1.42'}}>
              한글·한자이름만으로 운명상담<br/>
              [정확도 80% 이상]
            </p>
          </div>
          
          <div className="flex flex-row items-center justify-center gap-4">
            <button
              onClick={() => setLocation('/services')}
              data-testid="button-apply-now"
              className="hero-cta bg-black text-white font-medium rounded-full hover:bg-gray-800 transition-colors flex items-center gap-0.5"
            >
              지금 신청 <span>›</span>
            </button>
            <button
              onClick={() => { clearScrollPosition("/reviews"); setLocation('/reviews'); }}
              data-testid="button-reviews"
              className="hero-cta-link text-black dark:text-gray-900 font-medium hover:opacity-70 transition-opacity flex items-center gap-0.5"
            >
              후기 보기 <span>›</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
