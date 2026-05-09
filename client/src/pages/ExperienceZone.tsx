import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Flame, User, Heart, Sprout, Infinity, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAdmin } from "@/contexts/AdminContext";

const experiences: {
  id: string;
  Icon: LucideIcon;
  title: string;
  description: string;
  available: boolean;
  adminOnly?: boolean;
  path?: string;
}[] = [
  {
    id: "short-life",
    Icon: Flame,
    title: "단명운 10초 만에 알아보기",
    description: "이름이 보내는 단명의 신호, 지금 바로 확인해보세요.",
    available: false,
  },
  {
    id: "alone-fate",
    Icon: User,
    title: "혼자살 팔자 10초 만에 아는 법",
    description: "혼자 사는 운명인지, 이름으로 10초 만에 알아보세요.",
    adminOnly: true,
    available: true,
    path: "/experience-zone/alone-fate",
  },
  {
    id: "husband-luck",
    Icon: Heart,
    title: "남편복 1초 만에 아는 법",
    description: "이름에서 남편복을 단 1초 만에 읽어낼 수 있다면?",
    adminOnly: true,
    available: true,
    path: "/experience-zone/husband-luck",
  },
  {
    id: "children-luck",
    Icon: Sprout,
    title: "자식복 1초 만에 아는 법",
    description: "내 이름 속에 자식복이 담겨 있을까요? 지금 확인해보세요.",
    available: false,
  },
  {
    id: "destiny-number",
    Icon: Infinity,
    title: "운명의 화신: 숫자로 읽는 나의 본능",
    description: "숫자 속에 새겨진 나의 본능적 운명, 지금 바로 읽어보세요.",
    available: false,
  },
];

export default function ExperienceZone() {
  const [, setLocation] = useLocation();
  const { isAdmin } = useAdmin();

  useEffect(() => {
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

      return () => {
        document.documentElement.classList.remove(className);
      };
    }
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-16 pb-[150px] md:pt-24 md:pb-56">
        <img
          src="/mesh-header-hero.png"
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-top"
          fetchPriority="high"
          loading="eager"
          decoding="sync"
          aria-hidden="true"
        />
        {/* 볼록 하단 SVG */}
        <div className="absolute bottom-0 left-0 w-full" aria-hidden="true">
          <svg viewBox="0 0 1200 150" preserveAspectRatio="none" className="w-full h-28 md:h-36 block">
            <path d="M0,150 L0,0 Q600,150 1200,0 L1200,150 Z" className="fill-background" />
          </svg>
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12">
            <img
              src="/experience-zone-character-opt.webp"
              alt="체험 ZONE 캐릭터"
              className="w-auto h-40 md:h-56 flex-shrink-0"
              fetchPriority="high"
              loading="eager"
              decoding="async"
            />
            <div className="text-center md:text-left">
              <p className="text-sm font-medium tracking-wide text-slate-600 mb-2">EXPERIENCE ZONE</p>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white mb-6">
                체험 ZONE
              </h1>
              <p className="text-lg md:text-2xl text-slate-700">
                내 이름으로 직접 체험해보세요
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 카드 목록 */}
      <main className="flex-1 py-16 md:py-20 -mt-2">
        <div className="max-w-xl mx-auto px-5 space-y-5">
          {experiences.map((exp) => {
            const { Icon } = exp;
            const isAvailable = exp.available && (!exp.adminOnly || isAdmin);
            const path = isAvailable ? exp.path : undefined;
            return (
              <div
                key={exp.id}
                onClick={() => isAvailable && path && setLocation(path)}
                className={`group relative rounded-2xl bg-card border px-6 py-5 flex items-center gap-5 transition-colors duration-200 ${isAvailable ? "border-[#18a999]/30 hover:border-[#18a999] cursor-pointer" : "border-border/50"}`}
                style={{ boxShadow: "0 4px 28px rgba(0,0,0,0.06)" }}
              >
                {/* 아이콘 */}
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ring-1 ${isAvailable ? "bg-[#18a999]/15 ring-[#18a999]/30" : "bg-[#18a999]/10 ring-[#18a999]/20"}`}>
                  <Icon className="h-6 w-6 text-[#18a999]" />
                </div>

                {/* 텍스트 */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-foreground text-base leading-snug tracking-tight">
                    {exp.title}
                  </div>
                </div>

                {/* 상태 */}
                {isAvailable ? (
                  <ChevronRight className="flex-shrink-0 w-5 h-5 text-[#18a999]" />
                ) : (
                  <div className="flex-shrink-0 text-[11px] text-muted-foreground/35 tracking-widest font-light">
                    준비중
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      <Footer />
    </div>
  );
}
