import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Content } from "@shared/schema";

const PLACEHOLDER_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Crect fill='%23e5e7eb' width='400' height='400'/%3E%3Ctext fill='%239ca3af' font-family='sans-serif' font-size='14' x='50%25' y='50%25' text-anchor='middle' dy='.3em'%3E이미지 없음%3C/text%3E%3C/svg%3E`;

function getCategoryPath(category: string): string {
  switch (category) {
    case "review":
      return "/reviews";
    case "nameStory":
      return "/name-stories";
    default:
      return "/reviews";
  }
}

function getCategoryDetailPath(category: string, id: string): string {
  switch (category) {
    case "review":
      return `/reviews/${id}`;
    case "nameStory":
      return `/name-stories/${id}`;
    default:
      return `/reviews/${id}`;
  }
}

export function HomeBlogGrid() {
  const { data: contents, isLoading } = useQuery<Content[]>({
    queryKey: ["/api/contents", "all"],
    queryFn: async () => {
      const response = await fetch("/api/contents");
      if (!response.ok) throw new Error("Failed to fetch contents");
      return response.json();
    },
  });

  const sortedContents = contents
    ?.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  if (isLoading) {
    return (
      <section className="py-12 md:py-16 bg-background">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-3 md:grid-cols-4 gap-2 md:gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-square bg-muted rounded-lg" />
                <div className="hidden md:block mt-2 h-4 bg-muted rounded w-3/4" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!sortedContents || sortedContents.length === 0) {
    return null;
  }

  return (
    <section className="py-12 md:py-16 bg-background" data-testid="home-blog-grid">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h2 className="text-xl md:text-2xl font-bold text-foreground mb-6 md:mb-8 text-center">
          최근 소식
        </h2>
        
        <div className="grid grid-cols-3 md:grid-cols-4 gap-2 md:gap-4">
          {sortedContents.map((content) => (
            <Link
              key={content.id}
              href={getCategoryDetailPath(content.category, content.id)}
              className="group block"
              data-testid={`blog-item-${content.id}`}
            >
              <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                <img
                  src={content.thumbnail || PLACEHOLDER_SVG}
                  alt={content.title}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = PLACEHOLDER_SVG;
                  }}
                />
                {content.isVideo && (
                  <div className="absolute top-2 right-2 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
                    VIDEO
                  </div>
                )}
              </div>
              <div className="hidden md:block mt-2">
                <p className="text-sm text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                  {content.title}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(content.createdAt).toLocaleDateString("ko-KR", {
                    year: "numeric",
                    month: "numeric",
                    day: "numeric",
                  })}
                </p>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-6 md:mt-8 text-center">
          <Link href="/reviews">
            <span className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              더보기 →
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
