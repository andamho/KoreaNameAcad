import { MessageCircle, FileText, Star, DollarSign, BookOpen, PenSquare, Lock, LogOut, User, FileEdit, Upload, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAdmin } from "@/contexts/AdminContext";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import logoImage from "@assets/file_000000009b2c7206ad0a70c0142cb99a_1766915164756.png";

// 인앱 브라우저용 작은 base64 로고 (836 bytes) - HTML에서 미리 로드
const LOGO_TINY = (typeof window !== 'undefined' && (window as any).__LOGO_TINY) || 
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACABAMAAAAxEHz4AAAAIVBMVEVHcExW1ttY1ttS1dtV1dtT1dta19z5/v6n6eyE4OXT9PZkEfEhAAAABnRSTlMAruEddUD/GPw7AAACzElEQVRo3u2XzXLaMBDHyVDuCW2554tz00nuTUNzZkimdxiyY/UBIqMHsCU/AAgeoDI8ZWTZgE1ssrJPnep/IRD2x+5K3o9Wy8nJycnJyekf0t3gTGvwVNO8fd8Ho4sv3+rY33Zhp/MaTtz2IafxQzN7gMkPO/tODw40HloBfsI7XdnY30CJPjcJwASBP8wRlOoS7UC/HIB24TtUCJmFdq8KMMYBPkGlcLfpdzXgGhVBvxqASuORCHAxjI4BMFehdwwwtb5FUhSf6o+TcAIg8vZ5gsQkQV9DFWwtuIh8yefZO49hkvAIsGDGhEi+jJjyl1yk79UM4AWTQ48yAYRzIRWbE8W45NoLqWiAuM3mGq0ojYngisb6p0lEWSznEaXrOSKLnSTWtf62L1Sc5U9GTIbafpXkZoi5hyqWGxqH2+QBYRGNRcQwd/EETAhMSD+ck422WW3mhIU6H3Sd/O8UVUySELj2IMnbH6oBXIcQAx6gz0+lgHUGYPGSo56GFBDq70sDYClAaKKPAqTVxNOWKYAGKUB/EKBqSlaOiIxMCIy+piHEIjuTF2Q9I8J4MFMs9UBujxQLAG4ArwsaGQC3BkDqgUepAQAWsC9onvEgyWMBcI3uSqkHsDgAXKIBmQeeJeDk0AMdQwFwiu4KXhiQTZw8TLqWCXRn6OwBC3/752K2q5If1oN9YyOcZpePUB7g6/q+r/Awc2HhS4sO/7iPQdC/5jXnAKI15cYTvkrqO1E+t2mOueZMRKgJIZOBTXvO90YplB8xnmtuk6Fdd5a6NwhuOSUVZjQuxa41YueD4oTCC/aoCaU45ZEao+ao4ZTWfE6snpKmOPvybcFmY6galvELw00zB6pcmFqsn2UHYbf4ldyFr3Z787u978pyfz5c3M7t9s6E0G1mrwn3u9Iyqbf/t5+7BnFx9tCqq7vnweDXU8vJycnJycnpv9IbR7jl9lsqExQAAAAASUVORK5CYII=';

// 카테고리 옵션
const categoryOptions = [
  { value: "review", label: "후기" },
  { value: "nameStory", label: "이름이야기" },
  { value: "announcement", label: "공지사항" },
  { value: "expert", label: "한국이름학교" },
];

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [hasBeenOpened, setHasBeenOpened] = useState(false);
  const [, setLocation] = useLocation();
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  
  // Admin state
  const { isAdmin, login, logout } = useAdmin();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Login dialog
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  // Write dialog
  const [showWriteDialog, setShowWriteDialog] = useState(false);
  const [writeForm, setWriteForm] = useState({
    category: "review" as string,
    title: "",
    thumbnail: "",
    content: "",
    isVideo: false,
    videoUrl: "",
    isDraft: false,
  });
  
  // Uploaded images list (Naver Blog style)
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const uploadedImagesRef = useRef<string[]>([]);
  
  // Keep ref in sync with state
  uploadedImagesRef.current = uploadedImages;
  
  // Image upload (unified - both thumbnail and content)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = useUpload({
    onSuccess: (response) => {
      const imageUrl = response.objectPath;
      console.log("[Navbar] onSuccess - 새 이미지 URL:", imageUrl);
      console.log("[Navbar] onSuccess - BEFORE uploadedImages:", uploadedImages, "len:", uploadedImages.length);
      
      setUploadedImages(prev => {
        console.log("[Navbar] setUploadedImages - prev:", prev, "len:", prev.length);
        const newImages = [...prev, imageUrl];
        console.log("[Navbar] setUploadedImages - AFTER newImages:", newImages, "len:", newImages.length);
        // First image automatically becomes thumbnail
        if (newImages.length === 1) {
          setWriteForm(form => ({ ...form, thumbnail: imageUrl }));
        }
        return newImages;
      });
      toast({ title: "이미지가 추가되었습니다." });
    },
    onError: () => {
      toast({ title: "이미지 업로드에 실패했습니다.", variant: "destructive" });
    },
  });
  
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) {
          toast({ title: "이미지 파일만 업로드할 수 있습니다.", variant: "destructive" });
          continue;
        }
        await uploadFile(file);
      }
    }
    e.target.value = "";
  };
  
  // Set selected image as thumbnail
  const setAsThumbnail = (imageUrl: string) => {
    setWriteForm(prev => ({ ...prev, thumbnail: imageUrl }));
    toast({ title: "대표 이미지가 변경되었습니다." });
  };
  
  // Reset form including images
  const resetWriteForm = () => {
    setWriteForm({
      category: "review",
      title: "",
      thumbnail: "",
      content: "",
      isVideo: false,
      videoUrl: "",
      isDraft: false,
    });
    setUploadedImages([]);
  };

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
  
  // Scroll listener for navbar transparency
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 0);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial check
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  // Login handler
  const handleLogin = async () => {
    if (!loginPassword.trim()) {
      toast({ title: "비밀번호를 입력해주세요.", variant: "destructive" });
      return;
    }
    setIsLoggingIn(true);
    const success = await login(loginPassword);
    setIsLoggingIn(false);
    if (success) {
      setShowLoginDialog(false);
      setLoginPassword("");
      toast({ title: "관리자로 로그인되었습니다." });
    } else {
      toast({ title: "비밀번호가 틀렸습니다.", variant: "destructive" });
    }
  };
  
  // Logout handler
  const handleLogout = () => {
    logout();
    toast({ title: "로그아웃되었습니다." });
    setMenuOpen(false);
  };
  
  // Create content mutation
  const createContentMutation = useMutation({
    mutationFn: async (data: typeof writeForm) => {
      const token = localStorage.getItem("kna_admin_token");
      const response = await fetch("/api/contents", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to create content");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contents", data.category] });
      queryClient.invalidateQueries({ queryKey: ["/api/contents", "drafts"] });
      setShowWriteDialog(false);
      setWriteForm({
        category: "review",
        title: "",
        thumbnail: "",
        content: "",
        isVideo: false,
        videoUrl: "",
        isDraft: false,
      });
      if (data.isDraft) {
        toast({ title: "임시저장되었습니다." });
        setLocation("/drafts");
      } else {
        toast({ title: "콘텐츠가 등록되었습니다." });
      }
    },
    onError: () => {
      toast({ title: "등록에 실패했습니다.", variant: "destructive" });
    },
  });
  
  const handleWriteSubmit = (asDraft: boolean = false) => {
    if (!writeForm.title.trim() || !writeForm.content.trim()) {
      toast({ title: "제목과 내용을 입력해주세요.", variant: "destructive" });
      return;
    }
    
    // useRef를 사용하여 최신 이미지 순서 가져오기 (클로저 문제 해결)
    const currentImages = uploadedImagesRef.current;
    
    // 디버깅: 현재 uploadedImages 상태 확인
    console.log("[Navbar] handleWriteSubmit - currentImages (from ref):", currentImages);
    console.log("[Navbar] handleWriteSubmit - currentImages.length:", currentImages.length);
    
    // 썸네일 결정 (첫번째 이미지 또는 선택된 이미지)
    const finalThumbnail = writeForm.thumbnail || currentImages[0] || "";
    
    // 이미지를 content 맨 앞에 마크다운으로 추가
    // 기존 content에서 이미지 마크다운 제거 후 새로 추가
    // 썸네일은 content에서 제외 (중복 방지)
    const imageRegex = /!\[[^\]]*\]\([^)]+\)\n*/g;
    const cleanContent = writeForm.content.replace(imageRegex, '').trim();
    const contentImages = currentImages.filter(img => img !== finalThumbnail);
    const imagesMarkdown = contentImages.map(img => `![이미지](${img})`).join('\n');
    const finalContent = imagesMarkdown ? `${imagesMarkdown}\n\n${cleanContent}` : cleanContent;
    
    const payload = {
      ...writeForm,
      thumbnail: finalThumbnail,
      content: finalContent,
      isDraft: asDraft,
    };
    
    // 디버깅: 서버로 보내는 payload 확인
    console.log("[Navbar] handleWriteSubmit - payload:", payload);
    console.log("[Navbar] handleWriteSubmit - images count:", currentImages.length);
    
    createContentMutation.mutate(payload);
  };

  const goToHome = () => {
    // 인앱 브라우저에서는 해당 경로로 이동
    const isInstagram = document.documentElement.classList.contains('ua-instagram');
    const isTikTok = document.documentElement.classList.contains('ua-tiktok');
    
    // history state 초기화 (modal만 제거, popupShown은 유지)
    const currentState = window.history.state || {};
    window.history.replaceState({ popupShown: currentState.popupShown || true }, "", window.location.pathname);
    
    // 모든 Dialog 닫기 이벤트 발생
    window.dispatchEvent(new CustomEvent('closeAllDialogs'));
    
    if (isInstagram) {
      setLocation("/ig");
    } else if (isTikTok) {
      setLocation("/tt");
    } else {
      setLocation("/");
    }
    setMenuOpen(false);
    
    // 페이지 최상단으로 스크롤
    window.scrollTo(0, 0);
  };

  const goToPage = (path: string) => {
    // 스크롤 복원 데이터 삭제 (메뉴에서 이동 시 맨 위에서 시작)
    try {
      const positions = JSON.parse(sessionStorage.getItem("kna_scroll_positions") || "{}");
      delete positions[path];
      sessionStorage.setItem("kna_scroll_positions", JSON.stringify(positions));
    } catch {}
    
    setLocation(path);
    setMenuOpen(false);
    // 페이지 최상단으로 스크롤
    window.scrollTo(0, 0);
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
      <nav className={`kna-navbar fixed top-0 left-0 right-0 z-50 transition-shadow duration-100 ${scrolled ? 'bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-sm' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 lg:max-w-none lg:px-12">
          <div className="flex items-center justify-between h-[80px]">
            <div className="flex items-center gap-2">
              <button
                onClick={goToHome}
                className="flex items-center gap-0.5 sm:gap-1 rounded-md px-0 sm:px-2 py-1"
                data-testid="link-home"
              >
                <img 
                  ref={imgRef}
                  src={logoLoaded ? logoImage : LOGO_TINY} 
                  alt="한국이름학교 로고" 
                  className="h-[84px] w-[84px] md:h-[96px] md:w-[96px] -ml-[17px] -mr-[13px] md:-ml-[15px] md:-mr-[11px]"
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
                <div className="font-bold text-foreground text-left flex flex-col justify-center">
                  <div className="kna-brand-main leading-none">한국이름학교</div>
                  <div className="kna-brand-sub leading-none mt-0.5">와츠유어네임 이름연구협회</div>
                </div>
              </button>
            </div>

            <div className="flex items-center gap-1 sm:gap-3">
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowWriteDialog(true)}
                  data-testid="button-write"
                  className="text-primary hover:bg-primary/10"
                >
                  <PenSquare className="h-5 w-5" />
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => {
                  if (!menuOpen) setHasBeenOpened(true);
                  setMenuOpen(!menuOpen);
                }}
                data-testid="button-menu"
                className="flex items-center gap-2 md:gap-2 md:scale-100 -mr-[14px] sm:mr-0 sm:pr-3 no-default-hover-elevate no-default-active-elevate"
              >
                <div className={`hamburger-icon ${menuOpen ? 'open' : ''} ${hasBeenOpened ? 'animated' : ''}`}>
                  <span className="hamburger-line line-1"></span>
                  <span className="hamburger-line line-2"></span>
                  <span className="hamburger-line line-3"></span>
                </div>
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
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[100]"
            onClick={() => setMenuOpen(false)}
          />
          <div className="kna-menu-overlay fixed top-[80px] right-0 w-full md:w-96 bg-card border-l border-b shadow-2xl z-[200] max-h-[calc(100vh-80px)] overflow-y-auto">
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
                
                {/* 관리자 로그인/로그아웃 */}
                <div className="border-t border-border mt-4 pt-4">
                  {isAdmin ? (
                    <>
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          setShowWriteDialog(true);
                        }}
                        className="w-full flex items-center gap-4 p-4 rounded-lg hover-elevate active-elevate-2 group text-left"
                        data-testid="button-write-menu"
                      >
                        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                          <PenSquare className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-foreground">글쓰기</div>
                          <div className="text-sm text-muted-foreground">새 콘텐츠 작성</div>
                        </div>
                      </button>
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          goToPage('/drafts');
                        }}
                        className="w-full flex items-center gap-4 p-4 rounded-lg hover-elevate active-elevate-2 group text-left"
                        data-testid="button-drafts-menu"
                      >
                        <div className="w-10 h-10 bg-yellow-500/10 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-yellow-500/20 transition-colors">
                          <FileEdit className="h-5 w-5 text-yellow-600" />
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-foreground">임시저장함</div>
                          <div className="text-sm text-muted-foreground">저장된 초안 관리</div>
                        </div>
                      </button>
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-4 p-4 rounded-lg hover-elevate active-elevate-2 group text-left"
                        data-testid="button-admin-logout"
                      >
                        <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-muted/80 transition-colors">
                          <LogOut className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-foreground">로그아웃</div>
                          <div className="text-sm text-muted-foreground">관리자 모드 종료</div>
                        </div>
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        setShowLoginDialog(true);
                      }}
                      className="w-full flex items-center gap-4 p-4 rounded-lg hover-elevate active-elevate-2 group text-left"
                      data-testid="button-admin-login-menu"
                    >
                      <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-muted/80 transition-colors">
                        <Lock className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-foreground">관리자</div>
                        <div className="text-sm text-muted-foreground">관리자 로그인</div>
                      </div>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      
      {/* 관리자 로그인 다이얼로그 */}
      <Dialog open={showLoginDialog} onOpenChange={setShowLoginDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5" />
              관리자 로그인
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="admin-password">비밀번호</Label>
              <Input
                id="admin-password"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                placeholder="비밀번호를 입력하세요"
                data-testid="input-admin-password"
              />
            </div>
            <Button 
              onClick={handleLogin} 
              disabled={isLoggingIn}
              className="w-full"
              data-testid="button-admin-login-submit"
            >
              {isLoggingIn ? "로그인 중..." : "로그인"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* 글쓰기 다이얼로그 */}
      <Dialog open={showWriteDialog} onOpenChange={setShowWriteDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PenSquare className="w-5 h-5" />
              새 글 작성
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
              <Label className="text-sm font-semibold text-primary mb-3 block">카테고리 선택 (필수)</Label>
              <div className="grid grid-cols-2 gap-2">
                {categoryOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setWriteForm(prev => ({ ...prev, category: opt.value }))}
                    className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                      writeForm.category === opt.value 
                        ? 'border-primary bg-primary text-primary-foreground' 
                        : 'border-border bg-background text-foreground hover:border-primary/50'
                    }`}
                    data-testid={`button-category-${opt.value}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="write-title">제목</Label>
              <Input
                id="write-title"
                value={writeForm.title}
                onChange={(e) => setWriteForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="제목을 입력하세요"
                data-testid="input-write-title"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>이미지</Label>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleImageUpload}
                    data-testid="input-write-images"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    data-testid="button-write-upload-images"
                  >
                    <ImageIcon className="w-4 h-4 mr-1" />
                    {isUploading ? "업로드 중..." : "이미지 추가"}
                  </Button>
                </div>
              </div>
              {uploadedImages.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">클릭: 대표 이미지 선택 | 드래그: 순서 변경 | X: 삭제</p>
                  <div className="grid grid-cols-4 gap-2">
                    {uploadedImages.map((img, idx) => (
                      <div 
                        key={img} 
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', idx.toString());
                          e.currentTarget.style.opacity = '0.5';
                        }}
                        onDragEnd={(e) => {
                          e.currentTarget.style.opacity = '1';
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.currentTarget.style.transform = 'scale(1.05)';
                        }}
                        onDragLeave={(e) => {
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.currentTarget.style.transform = 'scale(1)';
                          const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
                          if (fromIdx !== idx) {
                            setUploadedImages(prev => {
                              const newArr = [...prev];
                              const [moved] = newArr.splice(fromIdx, 1);
                              newArr.splice(idx, 0, moved);
                              return newArr;
                            });
                          }
                        }}
                        className={`relative aspect-square cursor-grab active:cursor-grabbing rounded overflow-hidden border-2 transition-transform ${writeForm.thumbnail === img ? 'border-primary ring-2 ring-primary' : 'border-transparent hover:border-muted-foreground/50'}`}
                        onClick={() => setAsThumbnail(img)}
                        data-testid={`image-thumbnail-select-${idx}`}
                      >
                        <img 
                          src={img} 
                          alt={`이미지 ${idx + 1}`} 
                          className="w-full h-full object-cover pointer-events-none"
                        />
                        {writeForm.thumbnail === img && (
                          <div className="absolute top-1 left-1 bg-primary text-primary-foreground text-[10px] px-1 rounded">
                            대표
                          </div>
                        )}
                        {/* 삭제 버튼 */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setUploadedImages(prev => prev.filter((_, i) => i !== idx));
                            if (writeForm.thumbnail === img) {
                              const remaining = uploadedImages.filter((_, i) => i !== idx);
                              setWriteForm(form => ({ ...form, thumbnail: remaining[0] || "" }));
                            }
                          }}
                          className="absolute top-1 right-1 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs"
                          data-testid={`button-remove-image-${idx}`}
                        >
                          ×
                        </button>
                        {/* 순서 변경 버튼 (모바일용) */}
                        <div className="absolute bottom-1 right-1 flex gap-0.5">
                          {idx > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setUploadedImages(prev => {
                                  const newArr = [...prev];
                                  [newArr[idx - 1], newArr[idx]] = [newArr[idx], newArr[idx - 1]];
                                  return newArr;
                                });
                              }}
                              className="w-5 h-5 bg-black/60 hover:bg-black/80 text-white rounded flex items-center justify-center text-xs"
                              data-testid={`button-move-left-${idx}`}
                            >
                              ←
                            </button>
                          )}
                          {idx < uploadedImages.length - 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setUploadedImages(prev => {
                                  const newArr = [...prev];
                                  [newArr[idx], newArr[idx + 1]] = [newArr[idx + 1], newArr[idx]];
                                  return newArr;
                                });
                              }}
                              className="w-5 h-5 bg-black/60 hover:bg-black/80 text-white rounded flex items-center justify-center text-xs"
                              data-testid={`button-move-right-${idx}`}
                            >
                              →
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="write-content">내용</Label>
              <Textarea
                id="write-content"
                value={writeForm.content}
                onChange={(e) => setWriteForm(prev => ({ ...prev, content: e.target.value }))}
                placeholder="내용을 입력하세요"
                rows={6}
                data-testid="input-write-content"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="write-isVideo"
                checked={writeForm.isVideo}
                onChange={(e) => setWriteForm(prev => ({ ...prev, isVideo: e.target.checked }))}
                className="h-4 w-4"
                data-testid="checkbox-write-isvideo"
              />
              <Label htmlFor="write-isVideo" className="cursor-pointer">동영상 콘텐츠</Label>
            </div>
            {writeForm.isVideo && (
              <div>
                <Label htmlFor="write-videoUrl">YouTube URL</Label>
                <Input
                  id="write-videoUrl"
                  value={writeForm.videoUrl}
                  onChange={(e) => {
                    const url = e.target.value;
                    setWriteForm(prev => ({ ...prev, videoUrl: url }));
                    // YouTube 썸네일 자동 추출
                    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([^&\s?]+)/);
                    if (match && match[1]) {
                      const thumbnailUrl = `https://img.youtube.com/vi/${match[1]}/maxresdefault.jpg`;
                      setWriteForm(prev => ({ ...prev, thumbnail: thumbnailUrl }));
                    }
                  }}
                  placeholder="https://youtube.com/watch?v=..."
                  data-testid="input-write-videourl"
                />
                {writeForm.thumbnail && writeForm.thumbnail.includes('img.youtube.com') && (
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground mb-1">자동 추출된 썸네일:</p>
                    <img 
                      src={writeForm.thumbnail} 
                      alt="YouTube 썸네일" 
                      className="w-full max-w-[200px] rounded border"
                      onError={(e) => {
                        // maxresdefault 실패 시 hqdefault로 대체
                        const target = e.target as HTMLImageElement;
                        if (target.src.includes('maxresdefault')) {
                          target.src = target.src.replace('maxresdefault', 'hqdefault');
                        }
                      }}
                    />
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Button 
                onClick={() => handleWriteSubmit(true)}
                disabled={createContentMutation.isPending}
                variant="outline"
                className="flex-1"
                data-testid="button-write-draft"
              >
                {createContentMutation.isPending ? "저장 중..." : "임시저장"}
              </Button>
              <Button 
                onClick={() => handleWriteSubmit(false)}
                disabled={createContentMutation.isPending}
                className="flex-1"
                data-testid="button-write-submit"
              >
                {createContentMutation.isPending ? "등록 중..." : "등록하기"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Spacer for fixed navbar */}
      <div className="h-[80px]" />
    </>
  );
}
