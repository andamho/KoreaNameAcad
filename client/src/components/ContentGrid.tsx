import { useQuery, useMutation } from "@tanstack/react-query";
import { Play, Trash2, Pencil, Upload } from "lucide-react";
import { Link } from "wouter";
import { useState, useRef } from "react";
import type { Content } from "@shared/schema";
import { useAdmin } from "@/contexts/AdminContext";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { saveScrollPosition } from "@/hooks/use-scroll-restore";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const categoryOptions = [
  { value: "review", label: "후기" },
  { value: "nameStory", label: "이름이야기" },
  { value: "announcement", label: "공지사항" },
  { value: "expert", label: "한국이름학교" },
];

interface ContentGridProps {
  category: "nameStory" | "expert" | "announcement" | "review";
  basePath: string;
  emptyMessage?: string;
}

export function ContentGrid({ category, basePath, emptyMessage = "등록된 콘텐츠가 없습니다." }: ContentGridProps) {
  const { isAdmin, token, isVerifying } = useAdmin();
  
  const { data: contents, isLoading } = useQuery<Content[]>({
    queryKey: ["/api/contents", category],
    queryFn: async () => {
      const response = await fetch(`/api/contents?category=${category}`);
      if (!response.ok) throw new Error("Failed to fetch contents");
      return response.json();
    },
  });

  if (isLoading) {
    return null;
  }

  if (!contents || contents.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4 content-grid">
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
  const thumbnailUrl = content.thumbnail || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Crect fill='%23e5e7eb' width='400' height='400'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='48' fill='%239ca3af'%3E이미지%3C/text%3E%3C/svg%3E";
  const { isAdmin, token } = useAdmin();
  const { toast } = useToast();
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editForm, setEditForm] = useState({
    category: content.category,
    title: content.title,
    thumbnail: content.thumbnail || "",
    content: content.content,
    isVideo: content.isVideo,
    videoUrl: content.videoUrl || "",
  });
  
  // Naver Blog style: uploaded images gallery
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Unified image upload (multiple support, no markdown)
  const { uploadFile, isUploading } = useUpload({
    onSuccess: (response) => {
      const imageUrl = response.objectPath;
      console.log("[ContentGrid] onSuccess - 새 이미지 URL:", imageUrl);
      console.log("[ContentGrid] onSuccess - setUploadedImages 호출 직전 images:", uploadedImages);
      console.log("[ContentGrid] onSuccess - 호출 직전 images.length:", uploadedImages.length);
      
      setUploadedImages(prev => {
        console.log("[ContentGrid] setUploadedImages callback - prev:", prev);
        console.log("[ContentGrid] setUploadedImages callback - prev.length:", prev.length);
        const newImages = [...prev, imageUrl];
        console.log("[ContentGrid] setUploadedImages callback - newImages:", newImages);
        console.log("[ContentGrid] setUploadedImages callback - newImages.length:", newImages.length);
        if (newImages.length === 1 || !editForm.thumbnail) {
          setEditForm(form => ({ ...form, thumbnail: imageUrl }));
        }
        return newImages;
      });
      
      // 다음 렌더 사이클 후 상태 확인
      setTimeout(() => {
        console.log("[ContentGrid] onSuccess - setUploadedImages 호출 후 (setTimeout) - 현재 상태는 클로저로 인해 이전 값일 수 있음");
      }, 0);
      
      toast({ title: "이미지가 추가되었습니다." });
    },
    onError: () => {
      toast({ title: "이미지 업로드에 실패했습니다.", variant: "destructive" });
    },
  });
  
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
  
  const setAsThumbnail = (imageUrl: string) => {
    setEditForm(prev => ({ ...prev, thumbnail: imageUrl }));
    toast({ title: "대표 이미지가 변경되었습니다." });
  };
  
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/contents/${content.id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to delete");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contents", content.category] });
      toast({ title: "삭제되었습니다." });
    },
    onError: () => {
      toast({ title: "삭제 실패", variant: "destructive" });
    },
  });
  
  const updateMutation = useMutation({
    mutationFn: async (data: typeof editForm) => {
      const response = await fetch(`/api/contents/${content.id}`, {
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
      queryClient.invalidateQueries({ queryKey: ["/api/contents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contents", content.category] });
      queryClient.invalidateQueries({ queryKey: ["/api/contents", "drafts"] });
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
      category: content.category,
      title: content.title,
      thumbnail: content.thumbnail || "",
      content: content.content,
      isVideo: content.isVideo,
      videoUrl: content.videoUrl || "",
    });
    // Extract existing images from content and thumbnail
    const imageRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
    const existingImages: string[] = [];
    let match;
    while ((match = imageRegex.exec(content.content)) !== null) {
      if (!existingImages.includes(match[1])) {
        existingImages.push(match[1]);
      }
    }
    if (content.thumbnail && !existingImages.includes(content.thumbnail)) {
      existingImages.unshift(content.thumbnail);
    }
    setUploadedImages(existingImages);
    setShowEditDialog(true);
  };
  
  const handleEditSubmit = () => {
    if (!editForm.title.trim() || !editForm.content.trim()) {
      toast({ title: "제목과 내용을 입력해주세요.", variant: "destructive" });
      return;
    }
    
    // 디버깅: 현재 uploadedImages 상태 확인
    console.log("[ContentGrid] handleEditSubmit - uploadedImages:", uploadedImages);
    console.log("[ContentGrid] handleEditSubmit - uploadedImages.length:", uploadedImages.length);
    
    // 썸네일 결정
    const finalThumbnail = editForm.thumbnail || uploadedImages[0] || "";
    
    // 기존 마크다운 이미지 제거 후 새 이미지 마크다운 생성
    // 썸네일은 content에서 제외 (중복 방지)
    const imageRegex = /!\[[^\]]*\]\([^)]+\)\n*/g;
    const cleanContent = editForm.content.replace(imageRegex, '').trim();
    const contentImages = uploadedImages.filter(img => img !== finalThumbnail);
    const imagesMarkdown = contentImages.map(img => `![이미지](${img})`).join('\n');
    const finalContent = imagesMarkdown ? `${imagesMarkdown}\n\n${cleanContent}` : cleanContent;
    
    const payload = {
      ...editForm,
      thumbnail: finalThumbnail,
      content: finalContent,
    };
    
    // 디버깅: 서버로 보내는 payload 확인
    console.log("[ContentGrid] handleEditSubmit - payload:", payload);
    console.log("[ContentGrid] handleEditSubmit - images count in content:", uploadedImages.length);
    
    updateMutation.mutate(payload);
  };
  
  return (
    <>
    <Link href={`${basePath}/${content.id}`} data-testid={`content-card-${content.id}`} onClick={() => saveScrollPosition(basePath)}>
      <div className="group cursor-pointer relative">
        {/* 관리자 버튼들 */}
        {isAdmin && (
          <div className="absolute top-1 right-1 z-10 flex gap-1">
            <button
              onClick={handleEdit}
              className="p-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-full opacity-80 hover:opacity-100 transition-opacity"
              data-testid={`button-edit-${content.id}`}
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              onClick={handleDelete}
              className="p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full opacity-80 hover:opacity-100 transition-opacity"
              data-testid={`button-delete-${content.id}`}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
        
        {/* 임시저장 배지 (관리자만 볼 수 있음) */}
        {isAdmin && content.isDraft && (
          <div className="absolute top-1 left-1 z-10 px-1.5 py-0.5 bg-yellow-500 text-white text-[10px] font-medium rounded">
            임시
          </div>
        )}
        
        {/* 썸네일 - 항상 표시 */}
        <div className="relative aspect-square rounded-lg overflow-hidden bg-muted">
          <img
            src={thumbnailUrl}
            alt={content.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.onerror = null;
              target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Crect fill='%23e5e7eb' width='400' height='400'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='48' fill='%239ca3af'%3E이미지%3C/text%3E%3C/svg%3E";
            }}
          />
          {content.isVideo && (
            <div className="absolute bottom-1.5 right-1.5 sm:bottom-2 sm:right-2">
              <div className="w-5 h-5 sm:w-10 sm:h-10 rounded-full bg-black/60 sm:bg-white/90 flex items-center justify-center">
                <Play className="w-2.5 h-2.5 sm:w-5 sm:h-5 text-white sm:text-primary ml-0.5" fill="currentColor" />
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
                  data-testid="input-edit-thumbnail-file"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="h-8"
                  data-testid="button-edit-upload-thumbnail"
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
                    key={img}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', idx.toString());
                      e.currentTarget.style.opacity = '0.5';
                    }}
                    onDragEnd={(e) => {
                      e.currentTarget.style.opacity = '1';
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.currentTarget.style.transform = 'scale(1.05)';
                    }}
                    onDragLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.style.transform = 'scale(1)';
                      const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
                      if (fromIdx !== idx) {
                        setUploadedImages(prev => {
                          const newArr = [...prev];
                          const [moved] = newArr.splice(fromIdx, 1);
                          newArr.splice(idx, 0, moved);
                          return newArr;
                        });
                      }
                    }}
                    className={`relative aspect-square rounded overflow-hidden cursor-grab active:cursor-grabbing border-2 transition-transform ${editForm.thumbnail === img ? 'border-primary' : 'border-transparent'}`}
                    onClick={() => setAsThumbnail(img)}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover pointer-events-none" />
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
              클릭: 대표 이미지 선택 | 드래그: 순서 변경
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
              data-testid="checkbox-edit-isvideo"
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
                data-testid="input-edit-videourl"
              />
            </div>
          )}
          <div className="flex gap-2">
            <Button 
              onClick={() => setShowEditDialog(false)}
              variant="outline"
              className="flex-1"
              data-testid="button-edit-cancel"
            >
              취소
            </Button>
            <Button 
              onClick={handleEditSubmit}
              disabled={updateMutation.isPending}
              className="flex-1"
              data-testid="button-edit-submit"
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
