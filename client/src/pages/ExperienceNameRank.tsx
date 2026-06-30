import { useEffect, useRef, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useLocation } from "wouter";
import { ChevronLeft, Lock, Send, Trash2, Share2 } from "lucide-react";
import { useAdmin } from "@/contexts/AdminContext";

const BLOCKED = ['씨발','시발','개새끼','병신','미친놈','미친년','지랄','존나','좆','보지','창녀','찐따','등신','죽어','닥쳐'];
function hasBadWord(t: string) { return BLOCKED.some(w => t.replace(/\s/g,'').includes(w)); }

interface Comment {
  id: string; nickname: string; totalStrokes: number | null;
  content: string; isPrivate: boolean; reply: string | null;
  repliedAt: string | null; createdAt: string;
}

function parseReplies(reply: string): Array<{ text: string }> {
  try {
    const parsed = JSON.parse(reply);
    return Array.isArray(parsed) ? parsed : [{ text: reply }];
  } catch {
    return [{ text: reply }];
  }
}

export default function ExperienceNameRank() {
  const [, setLocation] = useLocation();
  const { isAdmin } = useAdmin();
  const videoRef = useRef<HTMLVideoElement>(null);
  const commentRef = useRef<HTMLDivElement>(null);

  const [comments, setComments] = useState<Comment[]>([]);
  const [nickname, setNickname] = useState('');
  const [commentText, setCommentText] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [wantsNotify, setWantsNotify] = useState(false);
  const [notifyContact, setNotifyContact] = useState('');
  const [notifyContactType, setNotifyContactType] = useState<'sms' | 'email'>('sms');
  const [submitting, setSubmitting] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [editingReply, setEditingReply] = useState<{ commentId: string; index: number } | null>(null);
  const [editReplyText, setEditReplyText] = useState('');

  useEffect(() => { window.scrollTo(0, 0); }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.play().catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/experience-comments/name-rank')
      .then(r => r.json())
      .then(data => setComments(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  async function submitComment() {
    if (!nickname.trim() || !commentText.trim()) { setCommentError('닉네임과 내용을 입력해주세요.'); return; }
    if (hasBadWord(nickname) || hasBadWord(commentText)) { setCommentError('부적절한 표현이 포함되어 있습니다.'); return; }
    setSubmitting(true); setCommentError('');
    try {
      const res = await fetch('/api/experience-comments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: 'name-rank', nickname: nickname.trim(), totalStrokes: null, content: commentText.trim(), isPrivate, notifyContact: wantsNotify ? notifyContact.trim() : null, notifyContactType: wantsNotify ? notifyContactType : null }),
      });
      if (!res.ok) throw new Error();
      const newComment = await res.json();
      setComments(prev => [newComment, ...prev]);
      setNickname(''); setCommentText(''); setIsPrivate(false); setWantsNotify(false); setNotifyContact(''); setNotifyContactType('sms');
    } catch { setCommentError('저장에 실패했습니다. 다시 시도해주세요.'); }
    finally { setSubmitting(false); }
  }

  async function deleteComment(id: string) {
    const token = localStorage.getItem('kna_admin_token');
    await fetch(`/api/experience-comments/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setComments(prev => prev.filter(c => c.id !== id));
  }

  async function submitReply(id: string) {
    if (!replyText.trim()) return;
    setReplySubmitting(true);
    const token = localStorage.getItem('kna_admin_token');
    try {
      const res = await fetch(`/api/experience-comments/${id}/reply`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reply: replyText.trim() }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setComments(prev => prev.map(c => c.id === id ? updated : c));
      setReplyingTo(null); setReplyText('');
    } catch {} finally { setReplySubmitting(false); }
  }

  async function submitEditReply(commentId: string, index: number) {
    if (!editReplyText.trim()) return;
    const token = localStorage.getItem('kna_admin_token');
    try {
      const res = await fetch(`/api/experience-comments/${commentId}/reply/${index}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: editReplyText.trim() }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setComments(prev => prev.map(c => c.id === commentId ? updated : c));
      setEditingReply(null);
      setEditReplyText('');
    } catch {}
  }

  return (
    <div className="kna-experience-page min-h-screen bg-background flex flex-col">
      <Navbar />
      <section className="relative overflow-hidden pt-16 pb-[150px] md:pt-24 md:pb-56 border-0 outline-none">
        <img src="/alone-fate-hero.png" alt="" className="absolute inset-0 w-full h-full object-cover object-top" fetchPriority="high" loading="eager" decoding="sync" aria-hidden />
        <div className="absolute bottom-0 left-0 w-full" aria-hidden>
          <svg viewBox="0 0 1200 150" preserveAspectRatio="none" className="w-full h-28 md:h-36 block">
            <path d="M0,150 L0,0 Q600,150 1200,0 L1200,150 Z" className="fill-background" />
          </svg>
        </div>
        <div className="relative max-w-2xl mx-auto px-5 text-center">
          <button onClick={() => setLocation('/experience-zone')}
            className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 font-semibold text-sm mb-6 transition-colors">
            <ChevronLeft className="w-4 h-4" /> 체험 ZONE
          </button>
          <h1 className="leading-tight text-slate-900">
            <span className="block text-5xl md:text-6xl font-black tracking-tight">전국 몇 등?</span>
            <span className="block text-3xl md:text-4xl font-light tracking-wide mt-1">내 이름의 전국 순위</span>
          </h1>
        </div>
      </section>

      <main className="flex-1 py-10 md:py-14 -mt-px border-0">
        <div className="max-w-2xl mx-auto px-5 space-y-8">
          <video
            ref={videoRef}
            src="/namerank.mp4"
            controls
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            onCanPlay={e => { (e.target as HTMLVideoElement).play().catch(() => {}); }}
            className="w-full rounded-2xl shadow-lg bg-black"
            style={{ minHeight: '60vh', maxHeight: '85vh', objectFit: 'contain' }}
          />

          {/* 진단 기록 */}
          <div ref={commentRef} className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-foreground">내 이름은 몇 등일까요? 순위에 없어도 실망하지 마세요!</h2>
              <p className="text-sm text-muted-foreground mt-0.5">영상을 보고 느낀 점을 남겨보세요</p>
            </div>
            <div className="rounded-2xl bg-card border border-border/50 p-5 space-y-3" style={{ boxShadow:'0 2px 12px rgba(0,0,0,0.04)' }}>
              <input value={nickname} onChange={e => setNickname(e.target.value)}
                placeholder="닉네임 (예: 서울 30대)" maxLength={20}
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#18a999] transition" />
              <textarea value={commentText} onChange={e => setCommentText(e.target.value)}
                placeholder={`야호 1등!!!\n저 7위요 ㅋㅋㅋ\n내 이름은 없다능~ 찾기힘들다능\n내이름 없음 ㅋ ㅋ 어머니 아버지 감사합니다!\n지혜인데 너무 흔해서 개명 고민 중ㅋㅋㅋ`}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#18a999] transition resize-none min-h-[90px]" maxLength={300} />
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <input type="checkbox" checked={wantsNotify} onChange={e => setWantsNotify(e.target.checked)} className="rounded accent-[#18a999]" />
                  답변 알림 받기
                </label>
                {wantsNotify && (
                  <div className="flex items-center gap-2 pl-5">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
                      <label className="flex items-center gap-1 cursor-pointer"><input type="radio" name="notifyType-namerank" checked={notifyContactType === 'sms'} onChange={() => setNotifyContactType('sms')} className="accent-[#18a999]" />문자</label>
                      <label className="flex items-center gap-1 cursor-pointer"><input type="radio" name="notifyType-namerank" checked={notifyContactType === 'email'} onChange={() => setNotifyContactType('email')} className="accent-[#18a999]" />이메일</label>
                    </div>
                    <input value={notifyContact} onChange={e => setNotifyContact(e.target.value)}
                      placeholder={notifyContactType === 'sms' ? '01012345678' : '이메일 주소'} maxLength={100}
                      className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-[#18a999] transition" />
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <input type="checkbox" checked={isPrivate} onChange={e => setIsPrivate(e.target.checked)} className="rounded" />
                  <Lock className="w-3 h-3" /> 이름의신만 보기 (비공개)
                </label>
                <button onClick={submitComment} disabled={submitting}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-[#18a999] border border-[#18a999]/30 text-sm font-bold hover:bg-[#18a999]/5 disabled:opacity-50 transition flex-shrink-0 whitespace-nowrap">
                  <Send className="w-3.5 h-3.5" />
                  {submitting ? '저장 중...' : '기록 남기기'}
                </button>
              </div>
              {commentError && <p className="text-red-500 text-xs">{commentError}</p>}
            </div>

            <div className="space-y-3">
              {comments.length === 0 && (
                <p className="text-center text-muted-foreground text-base py-8">아직 진단 기록이 없습니다.</p>
              )}
              {comments.map(c => c.isPrivate && !isAdmin ? (
                <div key={c.id} id={`comment-${c.id}`} className="rounded-2xl px-4 py-3 bg-muted/30 border border-dashed border-border/50 flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>비밀 댓글입니다.</span>
                  </div>
                  <span className="text-xs">{new Date(c.createdAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}</span>
                </div>
              ) : (
                <div key={c.id} id={`comment-${c.id}`} className={`rounded-2xl p-4 space-y-2 ${c.isPrivate ? 'bg-muted/40 border border-dashed border-border' : 'bg-card border border-border/50'}`}
                  style={{ boxShadow:'0 1px 8px rgba(0,0,0,0.04)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base text-foreground">{c.nickname}</span>
                      {c.isPrivate && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Lock className="w-3 h-3" /> 비공개</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleDateString('ko-KR',{month:'short',day:'numeric'})}</span>
                      {isAdmin && (
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => { setReplyingTo(replyingTo === c.id ? null : c.id); setReplyText(''); }} className="text-xs text-[#18a999] hover:text-[#149085] font-medium transition">답글</button>
                          <button onClick={() => deleteComment(c.id)} className="text-muted-foreground/50 hover:text-red-500 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-foreground/80 leading-relaxed">{c.content}</p>
                  {c.reply && parseReplies(c.reply).map((r, i) => (
                    <div key={i} className="mt-2 ml-3 pl-3 border-l-2 border-[#18a999]/30 space-y-0.5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-[#18a999]">이름의신</p>
                        {isAdmin && (
                          <button onClick={() => { setEditingReply({ commentId: c.id, index: i }); setEditReplyText(r.text); }}
                            className="text-xs text-muted-foreground hover:text-[#18a999] transition">수정</button>
                        )}
                      </div>
                      {editingReply?.commentId === c.id && editingReply.index === i ? (
                        <div className="flex gap-2 mt-1">
                          <input value={editReplyText} onChange={e => setEditReplyText(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && submitEditReply(c.id, i)}
                            className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[#18a999] transition"
                            maxLength={200} autoFocus />
                          <button onClick={() => submitEditReply(c.id, i)}
                            className="px-3 py-1.5 rounded-lg bg-[#18a999] text-white text-xs font-bold transition">저장</button>
                          <button onClick={() => setEditingReply(null)}
                            className="px-3 py-1.5 rounded-lg border border-border text-xs transition">취소</button>
                        </div>
                      ) : (
                        <p className="text-sm text-foreground/80 leading-relaxed">{r.text}</p>
                      )}
                    </div>
                  ))}
                  {isAdmin && replyingTo === c.id && (
                    <div className="mt-2 ml-3 pl-3 border-l-2 border-[#18a999]/30 flex gap-2">
                      <input value={replyText} onChange={e => setReplyText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !replySubmitting && submitReply(c.id)}
                        placeholder="답글을 입력하세요" maxLength={200}
                        className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[#18a999] transition" />
                      <button onClick={() => submitReply(c.id)} disabled={replySubmitting || !replyText.trim()}
                        className="px-3 py-1.5 rounded-lg bg-[#18a999] text-white text-xs font-bold disabled:opacity-40 transition">
                        {replySubmitting ? '...' : '등록'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="text-center pt-2">
              <button onClick={() => navigator.share?.({ title:'내 이름은 전국 몇 등일까?', url: window.location.href })}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#18a999] text-white text-sm font-bold hover:bg-[#149085] transition">
                <Share2 className="w-4 h-4" /> 친구에게 공유하기
              </button>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
