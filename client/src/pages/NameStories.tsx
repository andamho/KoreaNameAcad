import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Play, Calendar, MessageCircle, Trash2, Pencil, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useAdmin } from "@/contexts/AdminContext";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import type { Content } from "@shared/schema";
import storiesCharacterImage from "@assets/KakaoTalk_20251226_141747822_1766726282057.png";
import { useEffect, useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useScrollRestore, saveScrollPosition } from "@/hooks/use-scroll-restore";

const categoryOptions = [
  { value: "review", label: "후기" },
  { value: "nameStory", label: "이름이야기" },
  { value: "announcement", label: "공지사항" },
  { value: "expert", label: "한국이름학교" },
];

function formatDate(dateValue: string | Date) {
  const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
  return `${date.getFullYear()}. ${String(date.getMonth() + 1).padStart(2, '0')}. ${String(date.getDate()).padStart(2, '0')}.`;
}

function StoryCard({ story }: { story: Content }) {
  const { isAdmin, token } = useAdmin();
  const { toast } = useToast();
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editForm, setEditForm] = useState({
    category: story.category,
    title: story.title,
    thumbnail: story.thumbnail || "",
    content: story.content,
    isVideo: story.isVideo,
    videoUrl: story.videoUrl || "",
  });
  
  // Naver Blog style: uploaded images gallery
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Unified image upload (multiple support, no markdown)
  const { uploadFile, isUploading } = useUpload({
    onSuccess: (response) => {
      const imageUrl = response.objectPath;
      setUploadedImages(prev => {
        const newImages = [...prev, imageUrl];
        if (newImages.length === 1 || !editForm.thumbnail) {
          setEditForm(form => ({ ...form, thumbnail: imageUrl }));
        }
        return newImages;
      });
      toast({ title: "이미지가 추가되었습니다." });
    },
    onError: () => {
      toast({ title: "이미지 업로드에 실패했습니다.", variant: "destructive" });
    },
  });
  
  const setAsThumbnail = (imageUrl: string) => {
    setEditForm(prev => ({ ...prev, thumbnail: imageUrl }));
    toast({ title: "대표 이미지가 변경되었습니다." });
  };
  
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
  
  const updateMutation = useMutation({
    mutationFn: async (data: typeof editForm) => {
      const response = await fetch(`/api/contents/${story.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...data,
          thumbnail: data.thumbnail?.trim() || null,
          videoUrl: data.videoUrl?.trim() || null,
        }),
      });
      if (!response.ok) throw new Error("Failed to update");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contents", "nameStory"] });
      setShowEditDialog(false);
      toast({ title: "수정되었습니다." });
    },
    onError: () => {
      toast({ title: "수정 실패", variant: "destructive" });
    },
  });

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("정말 삭제하시겠습니까?")) {
      deleteMutation.mutate();
    }
  };
  
  const handleEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditForm({
      category: story.category,
      title: story.title,
      thumbnail: story.thumbnail || "",
      content: story.content,
      isVideo: story.isVideo,
      videoUrl: story.videoUrl || "",
    });
    // Extract existing images from content and thumbnail
    const imageRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
    const existingImages: string[] = [];
    let match;
    while ((match = imageRegex.exec(story.content)) !== null) {
      if (!existingImages.includes(match[1])) {
        existingImages.push(match[1]);
      }
    }
    if (story.thumbnail && !existingImages.includes(story.thumbnail)) {
      existingImages.unshift(story.thumbnail);
    }
    setUploadedImages(existingImages);
    setShowEditDialog(true);
  };
  
  const handleEditSubmit = () => {
    if (!editForm.title.trim() || !editForm.content.trim()) {
      toast({ title: "제목과 내용을 입력해주세요.", variant: "destructive" });
      return;
    }
    updateMutation.mutate(editForm);
  };

  return (
    <>
    <Link href={`/name-stories/${story.id}`} onClick={() => saveScrollPosition("/name-stories")}>
      <Card 
        className="group overflow-hidden hover-elevate active-elevate-2 cursor-pointer relative story-card"
        data-testid={`card-story-${story.id}`}
      >
        {/* 관리자 버튼들 */}
        {isAdmin && (
          <div className="absolute top-2 left-2 z-10 flex gap-1">
            <button
              onClick={handleEdit}
              className="p-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-full opacity-80 hover:opacity-100 transition-opacity"
              data-testid={`button-edit-${story.id}`}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleDelete}
              className="p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full opacity-80 hover:opacity-100 transition-opacity"
              data-testid={`button-delete-${story.id}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        
        {/* 임시저장 배지 */}
        {isAdmin && story.isDraft && (
          <div className="absolute top-2 right-2 z-10 px-2 py-0.5 bg-yellow-500 text-white text-xs font-medium rounded">
            임시
          </div>
        )}
        
        <div className="relative aspect-square overflow-hidden">
          <img
            src={story.thumbnail || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Crect fill='%23e5e7eb' width='400' height='400'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='48' fill='%239ca3af'%3E이미지%3C/text%3E%3C/svg%3E"}
            alt={story.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.onerror = null;
              target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Crect fill='%23e5e7eb' width='400' height='400'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='48' fill='%239ca3af'%3E이미지%3C/text%3E%3C/svg%3E";
            }}
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
    
    {/* 수정 다이얼로그 */}
    <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto z-[210]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-5 h-5" />
            글 수정
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="edit-category">카테고리</Label>
            <Select 
              value={editForm.category} 
              onValueChange={(value) => setEditForm(prev => ({ ...prev, category: value }))}
            >
              <SelectTrigger data-testid="select-edit-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[300]">
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
              data-testid="input-edit-title"
            />
          </div>
          {/* 이미지 업로드 (네이버 블로그 스타일) */}
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
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              클릭하여 대표 이미지 선택
            </p>
          </div>
          <div>
            <Label htmlFor="edit-content">내용</Label>
            <Textarea
              id="edit-content"
              value={editForm.content}
              onChange={(e) => setEditForm(prev => ({ ...prev, content: e.target.value }))}
              placeholder="내용을 입력하세요"
              rows={6}
              data-testid="input-edit-content"
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
            <Button 
              onClick={() => setShowEditDialog(false)}
              variant="outline"
              className="flex-1"
            >
              취소
            </Button>
            <Button 
              onClick={handleEditSubmit}
              disabled={updateMutation.isPending}
              className="flex-1"
            >
              {updateMutation.isPending ? "저장 중..." : "저장하기"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
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

  // 스크롤 위치 복원
  useScrollRestore("/name-stories");
  
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
            <div className="grid grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <StorySkeleton key={i} />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">콘텐츠를 불러오는데 실패했습니다.</p>
            </div>
          ) : stories && stories.length > 0 ? (
            <div className="grid grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-6">
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
