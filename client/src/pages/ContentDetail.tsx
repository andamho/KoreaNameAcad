import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Calendar, Share2, Play, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImageManager } from "@/components/ImageManager";
import { RichTextEditor, renderFormattedText } from "@/components/RichTextEditor";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Content } from "@shared/schema";
import { useEffect, useState } from "react";

interface ContentDetailProps {
  backPath: string;
  backLabel: string;
}

export default function ContentDetail({ backPath, backLabel }: ContentDetailProps) {
  const { id } = useParams<{ id: string }>();
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

  const { data: content, isLoading, error } = useQuery<Content>({
    queryKey: ["/api/contents", "detail", id],
    queryFn: async () => {
      const response = await fetch(`/api/contents/${id}`);
      if (!response.ok) throw new Error("Failed to fetch content");
      return response.json();
    },
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  useEffect(() => {
    const userAgent = navigator.userAgent || '';
    const isInstagram = userAgent.includes('Instagram');
    const isTikTok = userAgent.includes('TikTok') || userAgent.includes('musical_ly');
    
    if (isInstagram || isTikTok) {
      const className = isInstagram ? "ua-instagram" : "ua-tiktok";
      // 인앱 표시(ua-instagram / ua-tiktok)는 App 이 전역으로 관리한다. 여기서 붙이지 않는다.
      return () => {
      };
    }
  }, []);

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
    // Support: youtube.com/watch?v=, youtu.be/, youtube.com/embed/, youtube.com/shorts/
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([^&\s?]+)/);
    return match ? `https://www.youtube.com/embed/${match[1]}` : null;
  };

  const openEditDialog = () => {
    if (content) {
      setEditForm({
        category: content.category,
        title: content.title,
        thumbnail: content.thumbnail || "",
        content: content.content,
        videoUrl: content.videoUrl || "",
        isVideo: content.isVideo || false,
      });
      const images: string[] = [];
      if (content.thumbnail) images.push(content.thumbnail);
      const imageMatches = content.content.match(/!\[[^\]]*\]\(([^)]+)\)/g);
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
    // 붙인 사진을 본문에 넣어 저장한다.
    // 예전에는 editForm 만 보내서, 사진을 아무리 붙여도 저장하는 순간 전부 버려졌다
    // ("추가했는데 안 붙는다"의 원인). 목록 화면과 같은 방식으로 맞춘다.
    const finalThumbnail = editForm.thumbnail || uploadedImages[0] || "";
    // 본문에 이미 들어 있던 사진 표시를 지우고, 지금 목록으로 다시 만든다.
    // 대표 사진은 따로 보여지므로 본문에서는 뺀다(중복 방지).
    const cleanContent = editForm.content.replace(/!\[[^\]]*\]\([^)]+\)\n*/g, "").trim();
    const contentImages = uploadedImages.filter(img => img !== finalThumbnail);
    const imagesMarkdown = contentImages.map(img => `![이미지](${img})`).join("\n");
    const finalContent = imagesMarkdown ? `${imagesMarkdown}\n\n${cleanContent}` : cleanContent;

    updateMutation.mutate({ ...editForm, thumbnail: finalThumbnail, content: finalContent });
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
              <span className="text-muted-foreground hover:text-foreground transition-colors text-sm">
                &lt; {backLabel}
              </span>
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
            <Link href={backPath} data-testid="button-back">
              <span className="text-muted-foreground hover:text-foreground transition-colors kna-back-link" style={{ fontSize: 'clamp(12px, 2.5vw, 14px)' }}>
                &lt; {backLabel}
              </span>
            </Link>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Button variant="outline" size="sm" onClick={openEditDialog} data-testid="button-edit">
                  <Pencil className="w-4 h-4 mr-2" />
                  수정
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={handleShare} data-testid="button-share">
                <Share2 className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <article>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-4 kna-detail-title" data-testid="text-content-title">
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

            {/* kna-detail-body: 이 상세 화면 본문에만 붙는 표시.
                kna-nanum-editor 는 후기 목록 카드·에디터와도 함께 쓰는 이름이라
                인앱 보정을 그 이름에 걸면 다른 곳까지 번진다. */}
            <div className="kna-nanum-editor kna-detail-body prose max-w-none dark:prose-invert" style={{ fontFamily: "'Nanum Square', sans-serif" }}>
              {(() => {
                // 이미지 마커를 기준으로 분리 (줄 위치 상관없이 처리)
                const parts = content.content.split(/(!\[[^\]]*\]\([^)]+\))/);
                const result: JSX.Element[] = [];
                let textBuffer: string[] = [];

                const flushTextBuffer = (key: string) => {
                  const text = textBuffer.join("").replace(/^\n/, "").replace(/\n+$/, "");
                  textBuffer = [];
                  if (!text) return;
                  result.push(
                    <div key={key} className="text-foreground leading-relaxed whitespace-pre-line">
                      {renderFormattedText(text)}
                    </div>
                  );
                };

                parts.forEach((part, index) => {
                  const imageMatch = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
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
                    textBuffer.push(part);
                  }
                });

                flushTextBuffer('text-end');
                return result;
              })()}
              
              {backPath === "/reviews" && (
                <div className="kna-promo mt-8 rounded-2xl py-10 px-6 text-center relative overflow-hidden bg-white border border-gray-100">
                  <div className="relative z-10">
                    <div className="font-bold tracking-tight text-center kna-promo-head" style={{ fontSize: '1.75rem', lineHeight: '1.35', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.1em' }}>
                      {/* 푸터와 맞춰 두 줄을 한 줄로 합치고 가운데 솉표를 넣었다.
                          좁은 폰에서 줄바꿈되면 합친 뜻이 없어지므로 한 줄로 붙잡는다. */}
                      <span className="kna-highlight" style={{ whiteSpace: 'nowrap' }}>
                        <span className="kna-shine">이름이 맑아야, 인생이 맑다</span>
                      </span>
                      <span className="text-gray-900 font-normal relative kna-promo-third" style={{ fontSize: '1.1875rem', marginTop: '0.75em' }}>
                        이름 안에 너 있다
                        <span className="kna-underline-plain" aria-hidden="true" />
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
                    </div>
                  </div>
                </div>
              )}
            </div>
          </article>
        </div>
      </main>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>콘텐츠 수정</DialogTitle>
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
