import { Menu, X, MessageCircle, FileText, Star, DollarSign, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import logoImage from "@assets/file_000000009b2c7206ad0a70c0142cb99a_1766915164756.png";

// 인앱 브라우저용 작은 base64 로고 (836 bytes) - HTML에서 미리 로드
const LOGO_TINY = (typeof window !== 'undefined' && (window as any).__LOGO_TINY) || 
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACABAMAAAAxEHz4AAAAIVBMVEVHcExW1ttY1ttS1dtV1dtT1dta19z5/v6n6eyE4OXT9PZkEfEhAAAABnRSTlMAruEddUD/GPw7AAACzElEQVRo3u2XzXLaMBDHyVDuCW2554tz00nuTUNzZkimdxiyY/UBIqMHsCU/AAgeoDI8ZWTZgE1ssrJPnep/IRD2x+5K3o9Wy8nJycnJyekf0t3gTGvwVNO8fd8Ho4sv3+rY33Zhp/MaTtz2IafxQzN7gMkPO/tODw40HloBfsI7XdnY30CJPjcJwASBP8wRlOoS7UC/HIB24TtUCJmFdq8KMMYBPkGlcLfpdzXgGhVBvxqASuORCHAxjI4BMFehdwwwtb5FUhSf6o+TcAIg8vZ5gsQkQV9DFWwtuIh8yefZO49hkvAIsGDGhEi+jJjyl1yk79UM4AWTQ48yAYRzIRWbE8W45NoLqWiAuM3mGq0ojYngisb6p0lEWSznEaXrOSKLnSTWtf62L1Sc5U9GTIbafpXkZoi5hyqWGxqH2+QBYRGNRcQwd/EETAhMSD+ck422WW3mhIU6H3Sd/O8UVUySELj2IMnbH6oBXIcQAx6gz0+lgHUGYPGSo56GFBDq70sDYClAaKKPAqTVxNOWKYAGKUB/EKBqSlaOiIxMCIy+piHEIjuTF2Q9I8J4MFMs9UBujxQLAG4ArwsaGQC3BkDqgUepAQAWsC9onvEgyWMBcI3uSqkHsDgAXKIBmQeeJeDk0AMdQwFwiu4KXhiQTZw8TLqWCXRn6OwBC3/752K2q5If1oN9YyOcZpePUB7g6/q+r/Awc2HhS4sO/7iPQdC/5jXnAKI15cYTvkrqO1E+t2mOueZMRKgJIZOBTXvO90YplB8xnmtuk6Fdd5a6NwhuOSUVZjQuxa41YueD4oTCC/aoCaU45ZEao+ao4ZTWfE6snpKmOPvybcFmY6galvELw00zB6pcmFqsn2UHYbf4ldyFr3Z787u978pyfz5c3M7t9s6E0G1mrwn3u9Iyqbf/t5+7BnFx9tCqq7vnweDXU8vJycnJycnpv9IbR7jl9lsqExQAAAAASUVORK5CYII=';

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [, setLocation] = useLocation();
  const [logoLoaded, setLogoLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

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
      icon: BookOpen, 
      label: "흥미진진 이름이야기", 
      action: () => goToPage('/name-stories'),
      description: "이름에 담긴 이야기"
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
      <nav className="kna-navbar fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="max-w-7xl mx-auto px-0.5 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <button
                onClick={goToHome}
                className="flex items-center gap-0.5 sm:gap-1 hover-elevate active-elevate-2 rounded-md px-0 sm:px-2 py-1"
                data-testid="link-home"
              >
                <img 
                  ref={imgRef}
                  src={logoLoaded ? logoImage : LOGO_TINY} 
                  alt="한국이름학교 로고" 
                  className="h-16 w-16 md:h-[58px] md:w-[58px] -ml-3 -mr-[13px]"
                  loading="eager"
                  decoding="sync"
                  onLoad={() => {
                    // 큰 로고 미리 로드
                    if (!logoLoaded) {
                      const img = new Image();
                      img.src = logoImage;
                      img.onload = () => setLogoLoaded(true);
                    }
                  }}
                />
                <div className="md:text-xl font-bold text-foreground font-['Noto_Sans_KR']">
                  <div className="md:hidden text-left flex flex-col justify-center h-10">
                    <div className="kna-brand-main leading-none tracking-tight">한국이름학교</div>
                    <div className="kna-brand-sub leading-none tracking-[-0.12em] mt-0.5">와츠유어네임 이름연구협회</div>
                  </div>
                  <span className="hidden md:inline whitespace-nowrap tracking-wide">한국이름학교 | 와츠유어네임 이름연구협회</span>
                </div>
              </button>
            </div>

            <div className="flex items-center gap-1 sm:gap-3">
              <Button
                variant="ghost"
                onClick={() => setMenuOpen(!menuOpen)}
                data-testid="button-menu"
                className="flex items-center gap-2 md:gap-2 scale-[1.54] md:scale-100 pr-0.5 sm:pr-3"
              >
                {menuOpen ? (
                  <X className="h-[26px] w-[26px] md:h-6 md:w-6 md:scale-[1.26] text-[#58C4C4]" strokeWidth={2.3} />
                ) : (
                  <Menu className="h-[26px] w-[26px] md:h-6 md:w-6 md:scale-[1.26] text-[#58C4C4]" strokeWidth={2.3} />
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
          <div className="kna-menu-overlay fixed top-16 right-0 w-full md:w-96 bg-card border-l border-b shadow-2xl z-50 max-h-[calc(100vh-4rem)] overflow-y-auto">
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
      {/* Spacer for fixed navbar */}
      <div className="h-16" />
    </>
  );
}
