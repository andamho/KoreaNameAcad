import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Sparkles, Users, FileText, Award, Clock } from "lucide-react";
import { useLocation } from "wouter";

export default function Services() {
  const [, setLocation] = useLocation();

  const services = [
    {
      icon: BookOpen,
      title: "이름 분석",
      description: "현재 사용 중인 이름의 의미와 영향력을 깊이 있게 분석합니다",
      features: [
        "한글 이름의 음운 분석",
        "한자 이름의 의미 해석",
        "사주와 이름의 조화 분석",
        "가족 운세와의 상관관계 분석"
      ],
      price: "150,000원",
      duration: "약 2-3일 소요"
    },
    {
      icon: Sparkles,
      title: "작명 (개명)",
      description: "사주와 조화를 이루는 최적의 이름을 지어드립니다",
      features: [
        "사주 팔자 기반 이름 추천",
        "한글·한자 모두 고려한 작명",
        "3-5개의 이름 후보 제시",
        "이름별 상세 설명서 제공"
      ],
      price: "500,000원",
      duration: "약 7-10일 소요"
    },
    {
      icon: Users,
      title: "가족 종합 분석",
      description: "가족 구성원 모두의 이름을 종합적으로 분석합니다",
      features: [
        "가족 구성원 간 이름 조화 분석",
        "가정 운세 진단",
        "개선이 필요한 부분 파악",
        "맞춤형 솔루션 제공"
      ],
      price: "300,000원",
      duration: "약 5-7일 소요"
    }
  ];

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

      {/* Services Grid */}
      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-services-section-title">
              제공 서비스
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              각 서비스는 전문가의 깊이 있는 분석을 통해 제공됩니다
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {services.map((service, index) => (
              <Card key={index} className="hover-elevate" data-testid={`card-service-${index}`}>
                <CardHeader>
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                    <service.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-2xl">{service.title}</CardTitle>
                  <CardDescription className="text-base mt-2">{service.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 mb-6">
                    {service.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        <Award className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">비용</span>
                      <span className="font-bold text-lg text-primary">{service.price}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>{service.duration}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
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
