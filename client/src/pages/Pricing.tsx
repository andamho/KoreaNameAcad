import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import KnaPricingSection from "@/components/KnaPricingSection";
import { useEffect } from "react";
import pricingCharacterImage from "@assets/KakaoTalk_20251226_150428417_1766729101276.png";

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
          html.${className} .text-\\[18px\\] {
            font-size: 14px !important;
          }
          html.${className} .text-\\[21px\\] {
            font-size: 16px !important;
          }
        `;
        document.head.appendChild(style);
      }
      
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
      <div className="relative">
        <img 
          src={pricingCharacterImage}
          alt="비용 안내 캐릭터"
          className="absolute left-1/2 z-10 top-[32px] sm:top-[40px]"
          style={{ 
            width: 'auto', 
            height: '110px',
            transform: 'translateX(-50%)'
          }}
        />
        <KnaPricingSection showHero={true} />
      </div>
      <Footer />
    </div>
  );
}
