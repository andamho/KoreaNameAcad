import { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Send, CheckCircle2 } from "lucide-react";

interface PublicInquiry {
  id: string;
  maskedName: string;
  status: string;
  createdAt: string;
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
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [contactType, setContactType] = useState<"sms" | "email">("sms");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [publicList, setPublicList] = useState<PublicInquiry[]>([]);

  useEffect(() => {
    fetch("/api/inquiries/public")
      .then(r => r.json())
      .then(data => setPublicList(Array.isArray(data) ? data : []))
      .catch(() => {});
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
      setSubmitted(true);
    } catch (e: any) {
      setError(e.message || "제출에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
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
                {/* 이름 */}
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

                {/* 연락처 */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">답변 알림 연락처</label>
                    <div className="flex items-center gap-3 text-sm">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="contactType"
                          checked={contactType === "sms"}
                          onChange={() => setContactType("sms")}
                          className="accent-[#18a999]"
                        />
                        <span className="text-muted-foreground">문자</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="contactType"
                          checked={contactType === "email"}
                          onChange={() => setContactType("email")}
                          className="accent-[#18a999]"
                        />
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

                {/* 문의 내용 */}
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
          {/* 문의 현황 게시판 */}
          {publicList.length > 0 && (
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
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
