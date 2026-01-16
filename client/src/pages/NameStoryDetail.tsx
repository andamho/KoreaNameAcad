import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { ArrowLeft, Calendar, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import type { Content } from "@shared/schema";
import { useEffect } from "react";

function formatDate(dateValue: string | Date) {
  const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function getYouTubeEmbedUrl(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  if (match && match[2].length === 11) {
    return `https://www.youtube.com/embed/${match[2]}`;
  }
  return null;
}

export default function NameStoryDetail() {
  const params = useParams();
  const id = params.id;

  // Scroll to top on page load
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  const { data: story, isLoading, error } = useQuery<Content>({
    queryKey: ["/api/contents", "detail", id],
    queryFn: async () => {
      const res = await fetch(`/api/contents/${id}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!id,
  });

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: story?.title,
          url: window.location.href,
        });
      } catch (err) {
        console.log("Share cancelled");
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert("링크가 복사되었습니다!");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <main className="flex-1 py-12 md:py-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <Skeleton className="h-8 w-32 mb-6" />
            <Skeleton className="h-10 w-3/4 mb-4" />
            <Skeleton className="h-6 w-48 mb-8" />
            <Skeleton className="aspect-video w-full mb-8" />
            <div className="space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (error || !story) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <main className="flex-1 py-12 md:py-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
            <h1 className="text-2xl font-bold text-foreground mb-4">
              콘텐츠를 찾을 수 없습니다
            </h1>
            <Link href="/name-stories">
              <Button variant="outline" data-testid="button-back-list">
                <ArrowLeft className="w-4 h-4 mr-2" />
                목록으로 돌아가기
              </Button>
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const embedUrl = story.videoUrl ? getYouTubeEmbedUrl(story.videoUrl) : null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      
      <main className="flex-1 py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <Link href="/name-stories">
            <Button variant="ghost" className="mb-6" data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-2" />
              목록으로
            </Button>
          </Link>

          <article>
            <header className="mb-8">
              <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
                {story.title}
              </h1>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>{formatDate(story.createdAt)}</span>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleShare}
                  data-testid="button-share"
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  공유
                </Button>
              </div>
            </header>

            {story.isVideo && embedUrl ? (
              <div className="aspect-video mb-8 rounded-lg overflow-hidden bg-black">
                <iframe
                  src={embedUrl}
                  title={story.title}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : story.thumbnail && (
              <div className="mb-8 rounded-lg overflow-hidden">
                <img
                  src={story.thumbnail}
                  alt={story.title}
                  className="w-full h-auto"
                />
              </div>
            )}

            <Card className="p-6 md:p-8">
              <div className="prose prose-lg dark:prose-invert max-w-none">
                {story.content.split('\n').map((line, index) => {
                  const trimmedLine = line.trim();
                  if (!trimmedLine) return null;
                  
                  const imageMatch = trimmedLine.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
                  if (imageMatch) {
                    const [, alt, src] = imageMatch;
                    return (
                      <div key={index} className="my-4">
                        <img 
                          src={src} 
                          alt={alt || "이미지"} 
                          className="w-full h-auto rounded-lg"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    );
                  }
                  
                  return (
                    <p key={index} className="text-foreground leading-relaxed mb-4">
                      {trimmedLine}
                    </p>
                  );
                })}
                
                {/* 홍보 문구 */}
                <div className="mt-8 pt-6 border-t border-border text-center">
                  <p className="text-foreground leading-relaxed mb-1">😩고달픈 인생,</p>
                  <p className="text-foreground leading-relaxed mb-3">이름 하나로 이유와 해결책을!</p>
                  <p className="text-foreground leading-relaxed mb-1">🔍한글.한자이름만으로 운명상담</p>
                  <p className="text-foreground leading-relaxed mb-3">[정확도 80%👆]</p>
                  <p className="text-foreground leading-relaxed mb-1">🌸운이 술술 풀리는 이름으로</p>
                  <p className="text-foreground leading-relaxed mb-3">인생역전!</p>
                  <p className="text-foreground leading-relaxed mb-1">🔮이름상담 및 작명 [신청방법]</p>
                  <p className="text-foreground leading-relaxed mb-3">👇👇👇</p>
                  <a 
                    href="https://korea-name-acad.com/services" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-medium"
                  >
                    https://korea-name-acad.com/services
                  </a>
                </div>
              </div>
            </Card>
          </article>
        </div>
      </main>

      <Footer />
    </div>
  );
}
