import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useEffect } from "react";

export default function FamilyPolicy() {
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
            font-size: clamp(15px, 3.8vw, 18px) !important;
          }
          html.${className} h3, html.${className} h4 {
            font-size: clamp(14px, 3.5vw, 17px) !important;
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
        `;
        document.head.appendChild(style);
      }
      
      console.log(`[FamilyPolicy] 인앱 브라우저 감지: ${className}, User Agent: ${userAgent}`);
      
      // JavaScript로 모든 요소 직접 강제 설정
      const applyAllFontSizes = () => {
        // h1 요소
        document.querySelectorAll('h1').forEach(el => {
          (el as HTMLElement).style.setProperty('font-size', '20px', 'important');
        });
        
        // h2 요소
        document.querySelectorAll('h2').forEach(el => {
          (el as HTMLElement).style.setProperty('font-size', '16px', 'important');
        });
        
        // h3, h4 요소
        document.querySelectorAll('h3, h4').forEach(el => {
          (el as HTMLElement).style.setProperty('font-size', '15px', 'important');
        });
        
        // p, li, span 요소
        document.querySelectorAll('p, li, span').forEach(el => {
          if (!(el as HTMLElement).classList.toString().includes('text-')) {
            (el as HTMLElement).style.setProperty('font-size', '14px', 'important');
          }
        });
        
        // text-* 클래스들
        document.querySelectorAll('.text-sm').forEach(el => {
          (el as HTMLElement).style.setProperty('font-size', '13px', 'important');
        });
        document.querySelectorAll('.text-base').forEach(el => {
          (el as HTMLElement).style.setProperty('font-size', '14px', 'important');
        });
        document.querySelectorAll('.text-lg').forEach(el => {
          (el as HTMLElement).style.setProperty('font-size', '14px', 'important');
        });
        document.querySelectorAll('.text-xl').forEach(el => {
          (el as HTMLElement).style.setProperty('font-size', '15px', 'important');
        });
        document.querySelectorAll('.text-2xl').forEach(el => {
          (el as HTMLElement).style.setProperty('font-size', '16px', 'important');
        });
        document.querySelectorAll('.text-3xl').forEach(el => {
          (el as HTMLElement).style.setProperty('font-size', '18px', 'important');
        });
        document.querySelectorAll('.text-4xl').forEach(el => {
          (el as HTMLElement).style.setProperty('font-size', '20px', 'important');
        });
        
        console.log('[FamilyPolicy] 모든 폰트 크기 강제 설정 완료');
      };
      
      // 여러 번 반복 실행
      setTimeout(applyAllFontSizes, 0);
      setTimeout(applyAllFontSizes, 100);
      setTimeout(applyAllFontSizes, 300);
      setTimeout(applyAllFontSizes, 500);
      setTimeout(applyAllFontSizes, 1000);
      setTimeout(applyAllFontSizes, 2000);
    }
    
    window.scrollTo(0, 0);
    
    // cleanup에서 클래스 제거하지 않음 (App.tsx에서 전역 관리)
  }, []);

  const handleClose = () => {
    window.close();
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="space-y-8">
            <Card className="p-6 md:p-8 space-y-6">
              <div className="space-y-4 text-center">
                <h1 className="text-3xl md:text-4xl font-bold text-foreground">👨‍👩‍👧‍👦 등본상 가족 상담 원칙</h1>
                <div className="text-foreground space-y-4 leading-relaxed">
                  <p>
                    가족은 운명 공동체로,<br />
                    서로 이름운의 영향을<br />
                    강하게 주고 받습니다.
                  </p>
                  
                  <div className="mt-6">
                    <h2 className="font-bold text-lg mb-2">💍 결혼, 혼을 연결하는 인연</h2>
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
                    <h2 className="font-bold text-lg mb-2">👶 자녀, 피와 살로 이어진 존재</h2>
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
                    <h2 className="font-bold text-lg mb-2">🔄 이름운, 서로에게 영향을 줍니다</h2>
                    <p>
                      결혼을 하게 되면<br />
                      부부 각자의 이름운이<br />
                      서로에게 영향을 미칩니다.
                    </p>
                    <p className="mt-2">
                      또한,<br />
                      자녀가 태어나게 되면<br />
                      자녀의 초년운이<br />
                      👉 부모의 중년운에 영향을 주고,
                    </p>
                    <p className="mt-2">
                      부모의 중년운은<br />
                      👉 자녀의 초년운에 영향을 미칩니다.
                    </p>
                    <p className="mt-2">
                      이처럼 가족은 운명공동체로서<br />
                      서로 이름운의 영향을<br />
                      밀접하게 주고 받습니다.
                    </p>
                  </div>

                  <div className="mt-6">
                    <h2 className="font-bold text-lg mb-2">📜 이름은 '소리'보다 '글자'가 강합니다</h2>
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

            {/* 페이지 닫기 버튼 */}
            <div className="flex justify-center mt-8">
              <Button
                onClick={handleClose}
                className="gap-2"
                data-testid="button-close"
              >
                <X className="h-4 w-4" />
                페이지 닫기
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
