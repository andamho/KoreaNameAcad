import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Flame, User, Heart, Sprout, Infinity } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const experiences: {
  id: string;
  Icon: LucideIcon;
  title: string;
  description: string;
  available: boolean;
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
    available: false,
  },
  {
    id: "husband-luck",
    Icon: Heart,
    title: "남편복 1초 만에 아는 법",
    description: "이름에서 남편복을 단 1초 만에 읽어낼 수 있다면?",
    available: false,
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
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      {/* Hero Section */}
      <section className="relative overflow-hidden py-16 md:py-24">
        <img
          src="/bank-card-bg-opt.webp"
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          fetchPriority="high"
          loading="eager"
          decoding="async"
          aria-hidden="true"
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12">
            <img
              src="/experience-zone-character.png"
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
      <main className="flex-1 py-16 md:py-20">
        <div className="max-w-xl mx-auto px-5 space-y-5">
          {experiences.map((exp) => {
            const { Icon } = exp;
            return (
              <div
                key={exp.id}
                className="group relative rounded-2xl bg-card border border-border/50 px-6 py-5 flex items-center gap-5 transition-colors duration-200 hover:border-border"
                style={{ boxShadow: "0 4px 28px rgba(0,0,0,0.06)" }}
              >
                {/* 우측 상단 작은 점 */}
                <span className="absolute top-4 right-4 w-1.5 h-1.5 rounded-full bg-foreground/15" />

                {/* 아이콘 */}
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#18a999]/10 ring-1 ring-[#18a999]/20">
                  <Icon className="h-6 w-6 text-[#18a999]" />
                </div>

                {/* 텍스트 */}
                <div className="flex-1 min-w-0 pr-3">
                  <div className="font-semibold text-foreground text-[15px] leading-snug mb-0.5 tracking-tight">
                    {exp.title}
                  </div>
                  <div className="text-[13px] text-muted-foreground/80 leading-relaxed">
                    {exp.description}
                  </div>
                </div>

                {/* 준비중 */}
                <div className="flex-shrink-0 text-[11px] text-muted-foreground/35 tracking-widest font-light">
                  준비중
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <Footer />
    </div>
  );
}
