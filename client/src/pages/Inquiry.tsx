import { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Send, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAdmin } from "@/contexts/AdminContext";

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
  accessToken?: string;
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

  // 관리자 상태 — AdminContext에서 전역으로 관리 (네비바 로그인과 동기화)
  const { isAdmin, token: adminToken, login: adminContextLogin, logout: adminContextLogout, pendingOtp, verifyOtp } = useAdmin();
  const [adminInquiries, setAdminInquiries] = useState<AdminInquiry[]>([]);
  const [expandedInquiry, setExpandedInquiry] = useState<string | null>(null);
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [submittingReply, setSubmittingReply] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<Record<string, Array<{id: string; senderType: string; content: string; createdAt: string}>>>({});
  const [adminLoginVisible, setAdminLoginVisible] = useState(false);
  const [adminPw, setAdminPw] = useState("");
  const [adminLoginErr, setAdminLoginErr] = useState("");
  const [adminOtpCode, setAdminOtpCode] = useState("");
  const [adminOtpErr, setAdminOtpErr] = useState("");

  useEffect(() => { window.scrollTo(0, 0); }, []);

  // 관리자용 전체 목록 조회
  const fetchAdminInquiries = async () => {
    const res = await fetch("/api/inquiries", { headers: { Authorization: `Bearer ${adminToken}` } });
    if (!res.ok) return;
    const data = await res.json();
    setAdminInquiries(Array.isArray(data) ? data : []);
  };

  const handleAdminLogin = async () => {
    setAdminLoginErr("");
    try {
      const result = await adminContextLogin(adminPw);
      if (result === "ok") {
        setAdminLoginVisible(false);
        setAdminPw("");
      } else if (result === "otp_required") {
        setAdminOtpCode("");
        setAdminOtpErr("");
      } else {
        setAdminLoginErr("비밀번호가 올바르지 않습니다.");
      }
    } catch {
      setAdminLoginErr("로그인에 실패했습니다.");
    }
  };

  const handleAdminOtpVerify = async () => {
    setAdminOtpErr("");
    const result = await verifyOtp(adminOtpCode.trim());
    if (result.ok) {
      setAdminLoginVisible(false);
      setAdminPw("");
      setAdminOtpCode("");
    } else {
      setAdminOtpErr(result.error);
    }
  };

  const handleAdminLogout = () => {
    adminContextLogout();
    setAdminInquiries([]);
    setExpandedInquiry(null);
  };

  const fetchThreadMessages = async (id: string) => {
    try {
      const res = await fetch(`/api/inquiries/${id}/thread`, { headers: { Authorization: `Bearer ${adminToken}` } });
      if (!res.ok) return;
      const data = await res.json();
      setThreadMessages(prev => ({ ...prev, [id]: Array.isArray(data) ? data : [] }));
    } catch {}
  };

  // 공개 목록 로드
  useEffect(() => {
    const cached = localStorage.getItem("kna_public_inquiries");
    if (cached) {
      try { setPublicList(JSON.parse(cached)); setPublicListLoading(false); } catch {}
    }
    fetch("/api/inquiries/public")
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setPublicList(list);
        setPublicListLoading(false);
        localStorage.setItem("kna_public_inquiries", JSON.stringify(list));
      })
      .catch(() => { setPublicListLoading(false); });
  }, [submitted]);

  // 관리자 상태 변경 시 문의 목록 로드 (네비바 로그인 포함 즉시 반영)
  useEffect(() => {
    if (isAdmin) {
      fetchAdminInquiries();
    } else {
      setAdminInquiries([]);
      setExpandedInquiry(null);
    }
  }, [isAdmin]);

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
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm md:text-base font-semibold text-muted-foreground">문의 관리 <span className="text-[#18a999]">(관리자)</span></h2>
                  <button onClick={handleAdminLogout} className="text-xs text-muted-foreground hover:text-red-500 transition">로그아웃</button>
                </div>
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
                            await fetch(`/api/inquiries/${inq.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${adminToken}` } });
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
                          {inq.accessToken && (
                            <a
                              href={`/inquiry/thread/${inq.accessToken}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-block text-xs text-[#18a999] underline underline-offset-2"
                            >
                              대화방 열기 →
                            </a>
                          )}
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
                                    const res = await fetch(`/api/inquiries/${inq.id}/reply`, {
                                      method: "PUT",
                                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
                                      body: JSON.stringify({ reply: text }),
                                    });
                                    if (!res.ok) {
                                      const errData = await res.json().catch(() => ({}));
                                      throw new Error(errData.error || `HTTP ${res.status}`);
                                    }
                                    const result = await res.json();
                                    if (result.isFirstReply) {
                                      toast({ title: `답변을 ${inq.contactType === "sms" ? "문자로" : "이메일로"} 발송했습니다.` });
                                      fetchAdminInquiries();
                                    } else {
                                      toast({ title: "댓글이 등록되었습니다." });
                                    }
                                    setThreadMessages(prev => ({
                                      ...prev,
                                      [inq.id]: [...(prev[inq.id] ?? []), { id: `__tmp__${Date.now()}`, senderType: "admin", content: text, createdAt: new Date().toISOString() }],
                                    }));
                                    setReplyTexts(prev => { const n = { ...prev }; delete n[inq.id]; return n; });
                                    fetchThreadMessages(inq.id);
                                  } catch (e: any) {
                                    toast({ title: `실패: ${e?.message || "알 수 없는 오류"}`, variant: "destructive" });
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
          {/* 관리자 로그인 (비로그인 상태에서만) */}
          {!isAdmin && (
            <div className="mt-10 text-center">
              {!adminLoginVisible ? (
                <button
                  onClick={() => setAdminLoginVisible(true)}
                  className="text-xs text-muted-foreground/30 hover:text-muted-foreground/60 transition"
                >
                  관리자
                </button>
              ) : (
                <div className="inline-flex flex-col items-center gap-2 p-4 border border-border rounded-xl bg-card shadow-sm">
                  {pendingOtp ? (
                    <>
                      <p className="text-xs font-semibold text-muted-foreground">2단계 인증</p>
                      <p className="text-xs text-muted-foreground">텔레그램으로 전송된 코드를 입력하세요</p>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={adminOtpCode}
                        onChange={e => { setAdminOtpCode(e.target.value); setAdminOtpErr(""); }}
                        onKeyDown={e => e.key === "Enter" && handleAdminOtpVerify()}
                        placeholder="000000"
                        className="border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#18a999] bg-background w-44 text-center tracking-widest"
                        autoFocus
                      />
                      {adminOtpErr && <p className="text-xs text-red-500">{adminOtpErr}</p>}
                      <div className="flex gap-2">
                        <button
                          onClick={handleAdminOtpVerify}
                          className="px-4 py-1.5 rounded-lg bg-[#18a999] text-white text-sm font-bold hover:bg-[#149085] transition"
                        >
                          확인
                        </button>
                        <button
                          onClick={() => { setAdminLoginVisible(false); setAdminPw(""); setAdminOtpCode(""); setAdminOtpErr(""); }}
                          className="px-4 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted/30 transition"
                        >
                          취소
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-semibold text-muted-foreground">관리자 로그인</p>
                      <input
                        type="password"
                        value={adminPw}
                        onChange={e => setAdminPw(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleAdminLogin()}
                        placeholder="비밀번호"
                        className="border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#18a999] bg-background w-44"
                        autoFocus
                      />
                      {adminLoginErr && <p className="text-xs text-red-500">{adminLoginErr}</p>}
                      <div className="flex gap-2">
                        <button
                          onClick={handleAdminLogin}
                          className="px-4 py-1.5 rounded-lg bg-[#18a999] text-white text-sm font-bold hover:bg-[#149085] transition"
                        >
                          로그인
                        </button>
                        <button
                          onClick={() => { setAdminLoginVisible(false); setAdminPw(""); setAdminLoginErr(""); }}
                          className="px-4 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted/30 transition"
                        >
                          취소
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
