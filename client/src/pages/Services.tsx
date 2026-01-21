import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ServiceCard } from "@/components/ServiceCard";
import { NameAnalysisPhone } from "@/components/NameAnalysisPhone";
import { ConsultationForm } from "@/components/ConsultationForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { Card } from "@/components/ui/card";
import { X } from "lucide-react";
import { Search, Star, Flower, Baby, Building, Layers, Compass, Clock, CheckCircle, TriangleAlert, MapPin, Heart, LifeBuoy, Zap } from "lucide-react";
import { useLocation } from "wouter";
import { useEffect, useState, useRef } from "react";
import servicesCharacterImage from "@assets/KakaoTalk_20251226_140639616_1766725668691.png";

export default function Services() {
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<"analysis" | "naming">("analysis");
  const [analysisDetailOpen, setAnalysisDetailOpen] = useState(false);
  const [familyPolicyOpen, setFamilyPolicyOpen] = useState(false);
  
  // 뒤로 가기 버튼 처리를 위한 ref
  const dialogOpenRef = useRef(false);
  const analysisDetailOpenRef = useRef(false);
  const isClosingFromBackButton = useRef(false);
  const scrollBeforeProcess = useRef<number | null>(null);

  // 페이지 진입 시 스크롤 탑 (단, 뒤로가기가 아닌 경우에만)
  useEffect(() => {
    // history.state에 스크롤 위치가 없으면 새 방문으로 판단하고 스크롤 탑
    if (!window.history.state?.scrollY) {
      window.scrollTo(0, 0);
    }
  }, []);

  // ref를 state와 동기화
  useEffect(() => {
    dialogOpenRef.current = dialogOpen;
  }, [dialogOpen]);

  useEffect(() => {
    analysisDetailOpenRef.current = analysisDetailOpen;
  }, [analysisDetailOpen]);

  // 뒤로 가기 버튼 처리
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const modalState = event.state?.modal;
      
      if (analysisDetailOpenRef.current) {
        isClosingFromBackButton.current = true;
        setAnalysisDetailOpen(false);
      } else if (dialogOpenRef.current) {
        // consultation 상태면 닫지 않음
        if (modalState === "consultation") {
          return;
        }
        isClosingFromBackButton.current = true;
        setDialogOpen(false);
      } else if (event.state?.scrollPosition !== undefined) {
        // 진행과정 보기에서 뒤로 가기 - 저장된 스크롤 위치로 복원
        window.scrollTo({ top: event.state.scrollPosition, behavior: "instant" });
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
  
  const openDialog = (type: "analysis" | "naming") => {
    setDialogType(type);
    setDialogOpen(true);
    window.history.pushState({ modal: "consultation" }, "");
  };

  const closeDialog = () => {
    setDialogOpen(false);
    if (!isClosingFromBackButton.current) {
      window.history.back();
    }
    isClosingFromBackButton.current = false;
  };

  const openAnalysisDetail = () => {
    setAnalysisDetailOpen(true);
    window.history.pushState({ modal: "analysisDetail" }, "");
  };

  const closeAnalysisDetail = () => {
    setAnalysisDetailOpen(false);
    if (!isClosingFromBackButton.current) {
      window.history.back();
    }
    isClosingFromBackButton.current = false;
  };
  
  // 페이지 진입 시 스크롤 처리 (모달에서 돌아올 때는 카드 영역으로)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const restore = params.get('restore');
    
    if (restore === 'cards') {
      // URL에서 restore 파라미터 제거 (깔끔하게)
      window.history.replaceState(null, "", "/services");
      // 카드 영역으로 스크롤 (약간 위쪽으로 보이게)
      setTimeout(() => {
        const cardsSection = document.querySelector('[data-testid="card-service-0"]');
        if (cardsSection) {
          const rect = cardsSection.getBoundingClientRect();
          const scrollTop = window.pageYOffset + rect.top - 150; // 150px 위쪽 여백
          window.scrollTo({ top: scrollTop, behavior: 'instant' });
        }
      }, 50);
    } else {
      window.scrollTo(0, 0);
    }
  }, []);
  
  useEffect(() => {
    // User Agent로 인앱 브라우저 감지
    const userAgent = navigator.userAgent || '';
    const isInstagram = userAgent.includes('Instagram');
    const isTikTok = userAgent.includes('TikTok') || userAgent.includes('musical_ly');
    
    if (isInstagram || isTikTok) {
      const className = isInstagram ? "ua-instagram" : "ua-tiktok";
      document.documentElement.classList.add(className);
      
      const styleId = `inapp-style-${className}`;
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
          html.${className} {
            font-size: 14px !important;
          }
          html.${className} h1 {
            font-size: clamp(18px, 4.5vw, 22px) !important;
          }
          html.${className} h2 {
            font-size: clamp(16px, 4vw, 20px) !important;
          }
          html.${className} h3, html.${className} h4 {
            font-size: clamp(15px, 3.8vw, 18px) !important;
          }
          html.${className} p, html.${className} li, html.${className} span {
            font-size: 14px !important;
          }
          html.${className} .text-sm {
            font-size: 13px !important;
          }
          html.${className} .text-base {
            font-size: 14px !important;
          }
          html.${className} .text-lg {
            font-size: 14px !important;
          }
          html.${className} .text-xl {
            font-size: 15px !important;
          }
          html.${className} .text-2xl {
            font-size: 16px !important;
          }
          html.${className} .text-3xl {
            font-size: 18px !important;
          }
          html.${className} .text-4xl {
            font-size: 20px !important;
          }
          html.${className} [data-testid="text-process-title"] {
            font-size: clamp(20px, 5vw, 24px) !important;
          }
          html.${className} button {
            font-size: 13px !important;
          }
          /* 핵심 상담/작명 과정 뱃지 - 82% 적용 (11px × 0.82 = 9px) */
          html.${className} [data-testid^="process-consultation-step"] .text-\\[11px\\],
          html.${className} [data-testid^="process-rename-step"] .text-\\[11px\\] {
            font-size: 9px !important;
          }
          /* 서비스 카드 버튼들 - 82% 적용 */
          html.${className} [data-testid^="button-service-"] {
            font-size: 11px !important;
            padding: 3px 13px !important;
          }
        `;
        document.head.appendChild(style);
      }
      
      console.log(`[Services] 인앱 브라우저 감지: ${className}, User Agent: ${userAgent}`);
      
      return () => {
        document.documentElement.classList.remove(className);
        const styleElement = document.getElementById(styleId);
        if (styleElement) {
          styleElement.remove();
        }
      };
    }
  }, []);
  
  const nameConsultationSteps = [
    {
      no: "01",
      title: "상담 일정 예약",
      bullets: ["신청서 접수 및 입금 확인 후 예약 확정"],
    },
    { 
      no: "02", 
      title: "이름분석표(PDF) 발송", 
      bullets: ["상담 시작 직전 발송"],
    },
    { 
      no: "03", 
      title: "1:1 전화 상담 진행", 
      bullets: ["분석표를 토대로 심층 상담"],
    }
  ];

  const isConsultCore = (idx: number) => idx === 1 || idx === 2; // 02, 03번이 핵심

  const renameSteps = [
    {
      no: "01",
      title: "개명 비용 결제 및 맞춤 작명 착수",
      bullets: [
        "결제 완료 즉시, 기존 이름의 운과 상담 내용을 바탕으로 맞춤 작명에 착수",
      ],
    },
    {
      no: "02",
      title: "희망사항 제출 (최대 10가지)",
      bullets: ["결제 후 1주 이내 제출"],
    },
    {
      no: "03",
      title: "정밀 작명 및 검토",
      bullets: [
        "희망사항을 반영한 심층 작명",
        "개인 약 1개월 / 가족 약 2개월 소요",
      ],
    },
    {
      no: "04",
      title: "새 이름 제안 및 심층 전화 상담",
      bullets: ["완성된 이름 평균 3개 제안", "이름운 직접 상세 설명"],
    },
    {
      no: "05",
      title: "한글 이름 최종 선택",
      bullets: ["제안된 후보 중 고객 직접 선택"],
    },
    {
      no: "06",
      title: "작명서(PDF) 발송",
      bullets: ["선택된 이름의 한자 및 상세 해설이 포함된 작명서 제공"],
    },
  ];

  const isRenameCore = (idx: number) => idx >= 1 && idx <= 3; // 02~04

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      {/* Hero Section with character on left */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0f766e] to-[#4fd1c5] dark:from-[#0a5850] dark:to-[#3ba89e] py-16 md:py-24">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzBoLTR2NGg0di00em0wLThoLTR2NGg0di00em04IDhoLTR2NGg0di00em0tOCA4aC00djRoNHYtNHptOCAwaC00djRoNHYtNHptMC04aC00djRoNHYtNHptOC04aC00djRoNHYtNHptMCA4aC00djRoNHYtNHptLTggMGgtNHY0aDR2LTR6bTggOGgtNHY0aDR2LTR6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-20"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12">
            <img 
              src={servicesCharacterImage}
              alt="서비스 안내 캐릭터"
              className="w-auto h-40 md:h-56 flex-shrink-0"
            />
            <div className="text-center md:text-left">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white mb-6" data-testid="text-services-title">
                전문적인 이름 서비스
              </h1>
              <p className="text-xl md:text-2xl text-white/90">
                고달픈 인생,<br />
                이름 하나로 이유와 해결책을
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3D Name Analysis Phone */}
      <NameAnalysisPhone />

      {/* Professional Services */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-left mb-12">
          <p className="text-sm font-medium tracking-wide text-gray-500 dark:text-gray-400 mb-2">PREMIUM SERVICES</p>
          <h2 className="bg-gradient-to-r from-[#0f766e] to-[#4fd1c5] dark:from-[#58C4C4] dark:to-[#6DD4D4] bg-clip-text text-[25px] font-extrabold leading-tight text-transparent sm:text-3xl md:text-4xl">
            진단부터 작명까지, 통합 이름 솔루션
          </h2>
          <button
            onClick={() => {
              // 현재 스크롤 위치 저장 후 히스토리 추가
              const currentScroll = window.scrollY;
              window.history.pushState({ scrollPosition: currentScroll }, "");
              
              const el = document.getElementById("process-section");
              if (el) {
                el.scrollIntoView({ behavior: "instant" });
              }
            }}
            className="mt-6 inline-flex items-center gap-1.5 px-4 py-1 rounded-full font-semibold text-sm bg-[#F1FAEE] text-[#0b7f82] shadow-sm transition-all duration-200 hover:bg-[#e5f4e0] hover:shadow-md active:scale-[0.98]"
            data-testid="button-view-process"
          >
            진행과정 보기 <span className="text-base">›</span>
          </button>
        </div>
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              <ServiceCard
              icon={Search}
              title="이름분석"
              description="현재 이름에 들어있는 16가지운을 전문적으로 분석해드립니다."
              buttonText="신청하기"
              onClick={() => openDialog("analysis")}
              secondaryButtonText="자세히 보기"
              onSecondaryClick={() => openAnalysisDetail()}
              data-testid="card-service-0"
            />
            <ServiceCard
              icon={Star}
              title="이름감명"
              description="타 작명소에서 받은 이름의 적합도를 점검해드립니다"
              buttonText="신청하기"
              onClick={() => openDialog("naming")}
              data-testid="card-service-1"
            />
            <ServiceCard
              icon={Flower}
              title="개명"
              description="운이 술술 풀리는 개명을 위한 상담과 절차를 안내해드립니다."
              buttonText="자세히 보기"
              onClick={() => window.open("https://blog.naver.com/whats_ur_name_777/221277653666", "_blank")}
              data-testid="card-service-2"
            />
            <ServiceCard
              icon={Baby}
              title="신생아 작명"
              description="가족 모두가 행복해지는 아가이름을 위한 상담과 절차를 안내해드립니다."
              buttonText="자세히 보기"
              onClick={() => window.open("https://blog.naver.com/whats_ur_name_777/221277647598", "_blank")}
              data-testid="card-service-3"
            />
            <ServiceCard
              icon={Building}
              title="상호작명"
              description="부자되는 상호작명을 위한 상담과 절차를 안내해드립니다."
              buttonText="자세히 보기"
              onClick={() => window.open("https://blog.naver.com/whats_ur_name_777/221274436174", "_blank")}
              data-testid="card-service-4"
            />
            </div>
          </div>
        </section>

      {/* Process Section */}
      <section id="process-section" className="py-16 md:py-24 bg-slate-50 dark:bg-slate-900/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-left mb-12">
            <p className="text-sm font-medium tracking-wide text-gray-500 dark:text-gray-400 mb-2">HOW IT WORKS</p>
            <h2 className="bg-gradient-to-r from-[#0f766e] to-[#4fd1c5] dark:from-[#58C4C4] dark:to-[#6DD4D4] bg-clip-text text-[25px] font-extrabold leading-tight text-transparent sm:text-3xl md:text-4xl" data-testid="text-process-title">
              진행 과정
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-10">
            {/* 이름상담 진행과정 */}
            <div className="bg-white dark:bg-slate-800/50 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 p-6 md:p-8" data-testid="card-process-consultation">
              <h3 className="text-[21px] md:text-2xl font-bold mb-2">
                이름상담
              </h3>
              <p className="text-base text-muted-foreground mb-6">
                예약부터 상담까지, 단계별로 명확하게 안내드립니다.
              </p>

              <div className="relative">
                <div className="absolute left-[16px] md:left-[18px] top-2 h-[calc(100%-8px)] w-px bg-slate-200 dark:bg-slate-600" />

                <ol className="space-y-3 md:space-y-4">
                  {nameConsultationSteps.map((s, idx) => (
                    <li
                      key={s.no}
                      className={`group relative rounded-2xl border bg-white dark:bg-slate-800 p-4 md:p-5 shadow-sm transition ${
                        isConsultCore(idx)
                          ? "md:hover:shadow-[0_0_0_3px_rgba(86,213,219,0.15)] border-[#56D5DB]/30 bg-[#56D5DB]/[0.06] dark:bg-[#56D5DB]/10 shadow-md"
                          : "md:hover:shadow-md border-slate-200 dark:border-slate-600"
                      }`}
                      data-testid={`process-consultation-step-${idx + 1}`}
                    >
                      <div className="flex items-start gap-3 md:gap-4">
                        <div
                          className={`relative z-10 flex h-8 w-8 md:h-9 md:w-9 flex-none items-center justify-center rounded-full border text-sm font-bold ${
                            isConsultCore(idx)
                              ? "bg-[#56D5DB] text-white border-[#56D5DB]"
                              : "bg-white dark:bg-slate-800 text-[#56D5DB] border-[#56D5DB]/40"
                          }`}
                        >
                          {s.no}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                            {isConsultCore(idx) && (
                              <span className="inline-flex items-center rounded-full bg-[#56D5DB]/15 px-2.5 py-1 text-[11px] font-semibold text-[#0b7f82] dark:text-[#58C4C4]">
                                핵심 상담 과정
                              </span>
                            )}
                            <p className="text-lg font-semibold text-foreground">{s.title}</p>
                          </div>

                          <ul className="mt-3 space-y-1.5 md:space-y-2">
                            {s.bullets.map((b, i) => (
                              <li key={i} className="flex items-start gap-3">
                                <span
                                  className={`mt-0.5 inline-block w-px flex-none ${
                                    isConsultCore(idx)
                                      ? "h-5 bg-[#56D5DB]"
                                      : "h-4 bg-[#56D5DB]/60"
                                  }`}
                                />
                                <p className="text-base leading-relaxed text-muted-foreground">{b}</p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            {/* 개명 진행 과정 */}
            <div className="bg-white dark:bg-slate-800/50 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 p-6 md:p-8" data-testid="card-process-rename">
              <h3 className="text-[21px] md:text-2xl font-bold mb-2">
                개명
              </h3>
              <p className="text-base text-muted-foreground mb-6">
                결제부터 작명서 발송까지, 단계별로 명확하게 안내드립니다.
              </p>

              <div className="relative">
                <div className="absolute left-[16px] md:left-[18px] top-2 h-[calc(100%-8px)] w-px bg-slate-200 dark:bg-slate-600" />

                <ol className="space-y-3 md:space-y-4">
                  {renameSteps.map((s, idx) => (
                    <li
                      key={s.no}
                      className={`group relative rounded-2xl border bg-white dark:bg-slate-800 p-4 md:p-5 shadow-sm transition ${
                        isRenameCore(idx)
                          ? "md:hover:shadow-[0_0_0_3px_rgba(86,213,219,0.15)]"
                          : "md:hover:shadow-md"
                      } ${
                        idx === 2
                          ? "border-[#56D5DB]/30 bg-[#56D5DB]/[0.06] dark:bg-[#56D5DB]/10 shadow-md"
                          : "border-slate-200 dark:border-slate-600"
                      }`}
                      data-testid={`process-rename-step-${idx + 1}`}
                    >
                      <div className="flex items-start gap-3 md:gap-4">
                        <div
                          className={`relative z-10 flex h-8 w-8 md:h-9 md:w-9 flex-none items-center justify-center rounded-full border text-sm font-bold ${
                            isRenameCore(idx)
                              ? "bg-[#56D5DB] text-white border-[#56D5DB]"
                              : "bg-white dark:bg-slate-800 text-[#56D5DB] border-[#56D5DB]/40"
                          }`}
                        >
                          {s.no}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                            {isRenameCore(idx) && (
                              <span className="inline-flex items-center rounded-full bg-[#56D5DB]/15 px-2.5 py-1 text-[11px] font-semibold text-[#0b7f82] dark:text-[#58C4C4]">
                                핵심 작명 과정
                              </span>
                            )}
                            <p className="text-lg font-semibold text-foreground">{s.title}</p>
                          </div>

                          <ul className="mt-3 space-y-1.5 md:space-y-2">
                            {s.bullets.map((b, i) => (
                              <li key={i} className="flex items-start gap-3">
                                <span
                                  className={`mt-0.5 inline-block w-px flex-none ${
                                    isRenameCore(idx)
                                      ? "h-5 bg-[#56D5DB]"
                                      : "h-4 bg-[#56D5DB]/60"
                                  }`}
                                />
                                <p className="text-base leading-relaxed text-muted-foreground">{b}</p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="mt-6 md:mt-8 rounded-2xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 p-4 md:p-5">
                <p className="text-base font-semibold text-foreground">안내</p>
                <p className="mt-1 text-base leading-relaxed text-muted-foreground">
                  진행 기간은 제출 내용 및 검토 범위에 따라 일부 변동될 수 있습니다.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />

      {/* 상담 신청 모달 */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="w-full h-full max-w-full max-h-full !top-0 sm:!top-[80px] !translate-y-0 sm:!h-[calc(100vh-80px)] sm:max-w-[700px] overflow-y-auto !p-4 sm:!p-6 inset-0 !translate-x-0 !left-0 sm:!left-[50%] sm:!translate-x-[-50%] rounded-none sm:rounded-t-none sm:rounded-b-lg z-[300]" aria-describedby={undefined}>
          <DialogHeader className="sr-only">
            <DialogTitle>{dialogType === "analysis" ? "이름분석 상담 신청" : "이름감명 상담 신청"}</DialogTitle>
          </DialogHeader>
          <ConsultationForm 
            type={dialogType}
            onSuccess={closeDialog}
            onOpenFamilyPolicy={() => setFamilyPolicyOpen(true)}
          />
        </DialogContent>
      </Dialog>

      {/* 이름분석 자세히 보기 모달 */}
      <Sheet open={analysisDetailOpen} onOpenChange={(open) => { if (!open) closeAnalysisDetail(); }}>
        <SheetContent 
          side="right"
          className="analysis-detail-sheet z-[10001] w-full sm:max-w-[725px] sm:w-[725px] overflow-y-auto overflow-x-hidden bg-[#0A0D11] text-white border-l border-white/10 !p-0"
          aria-describedby={undefined}>
          <SheetHeader className="sr-only">
            <SheetTitle>이름분석 운명상담 안내</SheetTitle>
          </SheetHeader>
          
          {/* Fixed Header */}
          <div className="sticky top-0 z-10 px-6 py-6 sm:px-8 bg-[#0A0D11]/95 backdrop-blur flex items-start justify-between">
            <div>
              <h1 className="text-[22px] sm:text-[26px] font-bold text-[#56D5DB] tracking-tight" data-testid="section-title">
                이름분석 운명상담이란
              </h1>
              <p className="mt-2 text-[17px] leading-relaxed text-white/65">
                사주 없이 한글·한자 이름에 내재된 운명의 흐름을, 체계적으로 해석하는 전문 상담 서비스입니다.
              </p>
            </div>
            <SheetClose className="group -mr-2 ml-4 p-2 rounded-md text-white/40 hover:text-white focus:outline-none transition-colors">
              <span className="sr-only">닫기</span>
              <X className="h-6 w-6 group-hover:rotate-90 transition-transform duration-300" />
            </SheetClose>
          </div>

          {/* Scrollable Content */}
          <div className="px-6 py-8 sm:px-8" data-testid="name-analysis-root">
            {/* 분석 범위 - 3 Cards */}
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-6 mb-12" data-testid="analysis-scope">
              <div className="group" data-testid="scope-card-1">
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#56D5DB]/10 text-[#56D5DB]">
                  <Layers className="h-6 w-6" aria-hidden="true" />
                </div>
                <h3 className="text-[19px] font-semibold tracking-tight text-white group-hover:text-[#56D5DB] transition-colors">
                  16가지 세부 운세<br />종합 분석
                </h3>
                <p className="mt-2 text-[17px] leading-relaxed text-white/65">
                  수리운·주역괘운의 세밀한 분석을 통해 인생의 총체적 방향을 진단합니다.
                </p>
              </div>
              <div className="group" data-testid="scope-card-2">
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#56D5DB]/10 text-[#56D5DB]">
                  <Compass className="h-6 w-6" aria-hidden="true" />
                </div>
                <h3 className="text-[19px] font-semibold tracking-tight text-white group-hover:text-[#56D5DB] transition-colors">
                  7개 인생 시기별 운의<br />흐름 파악
                </h3>
                <p className="mt-2 text-[17px] leading-relaxed text-white/65">
                  초년·중년·말년 등 7개 시기를 분석하여 시기별 강점과 전환점을 명확히 제시합니다.
                </p>
              </div>
              <div className="group" data-testid="scope-card-3">
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#56D5DB]/10 text-[#56D5DB]">
                  <Clock className="h-6 w-6" aria-hidden="true" />
                </div>
                <h3 className="text-[19px] font-semibold tracking-tight text-white group-hover:text-[#56D5DB] transition-colors">
                  과거·현재·미래<br />정밀 진단
                </h3>
                <p className="mt-2 text-[17px] leading-relaxed text-white/65">
                  지나온 일, 현재 처한 상황, 다가올 운을 세밀히 파악합니다.
                </p>
              </div>
            </div>

            {/* Divider */}
            <div className="my-10 h-px bg-white/10"></div>

            {/* Two Column Layout - 상담 내용 & 진행 과정 */}
            <div className="grid gap-12 lg:grid-cols-2">
              {/* 상담 내용 */}
              <div data-testid="consulting-content">
                <h2 className="text-[24px] sm:text-[26px] font-semibold tracking-tight text-[#56D5DB] mb-6">
                  상담 내용
                </h2>
                <div className="space-y-8 pl-1">
                  <div className="group" data-testid="content-item-0">
                    <h3 className="text-[19px] font-bold text-white mb-1.5">고민 원인 분석</h3>
                    <p className="text-[17px] leading-relaxed text-white/65">
                      이름 분석 데이터를 바탕으로 현재 겪고 있는 문제의 근본 원인을 명확하게 진단합니다.
                    </p>
                  </div>
                  <div className="group" data-testid="content-item-1">
                    <h3 className="text-[19px] font-bold text-white mb-1.5">타고난 강점과 자질</h3>
                    <p className="text-[17px] leading-relaxed text-white/65">
                      선천적 재능과 특징 그리고 성격적 특성을 구체적으로 분석합니다.
                    </p>
                  </div>
                  <div className="group" data-testid="content-item-2">
                    <h3 className="text-[19px] font-bold text-white mb-1.5">인생 방향성</h3>
                    <p className="text-[17px] leading-relaxed text-white/65">
                      어떤 일을 할 때 성공하는지, 어떤 선택이 유리한지 명확히 제시합니다.
                    </p>
                  </div>
                  <div className="group" data-testid="content-item-3">
                    <h3 className="text-[19px] font-bold text-white mb-1.5">주의해야 할 흉운</h3>
                    <p className="text-[17px] leading-relaxed text-white/65">
                      발전을 저해하는 장애 요소와 극복 방안을 제시합니다.
                    </p>
                  </div>
                </div>
              </div>

              {/* 진행 과정 */}
              <div data-testid="process-flow">
                <h2 className="text-[24px] sm:text-[26px] font-semibold tracking-tight text-[#56D5DB] mb-6">
                  진행 과정
                </h2>
                <div className="space-y-8">
                  {/* Step 01 */}
                  <div className="flex items-start gap-5" data-testid="process-step-1">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-[#56D5DB]">01</div>
                    <div className="pt-0.5 w-full">
                      <div className="text-[19px] font-bold text-white mb-1.5">상담 일정 예약</div>
                      <div className="flex gap-3">
                        <div className="mt-1.5 h-[15px] w-[3px] shrink-0 rounded-full bg-[#56D5DB]"></div>
                        <div className="text-[17px] leading-relaxed text-white/60">
                          신청서 접수 및 입금 확인 후 예약 확정
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 02 - Core */}
                  <div className="flex items-start gap-5" data-testid="process-step-2">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#56D5DB] text-sm font-bold text-white">02</div>
                    <div className="pt-0.5 w-full">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="core-process-badge rounded-full bg-[#56D5DB]/[0.15] px-2 py-0.5 text-[11px] font-bold text-[#56D5DB]">
                          핵심 상담 과정
                        </span>
                      </div>
                      <div className="text-[19px] font-bold text-white mb-1.5">이름분석표(PDF) 발송</div>
                      <div className="flex gap-3">
                        <div className="mt-1.5 h-[15px] w-[3px] shrink-0 rounded-full bg-[#56D5DB]"></div>
                        <div className="text-[17px] leading-relaxed text-white/60">
                          상담 시작 직전 발송
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 03 - Core */}
                  <div className="flex items-start gap-5" data-testid="process-step-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#56D5DB] text-sm font-bold text-white">03</div>
                    <div className="pt-0.5 w-full">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="core-process-badge rounded-full bg-[#56D5DB]/[0.15] px-2 py-0.5 text-[11px] font-bold text-[#56D5DB]">
                          핵심 상담 과정
                        </span>
                      </div>
                      <div className="text-[19px] font-bold text-white mb-1.5">1:1 전화 상담 진행</div>
                      <div className="flex gap-3">
                        <div className="mt-1.5 h-[15px] w-[3px] shrink-0 rounded-full bg-[#56D5DB]"></div>
                        <div className="text-[17px] leading-relaxed text-white/60">
                          분석표를 토대로 심층 상담
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* 등본상 가족 상담 원칙 Sheet */}
      <Sheet open={familyPolicyOpen} onOpenChange={setFamilyPolicyOpen}>
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
              <linearGradient id="grad-aurora-1" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#56D5DB" />
                <stop offset="100%" stopColor="#7F5AF0" />
              </linearGradient>
              <linearGradient id="grad-aurora-2" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#4361EE" />
                <stop offset="100%" stopColor="#F72585" />
              </linearGradient>
            </defs>
          </svg>
          
          {/* Fixed Header - 고정 영역 */}
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

          {/* Scrollable Content - 스크롤 영역 */}
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

              {/* 첫번째 선 연결 애니메이션 */}
              <div className="relative h-20 w-full overflow-visible pointer-events-none">
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <path 
                    d="M 25 0 V 40 Q 25 45 20.85 45 H 16.7 Q 11.7 45 11.7 50 V 100" 
                    className="family-stripe-path" 
                    stroke="url(#grad-aurora-1)" 
                  />
                  <path 
                    d="M 75 0 V 40 Q 75 45 70 45 H 38.3 Q 33.3 45 33.3 50 V 100" 
                    className="family-stripe-path family-delay-top" 
                    stroke="url(#grad-aurora-1)" 
                  />
                </svg>
                <svg className="absolute inset-0 w-full h-full family-static-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <path 
                    d="M 25 0 V 40 Q 25 45 20.85 45 H 16.7 Q 11.7 45 11.7 50 V 100" 
                    fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    stroke="url(#grad-aurora-1)" 
                    style={{ vectorEffect: 'non-scaling-stroke' }}
                  />
                  <path 
                    d="M 75 0 V 40 Q 75 45 70 45 H 38.3 Q 33.3 45 33.3 50 V 100" 
                    fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    stroke="url(#grad-aurora-1)" 
                    style={{ vectorEffect: 'non-scaling-stroke' }}
                  />
                </svg>
              </div>

              {/* 중단 2개 카드 - 이름운, 에너지의 원리 */}
              <div className="grid gap-6 md:grid-cols-2 z-10 relative">
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
                        이름은 '소리'보다 '글자'가 강합니다
                      </p>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-white/10">
                    <p className="text-[17px] leading-relaxed text-white font-medium">
                      · 이름에는 소리 에너지도 있지만, 그보다 훨씬 강력한 것이 바로 글자 에너지입니다.<br />
                      · 소리 에너지는 말하는 순간 사라지지만, 글자 에너지는 폐기하기 전까지 계속 존재합니다.
                    </p>
                  </div>
                </article>
              </div>

              {/* 두번째 선 연결 애니메이션 */}
              <div className="relative h-20 w-full overflow-visible pointer-events-none">
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <path d="M 25 0 V 45 Q 25 50 30 50 H 45 Q 50 50 50 55 V 100" className="family-stripe-path family-delay-bottom" stroke="url(#grad-aurora-2)" />
                  <path d="M 75 0 V 45 Q 75 50 70 50 H 55 Q 50 50 50 55 V 100" className="family-stripe-path family-delay-bottom" stroke="url(#grad-aurora-2)" />
                </svg>
                <svg className="absolute inset-0 w-full h-full family-static-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <path d="M 25 0 V 45 Q 25 50 30 50 H 45 Q 50 50 50 55 V 100" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="url(#grad-aurora-2)" style={{ vectorEffect: 'non-scaling-stroke' }} />
                  <path d="M 75 0 V 45 Q 75 50 70 50 H 55 Q 50 50 50 55 V 100" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="url(#grad-aurora-2)" style={{ vectorEffect: 'non-scaling-stroke' }} />
                </svg>
              </div>

              {/* 결론 카드 */}
              <article className="family-card-bot rounded-2xl border-2 border-[#56D5DB]/30 bg-[#56D5DB]/[0.05] p-8 relative overflow-hidden shadow-[0_0_40px_-10px_rgba(86,213,219,0.15)] z-10">
                <div className="absolute inset-0 bg-gradient-to-b from-[#56D5DB]/5 to-transparent"></div>
                <div className="relative text-left">
                  <div className="inline-block rounded-full border border-[#56D5DB]/30 bg-[#56D5DB]/[0.15] px-3 py-1 text-[13px] font-bold text-[#56D5DB] mb-3">
                    핵심 결론
                  </div>
                  <h3 className="text-[19px] font-bold text-[#56D5DB] mb-4">
                    등본상 가족은 더 깊게 연결됩니다
                  </h3>
                  <p className="text-[17px] leading-relaxed text-white/80 mb-6">
                    법적 에너지권 안에서 글자 에너지로 깊게 연결된 등본상 가족은<br className="hidden sm:block" /> 
                    더욱 긴밀하며 상당한 영향을 미칩니다.
                  </p>
                  <div className="rounded-xl bg-[#0A0D11] border border-[#56D5DB]/30 p-5 shadow-inner">
                    <p className="text-[17px] font-bold text-[#56D5DB] text-center leading-relaxed">
                      "그래서 등본상 가족 전체의 이름분석을 진행하셔야<br className="hidden sm:block" /> 정확한 운명상담이 가능합니다."
                    </p>
                  </div>
                </div>
              </article>

              {/* 추천 글 섹션 */}
              <div className="mt-16 border-t border-white/10 pt-10">
                <h3 className="text-[19px] font-bold text-white mb-6 flex items-center gap-2">
                  <span className="inline-block w-1 h-5 bg-[#56D5DB] rounded-full"></span>
                  같이 보시면 좋은 글
                </h3>
                <div className="space-y-4">
                  <a 
                    href="https://blog.naver.com/whats_ur_name_777/223450662435" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block group rounded-xl bg-[#0A0D11] border border-white/10 p-5 hover:border-[#56D5DB]/50 transition-all shadow-md"
                    data-testid="link-blog-1"
                  >
                    <div className="flex items-start gap-4">
                      <span className="text-3xl filter grayscale group-hover:grayscale-0 transition-all">🤦‍♀️</span>
                      <div className="flex-1">
                        <h4 className="text-[17px] font-bold text-white group-hover:text-[#56D5DB] transition-colors leading-snug">
                          "아빠가 바람이 났습니다" <br className="sm:hidden" />
                          <span className="text-white/50 font-normal text-[15px] sm:ml-2">엄마 이름 때문에</span>
                        </h4>
                        <p className="mt-2 text-[15px] text-white/60 leading-relaxed line-clamp-2">
                          아빠가 바람이 났습니다. 네이버에 치면 나오는 유명인입니다. 아빠의 바람으로 집안이 엉망진창되었습니다...
                        </p>
                        <div className="mt-3 flex items-center text-[13px] font-bold text-[#56D5DB]/90 opacity-80 group-hover:opacity-100">
                          터치해서 전체 내용 보기
                          <svg className="w-3 h-3 ml-1 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                        </div>
                      </div>
                    </div>
                  </a>

                  <a 
                    href="https://blog.naver.com/whats_ur_name_777/223924993144" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block group rounded-xl bg-[#0A0D11] border border-white/10 p-5 hover:border-[#56D5DB]/50 transition-all shadow-md"
                    data-testid="link-blog-2"
                  >
                    <div className="flex items-start gap-4">
                      <span className="text-3xl filter grayscale group-hover:grayscale-0 transition-all">⚖️</span>
                      <div className="flex-1">
                        <h4 className="text-[17px] font-bold text-white group-hover:text-[#56D5DB] transition-colors leading-snug">
                          개명한 이름 때문에 아빠가 돌아가시고...
                        </h4>
                        <p className="mt-2 text-[15px] text-white/60 leading-relaxed line-clamp-2">
                          어느날 인스타로 디엠이 왔습니다. 너무 살기 힘들다며 죽고 싶다고까지 했습니다. 젊으신 분이 그러시면...
                        </p>
                        <div className="mt-3 flex items-center text-[13px] font-bold text-[#56D5DB]/90 opacity-80 group-hover:opacity-100">
                          터치해서 전체 내용 보기
                          <svg className="w-3 h-3 ml-1 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                        </div>
                      </div>
                    </div>
                  </a>
                </div>
              </div>

            </div>
            <div className="h-24"></div>
          </div>
        </SheetContent>
      </Sheet>

    </div>
  );
}
