import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { ServiceCard } from "@/components/ServiceCard";
import { ConsultationForm } from "@/components/ConsultationForm";
import { TestimonialCard } from "@/components/TestimonialCard";
import { StoryCard } from "@/components/StoryCard";
import { Footer } from "@/components/Footer";
import { Sparkles, PenLine, MessageCircle } from "lucide-react";
import { useState } from "react";
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

  const openDialog = (type: "analysis" | "naming") => {
    setDialogType(type);
    setDialogOpen(true);
  };

  // todo: remove mock functionality
  const testimonials = [
    {
      name: "김민수",
      service: "이름 분석",
      content: "이름 분석을 통해 제 이름에 담긴 의미를 깊이 이해할 수 있었습니다. 전문적이고 세심한 상담에 매우 만족합니다.",
      rating: 5,
    },
    {
      name: "박지은",
      service: "개명",
      content: "개명 후 새로운 삶을 시작할 수 있었습니다. 선생님의 깊이 있는 상담과 배려에 감사드립니다.",
      rating: 5,
    },
    {
      name: "이성호",
      service: "작명",
      content: "아이의 작명을 의뢰했는데, 의미 있고 아름다운 이름을 지어주셔서 정말 만족스럽습니다.",
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

      <section id="about" className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">
              한국이름학교 소개
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed tracking-wide">
              한국이름학교는 30년 이상의 경험을 바탕으로 전통적인 작명 원리와 
              현대적인 감각을 결합한 전문적인 이름 분석 및 작명 서비스를 제공합니다.
              <br /><br />
              우리는 단순히 이름을 짓는 것을 넘어, 한 사람의 정체성과 미래를 
              함께 고민하며 가장 적합한 이름을 찾아드립니다.
            </p>
          </div>
        </div>
      </section>

      <section id="services" className="py-16 md:py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center space-y-4 mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">
              전문 서비스
            </h2>
            <p className="text-lg text-muted-foreground tracking-wide">
              다양한 이름 관련 서비스를 제공합니다
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <ServiceCard
              icon={Sparkles}
              title="이름분석"
              description="현재 이름에 들어있는 16가지운을 전문적으로 분석해드립니다."
              buttonText="신청하기"
              onClick={() => openDialog("analysis")}
            />
            <ServiceCard
              icon={PenLine}
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
              onClick={() => setLocation("/detail-info")}
            />
            <ServiceCard
              icon={Sparkles}
              title="개명상담"
              description="운이 술술 풀리는 개명을 위한 상담과 절차를 안내해드립니다."
              buttonText="자세히 보기"
              onClick={() => console.log("개명상담 페이지")}
            />
            <ServiceCard
              icon={PenLine}
              title="신생아 작명 상담"
              description="가족 모두가 행복해지는 아가이름을 위한 상담과 절차를 안내해드립니다."
              buttonText="자세히 보기"
              onClick={() => console.log("신생아 작명 페이지")}
            />
            <ServiceCard
              icon={MessageCircle}
              title="상호작명 상담"
              description="부자되는 상호작명을 위한 상담과 절차를 안내해드립니다."
              buttonText="자세히 보기"
              onClick={() => console.log("상호작명 페이지")}
            />
          </div>
        </div>
      </section>

      <section id="testimonials" className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center space-y-4 mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">
              고객 후기
            </h2>
            <p className="text-lg text-muted-foreground tracking-wide">
              고객님들의 소중한 경험을 들어보세요
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <TestimonialCard key={index} {...testimonial} />
            ))}
          </div>
        </div>
      </section>

      <section id="stories" className="py-16 md:py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center space-y-4 mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">
              재미있는 이름 이야기
            </h2>
            <p className="text-lg text-muted-foreground tracking-wide">
              이름에 관한 흥미로운 이야기들
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {stories.map((story, index) => (
              <StoryCard
                key={index}
                {...story}
                onClick={() => console.log(`Story clicked: ${story.title}`)}
              />
            ))}
          </div>
        </div>
      </section>

      <Footer />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <ConsultationForm type={dialogType} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
