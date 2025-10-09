import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { useState } from "react";
import { useLocation } from "wouter";
import logoImage from "@assets/KakaoTalk_20251008_214156536_1759927358373.png";

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
          <div className="flex items-center gap-6">
            <button
              onClick={goToHome}
              className="flex items-center gap-3 hover-elevate active-elevate-2 rounded-md px-2 py-1"
              data-testid="link-home"
            >
              <img 
                src={logoImage} 
                alt="한국이름학교 로고" 
                className="h-8 w-8 dark:invert"
              />
              <span className="text-xl font-bold text-foreground tracking-wide">
                한국이름학교 | 와츠유어네임 이름연구협회
              </span>
            </button>
            
            <div className="hidden xl:flex items-center gap-3">
              <span className="text-sm text-muted-foreground">이름분석</span>
              <span className="text-sm text-muted-foreground">이름감명</span>
              <span className="text-sm text-muted-foreground">이름분석 및 감명 상세 안내</span>
              <span className="text-sm text-muted-foreground">개명</span>
              <span className="text-sm text-muted-foreground">신생아 작명</span>
              <span className="text-sm text-muted-foreground">상호작명</span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-4">
            <Button
              onClick={() => scrollToSection('services')}
              className="min-w-[120px]"
              data-testid="button-apply-now"
            >
              지금 신청
            </Button>
            <Button
              variant="outline"
              asChild
              className="min-w-[100px]"
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
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              data-testid="button-mobile-menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden py-4 space-y-2">
            <Button
              onClick={() => scrollToSection('services')}
              className="w-full"
              data-testid="mobile-button-apply-now"
            >
              지금 신청
            </Button>
            <Button
              variant="outline"
              asChild
              className="w-full"
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
