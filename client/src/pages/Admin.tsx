// v2
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
import { Linkify } from "@/lib/linkify";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { ImageManager } from "@/components/ImageManager";
import { KnopApp } from "@/components/knop/KnopApp";
import { InstagramPanel } from "@/components/instagram/InstagramPanel";
import { knopApi } from "@/lib/knopApi";
import { LayoutDashboard, UserPlus, Instagram } from "lucide-react";
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
  // 대화 내역(개별 메시지) — /inquiry 페이지와 동일하게 문의 관리 탭에서도 전체 대화·수정·삭제
  const [threadMessages, setThreadMessages] = useState<Record<string, Array<{ id: string; senderType: string; content: string; createdAt: string }>>>({});
  const [editingMsg, setEditingMsg] = useState<{ id: string; text: string } | null>(null);

  const fetchThreadMessages = async (id: string) => {
    try {
      const token = localStorage.getItem("kna_admin_token");
      const res = await fetch(`/api/inquiries/${id}/thread`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      setThreadMessages(prev => ({ ...prev, [id]: Array.isArray(data) ? data : [] }));
    } catch {}
  };
  // 관리자 답글(대화 메시지) 개별 수정
  const saveMsgEdit = async (inqId: string) => {
    if (!editingMsg?.text.trim()) return;
    try {
      const token = localStorage.getItem("kna_admin_token");
      const res = await fetch(`/api/inquiry-messages/${editingMsg.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: editingMsg.text.trim() }),
      });
      if (!res.ok) throw new Error();
      setEditingMsg(null);
      fetchThreadMessages(inqId);
    } catch { toast({ title: "수정 실패", variant: "destructive" }); }
  };
  // 관리자 답글 개별 삭제
  const deleteMsg = async (inqId: string, msgId: string) => {
    if (!confirm("이 답글을 삭제할까요?")) return;
    try {
      const token = localStorage.getItem("kna_admin_token");
      const res = await fetch(`/api/inquiry-messages/${msgId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error();
      fetchThreadMessages(inqId);
    } catch { toast({ title: "삭제 실패", variant: "destructive" }); }
  };

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

  const [convertingId, setConvertingId] = useState<string | null>(null);
  const handleConvertConsultation = async (id: string) => {
    setConvertingId(id);
    try {
      const { customer } = await knopApi.convertConsultation(id);
      toast({ title: "고객으로 전환되었습니다.", description: `${customer.name} · 운영(KOP) 탭에서 확인하세요.` });
    } catch (e: any) {
      toast({ title: "전환 실패", description: e?.message, variant: "destructive" });
    } finally {
      setConvertingId(null);
    }
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

        <Tabs defaultValue="knop" className="space-y-6">
          <TabsList>
            <TabsTrigger value="knop" data-testid="tab-knop">
              <LayoutDashboard className="w-3.5 h-3.5 mr-1.5" />
              운영 (KOP)
            </TabsTrigger>
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
            <TabsTrigger value="video" data-testid="tab-video">
              숏폼 배포
            </TabsTrigger>
            <TabsTrigger value="instagram" data-testid="tab-instagram">
              <Instagram className="w-3.5 h-3.5 mr-1.5" />
              인스타 자동화
            </TabsTrigger>
          </TabsList>

          {/* ── 인스타 자동화 탭 ────────────────────────────── */}
          <TabsContent value="instagram">
            <InstagramPanel />
          </TabsContent>

          {/* ── 운영 플랫폼 (KNOP) 탭 ─────────────────────────── */}
          <TabsContent value="knop">
            <KnopApp />
          </TabsContent>

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
              <div className="rounded-xl border border-border">
                {/* 헤더 */}
                <div className="grid grid-cols-[1fr_160px_100px_120px] gap-2 px-4 py-2.5 bg-muted/50 text-xs font-bold text-muted-foreground border-b border-border rounded-t-xl">
                  <span>작성자</span>
                  <span>문의 일시</span>
                  <span>상태</span>
                  <span />
                </div>
                {inquiries.map((inq, idx) => (
                  <div key={inq.id} className={idx !== 0 ? "border-t border-border/50" : ""}>
                    <div className="grid grid-cols-[1fr_160px_100px_120px] gap-2 items-center px-4 py-3">
                      <span className="font-medium text-sm">{maskName(inq.name)} 님</span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(inq.createdAt)}</span>
                      <Badge variant={inq.status === "답변완료" ? "secondary" : "default"}
                        className={inq.status === "접수완료" ? "bg-[#18a999] text-white hover:bg-[#18a999]" : ""}>
                        {inq.status}
                      </Badge>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="text-xs text-[#18a999] hover:underline font-medium"
                          onClick={() => {
                            const next = expandedInquiry === inq.id ? null : inq.id;
                            setExpandedInquiry(next);
                            if (next) fetchThreadMessages(next);
                          }}
                        >
                          {expandedInquiry === inq.id ? "닫기" : "내용보기"}
                        </button>
                        <button
                          type="button"
                          className="text-xs text-red-400 hover:text-red-600 font-medium transition"
                          onClick={async () => {
                            if (!confirm("정말 삭제하시겠습니까?")) return;
                            const token = localStorage.getItem("kna_admin_token");
                            await fetch(`/api/inquiries/${inq.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
                            fetchInquiries();
                            if (expandedInquiry === inq.id) setExpandedInquiry(null);
                          }}
                        >
                          삭제
                        </button>
                      </div>
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
                            <Linkify>{inq.content}</Linkify>
                          </p>
                        </div>

                        {/* 대화 내역 — 전체 메시지(관리자·고객), 관리자 메시지는 개별 수정·삭제 */}
                        {(threadMessages[inq.id] ?? []).length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-xs text-muted-foreground">대화 내역</p>
                            <div className="space-y-2 bg-card border border-border/40 rounded-lg p-3">
                              {(threadMessages[inq.id] ?? []).map(msg => (
                                <div key={msg.id} className={`flex flex-col gap-0.5 ${msg.senderType === "admin" ? "items-end" : "items-start"}`}>
                                  <p className={`text-[10px] font-medium ${msg.senderType === "admin" ? "text-[#18a999]" : "text-muted-foreground"}`}>
                                    {msg.senderType === "admin" ? "관리자" : inq.name}
                                  </p>
                                  {editingMsg?.id === msg.id ? (
                                    <div className="w-full flex flex-col gap-1.5">
                                      <textarea
                                        value={editingMsg.text}
                                        onChange={e => setEditingMsg({ id: msg.id, text: e.target.value })}
                                        ref={el => { if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; } }}
                                        className="w-full border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#18a999] transition min-h-[120px] max-h-[60vh] overflow-y-auto bg-background"
                                        maxLength={2000} autoFocus
                                      />
                                      <div className="flex justify-end gap-2">
                                        <button onClick={() => saveMsgEdit(inq.id)} disabled={!editingMsg.text.trim()}
                                          className="px-3 py-1 rounded-lg bg-[#18a999] text-white text-xs font-bold disabled:opacity-50 transition">저장</button>
                                        <button onClick={() => setEditingMsg(null)}
                                          className="px-3 py-1 rounded-lg border border-border text-xs transition">취소</button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed ${
                                      msg.senderType === "admin" ? "bg-[#18a999] text-white" : "bg-muted/60 text-foreground"
                                    }`}>
                                      <Linkify className={msg.senderType === "admin"
                                        ? "underline underline-offset-2 break-all font-medium"
                                        : "text-[#18a999] underline underline-offset-2 hover:text-[#149085] break-all"}>
                                        {msg.content}
                                      </Linkify>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-2">
                                    <p className="text-[10px] text-muted-foreground">{formatDateTime(msg.createdAt)}</p>
                                    {msg.senderType === "admin" && !msg.id.startsWith("__tmp__") && editingMsg?.id !== msg.id && (
                                      <>
                                        <button onClick={() => setEditingMsg({ id: msg.id, text: msg.content })}
                                          className="text-[10px] text-muted-foreground hover:text-[#18a999] transition">수정</button>
                                        <button onClick={() => deleteMsg(inq.id, msg.id)}
                                          className="text-[10px] text-muted-foreground hover:text-red-500 transition">삭제</button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 답변/댓글 입력 — 항상 표시(첫 답변은 문자·이메일 발송, 이후는 대화 댓글) */}
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground">
                            {inq.status === "접수완료"
                              ? `첫 답변 (${inq.contactType === "sms" ? "문자로 발송됩니다" : "이메일로 발송됩니다"})`
                              : "댓글 입력"}
                          </p>
                          <textarea
                            value={replyTexts[inq.id] || ""}
                            onChange={e => setReplyTexts(prev => ({ ...prev, [inq.id]: e.target.value }))}
                            placeholder={inq.status === "접수완료" ? `${inq.name}님께 보낼 답변을 작성하세요` : "댓글을 입력하세요"}
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
                              <Trash2 className="w-3.5 h-3.5 mr-1" /> 문의 삭제
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
                                  const result = await res.json().catch(() => ({}));
                                  fetchInquiries();
                                  setReplyTexts(prev => { const n = { ...prev }; delete n[inq.id]; return n; });
                                  fetchThreadMessages(inq.id);
                                  toast({ title: result?.isFirstReply === false ? "댓글이 등록되었습니다." : `답변을 ${inq.contactType === "sms" ? "문자로" : "이메일로"} 발송했습니다.` });
                                } catch {
                                  toast({ title: "발송에 실패했습니다.", variant: "destructive" });
                                } finally {
                                  setSubmittingReply(null);
                                }
                              }}
                            >
                              {submittingReply === inq.id ? "전송 중..." : (inq.status === "접수완료" ? "답변 발송" : "댓글 등록")}
                            </Button>
                          </div>
                        </div>
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
                        <Button
                          size="sm"
                          variant="outline"
                          className="ml-auto"
                          disabled={convertingId === consultation.id}
                          onClick={() => handleConvertConsultation(consultation.id)}
                          data-testid={`button-convert-${consultation.id}`}
                        >
                          <UserPlus className="w-4 h-4 mr-1.5" />
                          {convertingId === consultation.id ? "전환 중…" : "고객으로 전환"}
                        </Button>
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

          {/* ── 숏폼 배포 탭 ────────────────────────────────── */}
          <TabsContent value="video" className="space-y-4">
            <VideoDeployPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ── 숏폼 자동배포 패널 (채널 연결 + 배포) ──
interface YtStatus { configured: boolean; connected: boolean; channelTitle?: string }

interface IgStatus { configured: boolean; connected: boolean; username?: string }
interface TtStatus { configured: boolean; connected: boolean; displayName?: string }

function VideoDeployPanel() {
  const [yt, setYt] = useState<YtStatus | null>(null);
  const [ig, setIg] = useState<IgStatus | null>(null);
  const [tt, setTt] = useState<TtStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    setLoading(true);
    const token = localStorage.getItem("kna_admin_token");
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const res = await fetch("/api/admin/youtube/status", { headers });
      setYt(res.ok ? await res.json() : null);
    } catch {
      setYt(null);
    }
    try {
      const igRes = await fetch("/api/admin/instagram/status", { headers });
      setIg(igRes.ok ? await igRes.json() : null);
    } catch {
      setIg(null);
    }
    try {
      const ttRes = await fetch("/api/admin/tiktok/status", { headers });
      setTt(ttRes.ok ? await ttRes.json() : null);
    } catch {
      setTt(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const connectYoutube = () => {
    const token = localStorage.getItem("kna_admin_token");
    if (!token) return;
    // 현재 탭에서 구글 동의 화면으로 이동 (팝업 차단 회피). 완료 후 콜백 페이지에서 관리자로 복귀
    window.location.href = `/api/auth/youtube?token=${encodeURIComponent(token)}`;
  };

  const connectTiktok = () => {
    const token = localStorage.getItem("kna_admin_token");
    if (!token) return;
    window.location.href = `/api/auth/tiktok?token=${encodeURIComponent(token)}`;
  };

  // ── 배포 폼 상태 ──
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [candidates, setCandidates] = useState<Array<{ id: string; title: string; category: string }>>([]);
  const [selectedContentId, setSelectedContentId] = useState("");
  const [vPrivacy, setVPrivacy] = useState("public");
  const [igCaptionText, setIgCaptionText] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [result, setResult] = useState<any>(null);

  const fetchCandidates = async () => {
    try {
      const token = localStorage.getItem("kna_admin_token");
      const res = await fetch("/api/admin/video/candidates", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setCandidates(await res.json());
    } catch {
      setCandidates([]);
    }
  };
  useEffect(() => {
    fetchCandidates();
  }, []);

  const deploy = async () => {
    if (!file) { toast({ title: "영상 파일을 선택하세요.", variant: "destructive" }); return; }
    if (!selectedContentId) { toast({ title: "연결할 글을 선택하세요.", variant: "destructive" }); return; }
    setDeploying(true);
    setResult(null);
    try {
      const token = localStorage.getItem("kna_admin_token");
      // 1) 영상 R2 업로드
      const up = await fetch("/api/uploads/upload", {
        method: "POST",
        headers: { "Content-Type": file.type || "video/mp4" },
        body: file,
      });
      if (!up.ok) throw new Error("영상 업로드 실패");
      const { objectPath } = await up.json();

      // 2) 배포 실행 (선택한 글에 유튜브 링크 삽입). 썸네일은 서버가 영상 맨 앞 프레임으로 자동 설정.
      const dep = await fetch("/api/admin/video/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          objectPath,
          contentId: selectedContentId,
          privacyStatus: vPrivacy,
          targetInstagram: !!ig?.connected,
          instagramCaption: igCaptionText,
          targetTiktok: !!tt?.connected,
        }),
      });
      const data = await dep.json();
      if (!dep.ok) throw new Error(data.error || "배포 실패");
      setResult(data);
      toast({ title: "배포 완료" });
      setSelectedContentId("");
      setFile(null);
      fetchCandidates(); // 방금 영상 넣은 글은 목록에서 제외됨
    } catch (e: any) {
      setResult({ error: e?.message || "배포 실패" });
      toast({ title: "배포 실패", description: e?.message, variant: "destructive" });
    } finally {
      setDeploying(false);
    }
  };

  // 틱톡만 게시 (유튜브/인스타/홈페이지 안 건드림). 심사 전 샌드박스는 비공개(SELF_ONLY)로 게시됨.
  const tiktokOnly = async () => {
    if (!file) { toast({ title: "영상 파일을 선택하세요.", variant: "destructive" }); return; }
    setDeploying(true);
    setResult(null);
    try {
      const token = localStorage.getItem("kna_admin_token");
      const up = await fetch("/api/uploads/upload", {
        method: "POST",
        headers: { "Content-Type": file.type || "video/mp4" },
        body: file,
      });
      if (!up.ok) throw new Error("영상 업로드 실패");
      const { objectPath } = await up.json();

      const r = await fetch("/api/admin/video/tiktok-only", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ objectPath, caption: igCaptionText }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "틱톡 게시 실패");
      setResult({ tiktokOnly: data });
      toast({
        title: "틱톡 게시 완료",
        description: data.privacy === "SELF_ONLY" ? "심사 전이라 비공개로 게시됨(정상)" : `공개범위: ${data.privacy}`,
      });
      setFile(null);
    } catch (e: any) {
      setResult({ error: e?.message || "틱톡 게시 실패" });
      toast({ title: "틱톡 게시 실패", description: e?.message, variant: "destructive" });
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-1">채널 연결</h2>
        <p className="text-sm text-muted-foreground mb-4">
          영상을 자동으로 올리려면 각 플랫폼 계정을 먼저 연결해야 합니다.
        </p>

        {/* YouTube */}
        <div className="flex items-center justify-between border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "#D93B3B" }} />
            <div>
              <div className="font-medium">YouTube</div>
              {loading ? (
                <div className="text-xs text-muted-foreground">확인 중…</div>
              ) : !yt?.configured ? (
                <div className="text-xs text-amber-600">API 키 미설정 (.env)</div>
              ) : yt?.connected ? (
                <div className="text-xs text-emerald-600">
                  연결됨{yt.channelTitle ? ` · ${yt.channelTitle}` : ""}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">연결 안 됨</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {yt?.connected ? (
              <Badge variant="secondary">✓ 연결됨</Badge>
            ) : (
              <Button size="sm" onClick={connectYoutube} disabled={!yt?.configured}>
                YouTube 연결
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={fetchStatus}>
              새로고침
            </Button>
          </div>
        </div>

        {/* Instagram */}
        <div className="flex items-center justify-between border rounded-lg p-4 mt-3">
          <div className="flex items-center gap-3">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "#B33089" }} />
            <div>
              <div className="font-medium">Instagram</div>
              {loading ? (
                <div className="text-xs text-muted-foreground">확인 중…</div>
              ) : ig?.connected ? (
                <div className="text-xs text-emerald-600">연결됨{ig.username ? ` · @${ig.username}` : ""}</div>
              ) : (
                <div className="text-xs text-amber-600">토큰 미설정 (.env)</div>
              )}
            </div>
          </div>
          {ig?.connected ? <Badge variant="secondary">✓ 연결됨</Badge> : <Badge variant="outline">미연결</Badge>}
        </div>

        {/* TikTok */}
        <div className="flex items-center justify-between border rounded-lg p-4 mt-3">
          <div className="flex items-center gap-3">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "#0E9BAE" }} />
            <div>
              <div className="font-medium">TikTok <span className="text-xs text-muted-foreground">(초안 전송)</span></div>
              {loading ? (
                <div className="text-xs text-muted-foreground">확인 중…</div>
              ) : !tt?.configured ? (
                <div className="text-xs text-amber-600">API 키 미설정 (.env)</div>
              ) : tt?.connected ? (
                <div className="text-xs text-emerald-600">연결됨{tt.displayName ? ` · ${tt.displayName}` : ""}</div>
              ) : (
                <div className="text-xs text-muted-foreground">연결 안 됨</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {tt?.connected ? (
              <Badge variant="secondary">✓ 연결됨</Badge>
            ) : (
              <Button size="sm" onClick={connectTiktok} disabled={!tt?.configured}>
                TikTok 연결
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold mb-1">영상 배포</h2>
          <p className="text-sm text-muted-foreground">
            세로 숏폼 영상을 유튜브에 올리고, 선택한 홈페이지 글에 그 영상 링크를 자동으로 넣습니다.
            <br />(글 수정 → "동영상 콘텐츠" 켜기 → 주소 입력 → 저장, 이 과정을 자동화합니다.)
          </p>
        </div>

        {!yt?.connected && (
          <div className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-md p-3">
            먼저 위에서 YouTube를 연결해야 배포할 수 있습니다.
          </div>
        )}

        <div className="space-y-2">
          <Label>연결할 글 <span className="text-xs text-muted-foreground">(영상 없는 최근 글 10개)</span></Label>
          <Select value={selectedContentId} onValueChange={setSelectedContentId}>
            <SelectTrigger><SelectValue placeholder="글 선택" /></SelectTrigger>
            <SelectContent>
              {candidates.length === 0 ? (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">영상 없는 글이 없습니다</div>
              ) : (
                candidates.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            유튜브 제목 = 이 글의 <b>썸네일 제목</b> + 고정 해시태그로 자동 생성됩니다.
          </p>
        </div>

        <div className="space-y-2">
          <Label>영상 파일 (세로 mp4)</Label>
          <Input
            type="file"
            accept="video/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          {file && <p className="text-xs text-muted-foreground">{file.name} · {(file.size / 1024 / 1024).toFixed(1)}MB</p>}
        </div>

        <div className="space-y-2">
          <Label>YouTube 공개 설정</Label>
          <Select value={vPrivacy} onValueChange={setVPrivacy}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="public">공개</SelectItem>
              <SelectItem value="unlisted">일부공개(링크)</SelectItem>
              <SelectItem value="private">비공개</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 본문 (영상 대본) — 인스타/틱톡 캡션 공통 */}
        <div className="space-y-2">
          <Label>본문 (영상 대본)</Label>
          <textarea
            className="w-full min-h-32 rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={igCaptionText}
            onChange={(e) => setIgCaptionText(e.target.value)}
            placeholder="영상 대본을 그대로 붙여넣으세요. (아래 고정 홍보문구 + 해시태그가 자동으로 붙습니다)"
          />
          <div className="text-xs text-muted-foreground">
            인스타 캡션 = <b>대본</b> + 고정 홍보문구(@계정 포함) + 해시태그. 자동으로 붙습니다.
          </div>
        </div>

        {/* 동시 배포 대상 (토글 없이 항상 자동) */}
        <div className="border rounded-lg p-3 text-xs space-y-1.5">
          <div className="font-medium text-sm">동시 배포 (자동)</div>
          <div className="flex items-center gap-2"><span className="inline-block w-2 h-2 rounded-full" style={{ background: "#D93B3B" }} />YouTube — 항상</div>
          <div className="flex items-center gap-2"><span className="inline-block w-2 h-2 rounded-full" style={{ background: "#2E7D5B" }} />홈페이지 글 삽입 — 항상</div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#B33089" }} />
            Instagram — {ig?.connected ? "자동 배포됨" : <span className="text-amber-600">미연결</span>}
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#0E9BAE" }} />
            TikTok — {tt?.connected ? "자동 배포됨(초안)" : <span className="text-muted-foreground">심사 통과 후 자동 합류</span>}
          </div>
          <div className="text-muted-foreground pt-1">유튜브 제목 해시태그: #한국이름학교 #와츠유어네임이름연구협회 #작명 #개명 #이름분석 #이름풀이</div>
        </div>

        <Button className="w-full" onClick={deploy} disabled={deploying || !yt?.connected}>
          {deploying ? "배포 중… (영상 업로드에 시간이 걸릴 수 있습니다)" : "배포하기"}
        </Button>

        {/* 틱톡 단독 게시 — 유튜브/인스타/홈페이지 안 건드림. 테스트·데모 녹화용 */}
        <Button variant="outline" className="w-full" onClick={tiktokOnly} disabled={deploying || !tt?.connected}>
          {deploying ? "처리 중…" : "틱톡만 게시 (유튜브·인스타 제외)"}
        </Button>
        <div className="text-xs text-muted-foreground -mt-2">
          틱톡만 단독 게시합니다. 심사 통과 전에는 틱톡 정책상 <b>비공개(나만 보기)</b>로 올라갑니다.
        </div>

        {result && (
          <div className="text-sm border rounded-lg p-4 space-y-1">
            {result.error && <div className="text-red-600">오류: {result.error}</div>}
            {result.tiktokOnly && (
              <div>
                TikTok 단독 게시: <span className="text-emerald-600">성공</span>
                {" · "}공개범위 <b>{result.tiktokOnly.privacy}</b>
                {result.tiktokOnly.privacy === "SELF_ONLY" && <span className="text-muted-foreground"> (심사 전이라 비공개 — 정상)</span>}
                <div className="text-muted-foreground">
                  상태: {result.tiktokOnly.status} · 소요 {result.tiktokOnly.elapsedSec}s · publishId {result.tiktokOnly.publishId}
                </div>
              </div>
            )}
            {result.youtubeTitle && <div className="text-muted-foreground">제목: {result.youtubeTitle}</div>}
            {result.youtube && (
              <div>
                YouTube: {result.youtube.ok
                  ? <a href={result.youtube.url} target="_blank" rel="noreferrer" className="text-blue-600 underline">{result.youtube.url}</a>
                  : <span className="text-red-600">실패 — {result.youtube.error}</span>}
              </div>
            )}
            {result.thumbnail && (
              <div>
                썸네일: {result.thumbnail.ok
                  ? <span className="text-emerald-600">맨 앞 프레임으로 설정됨</span>
                  : <span className="text-amber-600">자동설정 실패({result.thumbnail.error}) — 유튜브 기본 썸네일 사용</span>}
              </div>
            )}
            {result.instagram && (
              <div>
                Instagram: {result.instagram.ok
                  ? <span className="text-emerald-600">릴스 게시 완료</span>
                  : <span className="text-red-600">실패 — {result.instagram.error}</span>}
              </div>
            )}
            {result.tiktok && (
              <div>
                TikTok: {result.tiktok.ok
                  ? <span className="text-emerald-600">초안 전송 완료 (틱톡 앱에서 게시)</span>
                  : <span className="text-red-600">실패 — {result.tiktok.error}</span>}
              </div>
            )}
            {result.homepage && (
              <div>
                홈페이지 글: {result.homepage.ok
                  ? <span className="text-emerald-600">영상 링크 삽입 완료</span>
                  : <span className="text-red-600">실패 — {result.homepage.error}</span>}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
