import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ServiceCard } from "@/components/ServiceCard";
import { NameAnalysisPhone } from "@/components/NameAnalysisPhone";
import { ConsultationForm } from "@/components/ConsultationForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Star, Flower, Baby, Building, Layers, Compass, Clock, CheckCircle, TriangleAlert, MapPin } from "lucide-react";
import { useLocation } from "wouter";
import { useEffect, useState, useRef } from "react";
import servicesCharacterImage from "@assets/KakaoTalk_20251226_140639616_1766725668691.png";

export default function Services() {
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<"analysis" | "naming">("analysis");
  const [analysisDetailOpen, setAnalysisDetailOpen] = useState(false);
  
  // 뒤로 가기 버튼 처리를 위한 ref
  const dialogOpenRef = useRef(false);
  const analysisDetailOpenRef = useRef(false);
  const isClosingFromBackButton = useRef(false);
  const scrollBeforeProcess = useRef<number | null>(null);

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
        // consultation 또는 familyPolicy 상태면 닫지 않음 (내부 다이얼로그 전환)
        if (modalState === "consultation" || modalState === "familyPolicy") {
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
        <div className="text-center mb-12">
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
          <div className="text-center mb-12">
            <h2 className="mt-4 bg-gradient-to-r from-[#0f766e] to-[#4fd1c5] dark:from-[#58C4C4] dark:to-[#6DD4D4] bg-clip-text text-[25px] font-extrabold leading-tight text-transparent sm:text-3xl md:text-4xl" data-testid="text-process-title">
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
        <DialogContent className="z-[10001] w-full h-full max-w-full max-h-full sm:!top-[80px] sm:!translate-y-0 sm:!h-[calc(100vh-80px)] sm:max-w-[700px] overflow-y-auto !p-4 sm:!p-6 inset-0 !translate-x-0 !translate-y-0 sm:!left-[50%] sm:!translate-x-[-50%] rounded-none sm:rounded-t-none sm:rounded-b-lg" aria-describedby={undefined}>
          <DialogHeader className="sr-only">
            <DialogTitle>{dialogType === "analysis" ? "이름분석 상담 신청" : "이름감명 상담 신청"}</DialogTitle>
          </DialogHeader>
          <ConsultationForm 
            type={dialogType}
            onSuccess={closeDialog}
          />
        </DialogContent>
      </Dialog>

      {/* 이름분석 자세히 보기 모달 */}
      <Dialog open={analysisDetailOpen} onOpenChange={(open) => { if (!open) closeAnalysisDetail(); }}>
        <DialogContent className="z-[10001] w-full h-full max-w-full max-h-full sm:!top-[80px] sm:!translate-y-0 sm:!h-[calc(100vh-80px)] overflow-y-auto overflow-x-hidden bg-neutral-950 text-white border-white/20 !p-0 inset-0 !translate-x-0 !translate-y-0 rounded-none" aria-describedby={undefined}>
          <DialogHeader className="sr-only">
            <DialogTitle>이름분석 운명상담 안내</DialogTitle>
          </DialogHeader>
          <div className="px-6 pt-20 pb-8" data-testid="name-analysis-root">
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
