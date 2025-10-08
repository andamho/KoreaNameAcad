import { Button } from "@/components/ui/button";
import heroImage from "@assets/ChatGPT Image 2025년 10월 8일 오후 09_34_23_1759926875782.png";

export function Hero() {
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section id="home" className="relative py-20 md:py-32 overflow-hidden">
      <div className="absolute inset-0">
        <img 
          src={heroImage} 
          alt="배경" 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-background/50 to-transparent dark:from-background/90 dark:via-background/60 dark:to-transparent" />
      </div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative">
        <div className="text-center max-w-4xl mx-auto space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl md:text-6xl font-bold text-foreground tracking-tight">
              고달픈 인생, <span className="text-primary">이름 하나로</span> 이유를 찾고
              <br />
              운이 술술 풀리는 새 이름으로, 인생역전하세요.
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground tracking-wide">
              한글·한자이름만으로 운명상담 [정확도 80% 이상]
            </p>
          </div>
          
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
