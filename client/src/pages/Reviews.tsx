import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { Star, Quote, Download, Heart, Clock } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export default function Reviews() {
  const statsRef = useRef<HTMLDivElement>(null);
  const [animated, setAnimated] = useState(false);

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
        `;
        document.head.appendChild(style);
      }
      
      console.log(`[Reviews] 인앱 브라우저 감지: ${className}, User Agent: ${userAgent}`);
      
      return () => {
        document.documentElement.classList.remove(className);
        const styleElement = document.getElementById(styleId);
        if (styleElement) {
          styleElement.remove();
        }
      };
    }
  }, []);

  // 애니메이션 효과
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !animated) {
            setAnimated(true);
            const numElements = entry.target.querySelectorAll('[data-animate-number]');
            numElements.forEach((el) => {
              const target = parseFloat(el.getAttribute('data-target') || '0');
              const suffix = el.getAttribute('data-suffix') || '';
              animateNumber(el as HTMLElement, target, suffix);
            });
          }
        });
      },
      { threshold: 0.35 }
    );

    if (statsRef.current) {
      observer.observe(statsRef.current);
    }

    return () => observer.disconnect();
  }, [animated]);

  const animateNumber = (element: HTMLElement, end: number, suffix: string) => {
    const duration = 1600;
    const start = 0;
    const startTime = performance.now();

    const easeOutQuad = (t: number) => t * (2 - t);

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutQuad(progress);
      const current = Math.floor(start + (end - start) * eased);

      if (suffix === '%') {
        element.textContent = current + '%';
      } else if (suffix === '년') {
        element.textContent = current + '년';
      } else if (suffix === '+') {
        element.textContent = current.toLocaleString() + '+';
      } else {
        element.textContent = current.toLocaleString() + suffix;
      }

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  };
  
  const analysisTestimonials = [
    {
      name: "김○○",
      service: "이름분석",
      content: "이제야 내 삶의 퍼즐이 맞춰지는 것같습니다. 감탄에 감탄",
      rating: 5,
      date: "2025.08",
    },
    {
      name: "이○○",
      service: "이름분석",
      content: "선생님과의 이름분석 상담은 너무나 달랐습니다",
      rating: 5,
      date: "2024.11",
    },
    {
      name: "안○○",
      service: "이름분석",
      content: "내용이 정말 소름끼치게 가깝더라구요",
      rating: 5,
      date: "2023.07",
    },
    {
      name: "박○○",
      service: "이름분석",
      content: "이름을 바꿀 수 있다는 게 얼마나 다행인지",
      rating: 5,
      date: "2024.03",
    },
    {
      name: "홍○○",
      service: "이름분석",
      content: "해결책이 생겨 마음이 편해졌어요",
      rating: 5,
      date: "2022.09",
    },
    {
      name: "최○○",
      service: "이름분석",
      content: "제 인생의 많은 부분을 다시 돌아보며 이해할 수 있는 시간이었습니다",
      rating: 5,
      date: "2023.12",
    },
    {
      name: "권○○",
      service: "이름분석",
      content: "한 시간이 너무 후딱 지나가더라구요. 뭔지 모를 후련함도 생기고. 누군가에게 말못한 고민까지 털어놓게 됐어요",
      rating: 5,
      date: "2021.05",
    },
    {
      name: "이○○",
      service: "이름분석",
      content: "아주 그냥 저희 집에 같이 살고 있는 줄요",
      rating: 5,
      date: "2025.02",
    },
    {
      name: "김○○",
      service: "이름분석",
      content: "이름대로 살고 있는 게 너무 너무 신기해요",
      rating: 5,
      date: "2022.06",
    },
    {
      name: "김○○",
      service: "이름분석",
      content: "지난날이 주마등처럼 지나가면서 저를 토닥여주고 싶었어요",
      rating: 5,
      date: "2024.08",
    },
    {
      name: "양○○",
      service: "이름분석",
      content: "성격 성향이 바뀐 게 이름의 끌어당김이었어요",
      rating: 5,
      date: "2023.03",
    },
  ];

  const testimonials = [
    {
      name: "박○○",
      service: "개명",
      content: "절 좋아하는 사람이 많아졌어요. 예민한 게 사라졌어요. 요즘 돈도 많이 벌어요",
      rating: 5,
      date: "2025.09",
    },
    {
      name: "최○○",
      service: "개명",
      content: "직장과 아파트가 생겼어요. 가전제품도 누가 사주셨어요. 아빠 외도 중이셨는데 정리하고 들어오셨어요. 지금은 소아정신과에서 아이들 진료보고 있는데 마더테레사라고 칭찬받고 인정받아요",
      rating: 5,
      date: "2024.05",
    },
    {
      name: "남○○",
      service: "개명",
      content: "미용실도 이전해서 넘 잘 되고 사랑하는 사람도 생겨 결혼해요",
      rating: 5,
      date: "2023.10",
    },
    {
      name: "김○○",
      service: "개명",
      content: "정부지원사업 3천만원 지원받아 플랫폼 사업 시작해서 넘 잘 돼요",
      rating: 5,
      date: "2022.12",
    },
    {
      name: "류○○",
      service: "개명",
      content: "개명 후 6년 세상에서 가장 행복한 사람",
      rating: 5,
      date: "2021.08",
    },
    {
      name: "이○○",
      service: "개명",
      content: "이상형의 남친이 생겼어요",
      rating: 5,
      date: "2024.01",
    },
    {
      name: "김○○",
      service: "개명",
      content: "가는 곳마다 열광. 이젠 대기업 임원만큼 돈을 벌어요. 크게 되고 빛날 것같아요",
      rating: 5,
      date: "2025.04",
    },
    {
      name: "박○○",
      service: "개명",
      content: "우울증과 알콜의존증으로 약까지 먹고 있었는데 거짓말처럼 술이 안땡겨요. 마음이 편해지고 삶이 의욕적으로 바뀌었어요",
      rating: 5,
      date: "2023.06",
    },
    {
      name: "김○○",
      service: "개명",
      content: "부지런해지고 원하던 회사에 합격했어요",
      rating: 5,
      date: "2022.03",
    },
    {
      name: "최○○",
      service: "개명",
      content: "남편이 달라졌어요. 밉지도 않고. 시어머님에 대한 원망이 사라졌어요. 아이가 알아서 스스로 잘 해요",
      rating: 5,
      date: "2021.11",
    },
  ];

  const stats = [
    { value: "30,000+", label: "누적 상담 건수", icon: Download },
    { value: "98%", label: "고객 만족도", icon: Heart },
    { value: "17년", label: "43만명 임상", icon: Clock, multiline: true }
  ];

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
          <p className="text-lg md:text-2xl text-white/90 mb-8 max-w-3xl mx-auto">
            이름대로 사는 것을 확인한 분들,<br />
            새로운 이름으로<br />
            꽃길을 걸으시는 분들의<br />
            생생한 이야기
          </p>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div ref={statsRef} className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6">
            {stats.map((stat, index) => {
              const IconComponent = stat.icon;
              const numValue = stat.multiline ? 17 : (stat.value.includes('%') ? 98 : 30000);
              const suffix = stat.value.includes('%') ? '%' : (stat.multiline ? '년' : '+');
              
              return (
                <div 
                  key={index} 
                  className={`flex flex-col items-center justify-center text-center py-6 ${index === 0 ? 'col-span-2 sm:col-span-1' : 'col-span-1'}`}
                  data-testid={`stat-${index}`}
                >
                  <div 
                    className="text-[36px] leading-[1.4] sm:text-5xl md:text-[60px] font-extrabold md:leading-relaxed mb-3 sm:mb-4 bg-gradient-to-r from-[#007C73] to-[#00B8A9] bg-clip-text text-transparent w-full px-2"
                    style={{ WebkitTextStroke: '0px' }}
                    data-animate-number
                    data-target={numValue}
                    data-suffix={suffix}
                  >
                    {stat.multiline ? '0년' : (suffix === '%' ? '0%' : '0+')}
                  </div>
                  <div className="flex items-center justify-center gap-2 text-[13px] sm:text-[18px] md:text-[24px] font-semibold text-muted-foreground">
                    <IconComponent className="w-[16px] h-[16px] sm:w-[20px] sm:h-[20px] md:w-[28px] md:h-[28px] opacity-65" strokeWidth={2} />
                    <span>{stat.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 이름분석 상담후기 섹션 */}
      <section id="analysis-testimonials" className="py-16 md:py-24 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center space-y-4 mb-12">
            <h2 className="mt-4 bg-gradient-to-r from-[#0f766e] to-[#4fd1c5] dark:from-[#58C4C4] dark:to-[#6DD4D4] bg-clip-text text-2xl font-extrabold leading-tight text-transparent sm:text-3xl md:text-4xl review-section-title">
              이름분석 상담후기
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {analysisTestimonials.map((testimonial, index) => (
              <Card
                key={index}
                className="p-6 hover-elevate relative"
                data-testid={`analysis-testimonial-card-${index}`}
              >
                {/* Quote Icon */}
                <Quote className="absolute top-6 right-6 w-12 h-12 text-muted-foreground/20" />
                
                {/* Name */}
                <h3 className="text-xl font-bold text-foreground mb-1">
                  {testimonial.name}
                </h3>
                
                {/* Service Type */}
                <p className="text-sm text-muted-foreground mb-4">
                  {testimonial.service}
                </p>
                
                {/* Rating Stars */}
                <div className="flex gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                
                {/* Content */}
                <p className="text-lg leading-relaxed text-foreground mb-6">
                  "{testimonial.content}"
                </p>
                
                {/* Date */}
                <p className="text-sm text-muted-foreground">
                  {testimonial.date}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* 개명 후기 섹션 */}
      <section id="name-change-testimonials" className="py-16 md:py-24 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center space-y-4 mb-12">
            <h2 className="mt-4 bg-gradient-to-r from-[#0f766e] to-[#4fd1c5] dark:from-[#58C4C4] dark:to-[#6DD4D4] bg-clip-text text-2xl font-extrabold leading-tight text-transparent sm:text-3xl md:text-4xl review-section-title">
              개명 후기
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {testimonials.map((testimonial, index) => (
              <Card
                key={index}
                className="p-6 hover-elevate relative"
                data-testid={`testimonial-card-${index}`}
              >
                {/* Quote Icon */}
                <Quote className="absolute top-6 right-6 w-12 h-12 text-muted-foreground/20" />
                
                {/* Name */}
                <h3 className="text-xl font-bold text-foreground mb-1">
                  {testimonial.name}
                </h3>
                
                {/* Service Type */}
                <p className="text-sm text-muted-foreground mb-4">
                  {testimonial.service}
                </p>
                
                {/* Rating Stars */}
                <div className="flex gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                
                {/* Content */}
                <p className="text-lg leading-relaxed text-foreground mb-6">
                  "{testimonial.content}"
                </p>
                
                {/* Date */}
                <p className="text-sm text-muted-foreground">
                  {testimonial.date}
                </p>
              </Card>
            ))}
          </div>

          <div className="mt-12 text-center">
            <a
              href="https://m.blog.naver.com/whats_ur_name_777?categoryNo=11&proxyReferer=https%3A%2F%2Flinkon.id%2F"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 px-8 py-4 rounded-full font-bold text-lg bg-gradient-to-r from-[#007C73] to-[#00B8A9] text-white shadow-[0_8px_20px_rgba(0,140,126,0.25)] transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.03] hover:shadow-[0_12px_28px_rgba(0,140,126,0.3)] active:scale-[0.98] active:shadow-[0_6px_16px_rgba(0,140,126,0.25)]"
              data-testid="link-detailed-testimonials"
            >
              <span>고객 후기 전체보기</span>
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
