// 댓글 알림 메일의 '댓글 바로가기'로 들어오면 그 댓글 하나를 큰 창으로 띄운다.
//
// 원장님 요청(2026-11-13): 메일에서 누르면 체험존 페이지가 통째로 작게 보여서
// 댓글을 찾아 읽고 답글을 달기가 불편했다 → 댓글을 크게, 답글 칸도 바로 아래 크게.
// 메일 주소에 ?open=<댓글id> 가 붙었을 때만 연다. 고객에게 가는 답글 알림 링크(#comment-…)는
// 지금처럼 그 댓글로 스크롤만 한다.
import { useEffect, useState } from "react";
import { X, Lock } from "lucide-react";
import { Linkify } from "@/lib/linkify";

type FocusComment = {
  id: string;
  nickname: string;
  totalStrokes: number | null;
  content: string;
  isPrivate: boolean;
  reply: string | null;
  createdAt: string;
  notifyContact?: string | null;
  notifyContactType?: string | null;
};

function parseReplies(reply: string): Array<{ text: string }> {
  try {
    const parsed = JSON.parse(reply);
    return Array.isArray(parsed) ? parsed : [{ text: reply }];
  } catch {
    return [{ text: reply }];
  }
}

export function CommentFocusModal<T extends FocusComment>({
  comments,
  isAdmin,
  onUpdated,
}: {
  comments: T[];
  isAdmin: boolean;
  onUpdated: (updated: T) => void;
}) {
  const [openId] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("open") || "";
    } catch {
      return "";
    }
  });
  const [closed, setClosed] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const c = openId ? comments.find((x) => x.id === openId) : undefined;
  const show = Boolean(c) && !closed;

  // 창이 떠 있는 동안 뒤 페이지가 스크롤되지 않게
  useEffect(() => {
    if (!show) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [show]);

  if (!show || !c) return null;

  const close = () => {
    setClosed(true);
    // 새로고침해도 다시 뜨지 않게 주소에서 open 을 뺀다(#comment-… 는 남겨 그 댓글로 스크롤)
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete("open");
      window.history.replaceState(null, "", u.pathname + u.search + u.hash);
    } catch {
      /* 무시 */
    }
  };

  async function submit() {
    if (!c || !text.trim()) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/experience-comments/${c.id}/reply`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("kna_admin_token")}` },
        body: JSON.stringify({ reply: text.trim() }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `오류 ${res.status}`);
      onUpdated(await res.json());
      setText("");
      setDone(true);
    } catch (e: any) {
      setError(e?.message || "답글 등록 실패");
    } finally {
      setSending(false);
    }
  }

  const hidden = c.isPrivate && !c.content; // 비밀 댓글인데 관리자 로그인이 안 된 기기
  const replies = c.reply ? parseReplies(c.reply) : [];

  return (
    // 사이트 메뉴줄(Navbar z-[200])보다 위 — 휴대폰에서 이름·닫기 줄을 가렸다
    <div className="fixed inset-0 z-[300] flex items-stretch sm:items-center justify-center bg-black/50 sm:p-6" onClick={close}>
      <div
        className="relative w-full sm:max-w-2xl bg-background sm:rounded-2xl shadow-2xl flex flex-col max-h-full sm:max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold text-xl text-foreground truncate">{c.nickname}</span>
            {c.totalStrokes && (
              <span className="text-sm font-bold px-2 py-0.5 rounded-full bg-[#18a999]/10 text-[#18a999] shrink-0">총운 {c.totalStrokes}획</span>
            )}
            {c.isPrivate && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground shrink-0">
                <Lock className="w-4 h-4" /> 비공개
              </span>
            )}
          </div>
          <button onClick={close} className="p-2 -mr-2 text-muted-foreground hover:text-foreground" aria-label="닫기">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="text-sm text-muted-foreground">
            {new Date(c.createdAt).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            {isAdmin && (
              <span className="ml-2">
                {c.notifyContact
                  ? <span className="text-[#18a999] font-medium">· {c.notifyContactType === "email" ? "메일" : "문자"} {c.notifyContact}</span>
                  : "· 연락처 없음(답글 알림 안 감)"}
              </span>
            )}
          </div>

          {hidden ? (
            <p className="text-lg text-muted-foreground">비밀 댓글입니다. 관리자 로그인한 기기에서 열면 내용이 보입니다.</p>
          ) : (
            <p className="text-lg leading-relaxed text-foreground whitespace-pre-wrap break-words"><Linkify>{c.content}</Linkify></p>
          )}

          {replies.map((r, i) => (
            <div key={i} className="pl-4 border-l-4 border-[#18a999]/40 space-y-1">
              <p className="text-sm font-bold text-[#18a999]">이름의신</p>
              <p className="text-base leading-relaxed text-foreground/90 whitespace-pre-wrap break-words"><Linkify>{r.text}</Linkify></p>
            </div>
          ))}
        </div>

        <div className="border-t border-border px-5 py-4 space-y-3">
          {isAdmin ? (
            <>
              {done && <p className="text-sm font-medium text-[#18a999]">답글을 등록했습니다{c.notifyContact ? " · 고객에게 알림을 보냈습니다" : ""}.</p>}
              <textarea
                value={text}
                onChange={(e) => { setText(e.target.value); setDone(false); }}
                placeholder="답글을 입력하세요"
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-base outline-none focus:ring-2 focus:ring-[#18a999] resize-y min-h-[160px]"
                maxLength={1000}
                rows={6}
                autoFocus
              />
              {error && <p className="text-sm text-red-500">{error}</p>}
              <div className="flex gap-2 justify-end">
                <button onClick={close} className="px-5 py-3 rounded-xl border border-border text-base">닫기</button>
                <button
                  onClick={submit}
                  disabled={sending || !text.trim()}
                  className="px-6 py-3 rounded-xl bg-[#18a999] text-white text-base font-bold disabled:opacity-40"
                >
                  {sending ? "등록 중…" : "답글 등록"}
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">답글은 관리자 로그인 후 달 수 있습니다.</p>
              <a href="/admin" className="px-5 py-3 rounded-xl bg-[#18a999] text-white text-base font-bold shrink-0">관리자 로그인</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
