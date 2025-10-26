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

export default function InstagramHome() {
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<"analysis" | "naming">("analysis");
  const [analysisDetailOpen, setAnalysisDetailOpen] = useState(false);
  const isClosingFromBackButton = useRef(false);
  const dialogOpenRef = useRef(false);
  const analysisDetailOpenRef = useRef(false);
  const referrerPage = useRef<string | null>(null);

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
        
        /* 섹션 padding 축소 - 외부 섹션과 내부 div 모두 */
        .kna-danger-section,
        .kna-value-section,
        .kna-intro-block,
        .kna-steps-section,
        .kna-myth-truth-section,
        .kna-video-section,
        .kna-pricing-section {
          padding-top: 1rem !important;
          padding-bottom: 1rem !important;
        }
        
        /* 각 섹션 내부 div의 padding도 강제 축소 */
        .kna-danger-section > div,
        .kna-value-section > div,
        .kna-intro-block > div,
        .kna-steps-section > div,
        .kna-myth-truth-section > div {
          padding-top: 1.5rem !important;
          padding-bottom: 1.5rem !important;
        }
        
        /* 섹션 간 간격 완전 제거 - 균일하게 조정 */
        .kna-danger-section {
          margin-bottom: -25% !important;
        }
        .kna-value-section {
          margin-bottom: -25% !important;
        }
        .kna-intro-block {
          margin-bottom: -25% !important;
        }
        .kna-steps-section {
          margin-bottom: -25% !important;
        }
        .kna-myth-truth-section {
          margin-bottom: -25% !important;
        }
        .kna-video-section {
          margin-bottom: -25% !important;
        }
        .kna-pricing-section {
          margin-bottom: -25% !important;
        }
        
        /* 푸터 텍스트 크기 강제 조정 (인앱 브라우저) */
        p.kna-footer-subtitle {
          font-size: 13px !important;
          line-height: 1.5 !important;
        }
        .kna-footer .border-t p {
          font-size: 11px !important;
        }
        
        /* 영상 밑 CEO 정보 텍스트 크기 조정 */
        .kna-video-section .text-muted-foreground {
          font-size: 13px !important;
        }
        
        /* Dialog 내부 텍스트도 크기 조정 */
        [role="dialog"] h1 {
          font-size: clamp(18px, 4.5vw, 22px) !important;
        }
        
        [role="dialog"] h2 {
          font-size: clamp(16px, 4vw, 20px) !important;
        }
        
        [role="dialog"] h3,
        [role="dialog"] h4 {
          font-size: clamp(15px, 3.8vw, 18px) !important;
        }
        
        [role="dialog"] p,
        [role="dialog"] li,
        [role="dialog"] span,
        [role="dialog"] label {
          font-size: 14px !important;
        }
        
        [role="dialog"] .text-lg {
          font-size: 14px !important;
        }
        
        [role="dialog"] .text-xl {
          font-size: 15px !important;
        }
        
        [role="dialog"] .text-2xl {
          font-size: 17px !important;
        }
        
        [role="dialog"] .text-3xl {
          font-size: 19px !important;
        }
        
        [role="dialog"] .text-4xl {
          font-size: 22px !important;
        }
        
        [role="dialog"] .text-\[21px\],
        [role="dialog"] .text-\[22px\],
        [role="dialog"] .text-\[23px\] {
          font-size: 16px !important;
        }
        
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
        footerSubtitle.style.setProperty('font-size', '13px', 'important');
        footerSubtitle.style.setProperty('line-height', '1.5', 'important');
        console.log('[IG] 푸터 subtitle 크기 적용: 13px');
      }
      
      if (copyrightText) {
        copyrightText.style.setProperty('font-size', '11px', 'important');
        console.log('[IG] 카피라이트 크기 적용: 11px');
      }
    };
    
    // 섹션 간격 강제 축소 (실제 padding/margin 변경)
    const applySectionSpacing = () => {
      const sections = [
        '.kna-danger-section',
        '.kna-value-section', 
        '.kna-intro-block',
        '.kna-steps-section',
        '.kna-myth-truth-section',
        '.kna-video-section',
        '.kna-pricing-section'
      ];
      
      sections.forEach(selector => {
        const section = document.querySelector(selector) as HTMLElement;
        if (section) {
          // 외부 섹션 padding 축소
          section.style.setProperty('padding-top', '1.5rem', 'important');
          section.style.setProperty('padding-bottom', '1.5rem', 'important');
          
          // 내부 div padding 축소
          const innerDiv = section.querySelector(':scope > div') as HTMLElement;
          if (innerDiv) {
            innerDiv.style.setProperty('padding-top', '1rem', 'important');
            innerDiv.style.setProperty('padding-bottom', '1rem', 'important');
          }
          
          // 내부 mt-*, mb-* 요소들 축소
          const mtElements = section.querySelectorAll('[class*="mt-"]');
          mtElements.forEach(el => {
            (el as HTMLElement).style.setProperty('margin-top', '1rem', 'important');
          });
          
          const mbElements = section.querySelectorAll('[class*="mb-"]');
          mbElements.forEach(el => {
            (el as HTMLElement).style.setProperty('margin-bottom', '1rem', 'important');
          });
        }
      });
      
      console.log('[IG] 섹션 간격 축소 완료');
    };
    
    // 여러 번 강제 적용 (늦은 렌더링 대비)
    setTimeout(applyScale, 0);
    setTimeout(applyFooterTextSize, 0);
    setTimeout(applySectionSpacing, 0);
    const timer1 = setTimeout(applyScale, 100);
    const timer1b = setTimeout(applyFooterTextSize, 100);
    const timer1c = setTimeout(applySectionSpacing, 100);
    const timer2 = setTimeout(applyScale, 300);
    const timer2b = setTimeout(applyFooterTextSize, 300);
    const timer2c = setTimeout(applySectionSpacing, 300);
    const timer3 = setTimeout(applyScale, 500);
    const timer3b = setTimeout(applyFooterTextSize, 500);
    const timer3c = setTimeout(applySectionSpacing, 500);
    const timer4 = setTimeout(applyScale, 1000);
    const timer4b = setTimeout(applyFooterTextSize, 1000);
    const timer4c = setTimeout(applySectionSpacing, 1000);
    const timer5 = setTimeout(applyScale, 2000);
    const timer5b = setTimeout(applyFooterTextSize, 2000);
    const timer5c = setTimeout(applySectionSpacing, 2000);
    
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
      <Navbar />
      
      <Hero />

      <KnaDangerSection />

      <KnaValueSection />

      <KnaIntroBlock />

      <KnaStepsSection />

      <KnaMythTruthSection />

      {/* 동영상 섹션 */}
      <section className="kna-video-section py-16 md:py-24">
        <div className="max-w-md mx-auto px-4 sm:px-6">
          <video 
            className="w-full h-auto rounded-lg shadow-lg"
            controls
            playsInline
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
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              한국이름학교 | 와츠유어네임 이름연구협회
            </p>
          </div>
        </div>
      </section>

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
        <DialogContent className="w-[95vw] sm:max-w-[900px] max-h-[90vh] overflow-y-auto overflow-x-hidden bg-neutral-950 text-white border-white/20">
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
              <h2 className="mb-4 text-2xl font-semibold tiffany md:text-4xl break-keep" data-testid="section-title">
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
