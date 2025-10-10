import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { ServiceCard } from "@/components/ServiceCard";
import { ConsultationForm } from "@/components/ConsultationForm";
import { TestimonialCard } from "@/components/TestimonialCard";
import { StoryCard } from "@/components/StoryCard";
import { Footer } from "@/components/Footer";
import KnaDangerSection from "@/components/KnaDangerSection";
import KnaValueSection from "@/components/KnaValueSection";
import KnaIntroBlock from "@/components/KnaIntroBlock";
import KnaStepsSection from "@/components/KnaStepsSection";
import KnaMythTruthSection from "@/components/KnaMythTruthSection";
import KnaPricingSection from "@/components/KnaPricingSection";
import { Search, Star, MessageCircle, Flower, Baby, Building } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function Home() {
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<"analysis" | "naming">("analysis");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const openType = params.get("open");
    if (openType === "analysis" || openType === "naming") {
      setDialogType(openType);
      setDialogOpen(true);
      window.history.replaceState({}, "", "/");
    }
  }, []);

  const openDialog = (type: "analysis" | "naming") => {
    setDialogType(type);
    setDialogOpen(true);
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
      content: "우울증과 알콜의존증으로 약까지 먹고 있었는데 거짓말처럼 술이 안땡기고. 마음이 편해지고. 삶이 의욕적으로 바뀌었어요",
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

      <KnaPricingSection onOpenDialog={openDialog} />

      <section id="services" className="py-16 md:py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center space-y-4 mb-12">
            <h2 className="mt-4 bg-gradient-to-r from-[#0f766e] to-[#4fd1c5] dark:from-[#58C4C4] dark:to-[#6DD4D4] bg-clip-text text-2xl font-extrabold leading-tight text-transparent sm:text-3xl md:text-4xl">
              전문 서비스
            </h2>
            <p className="text-lg text-muted-foreground">
              다양한 이름 관련 서비스를 제공합니다
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <ServiceCard
              icon={Search}
              title="이름분석"
              description="현재 이름에 들어있는 16가지운을 전문적으로 분석해드립니다."
              buttonText="신청하기"
              onClick={() => openDialog("analysis")}
            />
            <ServiceCard
              icon={Star}
              title="이름감명"
              description="개명을 위해 다른 작명소에서 받은 새이름에 대한 감명을 해드립니다."
              buttonText="신청하기"
              onClick={() => openDialog("naming")}
            />
            <ServiceCard
              icon={MessageCircle}
              title="이름분석 및 감명 상세 안내"
              description="이름분석과 이름감명에 대한 자세한 안내해드립니다."
              buttonText="자세히 보기"
              onClick={() => {
                setLocation("/detail-info");
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
            <ServiceCard
              icon={Flower}
              title="개명"
              description="운이 술술 풀리는 개명을 위한 상담과 절차를 안내해드립니다."
              buttonText="자세히 보기"
              onClick={() => window.open("https://blog.naver.com/whats_ur_name_777/221277653666", "_blank")}
            />
            <ServiceCard
              icon={Baby}
              title="신생아 작명"
              description="가족 모두가 행복해지는 아가이름을 위한 상담과 절차를 안내해드립니다."
              buttonText="자세히 보기"
              onClick={() => window.open("https://blog.naver.com/whats_ur_name_777/221277647598", "_blank")}
            />
            <ServiceCard
              icon={Building}
              title="상호작명"
              description="부자되는 상호작명을 위한 상담과 절차를 안내해드립니다."
              buttonText="자세히 보기"
              onClick={() => window.open("https://blog.naver.com/whats_ur_name_777/221274436174", "_blank")}
            />
          </div>
        </div>
      </section>

      <section id="testimonials" className="relative py-20 md:py-32 bg-[#0a0a0a] overflow-hidden">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-[#58C4C4]/20 via-transparent to-[#45B8B8]/20 animate-pulse" />
        </div>
        
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6">
          <h2 className="mt-4 bg-gradient-to-r from-[#0f766e] to-[#4fd1c5] dark:from-[#58C4C4] dark:to-[#6DD4D4] bg-clip-text text-2xl font-extrabold leading-tight text-transparent sm:text-3xl md:text-4xl text-center mb-16">
            이름분석 상담후기
          </h2>

          <div className="space-y-8">
            {analysisTestimonials.map((testimonial, index) => (
              <div
                key={index}
                className="group relative bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-10 md:p-12 transition-all duration-500 hover:translate-x-4 hover:scale-[1.02] hover:border-[#58C4C4]/50 hover:shadow-2xl hover:shadow-[#58C4C4]/20"
                data-testid={`analysis-testimonial-card-${index}`}
              >
                <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-[#58C4C4] via-[#6DD4D4] to-[#45B8B8] opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-l-3xl" />

                <div className="relative z-10">
                  <p className="text-base leading-relaxed text-gray-200 font-light">
                    {testimonial.content.split(' ').map((word, i) => (
                      <span key={i}>
                        {i === 0 ? (
                          <span 
                            className="font-bold text-xl"
                            style={{
                              background: 'linear-gradient(135deg, #58C4C4 0%, #6DD4D4 100%)',
                              WebkitBackgroundClip: 'text',
                              WebkitTextFillColor: 'transparent',
                              backgroundClip: 'text'
                            }}
                          >
                            {word}
                          </span>
                        ) : (
                          word
                        )}
                        {i < testimonial.content.split(' ').length - 1 && ' '}
                      </span>
                    ))}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="name-change-testimonials" className="relative py-20 md:py-32 bg-[#0a0a0a] overflow-hidden">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-[#58C4C4]/20 via-transparent to-[#45B8B8]/20 animate-pulse" />
        </div>
        
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6">
          <h2 className="mt-4 bg-gradient-to-r from-[#0f766e] to-[#4fd1c5] dark:from-[#58C4C4] dark:to-[#6DD4D4] bg-clip-text text-2xl font-extrabold leading-tight text-transparent sm:text-3xl md:text-4xl text-center mb-16">
            개명 후기
          </h2>

          <div className="space-y-8">
            {testimonials.map((testimonial, index) => (
              <div
                key={index}
                className="group relative bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-10 md:p-12 transition-all duration-500 hover:translate-x-4 hover:scale-[1.02] hover:border-[#58C4C4]/50 hover:shadow-2xl hover:shadow-[#58C4C4]/20"
                data-testid={`testimonial-card-${index}`}
              >
                <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-[#58C4C4] via-[#6DD4D4] to-[#45B8B8] opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-l-3xl" />

                <div className="relative z-10">
                  <p className="text-base leading-relaxed text-gray-200 font-light">
                    {testimonial.content.split(' ').map((word, i) => (
                      <span key={i}>
                        {i === 0 ? (
                          <span 
                            className="font-bold text-xl"
                            style={{
                              background: 'linear-gradient(135deg, #58C4C4 0%, #6DD4D4 100%)',
                              WebkitBackgroundClip: 'text',
                              WebkitTextFillColor: 'transparent',
                              backgroundClip: 'text'
                            }}
                          >
                            {word}
                          </span>
                        ) : (
                          word
                        )}
                        {i < testimonial.content.split(' ').length - 1 && ' '}
                      </span>
                    ))}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-16 text-center">
            <a
              href="https://m.blog.naver.com/whats_ur_name_777?categoryNo=11&proxyReferer=https%3A%2F%2Flinkon.id%2F"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xl md:text-2xl font-semibold hover:opacity-80 transition-opacity"
              style={{
                background: 'linear-gradient(135deg, #58C4C4 0%, #6DD4D4 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}
              data-testid="link-detailed-testimonials"
            >
              자세한 상담·개명 후기 안내
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6" style={{ stroke: '#58C4C4' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      <Footer />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <ConsultationForm 
            type={dialogType}
            onSuccess={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
