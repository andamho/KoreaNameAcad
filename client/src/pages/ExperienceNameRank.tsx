import { useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { useAdmin } from "@/contexts/AdminContext";

export default function ExperienceNameRank() {
  const [, setLocation] = useLocation();
  const { isAdmin, isVerifying } = useAdmin();

  useEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => {
    if (!isVerifying && !isAdmin) setLocation('/experience-zone');
  }, [isVerifying, isAdmin, setLocation]);

  if (isVerifying || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <section className="relative overflow-hidden pt-16 pb-[150px] md:pt-24 md:pb-56 border-0 outline-none">
        <img src="/alone-fate-hero.png" alt="" className="absolute inset-0 w-full h-full object-cover object-top" fetchPriority="high" loading="eager" decoding="sync" aria-hidden />
        <div className="absolute bottom-0 left-0 w-full" aria-hidden>
          <svg viewBox="0 0 1200 150" preserveAspectRatio="none" className="w-full h-28 md:h-36 block">
            <path d="M0,150 L0,0 Q600,150 1200,0 L1200,150 Z" className="fill-background" />
          </svg>
        </div>
        <div className="relative max-w-2xl mx-auto px-5 text-center">
          <button onClick={() => setLocation('/experience-zone')}
            className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 font-semibold text-sm mb-6 transition-colors">
            <ChevronLeft className="w-4 h-4" /> 체험 ZONE
          </button>
          <h1 className="leading-tight text-slate-900">
            <span className="block text-5xl md:text-6xl font-black tracking-tight">전국 몇 등?</span>
            <span className="block text-3xl md:text-4xl font-light tracking-wide mt-1">내 이름의 전국 순위</span>
          </h1>
        </div>
      </section>
      <main className="flex-1 py-10 md:py-14 -mt-px border-0">
        <div className="max-w-2xl mx-auto px-5 space-y-6">
          <video
            src="/namerank.mp4"
            controls
            playsInline
            className="w-full rounded-2xl shadow-lg bg-black"
            style={{ maxHeight: '80vh' }}
          />
        </div>
      </main>
      <Footer />
    </div>
  );
}
