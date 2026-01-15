import { useQuery, useMutation } from "@tanstack/react-query";
import { Trash2, Eye, FileEdit } from "lucide-react";
import { Link } from "wouter";
import type { Content } from "@shared/schema";
import { useAdmin } from "@/contexts/AdminContext";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const categoryLabels: Record<string, string> = {
  nameStory: "재미있는 이야기",
  expert: "전문가 과정",
  announcement: "공지사항",
  review: "후기",
};

export default function Drafts() {
  const { isAdmin, token, isVerifying } = useAdmin();
  const { toast } = useToast();

  const { data: drafts, isLoading } = useQuery<Content[]>({
    queryKey: ["/api/contents/drafts", token],
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
        <h1 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
          <FileEdit className="w-6 h-6" />
          임시저장함
        </h1>

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
            {drafts.map((draft) => (
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
    </div>
  );
}
