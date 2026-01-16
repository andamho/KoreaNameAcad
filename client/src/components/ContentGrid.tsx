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
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contentImageInputRef = useRef<HTMLInputElement>(null);
  
  const { uploadFile, isUploading } = useUpload({
    onSuccess: (response) => {
      setEditForm(prev => ({ ...prev, thumbnail: response.objectPath }));
      toast({ title: "이미지가 업로드되었습니다." });
    },
    onError: () => {
      toast({ title: "이미지 업로드에 실패했습니다.", variant: "destructive" });
    },
  });
  
  const { uploadFile: uploadContentImage, isUploading: isUploadingContent } = useUpload({
    onSuccess: (response) => {
      const imageMarkdown = `\n![이미지](${response.objectPath})\n`;
      setEditForm(prev => ({ ...prev, content: prev.content + imageMarkdown }));
      toast({ title: "본문에 이미지가 추가되었습니다." });
    },
    onError: () => {
      toast({ title: "이미지 업로드에 실패했습니다.", variant: "destructive" });
    },
  });
  
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast({ title: "이미지 파일만 업로드할 수 있습니다.", variant: "destructive" });
        return;
      }
      await uploadFile(file);
    }
  };
  
  const handleContentImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast({ title: "이미지 파일만 업로드할 수 있습니다.", variant: "destructive" });
        return;
      }
      await uploadContentImage(file);
    }
    e.target.value = "";
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
          <div>
            <Label>썸네일 이미지 (선택)</Label>
            <div className="flex gap-2 items-center">
              <Input
                id="edit-thumbnail"
                value={editForm.thumbnail}
                onChange={(e) => setEditForm(prev => ({ ...prev, thumbnail: e.target.value }))}
                placeholder="URL 직접 입력 또는 이미지 업로드"
                className="flex-1"
                data-testid="input-edit-thumbnail"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
                data-testid="input-edit-thumbnail-file"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                data-testid="button-edit-upload-thumbnail"
              >
                {isUploading ? (
                  <span className="animate-spin">⏳</span>
                ) : (
                  <Upload className="w-4 h-4" />
                )}
              </Button>
            </div>
            {editForm.thumbnail && (
              <div className="mt-2 relative">
                <img 
                  src={editForm.thumbnail} 
                  alt="썸네일 미리보기" 
                  className="w-full h-32 object-cover rounded border"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute top-1 right-1 h-6 px-2 text-xs bg-background/80"
                  onClick={() => setEditForm(prev => ({ ...prev, thumbnail: "" }))}
                  data-testid="button-edit-remove-thumbnail"
                >
                  삭제
                </Button>
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label htmlFor="edit-content">내용</Label>
              <div className="flex items-center gap-1">
                <input
                  ref={contentImageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleContentImageUpload}
                  data-testid="input-edit-content-image-file"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => contentImageInputRef.current?.click()}
                  disabled={isUploadingContent}
                  className="h-7 text-xs"
                  data-testid="button-edit-add-content-image"
                >
                  {isUploadingContent ? "업로드 중..." : "이미지 추가"}
                </Button>
              </div>
            </div>
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
