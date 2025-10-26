import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import KnaPricingSection from "@/components/KnaPricingSection";
import { useEffect } from "react";

export default function Pricing() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromPage = params.get("from");
    
    if (fromPage === "/ig" || fromPage === "/tt") {
      const className = fromPage === "/ig" ? "ua-instagram" : "ua-tiktok";
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
            font-size: clamp(24px, 6vw, 32px) !important;
          }
          html.${className} h2 {
            font-size: clamp(20px, 5vw, 26px) !important;
          }
          html.${className} h3 {
            font-size: clamp(16px, 4vw, 20px) !important;
          }
          html.${className} p, html.${className} li {
            font-size: 14px !important;
          }
        `;
        document.head.appendChild(style);
      }
      
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
