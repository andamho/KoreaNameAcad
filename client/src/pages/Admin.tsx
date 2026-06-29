import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Plus, Pencil, Trash2, ChevronDown, ChevronUp, MessageSquare } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { ImageManager } from "@/components/ImageManager";
import type { Consultation, Content, InsertContent } from "@shared/schema";

interface Inquiry {
  id: string;
  name: string;
  contact: string;
  contactType: string;
  content: string;
  status: string;
  adminReply: string | null;
  createdAt: string;
  repliedAt: string | null;
}

function maskName(name: string) {
  if (!name || name.length === 0) return "**";
  return name[0] + "**";
}

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day} ${h}:${mi}`;
}

const categoryOptions = [
  { value: "review", label: "후기" },
  { value: "nameStory", label: "이름이야기" },
  { value: "announcement", label: "공지사항" },
  { value: "expert", label: "한국이름학교" },
  { value: "about", label: "협회 소개" },
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

  const [expandedInquiry, setExpandedInquiry] = useState<string | null>(null);
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [submittingReply, setSubmittingReply] = useState<string | null>(null);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loadingInquiries, setLoadingInquiries] = useState(true);

  const fetchInquiries = async () => {
    setLoadingInquiries(true);
    try {
      const token = localStorage.getItem("kna_admin_token");
      const res = await fetch("/api/inquiries", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setInquiries(Array.isArray(data) ? data : []);
    } catch {
      setInquiries([]);
    } finally {
      setLoadingInquiries(false);
    }
  };

  const { data: consultations, isLoading: loadingConsultations } = useQuery<Consultation[]>({
    queryKey: ["/api/consultations"],
  });

  useEffect(() => { fetchInquiries(); }, []);

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

        <Tabs defaultValue="inquiries" className="space-y-6">
          <TabsList>
            <TabsTrigger value="inquiries" data-testid="tab-inquiries">
              <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
              문의 관리 ({inquiries?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="consultations" data-testid="tab-consultations">
              신청서 관리 ({consultations?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="contents" data-testid="tab-contents">
              콘텐츠 관리 ({contents?.length || 0})
            </TabsTrigger>
          </TabsList>

          {/* ── 문의 관리 탭 ────────────────────────────────── */}
          <TabsContent value="inquiries">
            {loadingInquiries ? (
              <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
            ) : !inquiries?.length ? (
              <Card className="p-12 text-center">
                <MessageSquare className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-muted-foreground">아직 문의가 없습니다.</p>
              </Card>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                {/* 헤더 */}
                <div className="grid grid-cols-[1fr_160px_100px_32px] gap-2 px-4 py-2.5 bg-muted/50 text-xs font-bold text-muted-foreground border-b border-border">
                  <span>작성자</span>
                  <span>문의 일시</span>
                  <span>상태</span>
                  <span />
                </div>
                {inquiries.map((inq, idx) => (
                  <div key={inq.id} className={idx !== 0 ? "border-t border-border/50" : ""}>
                    <div
                      className="grid grid-cols-[1fr_160px_100px_32px] gap-2 items-center px-4 py-3 cursor-pointer hover:bg-muted/30 transition"
                      onClick={() => setExpandedInquiry(expandedInquiry === inq.id ? null : inq.id)}
                    >
                      <span className="font-medium text-sm">{maskName(inq.name)} 님</span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(inq.createdAt)}</span>
                      <Badge variant={inq.status === "답변완료" ? "secondary" : "default"}
                        className={inq.status === "접수완료" ? "bg-[#18a999] text-white hover:bg-[#18a999]" : ""}>
                        {inq.status}
                      </Badge>
                      {expandedInquiry === inq.id
                        ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                    {expandedInquiry === inq.id && (
                      <div className="px-4 pb-4 pt-2 bg-muted/10 border-t border-border/30 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">성함</p>
                            <p className="font-medium">{inq.name}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">연락처</p>
                            <p className="font-medium">
                              {inq.contact}
                              <span className="ml-2 text-xs font-normal text-muted-foreground">
                                {inq.contactType === "sms" ? "📱 문자 알림" : "📧 이메일 알림"}
                              </span>
                            </p>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1.5">문의 내용</p>
                          <p className="text-sm whitespace-pre-wrap bg-card border border-border/50 rounded-lg px-4 py-3 leading-relaxed">
                            {inq.content}
                          </p>
                        </div>
                        {inq.adminReply && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1.5">보낸 답변</p>
                            <p className="text-sm whitespace-pre-wrap bg-[#18a999]/5 border border-[#18a999]/20 rounded-lg px-4 py-3 leading-relaxed">
                              {inq.adminReply}
                            </p>
                          </div>
                        )}
                        {inq.status === "접수완료" && (
                          <div className="space-y-2">
                            <p className="text-xs text-muted-foreground">
                              답변 작성 ({inq.contactType === "sms" ? "Solapi 문자로 발송됩니다" : "이메일로 발송됩니다"})
                            </p>
                            <textarea
                              value={replyTexts[inq.id] || ""}
                              onChange={e => setReplyTexts(prev => ({ ...prev, [inq.id]: e.target.value }))}
                              placeholder={`${inq.name}님께 보낼 답변을 작성하세요`}
                              className="w-full border border-border rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#18a999] transition resize-none min-h-[100px] bg-background"
                            />
                            <div className="flex items-center justify-between">
                              <Button
                                size="sm" variant="outline"
                                onClick={async () => {
                                  if (!confirm("정말 삭제하시겠습니까?")) return;
                                  const token = localStorage.getItem("kna_admin_token");
                                  await fetch(`/api/inquiries/${inq.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
                                  fetchInquiries();
                                  setExpandedInquiry(null);
                                }}
                                className="text-red-500 hover:text-red-600 border-red-200"
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-1" /> 삭제
                              </Button>
                              <Button
                                size="sm"
                                disabled={!replyTexts[inq.id]?.trim() || submittingReply === inq.id}
                                className="bg-[#18a999] text-white hover:bg-[#149085]"
                                onClick={async () => {
                                  const text = replyTexts[inq.id]?.trim();
                                  if (!text) return;
                                  setSubmittingReply(inq.id);
                                  try {
                                    const token = localStorage.getItem("kna_admin_token");
                                    const res = await fetch(`/api/inquiries/${inq.id}/reply`, {
                                      method: "PUT",
                                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                      body: JSON.stringify({ reply: text }),
                                    });
                                    if (!res.ok) throw new Error();
                                    fetchInquiries();
                                    setReplyTexts(prev => { const n = { ...prev }; delete n[inq.id]; return n; });
                                    setExpandedInquiry(null);
                                    toast({ title: `답변을 ${inq.contactType === "sms" ? "문자로" : "이메일로"} 발송했습니다.` });
                                  } catch {
                                    toast({ title: "발송에 실패했습니다.", variant: "destructive" });
                                  } finally {
                                    setSubmittingReply(null);
                                  }
                                }}
                              >
                                {submittingReply === inq.id ? "발송 중..." : "답변 발송"}
                              </Button>
                            </div>
                          </div>
                        )}
                        {inq.status === "답변완료" && (
                          <div className="flex justify-end">
                            <Button
                              size="sm" variant="outline"
                              onClick={async () => {
                                if (!confirm("정말 삭제하시겠습니까?")) return;
                                const token = localStorage.getItem("kna_admin_token");
                                await fetch(`/api/inquiries/${inq.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
                                fetchInquiries();
                                setExpandedInquiry(null);
                              }}
                              className="text-red-500 hover:text-red-600 border-red-200"
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-1" /> 삭제
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

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
                <DialogContent className="dialog-fullscreen overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingContent ? "콘텐츠 수정" : "새 글 작성"}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                      <Label className="text-sm font-semibold text-primary mb-2 block">카테고리 선택 (필수)</Label>
                      <div className="flex flex-wrap gap-2">
                        {categoryOptions.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setContentForm({ ...contentForm, category: opt.value })}
                            className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all whitespace-nowrap ${
                              contentForm.category === opt.value 
                                ? 'border-primary bg-primary text-primary-foreground' 
                                : 'border-border bg-background text-foreground hover:border-primary/50'
                            }`}
                            data-testid={`button-category-${opt.value}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
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
                    <div className="space-y-2 flex-1 flex flex-col">
                      <Label htmlFor="content">내용</Label>
                      <RichTextEditor
                        key={editingContent?.id ?? "new"}
                        value={contentForm.content}
                        onChange={(val) => setContentForm({ ...contentForm, content: val })}
                        placeholder="내용을 입력하세요..."
                        className="flex-1 min-h-[300px] md:min-h-[400px] text-base"
                        data-testid="input-content-body"
                        onUploadImage={async (file) => {
                          const result = await uploadFile(file);
                          if (!result) throw new Error("업로드 실패");
                          return result.objectPath;
                        }}
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
