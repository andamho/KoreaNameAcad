import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Calendar, Share2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImageManager } from "@/components/ImageManager";
import { RichTextEditor, renderFormattedText } from "@/components/RichTextEditor";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { queryClient } from "@/lib/queryClient";
import type { Content } from "@shared/schema";
import { useEffect, useState } from "react";

function formatDate(dateValue: string | Date) {
  const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function getYouTubeEmbedUrl(url: string): string | null {
  // Support: youtube.com/watch?v=, youtu.be/, youtube.com/embed/, youtube.com/shorts/
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?\s]*).*/;
  const match = url.match(regExp);
  if (match && match[2]) {
    return `https://www.youtube.com/embed/${match[2]}`;
  }
  return null;
}

export default function NameStoryDetail() {
  const params = useParams();
  const id = params.id;
  const { toast } = useToast();

  const [isAdmin, setIsAdmin] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const categoryOptions = [
    { value: "review", label: "후기" },
    { value: "nameStory", label: "이름이야기" },
    { value: "announcement", label: "공지사항" },
    { value: "expert", label: "한국이름학교" },
    { value: "about", label: "협회 소개" },
  ];

  const [editForm, setEditForm] = useState({
    category: "",
    title: "",
    thumbnail: "",
    content: "",
    videoUrl: "",
    isVideo: false,
  });
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  
  const { uploadFile, isUploading } = useUpload({
    onSuccess: (response) => {
      const imageUrl = response.objectPath;
      setUploadedImages(prev => {
        const newImages = [...prev, imageUrl];
        if (newImages.length === 1) {
          setEditForm(form => ({ ...form, thumbnail: imageUrl }));
        }
        return newImages;
      });
      toast({ title: "이미지가 추가되었습니다." });
    },
    onError: () => {
      toast({ title: "이미지 업로드 실패", variant: "destructive" });
    },
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  useEffect(() => {
    const token = localStorage.getItem("kna_admin_token");
    if (token) {
      fetch("/api/admin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
        .then((res) => res.json())
        .then((data) => setIsAdmin(data.valid))
        .catch(() => setIsAdmin(false));
    }
  }, []);

  const { data: story, isLoading, error } = useQuery<Content>({
    queryKey: ["/api/contents", "detail", id],
    queryFn: async () => {
      const res = await fetch(`/api/contents/${id}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof editForm) => {
      const token = localStorage.getItem("kna_admin_token");
      const res = await fetch(`/api/contents/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contents"] });
      setShowEditDialog(false);
      toast({ title: "수정되었습니다." });
    },
    onError: () => {
      toast({ title: "수정 실패", variant: "destructive" });
    },
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
      toast({ title: "링크가 복사되었습니다!" });
    }
  };

  const openEditDialog = () => {
    if (story) {
      setEditForm({
        category: story.category,
        title: story.title,
        thumbnail: story.thumbnail || "",
        content: story.content,
        videoUrl: story.videoUrl || "",
        isVideo: story.isVideo || false,
      });
      const images: string[] = [];
      if (story.thumbnail) images.push(story.thumbnail);
      const imageMatches = story.content.match(/!\[[^\]]*\]\(([^)]+)\)/g);
      if (imageMatches) {
        imageMatches.forEach(match => {
          const urlMatch = match.match(/\(([^)]+)\)/);
          if (urlMatch && !images.includes(urlMatch[1])) {
            images.push(urlMatch[1]);
          }
        });
      }
      setUploadedImages(images);
      setShowEditDialog(true);
    }
  };

  const handleUpdate = () => {
    if (!editForm.title.trim() || !editForm.content.trim()) {
      toast({ title: "제목과 내용을 입력해주세요.", variant: "destructive" });
      return;
    }
    updateMutation.mutate(editForm);
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
            <Link href="/name-stories" data-testid="button-back-list">
              <span className="text-muted-foreground hover:text-foreground transition-colors text-sm">
                &lt; 이름이야기 목록
              </span>
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
          <div className="flex items-center justify-between mb-6">
            <Link href="/name-stories" data-testid="button-back">
              <span className="text-muted-foreground hover:text-foreground transition-colors" style={{ fontSize: 'clamp(12px, 2.5vw, 14px)' }}>
                &lt; 이름이야기 목록
              </span>
            </Link>
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={openEditDialog} data-testid="button-edit">
                <Pencil className="w-4 h-4 mr-2" />
                수정
              </Button>
            )}
          </div>

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
              <div className="prose dark:prose-invert max-w-none">
                {(() => {
                  const lines = story.content.split('\n');
                  const result: JSX.Element[] = [];
                  let textBuffer: string[] = [];
                  
                  const flushTextBuffer = (key: string) => {
                    if (textBuffer.length > 0) {
                      // Normalize: 3+ consecutive newlines → 2 (1 blank line max)
                      // This also fixes content saved before the domToMarkers fix
                      const text = textBuffer.join('\n').replace(/\n{3,}/g, '\n\n');
                      result.push(
                        <div key={key} className="text-foreground leading-relaxed whitespace-pre-line">
                          {renderFormattedText(text)}
                        </div>
                      );
                      textBuffer = [];
                    }
                  };
                  
                  lines.forEach((line, index) => {
                    const trimmedLine = line.trim();
                    const imageMatch = trimmedLine.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
                    
                    if (imageMatch) {
                      flushTextBuffer(`text-before-${index}`);
                      const [, alt, src] = imageMatch;
                      result.push(
                        <div key={`img-${index}`} className="my-4">
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
                    } else {
                      textBuffer.push(line);
                    }
                  });
                  
                  flushTextBuffer('text-end');
                  return result;
                })()}
                
                <div className="kna-promo mt-8 rounded-2xl py-10 px-6 text-center relative overflow-hidden bg-white border border-gray-100">
                  <div className="relative z-10">
                    <div className="font-bold tracking-tight text-center" style={{ fontSize: 'clamp(18px, 4vw, 24px)', lineHeight: '1.35', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.1em' }}>
                      <span className="text-gray-900">고달픈 인생</span>
                      <span className="text-gray-900">이름 하나로 이유를 찾고</span>
                      <span className="kna-highlight">
                        <span className="kna-shine">운이 술술 풀리는</span>
                      </span>
                      <span className="kna-highlight">
                        <span className="kna-shine">새 이름으로, 인생역전하세요.</span>
                        <span className="kna-underline" aria-hidden="true" />
                      </span>
                    </div>
                    <div className="text-muted-foreground text-sm mt-4 mb-5 flex flex-col items-center" style={{ gap: '0.1em' }}>
                      <span>한글·한자이름만으로 운명상담</span>
                      <span>[정확도 80% 이상]</span>
                    </div>
                    <div className="flex justify-center items-center gap-4">
                      <a 
                        href="https://korea-name-acad.com/services" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="px-4 py-1.5 bg-black text-white font-medium rounded-full text-sm hover:bg-gray-800 transition-colors flex items-center gap-0.5 no-underline"
                      >
                        지금 신청 <span>›</span>
                      </a>
                      <a 
                        href="/reviews"
                        className="text-black font-medium text-sm hover:opacity-70 transition-opacity flex items-center gap-0.5 no-underline"
                      >
                        후기 보기 <span>›</span>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </article>
        </div>
      </main>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>이름이야기 수정</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-category">카테고리</Label>
              <Select
                value={editForm.category}
                onValueChange={(value) => setEditForm(prev => ({ ...prev, category: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="카테고리 선택" />
                </SelectTrigger>
                <SelectContent className="z-[20000]">
                  {categoryOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-title">제목</Label>
              <Input
                id="edit-title"
                value={editForm.title}
                onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="제목을 입력하세요"
              />
            </div>
            <ImageManager
              images={uploadedImages}
              onImagesChange={setUploadedImages}
              thumbnail={editForm.thumbnail}
              onThumbnailChange={(thumb) => setEditForm(prev => ({ ...prev, thumbnail: thumb }))}
              onUpload={uploadFile}
              isUploading={isUploading}
            />
            <div>
              <Label htmlFor="edit-content">내용</Label>
              <RichTextEditor
                value={editForm.content}
                onChange={(val) => setEditForm(prev => ({ ...prev, content: val }))}
                placeholder="내용을 입력하세요"
                className="min-h-[200px]"
                data-testid="input-edit-content"
                onUploadImage={async (file) => {
                  const result = await uploadFile(file);
                  if (!result) throw new Error("업로드 실패");
                  return result.objectPath;
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-isVideo"
                checked={editForm.isVideo}
                onChange={(e) => setEditForm(prev => ({ ...prev, isVideo: e.target.checked }))}
                className="h-4 w-4"
              />
              <Label htmlFor="edit-isVideo" className="cursor-pointer">동영상 콘텐츠</Label>
            </div>
            {editForm.isVideo && (
              <div>
                <Label htmlFor="edit-videoUrl">YouTube URL</Label>
                <Input
                  id="edit-videoUrl"
                  value={editForm.videoUrl}
                  onChange={(e) => setEditForm(prev => ({ ...prev, videoUrl: e.target.value }))}
                  placeholder="https://youtube.com/watch?v=..."
                />
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={() => setShowEditDialog(false)} variant="outline" className="flex-1">
                취소
              </Button>
              <Button onClick={handleUpdate} className="flex-1" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "저장 중..." : "저장"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}
