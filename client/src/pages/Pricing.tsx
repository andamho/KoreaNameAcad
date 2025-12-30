import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import KnaPricingSection from "@/components/KnaPricingSection";
import { useEffect } from "react";

export default function Pricing() {
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
          html.${className} h1:not(.kna-navbar *) {
            font-size: clamp(18px, 4.5vw, 22px) !important;
          }
          html.${className} h2:not(.kna-navbar *) {
            font-size: clamp(16px, 4vw, 20px) !important;
          }
          html.${className} h3:not(.kna-navbar *), html.${className} h4:not(.kna-navbar *) {
            font-size: clamp(15px, 3.8vw, 18px) !important;
          }
          html.${className} p:not(.kna-navbar *), html.${className} li:not(.kna-navbar *), html.${className} span:not(.kna-navbar *) {
            font-size: 14px !important;
          }
          html.${className} .text-sm:not(.kna-navbar *) {
            font-size: 13px !important;
          }
          html.${className} .text-base:not(.kna-navbar *) {
            font-size: 14px !important;
          }
          html.${className} .text-lg:not(.kna-navbar *) {
            font-size: 14px !important;
          }
          html.${className} .text-xl:not(.kna-navbar *) {
            font-size: 15px !important;
          }
          html.${className} .text-2xl:not(.kna-navbar *) {
            font-size: 16px !important;
          }
          html.${className} .text-3xl:not(.kna-navbar *) {
            font-size: 18px !important;
          }
          html.${className} .text-4xl:not(.kna-navbar *) {
            font-size: 20px !important;
          }
          html.${className} .text-\\[18px\\]:not(.kna-navbar *) {
            font-size: 14px !important;
          }
          html.${className} .text-\\[21px\\]:not(.kna-navbar *) {
            font-size: 16px !important;
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
          (el as HTMLElement).style.setProperty('font-size', '6.7px', 'important');
          (el as HTMLElement).style.setProperty('line-height', '1', 'important');
          (el as HTMLElement).style.setProperty('margin-top', '3px', 'important');
          (el as HTMLElement).style.setProperty('letter-spacing', '-0.068em', 'important');
        });
        
        console.log(`[Pricing] 네비바 스타일 적용 완료`);
      };
      
      applyNavbarStyles();
      setTimeout(applyNavbarStyles, 100);
      setTimeout(applyNavbarStyles, 300);
      setTimeout(applyNavbarStyles, 500);
      
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
