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
  const [threadToken, setThreadToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [publicList, setPublicList] = useState<PublicInquiry[]>([]);
  const [publicListLoading, setPublicListLoading] = useState(true);

  // 관리자 상태
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminInquiries, setAdminInquiries] = useState<AdminInquiry[]>([]);
  const [expandedInquiry, setExpandedInquiry] = useState<string | null>(null);
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [submittingReply, setSubmittingReply] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<Record<string, Array<{id: string; senderType: string; content: string; createdAt: string}>>>({});

  useEffect(() => { window.scrollTo(0, 0); }, []);

  // 관리자용 전체 목록 조회
  const fetchAdminInquiries = async () => {
    const token = localStorage.getItem("kna_admin_token");
    const res = await fetch("/api/inquiries", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const data = await res.json();
    setAdminInquiries(Array.isArray(data) ? data : []);
  };

  const fetchThreadMessages = async (id: string) => {
    const token = localStorage.getItem("kna_admin_token");
    try {
      const res = await fetch(`/api/inquiries/${id}/thread`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      setThreadMessages(prev => ({ ...prev, [id]: Array.isArray(data) ? data : [] }));
    } catch {}
  };

  // 마운트 시 공개 목록 + 관리자 확인을 병렬로 즉시 실행
  useEffect(() => {
    // 캐시된 공개 목록 즉시 표시 (로딩 느낌 없애기)
    const cached = localStorage.getItem("kna_public_inquiries");
    if (cached) {
      try { setPublicList(JSON.parse(cached)); setPublicListLoading(false); } catch {}
    }

    // 공개 목록 API 호출 후 캐시 갱신
    fetch("/api/inquiries/public")
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setPublicList(list);
        setPublicListLoading(false);
        localStorage.setItem("kna_public_inquiries", JSON.stringify(list));
      })
      .catch(() => { setPublicListLoading(false); });

    // 관리자 토큰 있으면 병렬로 확인 + 전체 목록 로드
    const token = localStorage.getItem("kna_admin_token");
    if (token) {
      fetch("/api/admin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
        .then(r => r.json())
        .then(data => {
          if (data.valid) {
            setIsAdmin(true);
            fetchAdminInquiries();
          }
        })
        .catch(() => {});
    }
  }, [submitted]);

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
      const data = await res.json();
      if (data.accessToken) setThreadToken(data.accessToken);
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
        <div className="w-full max-w-md md:max-w-lg mx-auto">
          <div className="rounded-2xl bg-card border border-border/50 p-8 space-y-6 shadow-sm">
            <div className="text-center space-y-1">
              <p className="text-sm md:text-base text-muted-foreground">한국이름학교</p>
              <h1 className="text-xl md:text-2xl font-bold text-foreground">문의 및 상담 신청</h1>
            </div>

            {submitted ? (
              <div className="py-6 text-center space-y-4">
                <CheckCircle2 className="w-12 h-12 mx-auto text-[#18a999]" />
                <p className="font-bold text-foreground text-lg md:text-xl">문의가 접수되었습니다</p>
                <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                  빠른 시일 내에 {contactType === "sms" ? "문자" : "이메일"}로 답변드리겠습니다.
                </p>
                {threadToken && (
                  <div className="mt-2 space-y-3 text-left bg-muted/40 rounded-xl p-4">
                    <p className="text-xs md:text-sm font-semibold text-foreground">내 문의 대화방 링크</p>
                    <p className="text-[11px] md:text-xs text-muted-foreground leading-relaxed">
                      이 링크를 저장해두시면 답변 확인 및 추가 문의를 이어서 하실 수 있습니다.
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={`${window.location.origin}/inquiry/thread/${threadToken}`}
                        className="flex-1 text-xs border border-border rounded-lg px-2 py-1.5 bg-background text-foreground outline-none truncate"
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/inquiry/thread/${threadToken}`);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        className="shrink-0 px-3 py-1.5 rounded-lg bg-[#18a999] text-white text-xs font-bold hover:bg-[#149085] transition"
                      >
                        {copied ? "복사됨" : "복사"}
                      </button>
                    </div>
                    <a
                      href={`/inquiry/thread/${threadToken}`}
                      className="block w-full text-center py-2 rounded-xl border border-[#18a999] text-[#18a999] text-sm font-bold hover:bg-[#18a999]/5 transition"
                    >
                      대화방 바로가기
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm md:text-base font-medium text-foreground">이름</label>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="이름을 입력해주세요"
                    maxLength={20}
                    className="w-full border border-border rounded-xl px-4 py-2.5 text-sm md:text-base outline-none focus:ring-2 focus:ring-[#18a999] bg-background transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm md:text-base font-medium text-foreground">답변 알림 발송</label>
                    <div className="flex items-center gap-3 text-sm md:text-base">
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
                    className="w-full border border-border rounded-xl px-4 py-2.5 text-sm md:text-base outline-none focus:ring-2 focus:ring-[#18a999] bg-background transition"
                  />
                  <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                    입력하신 연락처 또는 이메일은 <span className="font-bold text-orange-500">상담 답변 알림 발송 목적</span>으로만 사용되며,
                    상담 종료 후 안전하게 폐기됩니다.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm md:text-base font-medium text-foreground">문의 상세 내용</label>
                  <textarea
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    maxLength={1000}
                    rows={5}
                    className="w-full border border-border rounded-xl px-4 py-3 text-sm md:text-base outline-none focus:ring-2 focus:ring-[#18a999] bg-background transition resize-none"
                  />
                </div>

                {error && <p className="text-red-500 text-xs md:text-sm">{error}</p>}

                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#18a999] text-white font-bold text-sm md:text-base hover:bg-[#149085] disabled:opacity-50 transition"
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
                <h2 className="text-sm md:text-base font-semibold text-muted-foreground mb-3">문의 관리 <span className="text-[#18a999]">(관리자)</span></h2>
                <div className="rounded-xl border border-border bg-card text-sm overflow-hidden">
                  <div className="grid grid-cols-[1fr_130px_80px_50px] px-4 py-2 bg-muted/50 text-xs md:text-sm font-bold text-muted-foreground border-b border-border">
                    <span>작성자</span>
                    <span>문의 일시</span>
                    <span>상태</span>
                    <span />
                  </div>
                  <div>
                  {adminInquiries.map((inq, idx) => (
                    <div key={inq.id} className={idx !== 0 ? "border-t border-border/50" : ""}>
                      <div
                        className="grid grid-cols-[1fr_130px_80px_50px] px-4 py-3 items-center cursor-pointer hover:bg-muted/20 transition"
                        onClick={() => {
                          const next = expandedInquiry === inq.id ? null : inq.id;
                          setExpandedInquiry(next);
                          if (next) fetchThreadMessages(next);
                        }}
                      >
                        <span className="font-medium text-sm md:text-base">{maskName(inq.name)} 님</span>
                        <span className="text-xs md:text-sm text-muted-foreground">{formatDateTime(inq.createdAt)}</span>
                        <Badge variant={inq.status === "답변완료" ? "secondary" : "default"}
                          className={inq.status === "접수완료" ? "bg-[#18a999] text-white hover:bg-[#18a999] text-xs md:text-sm" : "text-xs md:text-sm"}>
                          {inq.status}
                        </Badge>
                        <button
                          type="button"
                          className="text-xs md:text-sm text-red-400 hover:text-red-600 font-medium text-right"
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
                          <div className="grid grid-cols-2 gap-3 text-sm md:text-base">
                            <div>
                              <p className="text-xs md:text-sm text-muted-foreground mb-0.5">성함</p>
                              <p className="font-medium">{inq.name}</p>
                            </div>
                            <div>
                              <p className="text-xs md:text-sm text-muted-foreground mb-0.5">연락처</p>
                              <p className="font-medium text-xs md:text-sm">
                                {inq.contact} <span className="text-muted-foreground">{inq.contactType === "sms" ? "📱 문자" : "📧 이메일"}</span>
                              </p>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs md:text-sm text-muted-foreground mb-1">문의 내용</p>
                            <p className="text-sm md:text-base whitespace-pre-wrap bg-background border border-border/50 rounded-lg px-3 py-2 leading-relaxed">
                              {inq.content}
                            </p>
                          </div>
                          {/* 스레드 메시지 */}
                          {(threadMessages[inq.id] ?? []).length > 0 && (
                            <div className="space-y-1.5">
                              <p className="text-xs md:text-sm text-muted-foreground">대화 내역</p>
                              <div className="space-y-2 max-h-52 overflow-y-auto bg-background border border-border/40 rounded-lg p-3">
                                {(threadMessages[inq.id] ?? []).map(msg => (
                                  <div key={msg.id} className={`flex flex-col gap-0.5 ${msg.senderType === "admin" ? "items-end" : "items-start"}`}>
                                    <p className={`text-[10px] font-medium ${msg.senderType === "admin" ? "text-[#18a999]" : "text-muted-foreground"}`}>
                                      {msg.senderType === "admin" ? "관리자" : inq.name}
                                    </p>
                                    <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs md:text-sm whitespace-pre-wrap leading-relaxed ${
                                      msg.senderType === "admin"
                                        ? "bg-[#18a999] text-white"
                                        : "bg-muted/60 text-foreground"
                                    }`}>
                                      {msg.content}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground">{formatDateTime(msg.createdAt)}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* 입력창 — 항상 표시 */}
                          <div className="space-y-2">
                            <p className="text-xs md:text-sm text-muted-foreground">
                              {inq.status === "접수완료"
                                ? `첫 답변 (${inq.contactType === "sms" ? "문자 알림 발송" : "이메일 알림 발송"})`
                                : "댓글 입력"}
                            </p>
                            <textarea
                              value={replyTexts[inq.id] || ""}
                              onChange={e => setReplyTexts(prev => ({ ...prev, [inq.id]: e.target.value }))}
                              placeholder={inq.status === "접수완료" ? `${inq.name}님께 보낼 답변을 작성하세요` : "댓글을 입력하세요"}
                              className="w-full border border-border rounded-xl px-3 py-2 text-sm md:text-base outline-none focus:ring-2 focus:ring-[#18a999] transition resize-none min-h-[80px] bg-background"
                            />
                            <div className="flex justify-end">
                              <button
                                disabled={!replyTexts[inq.id]?.trim() || submittingReply === inq.id}
                                className="px-4 py-1.5 text-sm md:text-base rounded-lg bg-[#18a999] text-white font-bold hover:bg-[#149085] disabled:opacity-50 transition"
                                onClick={async () => {
                                  const text = replyTexts[inq.id]?.trim();
                                  if (!text) return;
                                  setSubmittingReply(inq.id);
                                  try {
                                    const token = localStorage.getItem("kna_admin_token");
                                    if (inq.status === "접수완료") {
                                      // 첫 답변: 문자/이메일 알림 발송
                                      const res = await fetch(`/api/inquiries/${inq.id}/reply`, {
                                        method: "PUT",
                                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                        body: JSON.stringify({ reply: text }),
                                      });
                                      if (!res.ok) throw new Error();
                                      toast({ title: `답변을 ${inq.contactType === "sms" ? "문자로" : "이메일로"} 발송했습니다.` });
                                      fetchAdminInquiries();
                                      // 즉시 화면에 반영
                                      setThreadMessages(prev => ({
                                        ...prev,
                                        [inq.id]: [...(prev[inq.id] ?? []), { id: `__tmp__${Date.now()}`, inquiryId: inq.id, senderType: "admin", content: text, createdAt: new Date().toISOString() }],
                                      }));
                                    } else {
                                      // 이후 댓글: 알림 발송 없이 스레드에만 저장
                                      const res = await fetch(`/api/inquiries/${inq.id}/thread`, {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                        body: JSON.stringify({ content: text }),
                                      });
                                      if (!res.ok) throw new Error();
                                      const newMsg = await res.json();
                                      // 즉시 화면에 반영
                                      setThreadMessages(prev => ({
                                        ...prev,
                                        [inq.id]: [...(prev[inq.id] ?? []), newMsg],
                                      }));
                                      toast({ title: "댓글이 등록되었습니다." });
                                    }
                                    setReplyTexts(prev => { const n = { ...prev }; delete n[inq.id]; return n; });
                                    fetchThreadMessages(inq.id); // 서버와 동기화
                                  } catch {
                                    toast({ title: "실패했습니다.", variant: "destructive" });
                                  } finally {
                                    setSubmittingReply(null);
                                  }
                                }}
                              >
                                {submittingReply === inq.id ? "처리 중..." : inq.status === "접수완료" ? "답변 발송" : "댓글 입력"}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  </div>
                </div>
              </div>
            )
          ) : (
            /* 공개 뷰 */
            (publicListLoading || publicList.length > 0) && (
              <div className="mt-8">
                <h2 className="text-sm md:text-base font-semibold text-muted-foreground mb-3">문의 현황</h2>
                <div className="rounded-xl border border-border overflow-hidden text-sm">
                  <div className="grid grid-cols-[1fr_140px_80px] px-4 py-2 bg-muted/50 text-xs md:text-sm font-bold text-muted-foreground border-b border-border">
                    <span>작성자</span>
                    <span>문의 일시</span>
                    <span>상태</span>
                  </div>
                  <div className="overflow-y-auto" style={{ maxHeight: "250px" }}>
                  {publicListLoading && publicList.length === 0 ? (
                    [0,1,2].map(i => (
                      <div key={i} className={`grid grid-cols-[1fr_140px_80px] px-4 py-3 items-center ${i !== 0 ? "border-t border-border/40" : ""}`}>
                        <div className="h-3.5 w-20 rounded bg-muted/60 animate-pulse" />
                        <div className="h-3 w-28 rounded bg-muted/50 animate-pulse" />
                        <div className="h-3 w-12 rounded bg-muted/50 animate-pulse" />
                      </div>
                    ))
                  ) : (
                    publicList.map((inq, idx) => (
                      <div key={inq.id}
                        className={`grid grid-cols-[1fr_140px_80px] px-4 py-3 items-center ${idx !== 0 ? "border-t border-border/40" : ""}`}>
                        <span className="font-medium text-sm md:text-base text-foreground">{inq.maskedName} 님</span>
                        <span className="text-xs md:text-sm text-muted-foreground">{formatDateTime(inq.createdAt)}</span>
                        <span className={`text-xs md:text-sm font-medium ${inq.status === "답변완료" ? "text-muted-foreground" : "text-[#18a999]"}`}>
                          {inq.status}
                        </span>
                      </div>
                    ))
                  )}
                  </div>
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
