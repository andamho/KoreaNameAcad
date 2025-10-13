import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { useState } from "react";
import { useLocation } from "wouter";
import logoImage from "@assets/KakaoTalk_20251012_203556567_1760268983553.png";

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [, setLocation] = useLocation();

  const goToHome = () => {
    setLocation("/");
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setMobileMenuOpen(false);
  };

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      setMobileMenuOpen(false);
    }
  };

  return (
    <nav className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <button
              onClick={goToHome}
              className="flex items-center gap-2 hover-elevate active-elevate-2 rounded-md px-2 py-1"
              data-testid="link-home"
            >
              <img 
                src={logoImage} 
                alt="한국이름학교 로고" 
                className="h-10 w-10 md:h-6 md:w-6 dark:invert scale-90 md:scale-110"
              />
              <div className="md:text-xl font-bold text-foreground font-['Noto_Sans_KR']">
                <div className="md:hidden text-left flex flex-col justify-center h-10">
                  <div className="text-[17px] leading-none tracking-tight">한국이름학교</div>
                  <div className="text-[10px] leading-none tracking-[0.05em] mt-0.5">와츠유어네임 이름연구협회</div>
                </div>
                <span className="hidden md:inline whitespace-nowrap tracking-wide">한국이름학교 | 와츠유어네임 이름연구협회</span>
              </div>
            </button>
          </div>

          <div className="hidden md:flex items-center gap-4">
            <Button
              onClick={() => scrollToSection('services')}
              className="min-w-[120px] text-sm"
              data-testid="button-apply-now"
            >
              지금 신청
            </Button>
            <Button
              variant="outline"
              asChild
              className="min-w-[100px] text-sm"
            >
              <a
                href="https://pf.kakao.com/_Sxnvbb/chat"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="button-inquiry"
              >
                문의
              </a>
            </Button>
            <ThemeToggle />
          </div>

          <div className="flex md:hidden items-center gap-2">
            <div className="-translate-x-[2px] scale-[1.54]">
              <ThemeToggle />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              data-testid="button-mobile-menu"
              className="scale-[1.54]"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden py-4 space-y-2">
            <Button
              onClick={() => scrollToSection('services')}
              className="w-full text-sm"
              data-testid="mobile-button-apply-now"
            >
              지금 신청
            </Button>
            <Button
              variant="outline"
              asChild
              className="w-full text-sm"
            >
              <a
                href="https://pf.kakao.com/_Sxnvbb/chat"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="mobile-button-inquiry"
              >
                문의
              </a>
            </Button>
          </div>
        )}
      </div>
    </nav>
  );
}
