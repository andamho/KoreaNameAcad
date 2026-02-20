import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ContentGrid } from "@/components/ContentGrid";
import { Building2 } from "lucide-react";
import { useEffect } from "react";
import { useScrollRestore } from "@/hooks/use-scroll-restore";

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
      
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0d9488] to-[#14b8a6] dark:from-[#0f766e] dark:to-[#0d9488] py-16 md:py-20">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzBoLTR2NGg0di00em0wLThoLTR2NGg0di00em04IDhoLTR2NGg0di00em0tOCA4aC00djRoNHYtNHptOCAwaC00djRoNHYtNHptMC04aC00djRoNHYtNHptOC04aC00djRoNHYtNHptMCA4aC00djRoNHYtNHptLTggMGgtNHY0aDR2LTR6bTggOGgtNHY0aDR2LTR6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-20"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center mb-6">
              <Building2 className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-[22px] md:text-4xl lg:text-5xl font-extrabold text-white mb-4" data-testid="text-about-title">
              협회 소개
            </h1>
            <p className="text-[16px] md:text-xl text-white/90 max-w-2xl">
              와츠유어네임 이름연구협회를 소개합니다
            </p>
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
