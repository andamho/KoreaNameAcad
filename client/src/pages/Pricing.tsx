import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import KnaPricingSection from "@/components/KnaPricingSection";
import { useEffect } from "react";

export default function Pricing() {
  // 페이지 진입 시 스크롤 탑 (단, 뒤로가기가 아닌 경우에만)
  useEffect(() => {
    if (!window.history.state?.scrollY) {
      window.scrollTo(0, 0);
    }
  }, []);

  useEffect(() => {
    // User Agent로 인앱 브라우저 감지
    const userAgent = navigator.userAgent || '';
    const isInstagram = userAgent.includes('Instagram');
    const isTikTok = userAgent.includes('TikTok') || userAgent.includes('musical_ly');
    
    if (isInstagram || isTikTok) {
      const className = isInstagram ? "ua-instagram" : "ua-tiktok";
      document.documentElement.classList.add(className);
        // 인앱 브라우저용 82% 축소 규칙은 뺐다. 글자 크기가 화면 폭에
        // 맞춰 움직이게 바뀌어서, 이 규칙이 걸리면 앱 안에서만 글자가
        // 눌리거나 커졌다. 이제 일반 브라우저와 같은 크기로 보인다.
      
      console.log(`[Pricing] 인앱 브라우저 감지: ${className}, User Agent: ${userAgent}`);
      
      return () => {
        document.documentElement.classList.remove(className);
      };
    }
  }, []);
  
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <KnaPricingSection showHero={true} />
      <Footer />
    </div>
  );
}
