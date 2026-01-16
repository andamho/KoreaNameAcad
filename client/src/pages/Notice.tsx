import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ContentGrid } from "@/components/ContentGrid";
import { Bell } from "lucide-react";
import { useEffect } from "react";

export default function Notice() {
  // 페이지 진입 시 스크롤 탑 (단, 뒤로가기가 아닌 경우에만)
  useEffect(() => {
    if (!window.history.state?.scrollY) {
      window.scrollTo(0, 0);
    }
  }, []);

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
      
      <section className="relative overflow-hidden bg-gradient-to-br from-[#f59e0b] to-[#ef4444] dark:from-[#d97706] dark:to-[#dc2626] py-16 md:py-20">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzBoLTR2NGg0di00em0wLThoLTR2NGg0di00em04IDhoLTR2NGg0di00em0tOCA4aC00djRoNHYtNHptOCAwaC00djRoNHYtNHptMC04aC00djRoNHYtNHptOC04aC00djRoNHYtNHptMCA4aC00djRoNHYtNHptLTggMGgtNHY0aDR2LTR6bTggOGgtNHY0aDR2LTR6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-20"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center mb-6">
              <Bell className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-[22px] md:text-4xl lg:text-5xl font-extrabold text-white mb-4" data-testid="text-notice-title">
              공지사항
            </h1>
            <p className="text-[16px] md:text-xl text-white/90 max-w-2xl">
              한국이름학교의 새로운 소식을 확인하세요
            </p>
          </div>
        </div>
      </section>

      <main className="flex-1 py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <ContentGrid 
            category="announcement" 
            basePath="/notice"
            emptyMessage="현재 등록된 공지사항이 없습니다."
          />
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
