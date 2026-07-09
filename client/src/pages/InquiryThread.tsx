import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Send } from "lucide-react";

interface ThreadMessage {
  id: string;
  senderType: "user" | "admin";
  content: string;
  createdAt: string;
}

interface ThreadData {
  inquiry: {
    id: string;
    name: string;
    content: string;
    status: string;
    createdAt: string;
  };
  messages: ThreadMessage[];
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

export default function InquiryThread() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [data, setData] = useState<ThreadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  const fetchThread = async () => {
    try {
      const res = await fetch(`/api/inquiry/thread/${token}`);
      if (res.status === 404) { setNotFound(true); return; }
      if (!res.ok) throw new Error();
      const json = await res.json();
      setData(json);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchThread(); }, [token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages]);

  const handleSend = async () => {
    if (!replyText.trim()) return;
    setSending(true);
    setSendError("");
    try {
      const res = await fetch(`/api/inquiry/thread/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: replyText.trim() }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "오류가 발생했습니다.");
      }
      setReplyText("");
      await fetchThread();
    } catch (e: any) {
      setSendError(e.message || "전송에 실패했습니다.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundImage: "url('/inquirybg.png')", backgroundSize: "cover", backgroundPosition: "center", backgroundAttachment: "fixed" }}>
      <Navbar />
      <main className="flex-1 py-20 px-4">
        <div className="w-full max-w-md md:max-w-lg mx-auto space-y-4">
          {loading ? (
            <div className="rounded-2xl bg-card border border-border/50 p-8 text-center text-muted-foreground text-sm">
              불러오는 중...
            </div>
          ) : notFound ? (
            <div className="rounded-2xl bg-card border border-border/50 p-8 text-center space-y-2">
              <p className="font-bold text-foreground">문의를 찾을 수 없습니다</p>
              <p className="text-sm text-muted-foreground">링크가 올바른지 확인해주세요.</p>
            </div>
          ) : data && (
            <>
              {/* 원본 문의 */}
              <div className="rounded-2xl bg-card border border-border/50 p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">한국이름학교</p>
                    <h1 className="text-lg md:text-xl font-bold text-foreground">문의 내용</h1>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${data.inquiry.status === "답변완료" ? "bg-muted text-muted-foreground" : "bg-[#18a999]/10 text-[#18a999]"}`}>
                    {data.inquiry.status}
                  </span>
                </div>
                <div className="bg-muted/30 rounded-xl px-4 py-3">
                  <p className="text-sm md:text-base whitespace-pre-wrap leading-relaxed text-foreground">{data.inquiry.content}</p>
                  <p className="text-xs text-muted-foreground mt-2">{formatDateTime(data.inquiry.createdAt)}</p>
                </div>
              </div>

              {/* 메시지 스레드 */}
              {data.messages.length > 0 && (
                <div className="rounded-2xl bg-card border border-border/50 p-5 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground">대화 내역</p>
                  <div className="space-y-3">
                    {data.messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex flex-col gap-1 ${msg.senderType === "user" ? "items-end" : "items-start"}`}
                      >
                        <p className={`text-[10px] font-medium ${msg.senderType === "user" ? "text-muted-foreground" : "text-[#18a999]"}`}>
                          {msg.senderType === "user" ? data.inquiry.name : "한국이름학교"}
                        </p>
                        <div
                          className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm md:text-base whitespace-pre-wrap leading-relaxed ${
                            msg.senderType === "user"
                              ? "bg-[#18a999] text-white rounded-tr-sm"
                              : "bg-muted text-foreground rounded-tl-sm"
                          }`}
                        >
                          {msg.content}
                        </div>
                        <p className="text-[10px] text-muted-foreground">{formatDateTime(msg.createdAt)}</p>
                      </div>
                    ))}
                    <div ref={bottomRef} />
                  </div>
                </div>
              )}

              {/* 답글 입력 */}
              <div className="rounded-2xl bg-card border border-border/50 p-5 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground">추가 문의 또는 답글</p>
                <textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="메시지를 입력하세요"
                  maxLength={1000}
                  rows={4}
                  className="w-full border border-border rounded-xl px-4 py-3 text-sm md:text-base outline-none focus:ring-2 focus:ring-[#18a999] bg-background transition resize-none"
                />
                {sendError && <p className="text-red-500 text-xs">{sendError}</p>}
                <button
                  onClick={handleSend}
                  disabled={sending || !replyText.trim()}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#18a999] text-white font-bold text-sm md:text-base hover:bg-[#149085] disabled:opacity-50 transition"
                >
                  <Send className="w-4 h-4" />
                  {sending ? "전송 중..." : "전송하기"}
                </button>
              </div>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
