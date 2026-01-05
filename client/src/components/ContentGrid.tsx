import { useQuery } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { Link } from "wouter";
import type { Content } from "@shared/schema";

interface ContentGridProps {
  category: "nameStory" | "expert" | "announcement" | "review";
  basePath: string;
  emptyMessage?: string;
}

export function ContentGrid({ category, basePath, emptyMessage = "등록된 콘텐츠가 없습니다." }: ContentGridProps) {
  const { data: contents, isLoading } = useQuery<Content[]>({
    queryKey: ["/api/contents", category],
    queryFn: async () => {
      const response = await fetch(`/api/contents?category=${category}`);
      if (!response.ok) throw new Error("Failed to fetch contents");
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="aspect-square bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  if (!contents || contents.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4">
      {contents.map((content) => (
        <ContentCard key={content.id} content={content} basePath={basePath} />
      ))}
    </div>
  );
}

interface ContentCardProps {
  content: Content;
  basePath: string;
}

function ContentCard({ content, basePath }: ContentCardProps) {
  const thumbnailUrl = content.thumbnail || "/placeholder-thumbnail.jpg";
  
  return (
    <Link href={`${basePath}/${content.id}`} data-testid={`content-card-${content.id}`}>
      <div className="group cursor-pointer">
        {/* 썸네일 - 항상 표시 */}
        <div className="relative aspect-square rounded-lg overflow-hidden bg-muted">
          <img
            src={thumbnailUrl}
            alt={content.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
          {content.isVideo && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/90 flex items-center justify-center">
                <Play className="w-5 h-5 sm:w-6 sm:h-6 text-primary ml-0.5" fill="currentColor" />
              </div>
            </div>
          )}
        </div>
        
        {/* 제목과 날짜 - 데스크톱에서만 표시 */}
        <div className="hidden sm:block mt-2">
          <h3 className="font-medium text-foreground line-clamp-2 text-sm group-hover:text-primary transition-colors">
            {content.title}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {new Date(content.createdAt).toLocaleDateString("ko-KR")}
          </p>
        </div>
      </div>
    </Link>
  );
}
