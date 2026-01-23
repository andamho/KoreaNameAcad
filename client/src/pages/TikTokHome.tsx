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
import InAppBrowserHint from "@/components/InAppBrowserHint";
import { Layers, Compass, Clock, CheckCircle, TriangleAlert, MapPin } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useInAppScrollRestore } from "@/hooks/useInAppScrollRestore";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import { Heart, Baby, LifeBuoy, Zap, Users, X } from "lucide-react";
import analysisExampleImage from "@assets/hongildong-analysis.jpg";
import newYearImage from "@assets/newYearPopup_optimized.jpg";
import characterImage from "@assets/KakaoTalk_20251226_135549799_1766724973553.png";
import dangerCharacterImage from "@assets/KakaoTalk_20251226_152419337_1766730274782.png";
import effortCharacterImage from "@assets/KakaoTalk_20251226_152116391_1766730095506.png";
import stepsCharacterImage from "@assets/KakaoTalk_20251226_164036756_1766734877281.png";
import guideCharacterImage from "@assets/KakaoTalk_20251226_151729031_1766729868877.png";
import pricingCharacterImage from "@assets/KakaoTalk_20251226_150428417_1766729101276.png";
import butterflyCharacterImage from "@assets/KakaoTalk_20251226_134433821_1766724285654.png";

const INLINE_TT_STYLES = `
  html.ua-tiktok .ig-tt-dialog h2,
  html.ua-tiktok .ig-tt-dialog [class*="text-[25px]"] {
    font-size: 20px !important;
  }
  html.ua-tiktok .ig-tt-dialog h3,
  html.ua-tiktok .ig-tt-dialog [class*="text-[21px]"] {
    font-size: 17px !important;
  }
  html.ua-tiktok .ig-tt-dialog p,
  html.ua-tiktok .ig-tt-dialog [class*="text-lg"] {
    font-size: 15px !important;
  }
  html.ua-tiktok .ig-tt-dialog [class*="text-base"] {
    font-size: 13px !important;
  }
  html.ua-tiktok .ig-tt-dialog [class*="text-sm"] {
    font-size: 12px !important;
  }
`;

export default function TikTokHome() {
  useInAppScrollRestore("tt-home");
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<"analysis" | "naming">("analysis");
  const [analysisDetailOpen, setAnalysisDetailOpen] = useState(false);
  const [familyPolicyOpen, setFamilyPolicyOpen] = useState(false);
  const [showChristmasPopup, setShowChristmasPopup] = useState(false); // 팝업 비활성화
  const isClosingFromBackButton = useRef(false);
  const dialogOpenRef = useRef(false);
  const analysisDetailOpenRef = useRef(false);
  const familyPolicyOpenRef = useRef(false);
  const referrerPage = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // 크리스마스 팝업 3초 후 자동 닫기
  useEffect(() => {
    if (showChristmasPopup) {
      const timer = setTimeout(() => {
        setShowChristmasPopup(false);
        try { 
          sessionStorage.setItem('popupShown', 'true');
          window.history.replaceState({ ...window.history.state, popupShown: true }, ''); 
        } catch {}
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showChristmasPopup]);

  const closeChristmasPopup = () => {
    setShowChristmasPopup(false);
    try { 
      sessionStorage.setItem('popupShown', 'true');
      window.history.replaceState({ ...window.history.state, popupShown: true }, ''); 
    } catch {}
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

  // 틱톡 전용 클래스 및 canonical 태그 추가
  useEffect(() => {
    // html에 ua-tiktok 클래스 추가
    document.documentElement.classList.add('ua-tiktok');
    
    // 인라인 스타일 주입 (캐시 우회용 - 가장 확실한 방법)
    const ttDialogStyleId = 'tt-inline-font-override';
    if (!document.getElementById(ttDialogStyleId)) {
      const styleTag = document.createElement('style');
      styleTag.id = ttDialogStyleId;
      styleTag.textContent = INLINE_TT_STYLES;
      document.head.appendChild(styleTag);
    }
    
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
    
    // 틱톡 전용 추가 스타일 (섹션 간격은 index.css에서 처리)
    const ttForceStyleId = 'tt-force-style';
    if (!document.getElementById(ttForceStyleId)) {
      const style = document.createElement('style');
      style.id = ttForceStyleId;
      style.textContent = `
        html.ua-tiktok, html.ua-tiktok body {
          -webkit-text-size-adjust: none !important;
          text-size-adjust: none !important;
        }
        
        /* 푸터 텍스트 크기 강제 조정 */
        p.kna-footer-subtitle {
          font-size: 9.6px !important;
          line-height: 1.5 !important;
        }
        .kna-footer .border-t p {
          font-size: 11px !important;
        }
        
        h1, h2, h3, p { word-break: keep-all; overflow-wrap: anywhere; }
        input, select, textarea, button { font-size: 16px; }
      `;
      document.head.appendChild(style);
    }
    
    // 디버깅: 실행 확인
    console.log('[TT] TikTokHome useEffect 실행됨');
    
    // Transform scale 방식으로 텍스트 축소 (CSS + JS 이중 적용)
    const applyScale = () => {
      const heroWrap = document.querySelector('.hero-wrap') as HTMLElement;
      console.log('[TT] applyScale 실행, heroWrap:', heroWrap);
      
      if (heroWrap) {
        heroWrap.style.setProperty('transform', 'scale(0.82)', 'important');
        heroWrap.style.setProperty('transform-origin', 'top center', 'important');
        heroWrap.style.setProperty('margin-bottom', '-28px', 'important');
        console.log('[TT] transform 적용 완료');
      } else {
        console.log('[TT] heroWrap을 찾지 못함');
      }
    };
    
    // 푸터 텍스트 크기 강제 설정
    const applyFooterTextSize = () => {
      const footerSubtitle = document.querySelector('.kna-footer-subtitle') as HTMLElement;
      const copyrightText = document.querySelector('.kna-footer .border-t p') as HTMLElement;
      
      console.log('[TT] applyFooterTextSize 실행, footerSubtitle:', footerSubtitle, 'copyrightText:', copyrightText);
      
      if (footerSubtitle) {
        footerSubtitle.style.setProperty('font-size', '9.6px', 'important');
        footerSubtitle.style.setProperty('line-height', '1.5', 'important');
        console.log('[TT] 푸터 subtitle 크기 적용: 9.6px');
      }
      
      if (copyrightText) {
        copyrightText.style.setProperty('font-size', '11px', 'important');
        console.log('[TT] 카피라이트 크기 적용: 11px');
      }
    };
    
    // 영상 아래 텍스트 크기 강제 설정 (푸터 subtitle과 동일하게)
    const applyVideoTextSize = () => {
      const videoSectionText = document.querySelector('.kna-video-section .text-\\[11px\\]') as HTMLElement;
      
      console.log('[TT] applyVideoTextSize 실행, videoSectionText:', videoSectionText);
      
      if (videoSectionText) {
        videoSectionText.style.setProperty('font-size', '13px', 'important');
        console.log('[TT] 영상 아래 텍스트 크기 적용: 13px (푸터와 동일)');
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
      document.documentElement.classList.remove('ua-tiktok');
      const styleElement = document.getElementById(ttForceStyleId);
      if (styleElement) {
        styleElement.remove();
      }
      const dialogStyleElement = document.getElementById(ttDialogStyleId);
      if (dialogStyleElement) {
        dialogStyleElement.remove();
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
    familyPolicyOpenRef.current = familyPolicyOpen;
  }, [familyPolicyOpen]);

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
      // hash 기반으로 변경 (인앱 브라우저 호환)
      window.history.replaceState(null, "", "/tt#consultation");
    } else if (detailType === "analysis") {
      setAnalysisDetailOpen(true);
      // hash 기반으로 변경 (인앱 브라우저 호환)
      window.history.replaceState(null, "", "/tt#analysisDetail");
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

  // 뒤로 가기 버튼 감지 및 처리 (popstate + hashchange 둘 다 사용)
  useEffect(() => {
    const handleBackNavigation = () => {
      const hash = window.location.hash;
      const fromPage = referrerPage.current;
      
      // familyPolicy가 열려있는데 hash가 #familyPolicy가 아니면 닫음
      if (familyPolicyOpenRef.current && hash !== "#familyPolicy") {
        isClosingFromBackButton.current = true;
        setFamilyPolicyOpen(false);
        return;
      }
      
      // analysisDetail이 열려있는데 hash가 #analysisDetail이 아니면 닫음
      if (analysisDetailOpenRef.current && hash !== "#analysisDetail") {
        isClosingFromBackButton.current = true;
        setAnalysisDetailOpen(false);
        if (fromPage) {
          setTimeout(() => {
            setLocation(fromPage);
            referrerPage.current = null;
          }, 0);
        }
        return;
      }
      
      // consultation이 열려있는데 hash가 #consultation이나 #familyPolicy가 아니면 닫음
      if (dialogOpenRef.current && hash !== "#consultation" && hash !== "#familyPolicy") {
        isClosingFromBackButton.current = true;
        setDialogOpen(false);
        if (fromPage) {
          setTimeout(() => {
            setLocation(fromPage);
            referrerPage.current = null;
          }, 0);
        }
      }
    };

    // hashchange 이벤트 (인앱 브라우저에서 더 안정적)
    window.addEventListener("hashchange", handleBackNavigation);
    // popstate 이벤트 (일반 브라우저 호환)
    window.addEventListener("popstate", handleBackNavigation);
    
    return () => {
      window.removeEventListener("hashchange", handleBackNavigation);
      window.removeEventListener("popstate", handleBackNavigation);
    };
  }, [setLocation]);

  // 홈 버튼 클릭 시 모든 Dialog 닫기
  useEffect(() => {
    const handleCloseAllDialogs = () => {
      setDialogOpen(false);
      setAnalysisDetailOpen(false);
      setShowChristmasPopup(false);
    };
    
    window.addEventListener('closeAllDialogs', handleCloseAllDialogs);
    return () => window.removeEventListener('closeAllDialogs', handleCloseAllDialogs);
  }, []);

  const openDialog = (type: "analysis" | "naming") => {
    setDialogType(type);
    setDialogOpen(true);
    // hash를 사용하여 뒤로 가기 버튼으로 닫을 수 있게 함 (인앱 브라우저 호환)
    window.location.hash = "#consultation";
  };

  const closeDialog = () => {
    setDialogOpen(false);
    // X 버튼이나 외부 클릭으로 닫을 때
    if (!isClosingFromBackButton.current) {
      // hash 제거
      if (window.location.hash) {
        window.history.back();
      }
      const fromPage = referrerPage.current;
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
    // hash를 사용하여 뒤로 가기 버튼으로 닫을 수 있게 함 (인앱 브라우저 호환)
    window.location.hash = "#analysisDetail";
  };

  const closeAnalysisDetail = () => {
    setAnalysisDetailOpen(false);
    // X 버튼이나 외부 클릭으로 닫을 때
    if (!isClosingFromBackButton.current) {
      // hash 제거
      if (window.location.hash) {
        window.history.back();
      }
      const fromPage = referrerPage.current;
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

  const openFamilyPolicy = () => {
    setFamilyPolicyOpen(true);
    // hash를 사용하여 뒤로 가기 버튼으로 닫을 수 있게 함 (인앱 브라우저 호환)
    window.location.hash = "#familyPolicy";
  };

  const closeFamilyPolicy = () => {
    setFamilyPolicyOpen(false);
    // X 버튼이나 외부 클릭으로 닫을 때 - hash 제거하여 consultation으로 돌아감
    if (!isClosingFromBackButton.current) {
      window.history.back();
    }
    isClosingFromBackButton.current = false;
  };


  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-background ig-shell">
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
      {/* <InAppBrowserHint platform="tiktok" /> */}
      
      <Hero />

      <KnaDangerSection />

      <KnaValueSection />

      <KnaIntroBlock />

      <KnaStepsSection />

      <KnaMythTruthSection />

      {/* 동영상 섹션 */}
      <div className="relative">
        <section className="kna-video-section pb-16 md:pb-24">
          <div className="kna-video-inner max-w-md mx-auto px-4 sm:px-6 pt-[174px] sm:pt-[190px]">
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

      <KnaPricingSection />

      <Footer />
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <ConsultationForm 
            type={dialogType}
            onSuccess={closeDialog}
            onOpenFamilyPolicy={openFamilyPolicy}
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
              <h2 className="ig-dialog-title mb-8 text-[25px] font-semibold tiffany whitespace-nowrap" data-testid="section-title">
                이름분석 운명상담이란
              </h2>
              <p className="text-white/80 text-lg leading-relaxed">
                사주 없이 한글·한자 이름에 내재된 운명의 흐름을, 체계적으로 해석하는 전문 상담 서비스입니다.
              </p>
            </div>

            {/* 분석 범위 */}
            <div className="grid gap-6 mb-16" data-testid="analysis-scope">
              <div className="glass rounded-2xl p-6 text-center" data-testid="scope-card-1">
                <Layers className="mx-auto mb-3 h-10 w-10 text-[#81D8D0]" aria-hidden="true" />
                <h3 className="mb-2 text-[21px] font-semibold">16가지 세부 운세<br />종합 분석</h3>
                <p className="text-lg leading-relaxed text-white/70 text-left">
                  수리운·주역괘운의 세밀한 분석을 통해 인생의 총체적 방향을 진단합니다.
                </p>
              </div>
              <div className="glass rounded-2xl p-6 text-center" data-testid="scope-card-2">
                <Compass className="mx-auto mb-3 h-10 w-10 text-[#81D8D0]" aria-hidden="true" />
                <h3 className="mb-2 text-[21px] font-semibold">7개 인생 시기별 운의<br />흐름 파악</h3>
                <p className="text-lg leading-relaxed text-white/70 text-left">
                  초년·중년·말년 등 7개 시기를 분석하여 시기별 강점과 전환점을 명확히 제시합니다.
                </p>
              </div>
              <div className="glass rounded-2xl p-6 text-center" data-testid="scope-card-3">
                <Clock className="mx-auto mb-3 h-10 w-10 text-[#81D8D0]" aria-hidden="true" />
                <h3 className="mb-2 text-[21px] font-semibold">과거·현재·미래<br />정밀 진단</h3>
                <p className="text-lg leading-relaxed text-white/70 text-left">
                  지나온 일, 현재 처한 상황, 다가올 운을 세밀히 파악합니다.
                </p>
              </div>
            </div>

            {/* 상담 내용 */}
            <div data-testid="consulting-content">
              <h3 className="tiffany mb-10 text-center text-[21px] font-semibold">상담 내용</h3>
              <div className="space-y-10">
                <div className="flex flex-col" data-testid="content-item-1">
                  <div>
                    <h4 className="mb-1 text-[21px] font-semibold flex items-center gap-3">
                      <CheckCircle className="h-[21px] w-[21px] shrink-0 text-[#81D8D0]" aria-hidden="true" />
                      타고난 강점과 자질
                    </h4>
                    <p className="text-lg leading-relaxed text-white/70">
                      선천적 재능과 성격적 특성을 구체적으로 분석합니다.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col" data-testid="content-item-2">
                  <div>
                    <h4 className="mb-1 text-[21px] font-semibold flex items-center gap-3">
                      <MapPin className="h-[21px] w-[21px] shrink-0 text-[#81D8D0]" aria-hidden="true" />
                      인생 방향성
                    </h4>
                    <p className="text-lg leading-relaxed text-white/70">
                      어떤 일을 할 때 성공하는지, 어떤 선택이 유리한지 명확히 제시합니다.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col" data-testid="content-item-3">
                  <div>
                    <h4 className="mb-1 text-[21px] font-semibold flex items-center gap-3">
                      <TriangleAlert className="h-[21px] w-[21px] shrink-0 text-[#81D8D0]" aria-hidden="true" />
                      주의해야 할 흉운
                    </h4>
                    <p className="text-lg leading-relaxed text-white/70">
                      발전을 저해하는 장애 요소와 극복 방안을 제시합니다.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 등본상 가족 상담 원칙 Sheet */}
      <Sheet open={familyPolicyOpen} onOpenChange={(open) => { if (!open) closeFamilyPolicy(); }}>
        <SheetContent 
          side="right"
          className="family-policy-sheet z-[10002] w-full sm:max-w-[725px] sm:w-[725px] overflow-hidden bg-[#0A0D11] text-white border-l border-white/10 !p-0 flex flex-col"
          aria-describedby={undefined}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>등본상 가족 상담 원칙</SheetTitle>
          </SheetHeader>

          {/* SVG Gradients for line animations */}
          <svg className="absolute w-0 h-0">
            <defs>
              <linearGradient id="grad-aurora-1-tt" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#56D5DB" />
                <stop offset="100%" stopColor="#7F5AF0" />
              </linearGradient>
              <linearGradient id="grad-aurora-2-tt" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#4361EE" />
                <stop offset="100%" stopColor="#F72585" />
              </linearGradient>
            </defs>
          </svg>
          
          {/* Fixed Header */}
          <div className="shrink-0 px-6 py-6 sm:px-8 bg-[#0A0D11] flex items-start justify-between border-b border-white/5">
            <div>
              <h1 className="text-[22px] sm:text-[26px] font-bold text-[#56D5DB] tracking-tight">
                등본상 가족 상담 원칙
              </h1>
              <p className="mt-3 text-[17px] font-semibold tracking-tight text-white/85">
                가족은 운명 공동체로, 서로 이름운의 영향을 강하게 주고 받습니다.
              </p>
            </div>
            <SheetClose className="group -mr-2 ml-4 p-2 rounded-md text-white/40 hover:text-white focus:outline-none transition-colors">
              <span className="sr-only">닫기</span>
              <X className="h-8 w-8 group-hover:rotate-90 transition-transform duration-300" />
            </SheetClose>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-8 sm:px-8">
            <div className="flex flex-col">
              
              {/* 상단 2개 카드 - 결혼, 자녀 */}
              <div className="grid gap-6 md:grid-cols-2 z-10 relative">
                <article className="family-card-top group rounded-2xl bg-[#0A0D11] border border-white/10 p-6 shadow-lg">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#56D5DB]/10 text-[#56D5DB]">
                      <Heart className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-[19px] font-bold text-white">부부, 혼의 연결</h3>
                      <p className="mt-1 text-[15px] text-white/60">
                        · '결혼'은 본래 '혼(魂)을 연결한다'는 뜻에서 유래
                      </p>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-white/10">
                    <p className="text-[17px] leading-relaxed text-white font-medium">
                      · 일심동체처럼 몸과 마음이 강력히 연결
                    </p>
                  </div>
                </article>

                <article className="family-card-top group rounded-2xl bg-[#0A0D11] border border-white/10 p-6 shadow-lg">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#56D5DB]/10 text-[#56D5DB]">
                      <Baby className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-[19px] font-bold text-white">자녀, 혈육</h3>
                      <p className="mt-1 text-[15px] text-white/60">
                        · 혈육: 피로 연결되고 살로 이어진 관계
                      </p>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-white/10">
                    <p className="text-[17px] leading-relaxed text-white font-medium">
                      · 분리된 듯 보이나 결코 분리될 수 없는 특별한 연대
                    </p>
                  </div>
                </article>
              </div>

              {/* 중단 2개 카드 - 이름운, 에너지의 원리 */}
              <div className="grid gap-6 md:grid-cols-2 z-10 relative mt-6">
                <article className="family-card-mid group rounded-2xl bg-[#0A0D11] border border-white/10 p-6 shadow-lg">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#56D5DB]/10 text-[#56D5DB]">
                      <LifeBuoy className="h-5 w-5" />
                    </div>
                    <div className="w-full">
                      <h3 className="text-[19px] font-bold text-white">이름운, 서로에게 영향</h3>
                      <div className="mt-2 space-y-1 text-[15px] text-white/60">
                        <div className="flex justify-between px-1 border-b border-white/5 py-1"><span>남편</span> <span>↔</span> <span>아내</span></div>
                        <div className="flex justify-between px-1 border-b border-white/5 py-1"><span>부모</span> <span>↔</span> <span>자녀</span></div>
                        <div className="flex justify-between px-1 py-1"><span>자녀</span> <span>↔</span> <span>자녀</span></div>
                      </div>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-white/10 space-y-2">
                    <p className="text-[17px] text-white font-medium">
                      · 부부의 이름운은 결혼과 함께 상호작용
                    </p>
                    <p className="text-[17px] text-white font-medium">
                      · 자녀의 초년운 ↔ 부모의 중년운에 영향
                    </p>
                  </div>
                </article>

                <article className="family-card-mid group rounded-2xl bg-[#0A0D11] border border-white/10 p-6 shadow-lg">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#56D5DB]/10 text-[#56D5DB]">
                      <Zap className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-[19px] font-bold text-white">에너지의 원리</h3>
                      <p className="mt-1 text-[15px] text-white/60">
                        · 가정 내 에너지 분배
                      </p>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-white/10 space-y-2">
                    <p className="text-[17px] text-white font-medium">
                      · 한 사람의 운이 좋아지면, 가족 전체에도 영향
                    </p>
                    <p className="text-[17px] text-white font-medium">
                      · 가족 중 한 사람의 불운이 전체 균형을 흔들 수 있음
                    </p>
                  </div>
                </article>
              </div>

              {/* 하단 결론 카드 */}
              <div className="mt-6 z-10 relative">
                <article className="family-card-bottom group rounded-2xl bg-[#0A0D11] border border-white/10 p-6 shadow-lg">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#56D5DB]/10 text-[#56D5DB]">
                      <Users className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-[19px] font-bold text-white">따라서, 등본상 가족은 함께</h3>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-white/10 space-y-3">
                    <p className="text-[17px] text-white font-medium">
                      · 가족 전체 이름운을 조화롭게 분석
                    </p>
                    <p className="text-[17px] text-white font-medium">
                      · 개명이 필요한 경우, 가족 전체의 균형을 고려해 진행
                    </p>
                    <p className="text-[17px] text-white font-medium">
                      · 한 사람만 개명해도, 가족 전체에 긍정적 파급 효과
                    </p>
                  </div>
                </article>
              </div>

            </div>
          </div>
        </SheetContent>
      </Sheet>
      </div>
    </>
  );
}
