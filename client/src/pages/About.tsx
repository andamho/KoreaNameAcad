import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ContentGrid } from "@/components/ContentGrid";
import { useEffect } from "react";
import { useScrollRestore } from "@/hooks/use-scroll-restore";
import aboutCharacterImage from "@assets/KakaoTalk_20260305_100337313_1772672651584.png";

export default function About() {
  useScrollRestore("/about");

  useEffect(() => {
    const userAgent = navigator.userAgent || '';
    const isInstagram = userAgent.includes('Instagram');
    const isTikTok = userAgent.includes('TikTok') || userAgent.includes('musical_ly');
    
    if (isInstagram || isTikTok) {
      const className = isInstagram ? "ua-instagram" : "ua-tiktok";
      document.documentElement.classList.add(className);
      
      return () => {
        document.documentElement.classList.remove(className);
      };
    }
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      
      {/* Hero Section - 다른 페이지와 동일한 패턴 */}
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
              src={aboutCharacterImage}
              alt="협회 소개 캐릭터"
              className="w-auto h-40 md:h-56 flex-shrink-0"
            />
            <div className="text-center md:text-left">
              <p className="text-sm font-medium tracking-wide text-slate-600 mb-2">ABOUT US</p>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white mb-6" data-testid="text-about-title">
                협회 소개
              </h1>
              <p className="text-lg md:text-2xl text-slate-700">
                와츠유어네임 이름연구협회를<br />
                소개합니다
              </p>
            </div>
          </div>
        </div>
      </section>

      <main className="flex-1 py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <ContentGrid 
            category="about" 
            basePath="/about"
            emptyMessage="협회 소개 콘텐츠가 준비 중입니다."
          />
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
