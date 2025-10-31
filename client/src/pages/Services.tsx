import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ServiceCard } from "@/components/ServiceCard";
import { Search, Star, Flower, Baby, Building } from "lucide-react";
import { useLocation } from "wouter";
import { useEffect } from "react";

export default function Services() {
  const [, setLocation] = useLocation();
  
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
            font-size: clamp(16px, 4vw, 20px) !important;
          }
          html.${className} h3, html.${className} h4 {
            font-size: clamp(15px, 3.8vw, 18px) !important;
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
          html.${className} [data-testid="text-process-title"] {
            font-size: clamp(20px, 5vw, 24px) !important;
          }
        `;
        document.head.appendChild(style);
      }
      
      // JavaScript로 네비바 텍스트 크기 강제 적용
      const applyNavbarStyles = () => {
        const mainElements = document.querySelectorAll('.kna-brand-main');
        const subElements = document.querySelectorAll('.kna-brand-sub');
        
        mainElements.forEach(el => {
          (el as HTMLElement).style.setProperty('font-size', '13px', 'important');
          (el as HTMLElement).style.setProperty('line-height', '1', 'important');
        });
        
        subElements.forEach(el => {
          (el as HTMLElement).style.setProperty('font-size', '8px', 'important');
          (el as HTMLElement).style.setProperty('line-height', '1', 'important');
          (el as HTMLElement).style.setProperty('margin-top', '3px', 'important');
          (el as HTMLElement).style.setProperty('letter-spacing', '-0.05em', 'important');
        });
        
        console.log(`[Services] 네비바 스타일 적용 완료`);
      };
      
      applyNavbarStyles();
      setTimeout(applyNavbarStyles, 100);
      setTimeout(applyNavbarStyles, 300);
      setTimeout(applyNavbarStyles, 500);
      
      console.log(`[Services] 인앱 브라우저 감지: ${className}, User Agent: ${userAgent}`);
      
      return () => {
        document.documentElement.classList.remove(className);
        const styleElement = document.getElementById(styleId);
        if (styleElement) {
          styleElement.remove();
        }
      };
    }
  }, []);
  
  const nameConsultationSteps = [
    {
      n: 1,
      title: "일정예약",
      desc: "신청서 접수, 입금확인 후 예약"
    },
    { 
      n: 2, 
      title: "이름분석표 발송", 
      desc: "상담 바로 전" 
    },
    { 
      n: 3, 
      title: "전화상담 진행", 
      desc: "분석표 보며 상담" 
    }
  ];

  const renameSteps = [
    { n: 1, title: "개명비 입금" },
    { n: 2, title: "작명시작" },
    {
      n: 3,
      title: "희망사항 10가지 제출",
      desc: "1주일 내"
    },
    { 
      n: 4, 
      title: "작명 진행 및 마무리", 
      desc: "희망사항까지 반영한 작명 (개인 1달 / 가족 2달)" 
    },
    { 
      n: 5, 
      title: "새 이름 설명(전화상담)", 
      desc: "완성된 이름과 이름운 설명" 
    },
    { 
      n: 6, 
      title: "한글이름 선택", 
      desc: "3개 제시(평균)" 
    },
    { 
      n: 7, 
      title: "작명장 PDF 발송",
      desc: "선택된 한글이름의 한자가 포함된 작명장" 
    }
  ];

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
          <p className="text-xl md:text-2xl text-white/90 max-w-3xl mx-auto text-center">
            고달픈 인생,<br />
            이름 하나로 이유와 해결책을
          </p>
        </div>
      </section>

      {/* Professional Services */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <ServiceCard
              icon={Search}
              title="이름분석"
              description="현재 이름에 들어있는 16가지운을 전문적으로 분석해드립니다."
              buttonText="신청하기"
              onClick={() => setLocation("/?open=analysis&from=/services")}
              secondaryButtonText="자세히 보기"
              onSecondaryClick={() => setLocation("/?detail=analysis&from=/services")}
              data-testid="card-service-0"
            />
            <ServiceCard
              icon={Star}
              title="이름감명"
              description="타 작명소에서 받은 이름의 적합도를 점검해드립니다"
              buttonText="신청하기"
              onClick={() => setLocation("/?open=naming&from=/services")}
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
      <section className="py-16 md:py-24 bg-slate-50 dark:bg-slate-900/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="mt-4 bg-gradient-to-r from-[#0f766e] to-[#4fd1c5] dark:from-[#58C4C4] dark:to-[#6DD4D4] bg-clip-text text-[25px] font-extrabold leading-tight text-transparent sm:text-3xl md:text-4xl" data-testid="text-process-title">
              진행 과정
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-10">
            {/* 이름상담 진행과정 */}
            <div className="bg-white dark:bg-slate-800/50 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 p-6 md:p-8" data-testid="card-process-consultation">
              <h3 className="text-xl md:text-2xl font-bold mb-6">
                이름상담
              </h3>

              <ol className="space-y-6">
                {nameConsultationSteps.map((s) => (
                  <li key={s.n} className="flex items-start gap-4" data-testid={`process-consultation-step-${s.n}`}>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white bg-[#0f766e] dark:bg-[#58C4C4] font-semibold">
                      {s.n}
                    </div>
                    <div className="flex-1">
                      <div className="text-lg md:text-xl font-semibold">
                        {s.title}
                      </div>
                      {s.desc && (
                        <div className="text-base md:text-lg text-muted-foreground mt-1">
                          → {s.desc}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {/* 개명 진행 과정 */}
            <div className="bg-white dark:bg-slate-800/50 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 p-6 md:p-8" data-testid="card-process-rename">
              <h3 className="text-xl md:text-2xl font-bold mb-6">
                개명
              </h3>

              <ol className="space-y-6">
                {renameSteps.map((s) => (
                  <li key={s.n} className="flex items-start gap-4" data-testid={`process-rename-step-${s.n}`}>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white bg-[#0f766e] dark:bg-[#58C4C4] font-semibold">
                      {s.n}
                    </div>
                    <div className="flex-1">
                      <div className="text-lg md:text-xl font-semibold">
                        {s.title}
                      </div>
                      {s.desc && (
                        <div className="text-base md:text-lg text-muted-foreground mt-1">
                          → {s.desc}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
