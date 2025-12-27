import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import KnaPricingSection from "@/components/KnaPricingSection";

export default function Pricing() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <KnaPricingSection showHero={true} />
      <Footer />
    </div>
  );
}
