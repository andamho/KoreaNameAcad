import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useEffect } from "react";
import image1 from "@assets/image_1759935489354.png";
import image2 from "@assets/image_1759935501535.png";
import image3 from "@assets/image_1759935535730.png";
import image5 from "@assets/image_1759935876767.png";

export default function DetailInfo() {
  const [, setLocation] = useLocation();

  const openApplication = (type: "analysis" | "naming") => {
    setLocation(`/?open=${type}`);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromPage = params.get("from");
    
    if (fromPage === "/ig" || fromPage === "/tt") {
      const className = fromPage === "/ig" ? "ua-instagram" : "ua-tiktok";
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
            font-size: clamp(24px, 6vw, 32px) !important;
          }
          html.${className} h2 {
            font-size: clamp(20px, 5vw, 26px) !important;
          }
          html.${className} h3 {
            font-size: clamp(16px, 4vw, 20px) !important;
          }
          html.${className} p, html.${className} li {
            font-size: 14px !important;
          }
        `;
        document.head.appendChild(style);
      }
    }
    
    const hash = window.location.hash;
    if (hash) {
      const elementId = hash.substring(1);
      setTimeout(() => {
        const element = document.getElementById(elementId);
        if (element) {
          const yOffset = -100;
          const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
          window.scrollTo({ top: y, behavior: 'smooth' });
        }
      }, 100);
    }
    
    return () => {
      if (fromPage === "/ig" || fromPage === "/tt") {
        const className = fromPage === "/ig" ? "ua-instagram" : "ua-tiktok";
        document.documentElement.classList.remove(className);
        const styleElement = document.getElementById(`inapp-style-${className}`);
        if (styleElement) {
          styleElement.remove();
        }
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="space-y-8">
            <div className="text-center space-y-4">
              <h1 className="text-3xl md:text-4xl font-bold text-foreground">
                🎯 이름분석 & 감명 안내
              </h1>
            </div>

            {/* 첫 번째와 두 번째 이미지 */}
            <div className="space-y-6">
              <img 
                src={image1} 
                alt="이름은 단순한 표식이 아니라 운명을 담은 그릇입니다" 
                className="w-full rounded-lg"
                data-testid="img-intro-1"
              />
              <img 
                src={image2} 
                alt="이름은 우리를 연결하고 삶을 상상하며 자신을 찾게 하는 언어적 상징입니다" 
                className="w-full rounded-lg"
                data-testid="img-intro-2"
              />
            </div>

            {/* 이름분석 섹션 */}
            <Card className="p-6 md:p-8 space-y-6">
              <div className="space-y-4 text-center">
                <h2 className="text-2xl font-bold text-foreground">✔️ 이름분석은</h2>
                <div className="text-foreground space-y-3 leading-relaxed">
                  <p className="font-semibold">
                    사주없이❌❌❌
                  </p>
                  <p>
                    한글.한자 이름 속<br />
                    숨겨진 흐름
                  </p>
                  <p className="font-semibold">
                    [총 16가지 운세 &<br />
                    7개의 시기] 을
                  </p>
                  <p>
                    과거 현재 미래까지<br />
                    정확하게 분석해드립니다.
                  </p>
                  <p className="mt-4">
                    타고난 장점, 자질과 특징들<br />
                    그리고 그것들을 가지고<br />
                    꿈을 꾸고 이뤄나가는 데 있어서<br />
                    태클을 거는 흉운들까지<br />
                    꼼꼼히 알려드립니다
                  </p>
                </div>
              </div>
            </Card>

            {/* 세 번째 이미지 - 이름감명 안내글 바로 위 */}
            <img 
              src={image3} 
              alt="이름이 맞아야 인생이 맞다" 
              className="w-full rounded-lg"
              data-testid="img-intro-3"
            />

            {/* 이름감명 섹션 */}
            <Card className="p-6 md:p-8 space-y-6">
              <div className="space-y-4 text-center">
                <h2 className="text-2xl font-bold text-foreground">✔️ 이름감명은</h2>
                <div className="text-foreground space-y-3 leading-relaxed">
                  <p>
                    다른 작명소에서 받아오신<br />
                    새 이름이 '좋은 이름'인지<br />
                    간단히 확인해드리는 서비스입니다.
                  </p>
                  <p className="font-semibold text-lg mt-4">
                    📌 이름감명을 받으시려면
                  </p>
                  <p>
                    기존 이름에 대한 이름분석이<br />
                    반드시 함께 진행되어야 합니다.
                  </p>
                </div>
              </div>
            </Card>

            {/* 가족 상담 원칙 */}
            <Card id="family-policy" className="p-6 md:p-8 space-y-6">
              <div className="space-y-4 text-center">
                <h2 className="text-2xl font-bold text-foreground">👨‍👩‍👧‍👦 등본상 가족 상담 원칙</h2>
                <div className="text-foreground space-y-4 leading-relaxed">
                  <p>
                    가족은 운명 공동체로,<br />
                    서로의 이름운의 영향을<br />
                    강하게 주고 받습니다.
                  </p>
                  
                  <div className="mt-6">
                    <h3 className="font-bold text-lg mb-2">💍 결혼, 혼을 연결하는 인연</h3>
                    <p>
                      '결혼'이라는 말은<br />
                      본래 '혼(魂)을 연결한다'는 뜻에서<br />
                      유래했다고 합니다.
                    </p>
                    <p className="mt-2">
                      그만큼 결혼은 특별한 만남이며,<br />
                      '일심동체'라는 말이 있죠?
                    </p>
                    <p className="mt-2">
                      몸과 마음이 하나가 되는 것처럼<br />
                      강력하게 연결됩니다.
                    </p>
                  </div>

                  <div className="mt-6">
                    <h3 className="font-bold text-lg mb-2">👶 자녀, 피와 살로 이어진 존재</h3>
                    <p>
                      자녀는 '피붙이', '살붙이'라고도 하지요.<br />
                      그래서 '혈육(血肉)'이라고 부릅니다.
                    </p>
                    <p className="mt-2">
                      즉,<br />
                      피로 연결되고 살로 이어진 관계,<br />
                      분리된 거 같지만<br />
                      결코 분리될 수 없는<br />
                      그런 특별한 관계입니다.
                    </p>
                  </div>

                  <div className="mt-6">
                    <h3 className="font-bold text-lg mb-2">🔄 이름운, 서로에게 영향을 줍니다</h3>
                    <p>
                      결혼을 하게 되면<br />
                      부부 각자의 이름운이<br />
                      서로에게 영향을 미칩니다.
                    </p>
                    <p className="mt-2">
                      또한,<br />
                      자녀가 태어나게 되면<br />
                      아이의 운(초년운, 총운, 흉운)이<br />
                      👉 부모의 중년운에 영향을 주고,
                    </p>
                    <p className="mt-2">
                      부모의 운(중년운, 총운, 흉운)은<br />
                      👉 자녀의 초년운에 영향을 미칩니다.
                    </p>
                    <p className="mt-2">
                      이처럼 가족은 운명공동체로서<br />
                      서로의 이름운의 영향을<br />
                      밀접하게 주고 받습니다.
                    </p>
                  </div>

                  <div className="mt-6">
                    <h3 className="font-bold text-lg mb-2">📜 이름은 '소리'보다 '글자'가 강합니다</h3>
                    <p>
                      이름에는<br />
                      소리에너지도 있지만,<br />
                      그보다 훨씬 강력한 것이<br />
                      바로 글자 에너지입니다.
                    </p>
                    <p className="mt-2">
                      법적 에너지권 안에서<br />
                      글자 에너지로 깊게 연결되어 있는<br />
                      등본상 가족은,<br />
                      더욱 긴밀한 관계를 가지며<br />
                      상당한 영향을 미칩니다.
                    </p>
                  </div>

                  <p className="font-semibold text-lg mt-6">
                    📌 정확한 이름분석 상담을 받으시려면,<br />
                    등본상 가족 전체의<br />
                    이름 분석이 반드시 필요합니다.
                  </p>
                </div>
              </div>
            </Card>

            {/* 같이보시면 좋은 글 - 링크 */}
            <Card className="p-6 md:p-8 space-y-6">
              <div className="space-y-4 text-center">
                <h2 className="text-2xl font-bold text-foreground">📌✨📖 같이보시면 좋은 글</h2>

                <div className="space-y-3">
                  <a 
                    href="https://m.blog.naver.com/whats_ur_name_777/223450662435" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block p-4 bg-muted rounded-lg hover-elevate active-elevate-2"
                    data-testid="link-blog-1"
                  >
                    <h3 className="font-semibold text-foreground mb-1">
                      "아빠가 바람이 났습니다" 엄마이름때문에
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      😓아빠가 바람이 났습니다. 네이버에 치면 나오는 유명인입니다. 아빠의 바람으로 집안이 엉망진창되었습...
                    </p>
                  </a>

                  <a 
                    href="https://m.blog.naver.com/whats_ur_name_777/223924993144" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block p-4 bg-muted rounded-lg hover-elevate active-elevate-2"
                    data-testid="link-blog-2"
                  >
                    <h3 className="font-semibold text-foreground mb-1">
                      개명한 이름때문에 아빠가 돌아가시고, 소송도 걸리고
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      어느날 인스타로 디엠이 왔습니다. 너무 살기 힘들다며 죽고 싶다고까지 했습니다. 젊으신 분이 그러시면 ...
                    </p>
                  </a>
                </div>
              </div>
            </Card>

            {/* 신청 방법 */}
            <Card className="p-6 md:p-8 space-y-6">
              <div className="space-y-4 text-center">
                <h2 className="text-2xl font-bold text-foreground">📋 신청 방법</h2>
                <div className="space-y-4">
                  <p className="text-foreground">아래 링크 통해 신청서 작성</p>
                  
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button 
                      onClick={() => openApplication("analysis")}
                      className="flex-1"
                      data-testid="button-apply-analysis"
                    >
                      이름분석 신청하기
                    </Button>
                    <Button 
                      onClick={() => openApplication("naming")}
                      className="flex-1"
                      data-testid="button-apply-naming"
                    >
                      이름감명 신청하기
                    </Button>
                  </div>

                  <div className="mt-4 p-4 bg-muted rounded-lg">
                    <p className="font-semibold text-foreground">입금</p>
                    <p className="text-muted-foreground text-sm mt-1">
                      [입금확인 후 상담일정 잡아드립니다]
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            {/* 비용 및 시간 - 다섯 번째 이미지 */}
            <Card className="p-6 md:p-8 space-y-6">
              <div className="space-y-4 text-center">
                <h2 className="text-2xl font-bold text-foreground">💰 비용 및 시간</h2>
                
                <img 
                  src={image5} 
                  alt="비용 및 시간" 
                  className="w-full rounded-lg"
                  data-testid="img-pricing"
                />

                <div className="mt-4 text-muted-foreground space-y-2">
                  <p>
                    📌 개명 경험이 있거나<br />
                    인원이 많으면<br />
                    상담시간이 더 소요될 수 있습니다.
                  </p>
                  <p className="mt-4">
                    ⚖️ 모든 상담비용은<br />
                    이름연구협회 규정에 따릅니다.
                  </p>
                </div>
              </div>
            </Card>

            {/* 상담 일정 & 진행 방식 */}
            <Card className="p-6 md:p-8 space-y-6">
              <div className="space-y-4 text-center">
                <h2 className="text-2xl font-bold text-foreground">📞 상담 일정 & 진행 방식</h2>
                <div className="text-foreground space-y-3 leading-relaxed">
                  <p>
                    📆 <strong>상담요일:</strong> 수~일
                  </p>
                  <p>
                    ⏰ <strong>상담시간:</strong> 오후 2시
                  </p>
                  <p className="text-sm text-muted-foreground">
                    (정성스런 상담을 위해<br />
                    1타임만 운영하고 있는 점<br />
                    양해부탁드립니다🙏<br />
                    다른 시간에는<br />
                    상담준비, 작명, 교육<br />
                    및 이름연구를 합니다)
                  </p>
                  <p className="mt-4">
                    📃 예약 시간 전에<br />
                    이름분석표 발송 → 전화 상담 진행
                  </p>
                </div>
              </div>
            </Card>

            {/* 작명 & 개명 비용 */}
            <Card className="p-6 md:p-8 space-y-6">
              <div className="space-y-4 text-center">
                <h2 className="text-2xl font-bold text-foreground">🏷️ 작명 & 개명 비용</h2>
                <div className="text-foreground space-y-3 leading-relaxed">
                  <p>
                    신생아 / 성인 동일
                  </p>
                  <p>
                    브랜드/상호/회사명 등은<br />
                    사업 규모에 따라 차등 적용
                  </p>
                  <p className="mt-4">
                    <a 
                      href="https://blog.naver.com/whats_ur_name_777/221266616435"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                      data-testid="link-pricing-detail"
                    >
                      👉 작명비용 자세히 보기
                    </a>
                  </p>
                  <p className="mt-4">
                    ⚖️ 모든 작명비용은<br />
                    이름연구협회 규정에 따릅니다
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
