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
import { useLocation, Link } from "wouter";
import { useScrollRestore } from "@/hooks/use-scroll-restore";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import analysisExampleImage from "@assets/hongildong-analysis.jpg";
import newYearImage from "@assets/newYearPopup_optimized.jpg";
import characterImage from "@assets/KakaoTalk_20251226_135549799_1766724973553.png";
import effortCharacterImage from "@assets/KakaoTalk_20251226_152116391_1766730095506.png";
import stepsCharacterImage from "@assets/KakaoTalk_20251226_164036756_1766734877281.png";
import butterflyCharacterImage from "@assets/KakaoTalk_20251226_134433821_1766724285654.png";

export default function Home() {
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<"analysis" | "naming">("analysis");
  const [analysisDetailOpen, setAnalysisDetailOpen] = useState(false);
  const [showChristmasPopup, setShowChristmasPopup] = useState(false); // 팝업 비활성화
  const isClosingFromBackButton = useRef(false);
  const dialogOpenRef = useRef(false);
  const analysisDetailOpenRef = useRef(false);
  const referrerPage = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoIndex, setVideoIndex] = useState(0);
  const videoIndexRef = useRef(0);
  const videoPlaylist = [
    "/objects/uploads/video-2.mp4",
    "/objects/uploads/video-3.mp4",
    "/objects/uploads/video-1.mp4",
  ];

  // 스크롤 위치 복원 (뒤로가기 시)
  useScrollRestore("/");

  // 크리스마스 팝업 3초 후 자동 닫기
  useEffect(() => {
    if (showChristmasPopup) {
      const timer = setTimeout(() => {
        setShowChristmasPopup(false);
        try { sessionStorage.setItem('christmasPopupShown', 'true'); } catch {}
        try { window.history.replaceState({ ...window.history.state, popupShown: true }, ''); } catch {}
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showChristmasPopup]);

  const closeChristmasPopup = () => {
    setShowChristmasPopup(false);
    try { sessionStorage.setItem('christmasPopupShown', 'true'); } catch {}
    // 인앱 브라우저용: history.state에도 기록
    try { 
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

  // 영상 변경 시 자동 재생 (초기 렌더링은 IntersectionObserver가 처리)
  useEffect(() => {
    if (videoIndexRef.current === videoIndex) return; // 초기 렌더링 스킵
    videoIndexRef.current = videoIndex;
    const video = videoRef.current;
    if (!video) return;
    video.load();
    const playWhenReady = () => {
      video.play().catch(err => console.log('다음 영상 재생 실패:', err));
    };
    video.addEventListener('canplay', playWhenReady, { once: true });
    return () => video.removeEventListener('canplay', playWhenReady);
  }, [videoIndex]);

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
        // referrer 페이지로 이동 (스크롤 위치 복원용 파라미터 추가)
        if (fromPage) {
          setTimeout(() => {
            const restoreUrl = fromPage.includes('?') ? `${fromPage}&restore=cards` : `${fromPage}?restore=cards`;
            setLocation(restoreUrl);
            // referrer 정보 초기화 (한 번 사용 후 삭제)
            referrerPage.current = null;
          }, 0);
        }
      }
      // consultation이 열려있고, state가 consultation이 아니면 닫음
      else if (dialogOpenRef.current && modalState !== "consultation") {
        isClosingFromBackButton.current = true;
        setDialogOpen(false);
        // referrer 페이지로 이동 (스크롤 위치 복원용 파라미터 추가)
        if (fromPage) {
          setTimeout(() => {
            const restoreUrl = fromPage.includes('?') ? `${fromPage}&restore=cards` : `${fromPage}?restore=cards`;
            setLocation(restoreUrl);
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
      
      // referrer 페이지로 이동 (스크롤 위치 복원용 파라미터 추가)
      if (fromPage) {
        setTimeout(() => {
          const restoreUrl = fromPage.includes('?') ? `${fromPage}&restore=cards` : `${fromPage}?restore=cards`;
          setLocation(restoreUrl);
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
      
      // referrer 페이지로 이동 (스크롤 위치 복원용 파라미터 추가)
      if (fromPage) {
        setTimeout(() => {
          const restoreUrl = fromPage.includes('?') ? `${fromPage}&restore=cards` : `${fromPage}?restore=cards`;
          setLocation(restoreUrl);
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

      <KnaDangerSection />

      <KnaValueSection />

      <KnaIntroBlock />

      <KnaStepsSection />

      <KnaMythTruthSection />

      {/* 동영상 섹션 with overlay butterfly character */}
      <div className="relative">
        {/* 나비 캐릭터 제거됨 */}
        <section className="kna-video-section pt-24 pb-24 lg:pt-48 lg:pb-48 lg:min-h-screen lg:flex lg:flex-col lg:justify-center">
          <div className="max-w-md mx-auto px-4 sm:px-6 lg:max-w-none lg:px-0 lg:flex lg:flex-col lg:items-center lg:justify-center lg:h-full">
            <video
              ref={videoRef}
              className="w-full h-auto rounded-lg shadow-lg lg:rounded-none lg:shadow-none lg:h-[calc(100vh-160px)] lg:w-auto lg:max-w-full"
              controls
              playsInline
              muted
              preload="metadata"
              controlsList="nodownload"
              data-testid="video-promotion"
              src={videoPlaylist[videoIndex]}
              onEnded={() => setVideoIndex(i => (i + 1) % videoPlaylist.length)}
            >
              동영상을 재생할 수 없습니다. 브라우저가 MP4 형식을 지원하지 않습니다.
            </video>
            
            <div className="text-center mt-6 lg:mt-4">
              <p className="text-sm md:text-base font-semibold text-foreground">
                Founder & CEO 안서호
              </p>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">
                한국이름학교 | 와츠유어네임 이름연구협회
              </p>
            </div>
          </div>
        </section>
      </div>

      <KnaPricingSection />

      <Footer />

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="w-full h-full max-w-full max-h-full sm:!top-[80px] sm:!translate-y-0 sm:!h-[calc(100vh-80px)] sm:max-w-[700px] overflow-hidden rounded-none sm:rounded-t-none sm:rounded-b-lg !p-0">
          <ConsultationForm 
            type={dialogType}
            onSuccess={closeDialog}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={analysisDetailOpen} onOpenChange={(open) => { if (!open) closeAnalysisDetail(); }}>
        <DialogContent className="z-[210] w-full h-full max-w-full max-h-full sm:!top-[80px] sm:!translate-y-0 sm:!h-[calc(100vh-80px)] overflow-y-auto overflow-x-hidden bg-neutral-950 text-white border-white/20 !p-0 inset-0 !translate-x-0 !translate-y-0 rounded-none">
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
                  <CheckCircle className="hidden md:block h-[22px] w-[22px] shrink-0 text-[#81D8D0]" aria-hidden="true" />
                  <div>
                    <h4 className="mb-1 text-[21px] md:text-[22px] font-semibold flex items-center gap-3">
                      <CheckCircle className="h-[21px] w-[21px] md:hidden shrink-0 text-[#81D8D0]" aria-hidden="true" />
                      타고난 강점과 자질
                    </h4>
                    <p className="text-lg md:text-lg leading-relaxed text-white/70">
                      선천적 재능과 성격적 특성을 구체적으로 분석합니다.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row md:items-center md:gap-6" data-testid="content-item-2">
                  <MapPin className="hidden md:block h-[22px] w-[22px] shrink-0 text-[#81D8D0]" aria-hidden="true" />
                  <div>
                    <h4 className="mb-1 text-[21px] md:text-[22px] font-semibold flex items-center gap-3">
                      <MapPin className="h-[21px] w-[21px] md:hidden shrink-0 text-[#81D8D0]" aria-hidden="true" />
                      인생 방향성
                    </h4>
                    <p className="text-lg md:text-lg leading-relaxed text-white/70">
                      어떤 일을 할 때 성공하는지, 어떤 선택이 유리한지 명확히 제시합니다.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row md:items-center md:gap-6" data-testid="content-item-3">
                  <TriangleAlert className="hidden md:block h-[22px] w-[22px] shrink-0 text-[#81D8D0]" aria-hidden="true" />
                  <div>
                    <h4 className="mb-1 text-[21px] md:text-[22px] font-semibold flex items-center gap-3">
                      <TriangleAlert className="h-[21px] w-[21px] md:hidden shrink-0 text-[#81D8D0]" aria-hidden="true" />
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
              
              <div className="bg-neutral-900 rounded-2xl shadow-sm border border-white/10 p-6 md:p-8">
                <h3 className="text-[21px] md:text-2xl font-bold mb-2 text-white">
                  이름상담
                </h3>
                <p className="text-base text-white/70 mb-6">
                  예약부터 상담까지, 단계별로 명확하게 안내드립니다.
                </p>

                <div className="relative">
                  <ol className="space-y-3 md:space-y-4">
                    {/* Step 01 */}
                    <li
                      className="group relative rounded-2xl border bg-neutral-800 p-4 md:p-5 shadow-sm transition md:hover:shadow-md border-white/10"
                      data-testid="process-step-1"
                    >
                      <div className="flex items-start gap-3 md:gap-4">
                        <div className="relative z-10 flex h-8 w-8 md:h-9 md:w-9 flex-none items-center justify-center rounded-full border bg-neutral-800 text-[#56D5DB] border-[#56D5DB]/40 text-sm font-bold">
                          01
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                            <p className="text-lg font-semibold text-white">상담 일정 예약</p>
                          </div>
                          <ul className="mt-3 space-y-1.5 md:space-y-2">
                            <li className="flex items-start gap-3">
                              <span className="mt-0.5 inline-block w-px flex-none h-4 bg-[#56D5DB]/60" />
                              <p className="text-base leading-relaxed text-white/70">신청서 접수 및 입금 확인 후 예약 확정</p>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </li>

                    {/* Step 02 - Core */}
                    <li
                      className="group relative rounded-2xl border bg-[#56D5DB]/10 p-4 md:p-5 shadow-md transition md:hover:shadow-[0_0_0_3px_rgba(86,213,219,0.15)] border-[#56D5DB]/30"
                      data-testid="process-step-2"
                    >
                      <div className="flex items-start gap-3 md:gap-4">
                        <div className="relative z-10 flex h-8 w-8 md:h-9 md:w-9 flex-none items-center justify-center rounded-full border bg-[#56D5DB] text-white border-[#56D5DB] text-sm font-bold">
                          02
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                            <span className="inline-flex items-center rounded-full bg-[#56D5DB]/20 px-2.5 py-1 text-[11px] font-semibold text-[#58C4C4]">
                              핵심 상담 과정
                            </span>
                            <p className="text-lg font-semibold text-white">이름분석표(PDF) 발송</p>
                          </div>
                          <ul className="mt-3 space-y-1.5 md:space-y-2">
                            <li className="flex items-start gap-3">
                              <span className="mt-0.5 inline-block w-px flex-none h-5 bg-[#56D5DB]" />
                              <p className="text-base leading-relaxed text-white/70">상담 시작 직전 발송</p>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </li>

                    {/* Step 03 - Core */}
                    <li
                      className="group relative rounded-2xl border bg-[#56D5DB]/10 p-4 md:p-5 shadow-md transition md:hover:shadow-[0_0_0_3px_rgba(86,213,219,0.15)] border-[#56D5DB]/30"
                      data-testid="process-step-3"
                    >
                      <div className="flex items-start gap-3 md:gap-4">
                        <div className="relative z-10 flex h-8 w-8 md:h-9 md:w-9 flex-none items-center justify-center rounded-full border bg-[#56D5DB] text-white border-[#56D5DB] text-sm font-bold">
                          03
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                            <span className="inline-flex items-center rounded-full bg-[#56D5DB]/20 px-2.5 py-1 text-[11px] font-semibold text-[#58C4C4]">
                              핵심 상담 과정
                            </span>
                            <p className="text-lg font-semibold text-white">1:1 전화 상담 진행</p>
                          </div>
                          <ul className="mt-3 space-y-1.5 md:space-y-2">
                            <li className="flex items-start gap-3">
                              <span className="mt-0.5 inline-block w-px flex-none h-5 bg-[#56D5DB]" />
                              <p className="text-base leading-relaxed text-white/70">분석표를 토대로 심층 상담</p>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
