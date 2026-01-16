import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useRef } from "react";
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
import { Download, Plus, Pencil, Trash2, Upload } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
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
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  
  const { uploadFile, isUploading } = useUpload({
    onSuccess: (response) => {
      const imageUrl = response.objectPath;
      setUploadedImages(prev => {
        const newImages = [...prev, imageUrl];
        if (newImages.length === 1 || !storyForm.thumbnail) {
          setStoryForm(form => ({ ...form, thumbnail: imageUrl }));
        }
        return newImages;
      });
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
    setStoryForm(prev => ({ ...prev, thumbnail: imageUrl }));
    toast({ title: "대표 이미지가 변경되었습니다." });
  };

  const { data: consultations, isLoading: loadingConsultations } = useQuery<Consultation[]>({
    queryKey: ["/api/consultations"],
  });

  const { data: stories, isLoading: loadingStories } = useQuery<NameStory[]>({
    queryKey: ["/api/name-stories"],
  });

  const createStoryMutation = useMutation({
    mutationFn: (data: InsertNameStory) => apiRequest("POST", "/api/name-stories", data),
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
      apiRequest("PUT", `/api/name-stories/${id}`, data),
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
    mutationFn: (id: string) => apiRequest("DELETE", `/api/name-stories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/name-stories"] });
      toast({ title: "이야기가 삭제되었습니다." });
    },
    onError: () => {
      toast({ title: "삭제 실패", variant: "destructive" });
    },
  });

  // 홍보 문구 기본값
  const defaultPromoText = `😩고달픈 인생,
이름 하나로 이유와 해결책을!

🔍한글.한자이름만으로 운명상담
[정확도 80%👆]

🌸운이 술술 풀리는 이름으로
인생역전!

🔮이름상담 및 작명 [신청방법]
👇👇👇
https://korea-name-acad.com/services`;

  const resetStoryForm = () => {
    setStoryForm({ title: "", thumbnail: "", content: defaultPromoText, videoUrl: "", isVideo: false });
    setUploadedImages([]);
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
    // 기존 이미지들 추출 (썸네일 + 본문 이미지)
    const existingImages: string[] = [];
    const imageRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
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
                    {/* 이미지 업로드 (네이버 블로그 스타일) */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>이미지</Label>
                        <div>
                          <input
                            ref={thumbnailInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={handleImageUpload}
                            data-testid="input-story-thumbnail"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => thumbnailInputRef.current?.click()}
                            disabled={isUploading}
                            className="h-8"
                            data-testid="button-add-images"
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
                              className={`relative aspect-square rounded overflow-hidden cursor-pointer border-2 ${storyForm.thumbnail === img ? 'border-primary' : 'border-transparent'}`}
                              onClick={() => setAsThumbnail(img)}
                            >
                              <img src={img} alt="" className="w-full h-full object-cover" />
                              {storyForm.thumbnail === img && (
                                <div className="absolute top-0.5 left-0.5 bg-primary text-primary-foreground text-[10px] px-1 rounded">
                                  대표
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        클릭하여 대표 이미지 선택
                      </p>
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
                      <Label htmlFor="content">내용</Label>
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
