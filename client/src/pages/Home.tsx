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

export default function Home() {
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<"analysis" | "naming">("analysis");
  const [analysisDetailOpen, setAnalysisDetailOpen] = useState(false);
  const isClosingFromBackButton = useRef(false);
  const dialogOpenRef = useRef(false);
  const analysisDetailOpenRef = useRef(false);
  const referrerPage = useRef<string | null>(null);

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
      window.history.replaceState({ from: fromPage }, "", "/");
    } else if (detailType === "analysis") {
      setAnalysisDetailOpen(true);
      window.history.replaceState({ from: fromPage }, "", "/");
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

  const testimonials = [
    {
      name: "고객 1",
      service: "개명",
      content: "절 좋아하는 사람이 많아졌어요. 예민한 게 사라졌어요. 요즘 돈도 많이 벌어요",
      rating: 5,
    },
    {
      name: "고객 2",
      service: "개명",
      content: "직장과 아파트가 생겼어요. 가전제품도 누가 사주셨어요. 아빠 외도 중이셨는데 정리하고 들어오셨어요. 지금은 소아정신과에서 아이들 진료보고 있는데 마더테레사라고 칭찬받고 인정받아요",
      rating: 5,
    },
    {
      name: "고객 3",
      service: "개명",
      content: "미용실도 이전해서 넘 잘 되고 사랑하는 사람도 생겨 결혼해요",
      rating: 5,
    },
    {
      name: "고객 4",
      service: "개명",
      content: "정부지원사업 3천만원 지원받아 플랫폼 사업 시작해서 넘 잘 돼요",
      rating: 5,
    },
    {
      name: "고객 5",
      service: "개명",
      content: "개명 후 6년 세상에서 가장 행복한 사람",
      rating: 5,
    },
    {
      name: "고객 6",
      service: "개명",
      content: "이상형의 남친이 생겼어요",
      rating: 5,
    },
    {
      name: "고객 7",
      service: "개명",
      content: "가는 곳마다 열광. 이젠 대기업 임원만큼 돈을 벌어요. 크게 되고 빛날 것같아요",
      rating: 5,
    },
    {
      name: "고객 8",
      service: "개명",
      content: "우울증과 알콜의존증으로 약까지 먹고 있었는데 거짓말처럼 술이 안땡겨요. 마음이 편해지고 삶이 의욕적으로 바뀌었어요",
      rating: 5,
    },
    {
      name: "고객 9",
      service: "개명",
      content: "부지런해지고 원하던 회사에 합격했어요",
      rating: 5,
    },
    {
      name: "고객 10",
      service: "개명",
      content: "남편이 달라졌어요. 밉지도 않고. 시어머님에 대한 원망이 사라졌어요. 아이가 알아서 스스로 잘 해요",
      rating: 5,
    },
  ];

  const analysisTestimonials = [
    {
      name: "고객 1",
      service: "이름 분석",
      content: "이제야 내 삶의 퍼즐이 맞춰지는 것같습니다. 감탄에 감탄",
      rating: 5,
    },
    {
      name: "고객 2",
      service: "이름 분석",
      content: "선생님과의 이름분석 상담은 너무나 달랐습니다",
      rating: 5,
    },
    {
      name: "고객 3",
      service: "이름 분석",
      content: "내용이 정말 소름끼치게 가깝더라구요",
      rating: 5,
    },
    {
      name: "고객 4",
      service: "이름 분석",
      content: "이름을 바꿀 수 있다는 게 얼마나 다행인지",
      rating: 5,
    },
    {
      name: "고객 5",
      service: "이름 분석",
      content: "해결책이 생겨 마음이 편해졌어요",
      rating: 5,
    },
    {
      name: "고객 6",
      service: "이름 분석",
      content: "제 인생의 많은 부분을 다시 돌아보며 이해할 수 있는 시간이었습니다",
      rating: 5,
    },
    {
      name: "고객 7",
      service: "이름 분석",
      content: "한 시간이 너무 후딱 지나가더라구요. 뭔지 모를 후련함도 생기고. 누군가에게 말못한 고민까지 털어놓게 됐어요",
      rating: 5,
    },
    {
      name: "고객 8",
      service: "이름 분석",
      content: "아주 그냥 저희 집에 같이 살고 있는 줄요",
      rating: 5,
    },
    {
      name: "고객 9",
      service: "이름 분석",
      content: "이름대로 살고 있는 게 너무 너무 신기해요",
      rating: 5,
    },
    {
      name: "고객 10",
      service: "이름 분석",
      content: "지난날이 주마등처럼 지나가면서 저를 토닥여주고 싶었어요",
      rating: 5,
    },
    {
      name: "고객 11",
      service: "이름 분석",
      content: "성격 성향이 바뀐 게 이름의 끌어당김이었어요",
      rating: 5,
    },
  ];

  const stories = [
    {
      title: "이름에 담긴 부모의 마음",
      excerpt: "이름은 단순한 호칭이 아닙니다. 부모가 자녀에게 주는 첫 번째 선물이자, 평생을 함께할 정체성입니다. 한국 전통 작명법에서는...",
      category: "전통",
    },
    {
      title: "성공한 사람들의 이름 분석",
      excerpt: "역사 속 성공한 인물들의 이름을 분석해보면 흥미로운 공통점을 발견할 수 있습니다. 오행의 조화와 음양의 균형이...",
      category: "분석",
    },
    {
      title: "개명으로 달라진 인생",
      excerpt: "많은 분들이 개명을 통해 새로운 인생을 시작합니다. 단순히 이름만 바뀌는 것이 아니라, 자신에 대한 인식과 삶의 방향이...",
      category: "사례",
    },
  ];

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

      <section id="testimonials" className="py-16 md:py-24 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center space-y-4 mb-12">
            <h2 className="mt-4 bg-gradient-to-r from-[#0f766e] to-[#4fd1c5] dark:from-[#58C4C4] dark:to-[#6DD4D4] bg-clip-text text-2xl font-extrabold leading-tight text-transparent sm:text-3xl md:text-4xl">
              이름분석 상담후기
            </h2>
            <p className="text-lg text-muted-foreground">
              실제 고객님들의 생생한 후기입니다
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {analysisTestimonials.map((testimonial, index) => (
              <Card
                key={index}
                className="p-6 hover-elevate"
                data-testid={`analysis-testimonial-card-${index}`}
              >
                <p className="text-lg leading-relaxed text-foreground">
                  {testimonial.content}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="name-change-testimonials" className="py-16 md:py-24 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center space-y-4 mb-12">
            <h2 className="mt-4 bg-gradient-to-r from-[#0f766e] to-[#4fd1c5] dark:from-[#58C4C4] dark:to-[#6DD4D4] bg-clip-text text-2xl font-extrabold leading-tight text-transparent sm:text-3xl md:text-4xl">
              개명 후기
            </h2>
            <p className="text-lg text-muted-foreground">
              개명 후 달라진 삶을 경험한 고객님들의 이야기
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {testimonials.map((testimonial, index) => (
              <Card
                key={index}
                className="p-6 hover-elevate"
                data-testid={`testimonial-card-${index}`}
              >
                <p className="text-lg leading-relaxed text-foreground">
                  {testimonial.content}
                </p>
              </Card>
            ))}
          </div>

          <div className="mt-12 text-center">
            <a
              href="https://m.blog.naver.com/whats_ur_name_777?categoryNo=11&proxyReferer=https%3A%2F%2Flinkon.id%2F"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-[27px] font-semibold text-[#0f766e] dark:text-[#58C4C4] hover:underline"
              data-testid="link-detailed-testimonials"
            >
              고객 후기 전체보기 →
            </a>
          </div>
        </div>
      </section>

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
