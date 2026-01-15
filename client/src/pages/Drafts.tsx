import { useQuery, useMutation } from "@tanstack/react-query";
import { Trash2, Eye, FileEdit, Pencil, Upload } from "lucide-react";
import { Link } from "wouter";
import { useState, useRef } from "react";
import type { Content } from "@shared/schema";
import { useAdmin } from "@/contexts/AdminContext";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const categoryLabels: Record<string, string> = {
  review: "후기",
  nameStory: "이름이야기",
  announcement: "공지사항",
  expert: "한국이름학교",
};

const categoryOptions = [
  { value: "all", label: "전체" },
  { value: "review", label: "후기" },
  { value: "nameStory", label: "이름이야기" },
  { value: "announcement", label: "공지사항" },
  { value: "expert", label: "한국이름학교" },
];

const editCategoryOptions = [
  { value: "review", label: "후기" },
  { value: "nameStory", label: "이름이야기" },
  { value: "announcement", label: "공지사항" },
  { value: "expert", label: "한국이름학교" },
];

export default function Drafts() {
  const { isAdmin, token, isVerifying } = useAdmin();
  const { toast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState("all");
  
  // Edit state
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingDraft, setEditingDraft] = useState<Content | null>(null);
  const [editForm, setEditForm] = useState({
    category: "review",
    title: "",
    thumbnail: "",
    content: "",
    isVideo: false,
    videoUrl: "",
  });
  
  // Image upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = useUpload({
    onSuccess: (response) => {
      setEditForm(prev => ({ ...prev, thumbnail: response.objectPath }));
      toast({ title: "이미지가 업로드되었습니다." });
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

  const { data: drafts, isLoading } = useQuery<Content[]>({
    queryKey: ["/api/contents", "drafts", token],
    queryFn: async () => {
      if (!token) return [];
      const response = await fetch("/api/contents?includeDrafts=true", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch");
      const allContents = await response.json();
      return allContents.filter((c: Content) => c.isDraft);
    },
    enabled: isAdmin && !!token && !isVerifying,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/contents/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to delete");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contents"] });
      toast({ title: "삭제되었습니다." });
    },
    onError: () => {
      toast({ title: "삭제 실패", variant: "destructive" });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/contents/${id}`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ isDraft: false }),
      });
      if (!response.ok) throw new Error("Failed to publish");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contents"] });
      toast({ title: "공개되었습니다." });
    },
    onError: () => {
      toast({ title: "공개 실패", variant: "destructive" });
    },
  });

  const handleDelete = (id: string) => {
    if (confirm("정말 삭제하시겠습니까?")) {
      deleteMutation.mutate(id);
    }
  };

  const handlePublish = (id: string) => {
    if (confirm("이 글을 공개하시겠습니까?")) {
      publishMutation.mutate(id);
    }
  };
  
  // Edit mutation
  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; form: typeof editForm }) => {
      const response = await fetch(`/api/contents/${data.id}`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          ...data.form,
          thumbnail: data.form.thumbnail?.trim() || null,
          videoUrl: data.form.videoUrl?.trim() || null,
        }),
      });
      if (!response.ok) throw new Error("Failed to update");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contents"] });
      setShowEditDialog(false);
      setEditingDraft(null);
      toast({ title: "수정되었습니다." });
    },
    onError: () => {
      toast({ title: "수정 실패", variant: "destructive" });
    },
  });
  
  const handleEdit = (draft: Content) => {
    setEditingDraft(draft);
    setEditForm({
      category: draft.category,
      title: draft.title,
      thumbnail: draft.thumbnail || "",
      content: draft.content,
      isVideo: draft.isVideo,
      videoUrl: draft.videoUrl || "",
    });
    setShowEditDialog(true);
  };
  
  const handleEditSubmit = () => {
    if (!editingDraft) return;
    if (!editForm.title.trim() || !editForm.content.trim()) {
      toast({ title: "제목과 내용을 입력해주세요.", variant: "destructive" });
      return;
    }
    updateMutation.mutate({ id: editingDraft.id, form: editForm });
  };

  if (!isAdmin && !isVerifying) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-12 text-center">
          <p className="text-muted-foreground">관리자 전용 페이지입니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileEdit className="w-6 h-6" />
            임시저장함
          </h1>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-[180px]" data-testid="select-draft-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading || isVerifying ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : !drafts || drafts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            임시저장된 글이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {drafts
              .filter((draft) => selectedCategory === "all" || draft.category === selectedCategory)
              .map((draft) => (
              <div
                key={draft.id}
                className="flex items-center gap-4 p-4 bg-card rounded-lg border"
                data-testid={`draft-item-${draft.id}`}
              >
                {draft.thumbnail && (
                  <img
                    src={draft.thumbnail}
                    alt={draft.title}
                    className="w-16 h-16 object-cover rounded"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs">
                      {categoryLabels[draft.category] || draft.category}
                    </Badge>
                    <Badge className="bg-yellow-500 text-white text-xs">임시</Badge>
                  </div>
                  <h3 className="font-medium text-foreground truncate">{draft.title}</h3>
                  <p className="text-xs text-muted-foreground">
                    {new Date(draft.createdAt).toLocaleString("ko-KR")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleEdit(draft)}
                    className="text-blue-500 hover:text-blue-600"
                    data-testid={`button-edit-draft-${draft.id}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handlePublish(draft.id)}
                    disabled={publishMutation.isPending}
                    data-testid={`button-publish-${draft.id}`}
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    공개
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDelete(draft.id)}
                    disabled={deleteMutation.isPending}
                    className="text-red-500 hover:text-red-600"
                    data-testid={`button-delete-${draft.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* 수정 다이얼로그 */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto z-[210]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              임시저장 글 수정
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-category">카테고리</Label>
              <Select 
                value={editForm.category} 
                onValueChange={(value) => setEditForm(prev => ({ ...prev, category: value }))}
              >
                <SelectTrigger data-testid="select-edit-draft-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[300]">
                  {editCategoryOptions.map((opt) => (
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
                data-testid="input-edit-draft-title"
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
                  data-testid="input-edit-draft-thumbnail"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                  data-testid="input-edit-draft-thumbnail-file"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  data-testid="button-edit-draft-upload-thumbnail"
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
                    data-testid="button-edit-draft-remove-thumbnail"
                  >
                    삭제
                  </Button>
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="edit-content">내용</Label>
              <Textarea
                id="edit-content"
                value={editForm.content}
                onChange={(e) => setEditForm(prev => ({ ...prev, content: e.target.value }))}
                placeholder="내용을 입력하세요"
                rows={6}
                data-testid="input-edit-draft-content"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-isVideo"
                checked={editForm.isVideo}
                onChange={(e) => setEditForm(prev => ({ ...prev, isVideo: e.target.checked }))}
                className="h-4 w-4"
                data-testid="checkbox-edit-draft-isvideo"
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
                  data-testid="input-edit-draft-videourl"
                />
              </div>
            )}
            <div className="flex gap-2">
              <Button 
                onClick={() => setShowEditDialog(false)}
                variant="outline"
                className="flex-1"
                data-testid="button-edit-draft-cancel"
              >
                취소
              </Button>
              <Button 
                onClick={handleEditSubmit}
                disabled={updateMutation.isPending}
                className="flex-1"
                data-testid="button-edit-draft-submit"
              >
                {updateMutation.isPending ? "저장 중..." : "저장하기"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
