import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Star, Quote } from "lucide-react";
import { useLocation } from "wouter";

export default function Reviews() {
  const [, setLocation] = useLocation();

  const reviews = [
    {
      name: "김○○",
      service: "이름 분석",
      rating: 5,
      content: "이름 하나 때문에 이렇게 고생했구나 싶었어요. 분석 받고 개명하니 정말 삶이 달라졌습니다. 가족들도 놀랄 정도로 긍정적인 변화가 생겼어요.",
      date: "2024.09"
    },
    {
      name: "박○○",
      service: "작명 (개명)",
      rating: 5,
      content: "사업이 잘 안 풀려서 고민하다가 개명했는데, 진짜 신기하게 일이 풀리기 시작했어요. 이름이 이렇게 중요한 줄 몰랐습니다.",
      date: "2024.08"
    },
    {
      name: "이○○",
      service: "가족 종합 분석",
      rating: 5,
      content: "가족들 이름을 다 분석받았는데, 정말 놀라웠어요. 우리 가족이 겪는 문제들이 이름과 연관이 있었다니... 지금은 모두 좋아졌습니다.",
      date: "2024.07"
    },
    {
      name: "최○○",
      service: "이름 분석",
      rating: 5,
      content: "30년 넘게 살면서 이름 때문에 힘들었는데 이제야 이유를 알았어요. 개명 준비 중인데 벌써 마음이 편안해집니다.",
      date: "2024.09"
    },
    {
      name: "정○○",
      service: "작명 (개명)",
      rating: 5,
      content: "아이 이름 지을 때 여기서 작명 받았는데 정말 잘한 것 같아요. 아이가 건강하고 밝게 자라고 있습니다.",
      date: "2024.08"
    },
    {
      name: "강○○",
      service: "이름 분석",
      rating: 5,
      content: "비용이 아깝다고 생각했는데, 받고 나니 정말 값진 투자였어요. 이름 하나로 인생이 바뀔 수 있다는 걸 실감했습니다.",
      date: "2024.06"
    },
    {
      name: "윤○○",
      service: "가족 종합 분석",
      rating: 5,
      content: "남편과 관계가 좋지 않아서 고민이었는데, 이름 분석 받고 개선 방법을 찾았어요. 지금은 가정이 정말 화목합니다.",
      date: "2024.07"
    },
    {
      name: "조○○",
      service: "작명 (개명)",
      rating: 5,
      content: "건강 문제로 고생하다가 개명했는데, 정말 신기하게 몸이 좋아졌어요. 이름이 이렇게 큰 영향을 미치는지 몰랐습니다.",
      date: "2024.05"
    },
    {
      name: "한○○",
      service: "이름 분석",
      rating: 5,
      content: "후기 안 보고 다른 곳에서 작명했다가 후회했어요. 여기서 다시 분석받고 제대로 된 이름을 얻었습니다.",
      date: "2024.09"
    }
  ];

  const stats = [
    { value: "1,000+", label: "누적 상담 건수" },
    { value: "98%", label: "고객 만족도" },
    { value: "15년+", label: "전문가 경력" }
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
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzBoLTR2NGg0di00em0wLThoLTR2NGg0di00em04IDhoLTR2NGg4di00em0tOCA4aC00djRoNHYtNHptOCAwac00djRoNHYtNHptMC04aC00djRoNHYtNHptOC04aC00djRoNHYtNHptMCA4aC00djRoNHYtNHptLTggMGgtNHY0aDR2LTR6bTggOGgtNHY0aDR2LTR6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-20"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white mb-6" data-testid="text-reviews-title">
            고객 후기
          </h1>
          <p className="text-xl md:text-2xl text-white/90 mb-8 max-w-3xl mx-auto">
            이름 하나로 인생이 달라진<br className="hidden sm:inline" />
            실제 고객들의 생생한 이야기
          </p>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-3 gap-8 text-center">
            {stats.map((stat, index) => (
              <div key={index} data-testid={`stat-${index}`}>
                <div className="text-3xl md:text-4xl font-bold text-primary mb-2">{stat.value}</div>
                <div className="text-sm md:text-base text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Reviews Grid */}
      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">실제 고객 후기</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              검증된 서비스, 신뢰할 수 있는 결과
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {reviews.map((review, index) => (
              <Card key={index} className="hover-elevate" data-testid={`card-review-${index}`}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="font-bold text-lg mb-1">{review.name}</div>
                      <div className="text-sm text-muted-foreground">{review.service}</div>
                    </div>
                    <Quote className="h-8 w-8 text-primary/20" />
                  </div>
                  
                  <div className="flex gap-1 mb-4">
                    {[...Array(review.rating)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>

                  <p className="text-sm leading-relaxed mb-4 text-foreground/90">
                    "{review.content}"
                  </p>

                  <div className="text-xs text-muted-foreground">
                    {review.date}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            당신도 변화를 경험하세요
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            후기를 보고 확신을 가지셨나요?<br />
            지금 바로 상담을 신청하고 긍정적인 변화를 시작하세요
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
