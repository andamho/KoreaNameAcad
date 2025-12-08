import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Download, Plus, Pencil, Trash2 } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Consultation, NameStory, InsertNameStory } from "@shared/schema";

export default function Admin() {
  const { toast } = useToast();
  const [storyDialogOpen, setStoryDialogOpen] = useState(false);
  const [editingStory, setEditingStory] = useState<NameStory | null>(null);
  const [storyForm, setStoryForm] = useState<InsertNameStory>({
    title: "",
    thumbnail: "",
    content: "",
    videoUrl: "",
    isVideo: false,
  });

  const { data: consultations, isLoading: loadingConsultations } = useQuery<Consultation[]>({
    queryKey: ["/api/consultations"],
  });

  const { data: stories, isLoading: loadingStories } = useQuery<NameStory[]>({
    queryKey: ["/api/name-stories"],
  });

  const createStoryMutation = useMutation({
    mutationFn: (data: InsertNameStory) => apiRequest("/api/name-stories", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/name-stories"] });
      setStoryDialogOpen(false);
      resetStoryForm();
      toast({ title: "이야기가 등록되었습니다." });
    },
    onError: () => {
      toast({ title: "등록 실패", variant: "destructive" });
    },
  });

  const updateStoryMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertNameStory> }) => 
      apiRequest(`/api/name-stories/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/name-stories"] });
      setStoryDialogOpen(false);
      setEditingStory(null);
      resetStoryForm();
      toast({ title: "이야기가 수정되었습니다." });
    },
    onError: () => {
      toast({ title: "수정 실패", variant: "destructive" });
    },
  });

  const deleteStoryMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/name-stories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/name-stories"] });
      toast({ title: "이야기가 삭제되었습니다." });
    },
    onError: () => {
      toast({ title: "삭제 실패", variant: "destructive" });
    },
  });

  const resetStoryForm = () => {
    setStoryForm({ title: "", thumbnail: "", content: "", videoUrl: "", isVideo: false });
  };

  const openEditDialog = (story: NameStory) => {
    setEditingStory(story);
    setStoryForm({
      title: story.title,
      thumbnail: story.thumbnail,
      content: story.content,
      videoUrl: story.videoUrl || "",
      isVideo: story.isVideo,
    });
    setStoryDialogOpen(true);
  };

  const handleStorySubmit = () => {
    if (!storyForm.title || !storyForm.thumbnail || !storyForm.content) {
      toast({ title: "제목, 썸네일, 내용을 모두 입력해주세요.", variant: "destructive" });
      return;
    }
    if (editingStory) {
      updateStoryMutation.mutate({ id: editingStory.id, data: storyForm });
    } else {
      createStoryMutation.mutate(storyForm);
    }
  };

  const handleDownloadFile = (fileName: string, fileData: string, fileType: string) => {
    const dataUrl = `data:${fileType};base64,${fileData}`;
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatConsultationTime = (time: string) => {
    if (time === "weekday") return "주중 2시";
    if (time === "weekend") return "주말 2시";
    return time;
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="text-3xl font-bold text-foreground mb-8">관리자 페이지</h1>

        <Tabs defaultValue="consultations" className="space-y-6">
          <TabsList>
            <TabsTrigger value="consultations" data-testid="tab-consultations">
              신청서 관리 ({consultations?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="stories" data-testid="tab-stories">
              이름이야기 관리 ({stories?.length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="consultations" className="space-y-4">
            {loadingConsultations ? (
              <div className="text-center py-8">로딩 중...</div>
            ) : consultations && consultations.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">아직 신청서가 없습니다.</p>
              </Card>
            ) : (
              consultations?.map((consultation) => (
                <Card key={consultation.id} className="p-6 space-y-4" data-testid={`consultation-${consultation.id}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={consultation.type === "analysis" ? "default" : "secondary"}>
                          {consultation.type === "analysis" ? "이름분석" : "이름감명"}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {new Date(consultation.createdAt).toLocaleString("ko-KR")}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h3 className="font-semibold text-foreground mb-2">신청자 정보</h3>
                          <div className="space-y-1 text-sm">
                            <p><span className="text-muted-foreground">전화번호:</span> {consultation.phone}</p>
                            <p><span className="text-muted-foreground">입금자명:</span> {consultation.depositorName}</p>
                            <p><span className="text-muted-foreground">상담시간:</span> {formatConsultationTime(consultation.consultationTime)}</p>
                            <p><span className="text-muted-foreground">가족 인원:</span> {consultation.numPeople}명</p>
                          </div>
                        </div>

                        <div>
                          <h3 className="font-semibold text-foreground mb-2">분석 대상</h3>
                          <div className="space-y-2">
                            {consultation.peopleData.map((person, idx) => (
                              <div key={idx} className="text-sm bg-muted/30 p-2 rounded">
                                <p className="font-medium">{person.name}</p>
                                <p className="text-muted-foreground">
                                  {person.gender === "male" ? "남성" : "여성"} / {person.birthYear}년 / {person.occupation}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {consultation.hasNameChange === "yes" && consultation.nameChangeData && (
                        <div>
                          <h3 className="font-semibold text-foreground mb-2">개명 정보</h3>
                          <div className="space-y-2">
                            {consultation.nameChangeData.map((change, idx) => (
                              <div key={idx} className="text-sm bg-muted/30 p-2 rounded">
                                <p><span className="text-muted-foreground">현재 이름:</span> {change.currentName}</p>
                                <p><span className="text-muted-foreground">이전 이름:</span> {change.previousName}</p>
                                <p><span className="text-muted-foreground">한글:</span> {change.koreanName} / <span className="text-muted-foreground">한자:</span> {change.chineseName}</p>
                                <p><span className="text-muted-foreground">개명 연도:</span> {change.changeYear}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {consultation.type === "naming" && (
                        <div>
                          <h3 className="font-semibold text-foreground mb-2">감명받을 이름</h3>
                          <div className="text-sm bg-muted/30 p-2 rounded">
                            <p><span className="text-muted-foreground">한글:</span> {consultation.evaluationKoreanName}</p>
                            <p><span className="text-muted-foreground">한자:</span> {consultation.evaluationChineseName}</p>
                          </div>
                        </div>
                      )}

                      {consultation.reason && (
                        <div>
                          <h3 className="font-semibold text-foreground mb-2">신청 이유</h3>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {consultation.reason}
                          </p>
                        </div>
                      )}

                      {consultation.fileName && consultation.fileData && (
                        <div>
                          <h3 className="font-semibold text-foreground mb-2">첨부 파일</h3>
                          <div className="flex items-center gap-3 bg-muted/30 p-3 rounded">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-foreground">{consultation.fileName}</p>
                              <p className="text-xs text-muted-foreground">{consultation.fileType}</p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDownloadFile(consultation.fileName!, consultation.fileData!, consultation.fileType!)}
                              data-testid={`button-download-${consultation.id}`}
                            >
                              <Download className="w-4 h-4 mr-2" />
                              다운로드
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="stories" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={storyDialogOpen} onOpenChange={(open) => {
                setStoryDialogOpen(open);
                if (!open) {
                  setEditingStory(null);
                  resetStoryForm();
                }
              }}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-story">
                    <Plus className="w-4 h-4 mr-2" />
                    새 이야기 작성
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingStory ? "이야기 수정" : "새 이야기 작성"}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">제목</Label>
                      <Input
                        id="title"
                        value={storyForm.title}
                        onChange={(e) => setStoryForm({ ...storyForm, title: e.target.value })}
                        placeholder="이야기 제목"
                        data-testid="input-story-title"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="thumbnail">썸네일 URL</Label>
                      <Input
                        id="thumbnail"
                        value={storyForm.thumbnail}
                        onChange={(e) => setStoryForm({ ...storyForm, thumbnail: e.target.value })}
                        placeholder="https://example.com/image.jpg"
                        data-testid="input-story-thumbnail"
                      />
                      {storyForm.thumbnail && (
                        <div className="mt-2">
                          <img src={storyForm.thumbnail} alt="미리보기" className="max-h-40 rounded" />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="isVideo"
                        checked={storyForm.isVideo}
                        onCheckedChange={(checked) => setStoryForm({ ...storyForm, isVideo: checked })}
                        data-testid="switch-is-video"
                      />
                      <Label htmlFor="isVideo">영상 콘텐츠</Label>
                    </div>
                    {storyForm.isVideo && (
                      <div className="space-y-2">
                        <Label htmlFor="videoUrl">영상 URL (YouTube)</Label>
                        <Input
                          id="videoUrl"
                          value={storyForm.videoUrl || ""}
                          onChange={(e) => setStoryForm({ ...storyForm, videoUrl: e.target.value })}
                          placeholder="https://www.youtube.com/watch?v=..."
                          data-testid="input-story-video"
                        />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="content">내용 (HTML 지원)</Label>
                      <Textarea
                        id="content"
                        value={storyForm.content}
                        onChange={(e) => setStoryForm({ ...storyForm, content: e.target.value })}
                        placeholder="이야기 내용을 입력하세요..."
                        rows={10}
                        data-testid="input-story-content"
                      />
                    </div>
                    <Button 
                      onClick={handleStorySubmit} 
                      className="w-full"
                      disabled={createStoryMutation.isPending || updateStoryMutation.isPending}
                      data-testid="button-submit-story"
                    >
                      {editingStory ? "수정하기" : "등록하기"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {loadingStories ? (
              <div className="text-center py-8">로딩 중...</div>
            ) : stories && stories.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">아직 등록된 이야기가 없습니다.</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {stories?.map((story) => (
                  <Card key={story.id} className="overflow-hidden" data-testid={`story-card-${story.id}`}>
                    <div className="aspect-video relative">
                      <img src={story.thumbnail} alt={story.title} className="w-full h-full object-cover" />
                      {story.isVideo && (
                        <Badge className="absolute top-2 right-2">영상</Badge>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-semibold text-foreground line-clamp-2 mb-2">{story.title}</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        {new Date(story.createdAt).toLocaleDateString("ko-KR")}
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => openEditDialog(story)} data-testid={`button-edit-${story.id}`}>
                          <Pencil className="w-4 h-4 mr-1" />
                          수정
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => {
                            if (confirm("정말 삭제하시겠습니까?")) {
                              deleteStoryMutation.mutate(story.id);
                            }
                          }}
                          data-testid={`button-delete-${story.id}`}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          삭제
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
