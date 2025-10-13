import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ServiceCard } from "@/components/ServiceCard";
import { Search, Star, Flower, Baby, Building, FileText } from "lucide-react";
import { useLocation } from "wouter";

export default function Services() {
  const [, setLocation] = useLocation();

  const processSteps = [
    {
      step: 1,
      title: "상담 신청",
      description: "온라인 양식 작성 또는 카카오톡 문의"
    },
    {
      step: 2,
      title: "정보 전달",
      description: "사주 정보 및 필요 자료 제공"
    },
    {
      step: 3,
      title: "전문 분석",
      description: "이름 전문가의 상세한 분석 진행"
    },
    {
      step: 4,
      title: "결과 전달",
      description: "분석 결과서 및 상세 설명 제공"
    }
  ];

  const goToConsultation = () => {
    setLocation("/?open=analysis");
    setTimeout(() => {
      const element = document.getElementById('services');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0f766e] to-[#4fd1c5] dark:from-[#0a5850] dark:to-[#3ba89e] py-20 md:py-28">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzBoLTR2NGg0di00em0wLThoLTR2NGg0di00em04IDhoLTR2NGg0di00em0tOCA4aC00djRoNHYtNHptOCAwaC00djRoNHYtNHptMC04aC00djRoNHYtNHptOC04aC00djRoNHYtNHptMCA4aC00djRoNHYtNHptLTggMGgtNHY0aDR2LTR6bTggOGgtNHY0aDR2LTR6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-20"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white mb-6" data-testid="text-services-title">
            전문적인 이름 서비스
          </h1>
          <p className="text-xl md:text-2xl text-white/90 mb-8 max-w-3xl mx-auto">
            사주와 조화를 이루는 최적의 이름으로<br className="hidden sm:inline" />
            인생의 긍정적인 변화를 경험하세요
          </p>
          <Button
            onClick={goToConsultation}
            size="lg"
            className="bg-white text-[#0f766e] border-white"
            data-testid="button-consultation"
          >
            지금 상담 신청하기
          </Button>
        </div>
      </section>

      {/* Professional Services */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center space-y-4 mb-12">
            <h2 className="mt-4 bg-gradient-to-r from-[#0f766e] to-[#4fd1c5] dark:from-[#58C4C4] dark:to-[#6DD4D4] bg-clip-text text-2xl font-extrabold leading-tight text-transparent sm:text-3xl md:text-4xl" data-testid="text-services-section-title">
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
              onClick={() => setLocation("/?open=analysis")}
              secondaryButtonText="자세히 보기"
              onSecondaryClick={() => setLocation("/")}
              data-testid="card-service-0"
            />
            <ServiceCard
              icon={Star}
              title="이름감명"
              description="타 작명소에서 받은 이름의 적합도를 점검해드립니다"
              buttonText="신청하기"
              onClick={() => setLocation("/?open=naming")}
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
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">진행 과정</h2>
            <p className="text-lg text-muted-foreground">
              간단하고 명확한 4단계 프로세스
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {processSteps.map((item, index) => (
              <div key={index} className="text-center" data-testid={`process-step-${index}`}>
                <div className="w-16 h-16 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="text-xl font-bold mb-2">{item.title}</h3>
                <p className="text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <FileText className="h-16 w-16 text-primary mx-auto mb-6" />
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            이름, 제대로 알고 시작하세요
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            전문가의 상담을 통해 인생의 긍정적인 변화를 경험할 수 있습니다
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              onClick={goToConsultation}
              size="lg"
              data-testid="button-start-consultation"
            >
              상담 신청하기
            </Button>
            <Button
              variant="outline"
              size="lg"
              asChild
            >
              <a
                href="https://pf.kakao.com/_Sxnvbb/chat"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="button-kakao-inquiry"
              >
                카카오톡 문의
              </a>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
