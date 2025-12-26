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
import newYearImage from "@assets/Screenshot_20251226_110720_CapCut_1766715016537.jpg";
import characterImage from "@assets/KakaoTalk_20251226_112051215_1766716081551.png";
import warningCharacterImage from "@assets/KakaoTalk_20251226_113721756_1766716681811.png";
import sadCharacterImage from "@assets/KakaoTalk_20251226_113704028_1766716735122.png";
import happyCharacterImage from "@assets/KakaoTalk_20251226_114203894_1766717036057.png";
import prayCharacterImage from "@assets/KakaoTalk_20251226_115131742_1766723059740.png";

export default function Home() {
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<"analysis" | "naming">("analysis");
  const [analysisDetailOpen, setAnalysisDetailOpen] = useState(false);
  const [showChristmasPopup, setShowChristmasPopup] = useState(() => {
    // 세션에서 이미 본 경우 다시 표시 안 함
    try {
      return !sessionStorage.getItem('christmasPopupShown');
    } catch {
      // 인앱 브라우저에서 sessionStorage 사용 불가시 항상 표시
      return true;
    }
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
        try { sessionStorage.setItem('christmasPopupShown', 'true'); } catch {}
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showChristmasPopup]);

  const closeChristmasPopup = () => {
    setShowChristmasPopup(false);
    try { sessionStorage.setItem('christmasPopupShown', 'true'); } catch {}
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

  // 인앱 브라우저 감지
  useEffect(() => {
    const userAgent = navigator.userAgent || '';
    const isInstagram = userAgent.includes('Instagram');
    const isTikTok = userAgent.includes('TikTok') || userAgent.includes('musical_ly');
    
    console.log('[Home] User Agent:', userAgent);
    console.log('[Home] isInstagram:', isInstagram, 'isTikTok:', isTikTok);
    
    if (isInstagram || isTikTok) {
      const className = isInstagram ? 'ua-instagram' : 'ua-tiktok';
      document.documentElement.classList.add(className);
      console.log(`[Home] ${className} 클래스 추가됨`);
      
      // JavaScript로 네비바 텍스트 크기 강제 적용
      const applyNavbarStyles = () => {
        const mainElements = document.querySelectorAll('.kna-brand-main');
        const subElements = document.querySelectorAll('.kna-brand-sub');
        
        mainElements.forEach(el => {
          (el as HTMLElement).style.setProperty('font-size', '13px', 'important');
          (el as HTMLElement).style.setProperty('line-height', '1', 'important');
        });
        
        subElements.forEach(el => {
          (el as HTMLElement).style.setProperty('font-size', '6.7px', 'important');
          (el as HTMLElement).style.setProperty('line-height', '1', 'important');
          (el as HTMLElement).style.setProperty('margin-top', '3px', 'important');
          (el as HTMLElement).style.setProperty('letter-spacing', '-0.068em', 'important');
        });
        
        console.log(`[Home] 네비바 스타일 적용 완료 - main: ${mainElements.length}개, sub: ${subElements.length}개`);
      };
      
      // 즉시 실행 + 지연 실행 (DOM 로드 대비)
      applyNavbarStyles();
      setTimeout(applyNavbarStyles, 100);
      setTimeout(applyNavbarStyles, 300);
      setTimeout(applyNavbarStyles, 500);
      
      return () => {
        document.documentElement.classList.remove(className);
      };
    }
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
      window.history.replaceState({ modal: "consultation", from: fromPage }, "", "/");
    } else if (detailType === "analysis") {
      setAnalysisDetailOpen(true);
      window.history.replaceState({ modal: "analysisDetail", from: fromPage }, "", "/");
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
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 animate-in fade-in duration-300"
          onClick={closeChristmasPopup}
        >
          <div className="relative max-w-sm mx-4 animate-in zoom-in-95 duration-300">
            <img 
              src={newYearImage}
              alt="새해 복 많이 받으세요"
              className="w-full h-auto rounded-2xl shadow-2xl"
            />
          </div>
        </div>
      )}

      <Navbar />
      
      <Hero />

      {/* KnaDangerSection with overlay warning character */}
      <div className="relative">
        <img 
          src={warningCharacterImage}
          alt="경고 캐릭터"
          className="absolute left-1/2 z-10"
          style={{ 
            width: '70px', 
            height: 'auto',
            transform: 'translateX(-50%) translateY(-50%)',
            top: '0'
          }}
        />
        <KnaDangerSection />
      </div>

      {/* KnaValueSection with overlay character */}
      <div className="relative">
        <img 
          src={characterImage}
          alt="한국이름학교 캐릭터"
          className="absolute left-1/2 z-10"
          style={{ 
            width: '70px', 
            height: 'auto',
            transform: 'translateX(-50%) translateY(-50%)',
            top: '0'
          }}
        />
        <KnaValueSection />
      </div>

      {/* KnaIntroBlock with overlay sad character */}
      <div className="relative">
        <img 
          src={sadCharacterImage}
          alt="힘든 캐릭터"
          className="absolute left-1/2 z-10"
          style={{ 
            width: '70px', 
            height: 'auto',
            transform: 'translateX(-50%) translateY(-50%)',
            top: '0'
          }}
        />
        <KnaIntroBlock />
      </div>

      {/* KnaStepsSection with overlay happy character */}
      <div className="relative">
        <img 
          src={happyCharacterImage}
          alt="행복한 캐릭터"
          className="absolute left-1/2 z-10"
          style={{ 
            width: '70px', 
            height: 'auto',
            transform: 'translateX(-50%) translateY(-50%)',
            top: '0'
          }}
        />
        <KnaStepsSection />
      </div>

      {/* KnaMythTruthSection with overlay pray character */}
      <div className="relative">
        <img 
          src={prayCharacterImage}
          alt="기도하는 캐릭터"
          className="absolute left-1/2 z-10"
          style={{ 
            width: '70px', 
            height: '70px',
            objectFit: 'contain',
            transform: 'translateX(-50%) translateY(-50%)',
            top: '0'
          }}
        />
        <KnaMythTruthSection />
      </div>

      {/* 동영상 섹션 */}
      <section className="kna-video-section py-16 md:py-24">
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
        <DialogContent className="w-full h-full max-w-full max-h-full overflow-y-auto overflow-x-hidden bg-neutral-950 text-white border-white/20 !p-0 inset-0 !translate-x-0 !translate-y-0 rounded-none">
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
              <h2 className="mb-8 text-[25px] font-semibold tiffany sm:text-3xl md:text-4xl break-keep" data-testid="section-title">
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
                <p className="text-lg md:text-lg leading-relaxed text-white/70">
                  수리운·주역괘운의 세밀한 분석을 통해 인생의 총체적 방향을 진단합니다.
                </p>
              </div>
              <div className="glass rounded-2xl p-6 text-center" data-testid="scope-card-2">
                <Compass className="mx-auto mb-3 h-10 w-10 text-[#81D8D0]" aria-hidden="true" />
                <h3 className="mb-2 text-[21px] md:text-[22px] font-semibold">7개 인생 시기별 운의<br />흐름 파악</h3>
                <p className="text-lg md:text-lg leading-relaxed text-white/70">
                  초년·중년·말년 등 7개 시기를 분석하여 시기별 강점과 전환점을 명확히 제시합니다.
                </p>
              </div>
              <div className="glass rounded-2xl p-6 text-center" data-testid="scope-card-3">
                <Clock className="mx-auto mb-3 h-10 w-10 text-[#81D8D0]" aria-hidden="true" />
                <h3 className="mb-2 text-[21px] md:text-[22px] font-semibold">과거·현재·미래<br />정밀 진단</h3>
                <p className="text-lg md:text-lg leading-relaxed text-white/70">
                  지나온 일, 현재 처한 상황, 다가올 운을 세밀히 파악합니다.
                </p>
              </div>
            </div>

            {/* 상담 내용 */}
            <div data-testid="consulting-content">
              <h3 className="tiffany mb-10 text-center text-[25px] font-semibold sm:text-3xl md:text-4xl">상담 내용</h3>
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

            {/* 진행 과정 */}
            <div className="mt-16" data-testid="process-flow">
              <h3 className="tiffany mb-10 text-center text-[25px] font-semibold sm:text-3xl md:text-4xl">진행 과정</h3>
              
              <div className="space-y-6">
                <div className="flex gap-4" data-testid="process-step-1">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0f766e] dark:bg-[#58C4C4]">
                    <span className="text-[21px] font-bold text-white dark:text-neutral-950">1</span>
                  </div>
                  <div className="flex-1">
                    <h5 className="text-[21px] md:text-[22px] font-semibold text-white mb-1">상담 일정 예약</h5>
                    <p className="text-lg md:text-lg text-white/70">→ 신청서 접수 및 입금 확인 후 예약 확정</p>
                  </div>
                </div>

                <div className="flex gap-4" data-testid="process-step-2">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0f766e] dark:bg-[#58C4C4]">
                    <span className="text-[21px] font-bold text-white dark:text-neutral-950">2</span>
                  </div>
                  <div className="flex-1">
                    <h5 className="text-[21px] md:text-[22px] font-semibold text-white mb-1">이름분석표 발송</h5>
                    <p className="text-lg md:text-lg text-white/70">→ 상담 시작 직전 발송</p>
                  </div>
                </div>

                <div className="flex gap-4" data-testid="process-step-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0f766e] dark:bg-[#58C4C4]">
                    <span className="text-[21px] font-bold text-white dark:text-neutral-950">3</span>
                  </div>
                  <div className="flex-1">
                    <h5 className="text-[21px] md:text-[22px] font-semibold text-white mb-1">1:1 전화 상담 진행</h5>
                    <p className="text-lg md:text-lg text-white/70">→ 분석표를 토대로 심층 상담</p>
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
