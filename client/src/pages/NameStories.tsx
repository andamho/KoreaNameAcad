import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Play, Calendar, MessageCircle, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useAdmin } from "@/contexts/AdminContext";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Content } from "@shared/schema";
import storiesCharacterImage from "@assets/KakaoTalk_20251226_141747822_1766726282057.png";
import { useEffect } from "react";

function formatDate(dateValue: string | Date) {
  const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
  return `${date.getFullYear()}. ${String(date.getMonth() + 1).padStart(2, '0')}. ${String(date.getDate()).padStart(2, '0')}.`;
}

function StoryCard({ story }: { story: Content }) {
  const { isAdmin, token } = useAdmin();
  const { toast } = useToast();
  
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/contents/${story.id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to delete");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contents", "nameStory"] });
      toast({ title: "삭제되었습니다." });
    },
    onError: () => {
      toast({ title: "삭제 실패", variant: "destructive" });
    },
  });

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("정말 삭제하시겠습니까?")) {
      deleteMutation.mutate();
    }
  };

  return (
    <Link href={`/name-stories/${story.id}`}>
      <Card 
        className="group overflow-hidden hover-elevate active-elevate-2 cursor-pointer relative"
        data-testid={`card-story-${story.id}`}
      >
        {/* 관리자 삭제 버튼 */}
        {isAdmin && (
          <button
            onClick={handleDelete}
            className="absolute top-2 left-2 z-10 p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full opacity-80 hover:opacity-100 transition-opacity"
            data-testid={`button-delete-${story.id}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
        
        {/* 임시저장 배지 */}
        {isAdmin && story.isDraft && (
          <div className="absolute top-2 right-2 z-10 px-2 py-0.5 bg-yellow-500 text-white text-xs font-medium rounded">
            임시
          </div>
        )}
        
        <div className="relative aspect-square overflow-hidden">
          <img
            src={story.thumbnail || "/placeholder-thumbnail.jpg"}
            alt={story.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          {story.isVideo && !story.isDraft && (
            <div className="absolute top-2 right-2">
              <div className="w-8 h-8 bg-black/60 rounded-full flex items-center justify-center">
                <Play className="w-4 h-4 text-white fill-white ml-0.5" />
              </div>
            </div>
          )}
        </div>
        <div className="p-4">
          <h3 className="text-base font-semibold text-foreground line-clamp-2 mb-2">
            {story.title}
          </h3>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {formatDate(story.createdAt)}
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle className="w-4 h-4" />
              0
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}

function StorySkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="aspect-square w-full" />
      <div className="p-4 space-y-3">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </Card>
  );
}

export default function NameStories() {
  const { isAdmin, token, isVerifying } = useAdmin();
  
  const { data: stories, isLoading, error } = useQuery<Content[]>({
    queryKey: ["/api/contents", "nameStory"],
    queryFn: async () => {
      const response = await fetch("/api/contents?category=nameStory");
      if (!response.ok) throw new Error("Failed to fetch stories");
      return response.json();
    },
  });

  useEffect(() => {
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
            font-size: clamp(18px, 4.5vw, 22px) !important;
          }
          html.${className} h2 {
            font-size: clamp(16px, 4vw, 20px) !important;
          }
          html.${className} h3, html.${className} h4 {
            font-size: clamp(15px, 3.8vw, 18px) !important;
          }
          html.${className} p, html.${className} li, html.${className} span {
            font-size: 14px !important;
          }
          html.${className} .text-4xl {
            font-size: 20px !important;
          }
          html.${className} .text-5xl {
            font-size: 22px !important;
          }
          html.${className} .text-lg {
            font-size: 14px !important;
          }
          html.${className} .text-2xl {
            font-size: 16px !important;
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
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      
      {/* Hero Section with character on right */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0f766e] to-[#4fd1c5] dark:from-[#0a5850] dark:to-[#3ba89e] py-16 md:py-24">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzBoLTR2NGg0di00em0wLThoLTR2NGg0di00em04IDhoLTR2NGg0di00em0tOCA4aC00djRoNHYtNHptOCAwaC00djRoNHYtNHptMC04aC00djRoNHYtNHptOC04aC00djRoNHYtNHptMCA4aC00djRoNHYtNHptLTggMGgtNHY0aDR2LTR6bTggOGgtNHY0aDR2LTR6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-20"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12">
            {/* Character - on top for mobile, right for desktop */}
            <img 
              src={storiesCharacterImage}
              alt="이름이야기 캐릭터"
              className="w-auto h-40 md:h-56 flex-shrink-0 order-1 md:order-2"
            />
            {/* Title, description, and button as one unit */}
            <div className="text-center md:text-left order-2 md:order-1">
              <p className="text-sm font-medium tracking-wide text-white/70 mb-2">NAMING STORIES</p>
              <h1 className="text-[22px] md:text-5xl lg:text-6xl font-extrabold text-white mb-4" data-testid="text-stories-title">
                흥미진진 이름이야기
              </h1>
              <p className="text-[16px] md:text-2xl text-white/90 mb-8">
                이름에 담긴 흥미로운 이야기들을 만나보세요
              </p>
              <a
                href="https://m.blog.naver.com/whats_ur_name_777?categoryNo=10&tab=1#contentslist_block"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full font-semibold text-sm bg-[#56D5DB] text-white shadow-sm transition-all duration-200 hover:bg-[#4ac5cb] hover:shadow-md active:scale-[0.98]"
                data-testid="link-blog-stories"
              >
                <span>자세히 보기</span>
                <span className="text-lg">›</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <main className="flex-1 py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">

          {/* Story cards */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <StorySkeleton key={i} />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">콘텐츠를 불러오는데 실패했습니다.</p>
            </div>
          ) : stories && stories.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {stories.map((story) => (
                <StoryCard key={story.id} story={story} />
              ))}
            </div>
          ) : null}
        </div>
      </main>

      <Footer />
    </div>
  );
}
