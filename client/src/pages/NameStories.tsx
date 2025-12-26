import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Play, Calendar, MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import type { NameStory } from "@shared/schema";
import storiesCharacterImage from "@assets/KakaoTalk_20251226_141747822_1766726282057.png";

function formatDate(dateValue: string | Date) {
  const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
  return `${date.getFullYear()}. ${String(date.getMonth() + 1).padStart(2, '0')}. ${String(date.getDate()).padStart(2, '0')}.`;
}

function StoryCard({ story }: { story: NameStory }) {
  return (
    <Link href={`/name-stories/${story.id}`}>
      <Card 
        className="group overflow-hidden hover-elevate active-elevate-2 cursor-pointer"
        data-testid={`card-story-${story.id}`}
      >
        <div className="relative aspect-square overflow-hidden">
          <img
            src={story.thumbnail}
            alt={story.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          {story.isVideo && (
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
  const { data: stories, isLoading, error } = useQuery<NameStory[]>({
    queryKey: ["/api/name-stories"],
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      
      <main className="flex-1 py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          {/* Header with character on right (hand pointing left), centered as a unit */}
          <div className="flex flex-col items-center justify-center mb-16">
            {/* Title and description - always centered */}
            <div className="text-center mb-8">
              <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                재미있는 이름이야기
              </h1>
              <p className="text-lg text-muted-foreground">
                이름에 담긴 흥미로운 이야기들을 만나보세요
              </p>
            </div>
            
            {/* Button + Character row - centered as a unit */}
            <div className="flex flex-row items-center justify-center gap-4 md:gap-8">
              <a
                href="https://m.blog.naver.com/whats_ur_name_777?categoryNo=10&tab=1#contentslist_block"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2.5 px-8 py-4 rounded-full font-bold text-lg bg-gradient-to-r from-[#007C73] to-[#00B8A9] text-white shadow-[0_8px_20px_rgba(0,140,126,0.25)] transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.03] hover:shadow-[0_12px_28px_rgba(0,140,126,0.3)] active:scale-[0.98] active:shadow-[0_6px_16px_rgba(0,140,126,0.25)]"
                data-testid="link-blog-stories"
              >
                <span>자세히 보기</span>
              </a>
              <img 
                src={storiesCharacterImage}
                alt="이름이야기 캐릭터"
                className="w-auto h-24 md:h-48 flex-shrink-0"
              />
            </div>
          </div>

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
