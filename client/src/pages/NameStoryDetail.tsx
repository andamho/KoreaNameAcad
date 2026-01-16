import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { ArrowLeft, Calendar, Share2, Pencil, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { queryClient } from "@/lib/queryClient";
import type { Content } from "@shared/schema";
import { useEffect, useState, useRef } from "react";

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
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editForm, setEditForm] = useState({
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
      setUploadedImages(prev => [...prev, imageUrl]);
      if (!editForm.thumbnail) {
        setEditForm(prev => ({ ...prev, thumbnail: imageUrl }));
      }
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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        toast({ title: "이미지 파일만 업로드할 수 있습니다.", variant: "destructive" });
        continue;
      }
      await uploadFile(file);
    }
    
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const setAsThumbnail = (url: string) => {
    setEditForm(prev => ({ ...prev, thumbnail: url }));
  };

  const insertImageToContent = (url: string) => {
    const imageMarkdown = `\n![이미지](${url})\n`;
    setEditForm(prev => ({ ...prev, content: prev.content + imageMarkdown }));
    toast({ title: "이미지가 본문에 추가되었습니다." });
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
          <div className="flex items-center justify-between mb-6">
            <Link href="/name-stories">
              <Button variant="ghost" data-testid="button-back">
                <ArrowLeft className="w-4 h-4 mr-2" />
                목록으로
              </Button>
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
                
                <div className="mt-8 rounded-2xl py-10 px-6 text-center relative overflow-hidden bg-white border border-gray-100">
                  <div className="relative z-10">
                    <div className="font-bold tracking-tight text-center" style={{ fontSize: 'clamp(18px, 4vw, 24px)', lineHeight: '1.35', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.1em' }}>
                      <span className="text-gray-900">고달픈 인생</span>
                      <span className="text-gray-900">이름 하나로 이유를 찾고</span>
                      <span className="kna-highlight">
                        <span className="kna-shine">운이 술술 풀리는</span>
                      </span>
                      <span className="kna-highlight">
                        <span className="kna-shine">새 이름으로, 인생역전하세요.</span>
                      </span>
                    </div>
                    <p className="text-muted-foreground text-sm mt-4 mb-1">한글·한자이름만으로 운명상담</p>
                    <p className="text-muted-foreground text-sm mb-6">[정확도 80% 이상]</p>
                    <div className="flex justify-center items-center gap-4">
                      <a 
                        href="https://korea-name-acad.com/services" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="px-4 py-1.5 bg-black text-white font-medium rounded-full text-sm hover:bg-gray-800 transition-colors flex items-center gap-0.5"
                      >
                        지금 신청 <span>›</span>
                      </a>
                      <a 
                        href="/reviews"
                        className="text-black font-medium text-sm hover:opacity-70 transition-opacity flex items-center gap-0.5"
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
              <Label htmlFor="edit-title">제목</Label>
              <Input
                id="edit-title"
                value={editForm.title}
                onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="제목을 입력하세요"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>이미지</Label>
                <div className="flex gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="h-8"
                  >
                    {isUploading ? "업로드 중..." : (
                      <>
                        <Upload className="w-4 h-4 mr-1" />
                        이미지 추가
                      </>
                    )}
                  </Button>
                </div>
              </div>
              {uploadedImages.length > 0 && (
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {uploadedImages.map((img, idx) => (
                    <div
                      key={idx}
                      className={`relative aspect-square rounded overflow-hidden cursor-pointer border-2 ${editForm.thumbnail === img ? 'border-primary' : 'border-transparent'}`}
                      onClick={() => setAsThumbnail(img)}
                    >
                      <img src={img} alt="" className="w-full h-full object-cover" />
                      {editForm.thumbnail === img && (
                        <div className="absolute top-0.5 left-0.5 bg-primary text-primary-foreground text-[10px] px-1 rounded">
                          대표
                        </div>
                      )}
                      <button
                        type="button"
                        className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          const newImages = uploadedImages.filter((_, i) => i !== idx);
                          setUploadedImages(newImages);
                          if (editForm.thumbnail === img) {
                            setEditForm(prev => ({ ...prev, thumbnail: newImages[0] || "" }));
                          }
                        }}
                      >
                        ✕
                      </button>
                      <button
                        type="button"
                        className="absolute bottom-0.5 right-0.5 w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-[10px] hover:bg-blue-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          insertImageToContent(img);
                        }}
                        title="본문에 추가"
                      >
                        +
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                클릭하여 대표 이미지 선택, + 버튼으로 본문에 추가
              </p>
            </div>
            <div>
              <Label htmlFor="edit-content">내용</Label>
              <Textarea
                id="edit-content"
                value={editForm.content}
                onChange={(e) => setEditForm(prev => ({ ...prev, content: e.target.value }))}
                placeholder="내용을 입력하세요"
                rows={8}
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
