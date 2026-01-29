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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Plus, Pencil, Trash2 } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { ImageManager } from "@/components/ImageManager";
import type { Consultation, Content, InsertContent } from "@shared/schema";

const categoryOptions = [
  { value: "review", label: "후기" },
  { value: "nameStory", label: "이름이야기" },
  { value: "announcement", label: "공지사항" },
  { value: "expert", label: "한국이름학교" },
];

export default function Admin() {
  const { toast } = useToast();
  const [contentDialogOpen, setContentDialogOpen] = useState(false);
  const [editingContent, setEditingContent] = useState<Content | null>(null);
  const [contentForm, setContentForm] = useState<InsertContent>({
    category: "nameStory",
    title: "",
    thumbnail: "",
    content: "",
    videoUrl: "",
    isVideo: false,
  });
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const uploadedImagesRef = useRef<string[]>([]);
  
  // Keep ref in sync with state
  uploadedImagesRef.current = uploadedImages;
  
  const { uploadFile, isUploading } = useUpload({
    onSuccess: (response) => {
      console.log("[Admin] onSuccess called with:", response);
      const imageUrl = response.objectPath;
      setUploadedImages(prev => {
        const newImages = [...prev, imageUrl];
        if (newImages.length === 1 || !contentForm.thumbnail) {
          setContentForm(form => ({ ...form, thumbnail: imageUrl }));
        }
        return newImages;
      });
      toast({ title: "이미지가 추가되었습니다." });
    },
    onError: () => {
      toast({ title: "이미지 업로드에 실패했습니다.", variant: "destructive" });
    },
  });

  const { data: consultations, isLoading: loadingConsultations } = useQuery<Consultation[]>({
    queryKey: ["/api/consultations"],
  });

  const { data: contents, isLoading: loadingContents } = useQuery<Content[]>({
    queryKey: ["/api/contents"],
  });

  const createContentMutation = useMutation({
    mutationFn: (data: InsertContent) => apiRequest("POST", "/api/contents", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contents"] });
      setContentDialogOpen(false);
      resetContentForm();
      toast({ title: "콘텐츠가 등록되었습니다." });
    },
    onError: () => {
      toast({ title: "등록 실패", variant: "destructive" });
    },
  });

  const updateContentMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertContent> }) => 
      apiRequest("PUT", `/api/contents/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contents"] });
      setContentDialogOpen(false);
      setEditingContent(null);
      resetContentForm();
      toast({ title: "콘텐츠가 수정되었습니다." });
    },
    onError: () => {
      toast({ title: "수정 실패", variant: "destructive" });
    },
  });

  const deleteContentMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/contents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contents"] });
      toast({ title: "콘텐츠가 삭제되었습니다." });
    },
    onError: () => {
      toast({ title: "삭제 실패", variant: "destructive" });
    },
  });

  // 홍보 문구 기본값 (버튼은 상세페이지에서 자동 렌더링됨)
  const defaultPromoText = `😩고달픈 인생,
이름 하나로 이유와 해결책을!

🔍한글.한자이름만으로 운명상담
[정확도 80%👆]

🌸운이 술술 풀리는 이름으로
인생역전!

🔮이름상담 및 작명 [신청방법]
👇👇👇`;

  const resetContentForm = () => {
    setContentForm({ category: "nameStory", title: "", thumbnail: "", content: defaultPromoText, videoUrl: "", isVideo: false });
    setUploadedImages([]);
  };

  const openEditDialog = (content: Content) => {
    setEditingContent(content);
    setContentForm({
      category: content.category,
      title: content.title,
      thumbnail: content.thumbnail,
      content: content.content,
      videoUrl: content.videoUrl || "",
      isVideo: content.isVideo,
    });
    // 기존 이미지들 추출 (썸네일 + 본문 이미지)
    const existingImages: string[] = [];
    const imageRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
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
    setContentDialogOpen(true);
  };

  const handleContentSubmit = () => {
    if (!contentForm.title || !contentForm.thumbnail || !contentForm.content) {
      toast({ title: "제목, 썸네일, 내용을 모두 입력해주세요.", variant: "destructive" });
      return;
    }
    
    // useRef를 사용하여 최신 이미지 순서 가져오기 (클로저 문제 해결)
    const currentImages = uploadedImagesRef.current;
    
    // 썸네일 결정
    const finalThumbnail = contentForm.thumbnail || currentImages[0] || "";
    
    // 이미지를 content 맨 앞에 마크다운으로 추가
    // 기존 content에서 이미지 마크다운 제거 후 새로 추가
    // 썸네일은 content에서 제외 (중복 방지)
    let cleanContent = contentForm.content.replace(/!\[[^\]]*\]\([^)]+\)\n*/g, '').trim();
    const contentImages = currentImages.filter(img => img !== finalThumbnail);
    const imagesMarkdown = contentImages.map(img => `![이미지](${img})`).join('\n');
    const finalContent = imagesMarkdown ? `${imagesMarkdown}\n\n${cleanContent}` : cleanContent;
    
    const submitData = {
      ...contentForm,
      thumbnail: finalThumbnail,
      content: finalContent,
    };
    
    if (editingContent) {
      updateContentMutation.mutate({ id: editingContent.id, data: submitData });
    } else {
      createContentMutation.mutate(submitData);
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
            <TabsTrigger value="contents" data-testid="tab-contents">
              콘텐츠 관리 ({contents?.length || 0})
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
                            {consultation.nameChangeData.map((change: any, idx) => (
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

          <TabsContent value="contents" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={contentDialogOpen} onOpenChange={(open) => {
                setContentDialogOpen(open);
                if (!open) {
                  setEditingContent(null);
                  resetContentForm();
                }
              }}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-content">
                    <Plus className="w-4 h-4 mr-2" />
                    새 글 작성
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingContent ? "콘텐츠 수정" : "새 글 작성"}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                      <Label htmlFor="category" className="text-sm font-semibold text-primary mb-2 block">카테고리 선택 (필수)</Label>
                      <Select 
                        value={contentForm.category} 
                        onValueChange={(value) => setContentForm({ ...contentForm, category: value })}
                      >
                        <SelectTrigger data-testid="select-content-category" className="bg-background">
                          <SelectValue placeholder="카테고리를 선택하세요" />
                        </SelectTrigger>
                        <SelectContent className="z-[9999]">
                          {categoryOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="title">제목</Label>
                      <Input
                        id="title"
                        value={contentForm.title}
                        onChange={(e) => setContentForm({ ...contentForm, title: e.target.value })}
                        placeholder="제목을 입력하세요"
                        data-testid="input-content-title"
                      />
                    </div>
                    {/* 이미지 업로드 (드래그앤드롭 지원) */}
                    <ImageManager
                      images={uploadedImages}
                      onImagesChange={setUploadedImages}
                      thumbnail={contentForm.thumbnail || ""}
                      onThumbnailChange={(thumb) => setContentForm(prev => ({ ...prev, thumbnail: thumb }))}
                      onUpload={uploadFile}
                      isUploading={isUploading}
                    />
                    <div className="flex items-center gap-2">
                      <Switch
                        id="isVideo"
                        checked={contentForm.isVideo}
                        onCheckedChange={(checked) => setContentForm({ ...contentForm, isVideo: checked })}
                        data-testid="switch-is-video"
                      />
                      <Label htmlFor="isVideo">영상 콘텐츠</Label>
                    </div>
                    {contentForm.isVideo && (
                      <div className="space-y-2">
                        <Label htmlFor="videoUrl">영상 URL (YouTube)</Label>
                        <Input
                          id="videoUrl"
                          value={contentForm.videoUrl || ""}
                          onChange={(e) => {
                            const url = e.target.value;
                            setContentForm({ ...contentForm, videoUrl: url });
                            // YouTube 썸네일 자동 추출
                            const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([^&\s?]+)/);
                            if (match && match[1]) {
                              const thumbnailUrl = `https://img.youtube.com/vi/${match[1]}/maxresdefault.jpg`;
                              setContentForm(prev => ({ ...prev, thumbnail: thumbnailUrl }));
                            }
                          }}
                          placeholder="https://www.youtube.com/watch?v=..."
                          data-testid="input-content-video"
                        />
                        {contentForm.thumbnail && contentForm.thumbnail.includes('img.youtube.com') && (
                          <div className="mt-2">
                            <p className="text-xs text-muted-foreground mb-1">자동 추출된 썸네일:</p>
                            <img 
                              src={contentForm.thumbnail} 
                              alt="YouTube 썸네일" 
                              className="w-full max-w-[200px] rounded border"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                if (target.src.includes('maxresdefault')) {
                                  target.src = target.src.replace('maxresdefault', 'hqdefault');
                                }
                              }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="content">내용</Label>
                      <Textarea
                        id="content"
                        value={contentForm.content}
                        onChange={(e) => setContentForm({ ...contentForm, content: e.target.value })}
                        placeholder="내용을 입력하세요..."
                        rows={10}
                        data-testid="input-content-body"
                      />
                    </div>
                    <Button 
                      onClick={handleContentSubmit} 
                      className="w-full"
                      disabled={createContentMutation.isPending || updateContentMutation.isPending}
                      data-testid="button-submit-content"
                    >
                      {editingContent ? "수정하기" : "등록하기"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {loadingContents ? (
              <div className="text-center py-8">로딩 중...</div>
            ) : contents && contents.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">아직 등록된 콘텐츠가 없습니다.</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {contents?.map((content) => (
                  <Card key={content.id} className="overflow-hidden" data-testid={`content-card-${content.id}`}>
                    <div className="aspect-video relative">
                      <img src={content.thumbnail || ""} alt={content.title} className="w-full h-full object-cover" />
                      {content.isVideo && (
                        <Badge className="absolute top-2 right-2">영상</Badge>
                      )}
                      <Badge className="absolute top-2 left-2" variant="secondary">
                        {categoryOptions.find(c => c.value === content.category)?.label || content.category}
                      </Badge>
                    </div>
                    <div className="p-4">
                      <h3 className="font-semibold text-foreground line-clamp-2 mb-2">{content.title}</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        {new Date(content.createdAt).toLocaleDateString("ko-KR")}
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => openEditDialog(content)} data-testid={`button-edit-${content.id}`}>
                          <Pencil className="w-4 h-4 mr-1" />
                          수정
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => {
                            if (confirm("정말 삭제하시겠습니까?")) {
                              deleteContentMutation.mutate(content.id);
                            }
                          }}
                          data-testid={`button-delete-${content.id}`}
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
