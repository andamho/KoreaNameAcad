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
            font-size: clamp(22px, 5.5vw, 28px) !important;
          }
          html.${className} h2 {
            font-size: clamp(18px, 4.5vw, 24px) !important;
          }
          html.${className} h3 {
            font-size: clamp(16px, 4vw, 20px) !important;
          }
          html.${className} p, html.${className} li {
            font-size: 14px !important;
          }
          html.${className} .text-xl {
            font-size: 16px !important;
          }
          html.${className} .text-2xl {
            font-size: 18px !important;
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
      <KnaPricingSection />
      <Footer />
    </div>
  );
}
