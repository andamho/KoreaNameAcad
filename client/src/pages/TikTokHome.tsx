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

export default function TikTokHome() {
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<"analysis" | "naming">("analysis");
  const [analysisDetailOpen, setAnalysisDetailOpen] = useState(false);
  const isClosingFromBackButton = useRef(false);
  const dialogOpenRef = useRef(false);
  const analysisDetailOpenRef = useRef(false);
  const referrerPage = useRef<string | null>(null);

  // 틱톡 전용 클래스 및 canonical 태그 추가
  useEffect(() => {
    // html에 ua-tiktok 클래스 추가
    document.documentElement.classList.add('ua-tiktok');
    
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
    
    // 틱톡 전용 강제 스타일 추가
    const styleId = 'tt-force-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        html.ua-tiktok, html.ua-tiktok body {
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
        
        /* 모든 섹션 글자 크기만 축소 (여백 없이) */
        .kna-danger-section,
        .kna-value-section,
        .kna-intro-block,
        .kna-steps-section,
        .kna-pricing-section,
        .kna-footer {
          font-size: 82% !important;
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
    
    // 여러 번 강제 적용 (늦은 렌더링 대비)
    setTimeout(applyScale, 0);
    const timer1 = setTimeout(applyScale, 100);
    const timer2 = setTimeout(applyScale, 300);
    const timer3 = setTimeout(applyScale, 500);
    const timer4 = setTimeout(applyScale, 1000);
    const timer5 = setTimeout(applyScale, 2000);
    
    // 리사이즈 시에도 재적용
    window.addEventListener('resize', applyScale);
    
    return () => {
      document.documentElement.classList.remove('ua-tiktok');
      const styleElement = document.getElementById(styleId);
      if (styleElement) {
        styleElement.remove();
      }
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
      clearTimeout(timer5);
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
      window.history.replaceState({ from: fromPage }, "", "/tt");
    } else if (detailType === "analysis") {
      setAnalysisDetailOpen(true);
      window.history.replaceState({ from: fromPage }, "", "/tt");
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
      // consultation이 열려있고, state에서 사라졌으면 (null 또는 familyPolicy가 아닌 경우) 닫음
      else if (dialogOpenRef.current && !modalState) {
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
      <Navbar />
      
      <Hero />

      <KnaDangerSection />

      <KnaValueSection />

      <KnaIntroBlock />

      <KnaStepsSection />

      <KnaMythTruthSection />

      <KnaPricingSection />

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
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto bg-neutral-950 text-white border-white/20">
          <DialogHeader className="sr-only">
            <DialogTitle>이름분석 운명상담 안내</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-8" data-testid="name-analysis-root">
            <style>{`
              .glass { background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03)); border: 1px solid rgba(255,255,255,0.12); }
              .tiffany { color: #81D8D0; }
            `}</style>

            {/* Header */}
            <div className="text-center mb-10">
              <h2 className="mb-4 text-2xl font-semibold tiffany md:text-4xl whitespace-nowrap" data-testid="section-title">
                이름분석 운명상담이란
              </h2>
              <p className="text-white/80 text-base md:text-base leading-relaxed">
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
              <h3 className="tiffany mb-10 text-center text-2xl font-semibold">상담 내용</h3>
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
