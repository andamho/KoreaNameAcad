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
      // 인앱 표시(ua-instagram / ua-tiktok)는 App 이 전역으로 관리한다. 여기서 붙이지 않는다.
      
      // 인앱 font-size 강제 주입은 없앱다.
      //
      // 예전에는 <style>(inapp-style-*)을 만들어 기준자(html)를 14px 로 못박고
      // h1~h4 · p/li/span · .text-sm ~ .text-4xl 을 px 로 고정했다. !important 라
      // index.css 의 공통 ÷1.3 보정을 전부 이겼다.
      //
      // 선택자에 페이지 제한이 없어 문서 전체에 걸렸고, 이 화면의 푸터까지
      // 망가뜨렸다. 338px 에서 주입을 켜고 재보니 글자 90개 중 78개가 어긋났고
      // 그중 27개가 푸터였다.
      //   푸터 '이름이 맑아야'      25.2 → 18.2  (0.72배)
      //   푸터 '[정확도 80% 이상]'  12.6 → 18.2  (1.45배)
      //   본문 '비용 및 시간'         32.4 → 26.1  (0.80배)
      //
      // 체험존·서비스·후기·이름이야기와 같은 정리다. 크기는 공통 보정에 맡긴다.
      // 빈 <style> 을 만들지도 않는다. id 를 여러 페이지가 함께 쓰기 때문에
      // 빈 태그가 남으면 다른 페이지가 자기 스타일을 못 만든다.
      console.log(`[Pricing] 인앱 브라우저 감지: ${className}, User Agent: ${userAgent}`);
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
