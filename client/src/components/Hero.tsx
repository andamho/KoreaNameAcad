import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export function Hero() {
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section id="home" className="relative py-20 md:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative">
        <div className="text-center max-w-4xl mx-auto space-y-8">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium">
            <Sparkles className="h-4 w-4" />
            <span>전문적인 이름 분석과 작명 서비스</span>
          </div>
          
          <h1 className="text-4xl md:text-6xl font-bold text-foreground tracking-tight">
            한국이름학교에서
            <br />
            <span className="text-primary">새로운 이름</span>을 찾아보세요
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto tracking-wide">
            당신의 이름에 담긴 의미를 발견하고, 전문가의 깊이 있는 분석으로 
            새로운 시작을 준비하세요. 수십 년의 경험과 전통적인 작명 원리를 바탕으로 합니다.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              onClick={() => scrollToSection('services')}
              data-testid="button-consultation"
              className="min-w-[200px]"
            >
              상담 신청하기
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => scrollToSection('stories')}
              data-testid="button-stories"
              className="min-w-[200px] bg-background/50 backdrop-blur-sm"
            >
              이름 이야기 보기
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
