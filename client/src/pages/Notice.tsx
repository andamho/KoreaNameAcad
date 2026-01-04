import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Bell } from "lucide-react";
import { useEffect } from "react";

export default function Notice() {
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
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="pt-[100px] pb-16 legal-page-content">
        <div className="max-w-4xl mx-auto px-6">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-8">
            공지사항
          </h1>
          
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Bell className="w-16 h-16 text-muted-foreground/40 mb-6" />
            <p className="text-lg text-muted-foreground">
              현재 등록된 공지사항이 없습니다.
            </p>
            <p className="text-sm text-muted-foreground/70 mt-2">
              새로운 소식이 있으면 이곳에 안내드리겠습니다.
            </p>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
