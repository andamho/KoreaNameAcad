import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { ArrowLeft, Calendar, Share2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import type { Content } from "@shared/schema";
import { useEffect } from "react";

interface ContentDetailProps {
  backPath: string;
  backLabel: string;
}

export default function ContentDetail({ backPath, backLabel }: ContentDetailProps) {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const { data: content, isLoading, error } = useQuery<Content>({
    queryKey: ["/api/contents", "detail", id],
    queryFn: async () => {
      const response = await fetch(`/api/contents/${id}`);
      if (!response.ok) throw new Error("Failed to fetch content");
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
      return () => {
        document.documentElement.classList.remove(className);
      };
    }
  }, []);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: content?.title || "한국이름학교",
          url,
        });
      } catch {
        // User cancelled
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast({ title: "링크가 복사되었습니다." });
    }
  };

  const getYouTubeEmbedUrl = (url: string) => {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/);
    return match ? `https://www.youtube.com/embed/${match[1]}` : null;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <main className="flex-1 py-8 md:py-12">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <Skeleton className="h-8 w-48 mb-6" />
            <Skeleton className="h-12 w-full mb-4" />
            <Skeleton className="aspect-video w-full mb-6" />
            <Skeleton className="h-64 w-full" />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (error || !content) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <main className="flex-1 py-8 md:py-12">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
            <p className="text-muted-foreground mb-4">콘텐츠를 찾을 수 없습니다.</p>
            <Link href={backPath}>
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                {backLabel}
              </Button>
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const embedUrl = content.videoUrl ? getYouTubeEmbedUrl(content.videoUrl) : null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      
      <main className="flex-1 py-8 md:py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between mb-6">
            <Link href={backPath}>
              <Button variant="ghost" size="sm" data-testid="button-back">
                <ArrowLeft className="w-4 h-4 mr-2" />
                {backLabel}
              </Button>
            </Link>
            <Button variant="ghost" size="icon" onClick={handleShare} data-testid="button-share">
              <Share2 className="w-4 h-4" />
            </Button>
          </div>

          <article>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-4" data-testid="text-content-title">
              {content.title}
            </h1>
            
            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {new Date(content.createdAt).toLocaleDateString("ko-KR", {
                  year: "numeric",
                  month: "long",
                  day: "numeric"
                })}
              </span>
            </div>

            {content.isVideo && embedUrl ? (
              <div className="aspect-video mb-8 rounded-lg overflow-hidden bg-muted">
                <iframe
                  src={embedUrl}
                  title={content.title}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : content.thumbnail ? (
              <div className="relative mb-8 rounded-lg overflow-hidden">
                <img 
                  src={content.thumbnail}
                  alt={content.title}
                  className="w-full h-auto"
                />
                {content.isVideo && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center">
                      <Play className="w-8 h-8 text-primary ml-1" fill="currentColor" />
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            <div className="prose prose-lg max-w-none dark:prose-invert">
              {content.content.split('\n').map((paragraph, index) => (
                paragraph.trim() && (
                  <p key={index} className="text-foreground leading-relaxed mb-4">
                    {paragraph}
                  </p>
                )
              ))}
            </div>
          </article>
        </div>
      </main>

      <Footer />
    </div>
  );
}
