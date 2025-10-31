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
      
      // JavaScript로 네비바 텍스트 크기 강제 적용
      const applyNavbarStyles = () => {
        const mainElements = document.querySelectorAll('.kna-brand-main');
        const subElements = document.querySelectorAll('.kna-brand-sub');
        
        mainElements.forEach(el => {
          (el as HTMLElement).style.setProperty('font-size', '13px', 'important');
          (el as HTMLElement).style.setProperty('line-height', '1', 'important');
        });
        
        subElements.forEach(el => {
          (el as HTMLElement).style.setProperty('font-size', '10px', 'important');
          (el as HTMLElement).style.setProperty('line-height', '1', 'important');
          (el as HTMLElement).style.setProperty('margin-top', '3px', 'important');
        });
        
        console.log(`[Pricing] 네비바 스타일 적용 완료`);
      };
      
      applyNavbarStyles();
      setTimeout(applyNavbarStyles, 100);
      setTimeout(applyNavbarStyles, 300);
      setTimeout(applyNavbarStyles, 500);
      
      console.log(`[Pricing] 인앱 브라우저 감지: ${className}, User Agent: ${userAgent}`);
      
      return () => {
        document.documentElement.classList.remove(className);
        const styleElement = document.getElementById(styleId);
        if (styleElement) {
          styleElement.remove();
        }
      };
    }
  }, []);
  
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <KnaPricingSection />
      <Footer />
    </div>
  );
}
