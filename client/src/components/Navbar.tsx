import { Menu, X, MessageCircle, FileText, Star, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import logoImage from "@assets/KakaoTalk_20251014_171358611_1760429674941.png";

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [, setLocation] = useLocation();

  // Close menu on ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && menuOpen) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [menuOpen]);

  const goToHome = () => {
    setLocation("/");
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setMenuOpen(false);
  };

  const goToPage = (path: string) => {
    setLocation(path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setMenuOpen(false);
  };

  const menuItems = [
    { 
      icon: FileText, 
      label: "전문서비스", 
      action: () => goToPage('/services'),
      description: "이름 분석 · 작명"
    },
    { 
      icon: DollarSign, 
      label: "비용", 
      action: () => goToPage('/pricing'),
      description: "상담비 · 소요시간"
    },
    { 
      icon: Star, 
      label: "이름후기", 
      action: () => goToPage('/reviews'),
      description: "고객 후기 보기"
    },
    { 
      icon: MessageCircle, 
      label: "문의", 
      href: "https://pf.kakao.com/_Sxnvbb/chat",
      description: "카카오톡 문의"
    }
  ];

  return (
    <>
      <nav className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b">
        <div className="max-w-7xl mx-auto px-1 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <button
                onClick={goToHome}
                className="flex items-center gap-1 sm:gap-2 hover-elevate active-elevate-2 rounded-md px-0 sm:px-2 py-1"
                data-testid="link-home"
              >
                <img 
                  src={logoImage} 
                  alt="한국이름학교 로고" 
                  className="h-10 w-10 md:h-6 md:w-6 scale-90 md:scale-110"
                />
                <div className="md:text-xl font-bold text-foreground font-['Noto_Sans_KR']">
                  <div className="md:hidden text-left flex flex-col justify-center h-10">
                    <div className="text-[17px] leading-none tracking-tight">한국이름학교</div>
                    <div className="text-[10px] leading-none tracking-[-0.02em] mt-0.5">와츠유어네임 이름연구협회</div>
                  </div>
                  <span className="hidden md:inline whitespace-nowrap tracking-wide">한국이름학교 | 와츠유어네임 이름연구협회</span>
                </div>
              </button>
            </div>

            <div className="flex items-center gap-1 sm:gap-3">
              <div className="md:hidden scale-[1.54]">
                <ThemeToggle />
              </div>
              <div className="hidden md:block">
                <ThemeToggle />
              </div>
              <Button
                variant="ghost"
                onClick={() => setMenuOpen(!menuOpen)}
                data-testid="button-menu"
                className="flex items-center gap-2 md:gap-2 scale-[1.54] md:scale-100 pr-1 sm:pr-3"
              >
                {menuOpen ? (
                  <X className="h-5 w-5 md:h-6 md:w-6 md:scale-[1.26]" />
                ) : (
                  <Menu className="h-5 w-5 md:h-6 md:w-6 md:scale-[1.26]" />
                )}
                <span className="hidden md:inline text-sm font-medium">메뉴</span>
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Menu Overlay */}
      {menuOpen && (
        <>
          <div 
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
            onClick={() => setMenuOpen(false)}
          />
          <div className="fixed top-16 right-0 w-full md:w-96 bg-card border-l border-b shadow-2xl z-50 max-h-[calc(100vh-4rem)] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-lg font-bold mb-6 text-foreground">메뉴</h3>
              <div className="space-y-1">
                {menuItems.map((item, index) => (
                  item.href ? (
                    <a
                      key={index}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-4 p-4 rounded-lg hover-elevate active-elevate-2 group"
                      data-testid={`menu-item-${index}`}
                      onClick={() => setMenuOpen(false)}
                    >
                      <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                        <item.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-foreground">{item.label}</div>
                        <div className="text-sm text-muted-foreground">{item.description}</div>
                      </div>
                    </a>
                  ) : (
                    <button
                      key={index}
                      onClick={item.action}
                      className="w-full flex items-center gap-4 p-4 rounded-lg hover-elevate active-elevate-2 group text-left"
                      data-testid={`menu-item-${index}`}
                    >
                      <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                        <item.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-foreground">{item.label}</div>
                        <div className="text-sm text-muted-foreground">{item.description}</div>
                      </div>
                    </button>
                  )
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
