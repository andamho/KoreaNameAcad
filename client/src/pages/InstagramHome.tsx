import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { ConsultationForm } from "@/components/ConsultationForm";
import { Footer } from "@/components/Footer";
import KnaDangerSection from "@/components/KnaDangerSection";
import KnaValueSection from "@/components/KnaValueSection";
import KnaIntroBlock from "@/components/KnaIntroBlock";
import KnaStepsSection from "@/components/KnaStepsSection";
import KnaMythTruthSection from "@/components/KnaMythTruthSection";
import KnaPricingSection from "@/components/KnaPricingSection";
import { Layers, Compass, Clock, CheckCircle, TriangleAlert, MapPin } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import analysisExampleImage from "@assets/hongildong-analysis.jpg";
import newYearImage from "@assets/newYearPopup_optimized.jpg";
import characterImage from "@assets/KakaoTalk_20251226_135549799_1766724973553.png";
import dangerCharacterImage from "@assets/KakaoTalk_20251226_152419337_1766730274782.png";
import effortCharacterImage from "@assets/KakaoTalk_20251226_152116391_1766730095506.png";
import stepsCharacterImage from "@assets/KakaoTalk_20251226_164036756_1766734877281.png";
import guideCharacterImage from "@assets/KakaoTalk_20251226_151729031_1766729868877.png";
import pricingCharacterImage from "@assets/KakaoTalk_20251226_150428417_1766729101276.png";
import butterflyCharacterImage from "@assets/KakaoTalk_20251226_134433821_1766724285654.png";

export default function InstagramHome() {
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<"analysis" | "naming">("analysis");
  const [analysisDetailOpen, setAnalysisDetailOpen] = useState(false);
  const [showChristmasPopup, setShowChristmasPopup] = useState(() => {
    // 뒤로가기/앞으로가기로 온 경우 팝업 표시 안 함
    const navigationType = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)?.type;
    if (navigationType === 'back_forward') {
      return false;
    }
    // URL 파라미터가 있으면 (다른 페이지에서 온 경우) 팝업 표시 안 함
    const params = new URLSearchParams(window.location.search);
    if (params.get('open') || params.get('detail') || params.get('from')) {
      return false;
    }
    // history.state로 이미 본 경우 체크
    if (window.history.state?.popupShown) {
      return false;
    }
    return true;
  });
  const isClosingFromBackButton = useRef(false);
  const dialogOpenRef = useRef(false);
  const analysisDetailOpenRef = useRef(false);
  const referrerPage = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // 크리스마스 팝업 3초 후 자동 닫기
  useEffect(() => {
    if (showChristmasPopup) {
      const timer = setTimeout(() => {
        setShowChristmasPopup(false);
        try { window.history.replaceState({ ...window.history.state, popupShown: true }, ''); } catch {}
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showChristmasPopup]);

  const closeChristmasPopup = () => {
    setShowChristmasPopup(false);
    try { window.history.replaceState({ ...window.history.state, popupShown: true }, ''); } catch {}
  };

  // 동영상 자동 재생 (스크롤 시)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            video.play().catch(err => {
              console.log('자동 재생 실패:', err);
            });
          } else {
            video.pause();
          }
        });
      },
      { threshold: 0.5 }
    );

    observer.observe(video);

    return () => {
      observer.disconnect();
    };
  }, []);

  // 인스타그램 전용 클래스 및 canonical 태그 추가
  useEffect(() => {
    // html에 ua-instagram 클래스 추가
    document.documentElement.classList.add('ua-instagram');
    
    // viewport 메타 태그 강제 설정 (인앱 브라우저 autosizing 차단)
    let viewportMeta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement;
    if (viewportMeta) {
      viewportMeta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
    }
    
    // canonical 태그 추가
    let canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.rel = 'canonical';
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.href = 'https://korea-name-acad.com/';
    
    // robots 메타 태그 추가
    let robotsMeta = document.querySelector('meta[name="robots"]') as HTMLMetaElement;
    if (!robotsMeta) {
      robotsMeta = document.createElement('meta');
      robotsMeta.name = 'robots';
      document.head.appendChild(robotsMeta);
    }
    robotsMeta.content = 'index,follow';
    
    // 인스타그램 전용 강제 스타일 추가
    const styleId = 'ig-force-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        html.ua-instagram, html.ua-instagram body {
          -webkit-text-size-adjust: none !important;
          text-size-adjust: none !important;
        }
        
        /* Hero 섹션만 축소 */
        .hero-wrap { 
          max-width: 640px; 
          margin: 0 auto; 
          padding: 0 16px;
          transform: scale(0.82) !important;
          transform-origin: top center !important;
          margin-bottom: -28px !important;
        }
        
        .hero-title {
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          text-align: center !important;
        }
        
        .hero-title span {
          text-align: center !important;
        }
        
        /* 네비바 글자 크기 축소 (로고와 균형) */
        .kna-navbar * {
          font-size: 75% !important;
        }
        
        .kna-navbar .text-\\[17px\\] {
          font-size: 13px !important;
        }
        
        .kna-navbar .text-\\[10px\\] {
          font-size: 7.5px !important;
        }
        
        /* 모든 섹션을 scale로 축소 + 좌우/상하 여백 완전 제거 */
        .kna-danger-section > div,
        .kna-value-section > div,
        .kna-intro-block > div,
        .kna-steps-section > div,
        .kna-myth-truth-section > div,
        .kna-video-section > div,
        .kna-pricing-section > div,
        .kna-footer > div {
          transform: scale(0.82) !important;
          transform-origin: top center !important;
          width: 122% !important;
          margin-left: -11% !important;
        }
        
        /* 캐릭터 있는 섹션: scale 보정을 위해 상단 패딩 증가 */
        /* 원래 174px → scale(0.82) 후 143px, 캐릭터 하단 142px → 여백 1px */
        /* 목표 여백 32px → 필요 패딩: (142 + 32) / 0.82 = 213px */
        /* 컴포넌트 섹션 (패딩이 > div에 있음 - scale 적용됨) */
        .kna-danger-section > div,
        .kna-value-section > div,
        .kna-intro-block > div {
          padding-top: 213px !important;
        }
        /* 영상/비용 섹션: 패딩이 section에 있고 scale은 > div에만 적용됨 */
        /* section 패딩은 scale되지 않으므로 보정 불필요 - 174px 유지 */
        
        .kna-danger-section,
        .kna-value-section,
        .kna-intro-block,
        .kna-steps-section,
        .kna-myth-truth-section,
        .kna-video-section,
        .kna-pricing-section,
        .kna-footer {
          overflow-x: hidden !important;
        }
        
        /* 섹션 간 간격 완전 제거 - 각 섹션 높이에 맞춰 개별 조정 */
        .kna-danger-section {
          margin-bottom: -18% !important;
        }
        .kna-value-section {
          margin-bottom: -18% !important;
        }
        .kna-intro-block {
          margin-bottom: -20% !important;
        }
        .kna-steps-section {
          margin-bottom: -20% !important;
        }
        .kna-myth-truth-section {
          margin-bottom: -18% !important;
        }
        .kna-video-section {
          margin-bottom: -18% !important;
        }
        .kna-pricing-section {
          padding-top: 155px !important; /* 캐릭터 아래 여백 줄이기 (174 → 155) */
          margin-bottom: 0 !important;
        }
        /* 영상/비용 섹션 캐릭터 컨테이너: 위 섹션 음수 마진 상쇄 */
        .ig-video-char-container,
        .ig-pricing-char-container {
          margin-top: 60px !important;
        }
        
        /* 푸터 높이 제한으로 검정 바탕 잘라내기 */
        .kna-footer {
          padding-top: 60px !important;
          max-height: 500px !important;
          overflow: hidden !important;
          position: relative !important;
        }
        
        .kna-footer > div {
          padding-bottom: 60px !important;
        }
        
        /* 카피라이트 위 여백 제거 */
        .kna-footer .mt-8 {
          margin-top: 0 !important;
        }
        .kna-footer .pt-8 {
          padding-top: 0 !important;
        }
        
        /* 푸터 버튼 30% 축소 */
        .kna-footer button {
          padding: 5px 12px !important;
          font-size: 13px !important;
        }
        
        /* 푸터 텍스트 크기 강제 조정 (인앱 브라우저) */
        p.kna-footer-subtitle {
          font-size: 9.6px !important;
          line-height: 1.5 !important;
        }
        .kna-footer .border-t p {
          font-size: 11px !important;
        }
        
        /* 다이얼로그는 축소하지 않음 (폰트 크기를 섹션과 동일하게 이미 설정함) */
        
        h1, h2, h3, p { word-break: keep-all; overflow-wrap: anywhere; }
        input, select, textarea, button { font-size: 16px; }
      `;
      document.head.appendChild(style);
    }
    
    // 디버깅: 실행 확인
    console.log('[IG] InstagramHome useEffect 실행됨');
    
    // Transform scale 방식으로 텍스트 축소 (CSS + JS 이중 적용)
    const applyScale = () => {
      const heroWrap = document.querySelector('.hero-wrap') as HTMLElement;
      console.log('[IG] applyScale 실행, heroWrap:', heroWrap);
      
      if (heroWrap) {
        heroWrap.style.setProperty('transform', 'scale(0.82)', 'important');
        heroWrap.style.setProperty('transform-origin', 'top center', 'important');
        heroWrap.style.setProperty('margin-bottom', '-28px', 'important');
        console.log('[IG] transform 적용 완료');
      } else {
        console.log('[IG] heroWrap을 찾지 못함');
      }
    };
    
    // 푸터 텍스트 크기 강제 설정
    const applyFooterTextSize = () => {
      const footerSubtitle = document.querySelector('.kna-footer-subtitle') as HTMLElement;
      const copyrightText = document.querySelector('.kna-footer .border-t p') as HTMLElement;
      
      console.log('[IG] applyFooterTextSize 실행, footerSubtitle:', footerSubtitle, 'copyrightText:', copyrightText);
      
      if (footerSubtitle) {
        footerSubtitle.style.setProperty('font-size', '9.6px', 'important');
        footerSubtitle.style.setProperty('line-height', '1.5', 'important');
        console.log('[IG] 푸터 subtitle 크기 적용: 9.6px');
      }
      
      if (copyrightText) {
        copyrightText.style.setProperty('font-size', '11px', 'important');
        console.log('[IG] 카피라이트 크기 적용: 11px');
      }
    };
    
    // 영상 아래 텍스트 크기 강제 설정 (푸터 subtitle과 동일하게)
    const applyVideoTextSize = () => {
      const videoSectionText = document.querySelector('.kna-video-section .text-\\[11px\\]') as HTMLElement;
      
      console.log('[IG] applyVideoTextSize 실행, videoSectionText:', videoSectionText);
      
      if (videoSectionText) {
        videoSectionText.style.setProperty('font-size', '13px', 'important');
        console.log('[IG] 영상 아래 텍스트 크기 적용: 13px (푸터와 동일)');
      }
    };
    
    // 여러 번 강제 적용 (늦은 렌더링 대비)
    setTimeout(applyScale, 0);
    setTimeout(applyFooterTextSize, 0);
    setTimeout(applyVideoTextSize, 0);
    const timer1 = setTimeout(applyScale, 100);
    const timer1b = setTimeout(applyFooterTextSize, 100);
    const timer1c = setTimeout(applyVideoTextSize, 100);
    const timer2 = setTimeout(applyScale, 300);
    const timer2b = setTimeout(applyFooterTextSize, 300);
    const timer2c = setTimeout(applyVideoTextSize, 300);
    const timer3 = setTimeout(applyScale, 500);
    const timer3b = setTimeout(applyFooterTextSize, 500);
    const timer3c = setTimeout(applyVideoTextSize, 500);
    const timer4 = setTimeout(applyScale, 1000);
    const timer4b = setTimeout(applyFooterTextSize, 1000);
    const timer4c = setTimeout(applyVideoTextSize, 1000);
    const timer5 = setTimeout(applyScale, 2000);
    const timer5b = setTimeout(applyFooterTextSize, 2000);
    const timer5c = setTimeout(applyVideoTextSize, 2000);
    
    // 리사이즈 시에도 재적용
    window.addEventListener('resize', applyScale);
    
    return () => {
      document.documentElement.classList.remove('ua-instagram');
      const styleElement = document.getElementById(styleId);
      if (styleElement) {
        styleElement.remove();
      }
      clearTimeout(timer1);
      clearTimeout(timer1b);
      clearTimeout(timer1c);
      clearTimeout(timer2);
      clearTimeout(timer2b);
      clearTimeout(timer2c);
      clearTimeout(timer3);
      clearTimeout(timer3b);
      clearTimeout(timer3c);
      clearTimeout(timer4);
      clearTimeout(timer4b);
      clearTimeout(timer4c);
      clearTimeout(timer5);
      clearTimeout(timer5b);
      clearTimeout(timer5c);
      window.removeEventListener('resize', applyScale);
    };
  }, []);

  // ref를 state와 동기화
  useEffect(() => {
    dialogOpenRef.current = dialogOpen;
  }, [dialogOpen]);

  useEffect(() => {
    analysisDetailOpenRef.current = analysisDetailOpen;
  }, [analysisDetailOpen]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const openType = params.get("open");
    const detailType = params.get("detail");
    const fromPage = params.get("from");
    
    // referrer 저장 (없으면 null로 초기화)
    referrerPage.current = fromPage || null;
    
    if (openType === "analysis" || openType === "naming") {
      setDialogType(openType);
      setDialogOpen(true);
      window.history.replaceState({ modal: "consultation", from: fromPage }, "", "/ig");
    } else if (detailType === "analysis") {
      setAnalysisDetailOpen(true);
      window.history.replaceState({ modal: "analysisDetail", from: fromPage }, "", "/ig");
    }

    const hash = window.location.hash;
    if (hash) {
      const elementId = hash.substring(1);
      setTimeout(() => {
        const element = document.getElementById(elementId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, []);

  // 뒤로 가기 버튼 감지 및 처리
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const modalState = event.state?.modal;
      const fromPage = event.state?.from || referrerPage.current;
      
      // analysisDetail이 열려있고, state에서 사라졌으면 닫음
      if (analysisDetailOpenRef.current && modalState !== "analysisDetail") {
        isClosingFromBackButton.current = true;
        setAnalysisDetailOpen(false);
        // referrer 페이지로 이동
        if (fromPage) {
          setTimeout(() => {
            setLocation(fromPage);
            // referrer 정보 초기화 (한 번 사용 후 삭제)
            referrerPage.current = null;
          }, 0);
        }
      }
      // consultation이 열려있고, state가 consultation도 familyPolicy도 아니면 닫음
      else if (dialogOpenRef.current && modalState !== "consultation" && modalState !== "familyPolicy") {
        isClosingFromBackButton.current = true;
        setDialogOpen(false);
        // referrer 페이지로 이동
        if (fromPage) {
          setTimeout(() => {
            setLocation(fromPage);
            // referrer 정보 초기화 (한 번 사용 후 삭제)
            referrerPage.current = null;
          }, 0);
        }
      }
    };

    window.addEventListener("popstate", handlePopState);
    
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []); // 의존성 배열 비움 - 항상 최신 ref 값을 참조

  const openDialog = (type: "analysis" | "naming") => {
    setDialogType(type);
    setDialogOpen(true);
    // 히스토리에 고유 ID를 저장하여 뒤로 가기 버튼으로 닫을 수 있게 함
    const fromPage = window.history.state?.from || referrerPage.current;
    window.history.pushState({ modal: "consultation", from: fromPage }, "");
  };

  const closeDialog = () => {
    setDialogOpen(false);
    // X 버튼이나 외부 클릭으로 닫을 때
    if (!isClosingFromBackButton.current) {
      const fromPage = window.history.state?.from || referrerPage.current;
      window.history.replaceState(null, "", window.location.pathname);
      
      // referrer 페이지로 이동
      if (fromPage) {
        setTimeout(() => {
          setLocation(fromPage);
          referrerPage.current = null;
        }, 0);
      } else {
        referrerPage.current = null;
      }
    }
    isClosingFromBackButton.current = false;
  };

  const openAnalysisDetail = () => {
    setAnalysisDetailOpen(true);
    // 히스토리에 고유 ID를 저장하여 뒤로 가기 버튼으로 닫을 수 있게 함
    const fromPage = window.history.state?.from || referrerPage.current;
    window.history.pushState({ modal: "analysisDetail", from: fromPage }, "");
  };

  const closeAnalysisDetail = () => {
    setAnalysisDetailOpen(false);
    // X 버튼이나 외부 클릭으로 닫을 때
    if (!isClosingFromBackButton.current) {
      const fromPage = window.history.state?.from || referrerPage.current;
      window.history.replaceState(null, "", window.location.pathname);
      
      // referrer 페이지로 이동
      if (fromPage) {
        setTimeout(() => {
          setLocation(fromPage);
          referrerPage.current = null;
        }, 0);
      } else {
        referrerPage.current = null;
      }
    }
    isClosingFromBackButton.current = false;
  };


  return (
    <div className="min-h-screen bg-background">
      {/* 크리스마스 팝업 */}
      {showChristmasPopup && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
          onClick={closeChristmasPopup}
        >
          <div className="relative max-w-sm mx-4">
            <img 
              src={newYearImage}
              alt="새해 복 많이 받으세요"
              className="w-full h-auto rounded-2xl shadow-2xl"
              loading="eager"
              fetchPriority="high"
              decoding="sync"
            />
          </div>
        </div>
      )}

      <Navbar />
      
      <Hero />

      {/* KnaDangerSection with overlay warning character */}
      <div className="relative">
        <img 
          src={dangerCharacterImage}
          alt="경고 캐릭터"
          className="absolute left-1/2 z-10 top-[32px] sm:top-[40px]"
          style={{ 
            width: 'auto', 
            height: '110px',
            transform: 'translateX(-50%)'
          }}
        />
        <KnaDangerSection />
      </div>

      {/* KnaValueSection with overlay character */}
      <div className="relative">
        <img 
          src={characterImage}
          alt="한국이름학교 캐릭터"
          className="absolute left-1/2 z-10 top-[32px] sm:top-[40px]"
          style={{ 
            width: 'auto', 
            height: '110px',
            transform: 'translateX(-50%)'
          }}
        />
        <KnaValueSection />
      </div>

      {/* KnaIntroBlock with overlay sad character */}
      <div className="relative">
        <img 
          src={effortCharacterImage}
          alt="힘든 캐릭터"
          className="absolute left-1/2 z-10 top-[32px] sm:top-[40px]"
          style={{ 
            width: 'auto', 
            height: '110px',
            transform: 'translateX(-50%)'
          }}
        />
        <KnaIntroBlock />
      </div>

      {/* KnaStepsSection with overlay happy character */}
      <div className="relative">
        <img 
          src={stepsCharacterImage}
          alt="행복한 캐릭터"
          className="absolute left-1/2 z-10 top-[32px] md:top-[48px]"
          style={{ 
            width: 'auto', 
            height: '110px',
            transform: 'translateX(-50%)'
          }}
        />
        <KnaStepsSection />
      </div>

      {/* KnaMythTruthSection with overlay pray character */}
      <div className="relative">
        <img 
          src={guideCharacterImage}
          alt="기도하는 캐릭터"
          className="absolute left-1/2 z-10 top-[32px] md:top-[48px]"
          style={{ 
            width: 'auto', 
            height: '110px',
            transform: 'translateX(-50%)'
          }}
        />
        <KnaMythTruthSection />
      </div>

      {/* 동영상 섹션 with overlay butterfly character */}
      <div className="relative ig-video-char-container">
        <img 
          src={butterflyCharacterImage}
          alt="나비 캐릭터"
          className="absolute left-1/2 z-10 top-[32px] md:top-[48px]"
          style={{ 
            width: 'auto', 
            height: '110px',
            transform: 'translateX(-50%)'
          }}
        />
        <section className="kna-video-section pt-[174px] pb-16 md:pt-[206px] md:pb-24">
          <div className="max-w-md mx-auto px-4 sm:px-6">
            <video 
              ref={videoRef}
              className="w-full h-auto rounded-lg shadow-lg"
              controls
              playsInline
              muted
              loop
              preload="metadata"
              controlsList="nodownload"
              data-testid="video-promotion"
              src="/promotion-video.mp4#t=0.1"
              poster=""
            >
              동영상을 재생할 수 없습니다. 브라우저가 MP4 형식을 지원하지 않습니다.
            </video>
            
            <div className="text-center mt-6">
              <p className="text-sm md:text-base font-semibold text-foreground">
                Founder & CEO 안서호
              </p>
              <p className="text-[11px] md:text-[14px] text-muted-foreground mt-1">
                한국이름학교 | 와츠유어네임 이름연구협회
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* KnaPricingSection with overlay shrug character */}
      <div className="relative ig-pricing-char-container">
        <img 
          src={pricingCharacterImage}
          alt="어깨 으쓱 캐릭터"
          className="absolute left-1/2 z-10 top-[32px] sm:top-[40px]"
          style={{ 
            width: 'auto', 
            height: '110px',
            transform: 'translateX(-50%)'
          }}
        />
        <KnaPricingSection />
      </div>

      <Footer />

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <ConsultationForm 
            type={dialogType}
            onSuccess={closeDialog}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={analysisDetailOpen} onOpenChange={(open) => { if (!open) closeAnalysisDetail(); }}>
        <DialogContent className="w-full h-full max-w-full max-h-full overflow-y-auto bg-neutral-950 text-white border-white/20 !p-0 inset-0 !translate-x-0 !translate-y-0 rounded-none">
          <DialogHeader className="sr-only">
            <DialogTitle>이름분석 운명상담 안내</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-8 ig-tt-dialog" data-testid="name-analysis-root">
            <style>{`
              .glass { background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03)); border: 1px solid rgba(255,255,255,0.12); }
              .tiffany { color: #81D8D0; }
            `}</style>

            {/* Header */}
            <div className="text-center mb-10">
              <h2 className="mb-8 text-[25px] sm:text-3xl md:text-4xl font-semibold tiffany whitespace-nowrap" data-testid="section-title">
                이름분석 운명상담이란
              </h2>
              <p className="text-white/80 text-lg md:text-lg leading-relaxed">
                사주 없이 한글·한자 이름에 내재된 운명의 흐름을, 체계적으로 해석하는 전문 상담 서비스입니다.
              </p>
            </div>

            {/* 분석 범위 */}
            <div className="grid gap-6 md:grid-cols-3 mb-16" data-testid="analysis-scope">
              <div className="glass rounded-2xl p-6 text-center" data-testid="scope-card-1">
                <Layers className="mx-auto mb-3 h-10 w-10 text-[#81D8D0]" aria-hidden="true" />
                <h3 className="mb-2 text-[21px] md:text-[22px] font-semibold">16가지 세부 운세<br />종합 분석</h3>
                <p className="text-lg md:text-lg leading-relaxed text-white/70 text-left">
                  수리운·주역괘운의 세밀한 분석을 통해 인생의 총체적 방향을 진단합니다.
                </p>
              </div>
              <div className="glass rounded-2xl p-6 text-center" data-testid="scope-card-2">
                <Compass className="mx-auto mb-3 h-10 w-10 text-[#81D8D0]" aria-hidden="true" />
                <h3 className="mb-2 text-[21px] md:text-[22px] font-semibold">7개 인생 시기별 운의<br />흐름 파악</h3>
                <p className="text-lg md:text-lg leading-relaxed text-white/70 text-left">
                  초년·중년·말년 등 7개 시기를 분석하여 시기별 강점과 전환점을 명확히 제시합니다.
                </p>
              </div>
              <div className="glass rounded-2xl p-6 text-center" data-testid="scope-card-3">
                <Clock className="mx-auto mb-3 h-10 w-10 text-[#81D8D0]" aria-hidden="true" />
                <h3 className="mb-2 text-[21px] md:text-[22px] font-semibold">과거·현재·미래<br />정밀 진단</h3>
                <p className="text-lg md:text-lg leading-relaxed text-white/70 text-left">
                  지나온 일, 현재 처한 상황, 다가올 운을 세밀히 파악합니다.
                </p>
              </div>
            </div>

            {/* 상담 내용 */}
            <div data-testid="consulting-content">
              <h3 className="tiffany mb-10 text-center text-[21px] md:text-[22px] font-semibold">상담 내용</h3>
              <div className="space-y-10">
                <div className="flex flex-col md:flex-row md:items-center md:gap-6" data-testid="content-item-1">
                  <CheckCircle className="hidden md:block h-10 w-10 shrink-0 text-[#81D8D0]" aria-hidden="true" />
                  <div>
                    <h4 className="mb-1 text-[21px] md:text-[22px] font-semibold flex items-center gap-3">
                      <CheckCircle className="h-[25px] w-[25px] md:hidden shrink-0 text-[#81D8D0]" aria-hidden="true" />
                      타고난 강점과 자질
                    </h4>
                    <p className="text-lg md:text-lg leading-relaxed text-white/70">
                      선천적 재능과 성격적 특성을 구체적으로 분석합니다.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row md:items-center md:gap-6" data-testid="content-item-2">
                  <MapPin className="hidden md:block h-10 w-10 shrink-0 text-[#81D8D0]" aria-hidden="true" />
                  <div>
                    <h4 className="mb-1 text-[21px] md:text-[22px] font-semibold flex items-center gap-3">
                      <MapPin className="h-[25px] w-[25px] md:hidden shrink-0 text-[#81D8D0]" aria-hidden="true" />
                      인생 방향성
                    </h4>
                    <p className="text-lg md:text-lg leading-relaxed text-white/70">
                      어떤 일을 할 때 성공하는지, 어떤 선택이 유리한지 명확히 제시합니다.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row md:items-center md:gap-6" data-testid="content-item-3">
                  <TriangleAlert className="hidden md:block h-10 w-10 shrink-0 text-[#81D8D0]" aria-hidden="true" />
                  <div>
                    <h4 className="mb-1 text-[21px] md:text-[22px] font-semibold flex items-center gap-3">
                      <TriangleAlert className="h-[25px] w-[25px] md:hidden shrink-0 text-[#81D8D0]" aria-hidden="true" />
                      주의해야 할 흉운
                    </h4>
                    <p className="text-lg md:text-lg leading-relaxed text-white/70">
                      발전을 저해하는 장애 요소와 극복 방안을 제시합니다.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
