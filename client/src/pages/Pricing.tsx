import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import KnaPricingSection from "@/components/KnaPricingSection";
import pricingCharacterImage from "@assets/KakaoTalk_20251226_150428417_1766729101276.png";

export default function Pricing() {
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
