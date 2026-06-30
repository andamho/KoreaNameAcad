import { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Send, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface PublicInquiry {
  id: string;
  maskedName: string;
  status: string;
  createdAt: string;
}

interface AdminInquiry {
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

export default function Inquiry() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [contactType, setContactType] = useState<"sms" | "email">("sms");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [publicList, setPublicList] = useState<PublicInquiry[]>([]);

  // 관리자 상태
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminInquiries, setAdminInquiries] = useState<AdminInquiry[]>([]);
  const [expandedInquiry, setExpandedInquiry] = useState<string | null>(null);
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [submittingReply, setSubmittingReply] = useState<string | null>(null);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  // 관리자 여부 확인
  useEffect(() => {
    const token = localStorage.getItem("kna_admin_token");
    if (!token) return;
    fetch("/api/admin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(r => r.json())
      .then(data => { if (data.valid) setIsAdmin(true); })
      .catch(() => {});
  }, []);

  // 관리자용 전체 목록 조회
  const fetchAdminInquiries = async () => {
    const token = localStorage.getItem("kna_admin_token");
    const res = await fetch("/api/inquiries", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const data = await res.json();
    setAdminInquiries(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    if (isAdmin) {
      fetchAdminInquiries();
    }
  }, [isAdmin, submitted]);

  // 공개 목록 조회 (비관리자용)
  useEffect(() => {
    if (isAdmin) return;
    fetch("/api/inquiries/public")
      .then(r => r.json())
      .then(data => setPublicList(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [submitted, isAdmin]);

  async function handleSubmit() {
    if (!name.trim() || !contact.trim() || !content.trim()) {
      setError("모든 항목을 입력해주세요.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), contact: contact.trim(), contactType, content: content.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "오류가 발생했습니다.");
      }
      setSubmitted(true);
    } catch (e: any) {
      setError(e.message || "제출에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundImage: "url('/inquirybg.png')", backgroundSize: "cover", backgroundPosition: "center", backgroundAttachment: "fixed" }}>
      <Navbar />
      <main className="flex-1 py-20 px-4">
        <div className="w-full max-w-md mx-auto">
          <div className="rounded-2xl bg-card border border-border/50 p-8 space-y-6 shadow-sm">
            <div className="text-center space-y-1">
              <p className="text-sm text-muted-foreground">한국이름학교</p>
              <h1 className="text-xl font-bold text-foreground">문의 및 상담 신청</h1>
            </div>

            {submitted ? (
              <div className="py-8 text-center space-y-3">
                <CheckCircle2 className="w-12 h-12 mx-auto text-[#18a999]" />
                <p className="font-bold text-foreground text-lg">문의가 접수되었습니다</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  빠른 시일 내에 {contactType === "sms" ? "문자" : "이메일"}로 답변드리겠습니다.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">이름</label>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="이름을 입력해주세요"
                    maxLength={20}
                    className="w-full border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#18a999] bg-background transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">답변 알림 연락처</label>
                    <div className="flex items-center gap-3 text-sm">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name="contactType" checked={contactType === "sms"} onChange={() => setContactType("sms")} className="accent-[#18a999]" />
                        <span className="text-muted-foreground">문자</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name="contactType" checked={contactType === "email"} onChange={() => setContactType("email")} className="accent-[#18a999]" />
                        <span className="text-muted-foreground">이메일</span>
                      </label>
                    </div>
                  </div>
                  <input
                    value={contact}
                    onChange={e => setContact(e.target.value)}
                    placeholder={contactType === "sms" ? "01012345678" : "이메일 주소"}
                    maxLength={100}
                    className="w-full border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#18a999] bg-background transition"
                  />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    입력하신 연락처 또는 이메일은 <span className="font-bold text-orange-500">상담 답변 알림 발송 목적</span>으로만 사용되며,
                    상담 종료 후 안전하게 폐기됩니다.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">문의 상세 내용</label>
                  <textarea
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    maxLength={1000}
                    rows={5}
                    className="w-full border border-border rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#18a999] bg-background transition resize-none"
                  />
                </div>

                {error && <p className="text-red-500 text-xs">{error}</p>}

                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#18a999] text-white font-bold text-sm hover:bg-[#149085] disabled:opacity-50 transition"
                >
                  <Send className="w-4 h-4" />
                  {submitting ? "등록 중..." : "문의 등록하기"}
                </button>
              </div>
            )}
          </div>

          {/* 문의 현황 */}
          {isAdmin ? (
            /* 관리자 뷰 */
            adminInquiries.length > 0 && (
              <div className="mt-8">
                <h2 className="text-sm font-semibold text-muted-foreground mb-3">문의 관리 <span className="text-[#18a999]">(관리자)</span></h2>
                <div className="rounded-xl border border-border bg-card text-sm">
                  <div className="grid grid-cols-[1fr_130px_80px_50px] px-4 py-2 bg-muted/50 text-xs font-bold text-muted-foreground border-b border-border rounded-t-xl">
                    <span>작성자</span>
                    <span>문의 일시</span>
                    <span>상태</span>
                    <span />
                  </div>
                  {adminInquiries.map((inq, idx) => (
                    <div key={inq.id} className={idx !== 0 ? "border-t border-border/50" : ""}>
                      <div
                        className="grid grid-cols-[1fr_130px_80px_50px] px-4 py-3 items-center cursor-pointer hover:bg-muted/20 transition"
                        onClick={() => setExpandedInquiry(expandedInquiry === inq.id ? null : inq.id)}
                      >
                        <span className="font-medium text-sm">{maskName(inq.name)} 님</span>
                        <span className="text-xs text-muted-foreground">{formatDateTime(inq.createdAt)}</span>
                        <Badge variant={inq.status === "답변완료" ? "secondary" : "default"}
                          className={inq.status === "접수완료" ? "bg-[#18a999] text-white hover:bg-[#18a999] text-xs" : "text-xs"}>
                          {inq.status}
                        </Badge>
                        <button
                          type="button"
                          className="text-xs text-red-400 hover:text-red-600 font-medium text-right"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!confirm("정말 삭제하시겠습니까?")) return;
                            const token = localStorage.getItem("kna_admin_token");
                            await fetch(`/api/inquiries/${inq.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
                            fetchAdminInquiries();
                            if (expandedInquiry === inq.id) setExpandedInquiry(null);
                          }}
                        >
                          삭제
                        </button>
                      </div>
                      {expandedInquiry === inq.id && (
                        <div className="px-4 pb-4 pt-2 bg-muted/10 border-t border-border/30 space-y-3">
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <p className="text-xs text-muted-foreground mb-0.5">성함</p>
                              <p className="font-medium">{inq.name}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-0.5">연락처</p>
                              <p className="font-medium text-xs">
                                {inq.contact} <span className="text-muted-foreground">{inq.contactType === "sms" ? "📱 문자" : "📧 이메일"}</span>
                              </p>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">문의 내용</p>
                            <p className="text-sm whitespace-pre-wrap bg-background border border-border/50 rounded-lg px-3 py-2 leading-relaxed">
                              {inq.content}
                            </p>
                          </div>
                          {inq.adminReply && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">보낸 답변</p>
                              <p className="text-sm whitespace-pre-wrap bg-[#18a999]/5 border border-[#18a999]/20 rounded-lg px-3 py-2 leading-relaxed">
                                {inq.adminReply}
                              </p>
                            </div>
                          )}
                          {inq.status === "접수완료" && (
                            <div className="space-y-2">
                              <p className="text-xs text-muted-foreground">
                                답변 작성 ({inq.contactType === "sms" ? "문자 발송" : "이메일 발송"})
                              </p>
                              <textarea
                                value={replyTexts[inq.id] || ""}
                                onChange={e => setReplyTexts(prev => ({ ...prev, [inq.id]: e.target.value }))}
                                placeholder={`${inq.name}님께 보낼 답변을 작성하세요`}
                                className="w-full border border-border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#18a999] transition resize-none min-h-[80px] bg-background"
                              />
                              <div className="flex justify-end">
                                <button
                                  disabled={!replyTexts[inq.id]?.trim() || submittingReply === inq.id}
                                  className="px-4 py-1.5 text-sm rounded-lg bg-[#18a999] text-white font-bold hover:bg-[#149085] disabled:opacity-50 transition"
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
                                      fetchAdminInquiries();
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
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          ) : (
            /* 공개 뷰 */
            publicList.length > 0 && (
              <div className="mt-8">
                <h2 className="text-sm font-semibold text-muted-foreground mb-3">문의 현황</h2>
                <div className="rounded-xl border border-border overflow-hidden text-sm">
                  <div className="grid grid-cols-[1fr_140px_80px] px-4 py-2 bg-muted/50 text-xs font-bold text-muted-foreground border-b border-border">
                    <span>작성자</span>
                    <span>문의 일시</span>
                    <span>상태</span>
                  </div>
                  {publicList.map((inq, idx) => (
                    <div key={inq.id}
                      className={`grid grid-cols-[1fr_140px_80px] px-4 py-3 items-center ${idx !== 0 ? "border-t border-border/40" : ""}`}>
                      <span className="font-medium text-foreground">{inq.maskedName} 님</span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(inq.createdAt)}</span>
                      <span className={`text-xs font-medium ${inq.status === "답변완료" ? "text-muted-foreground" : "text-[#18a999]"}`}>
                        {inq.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
