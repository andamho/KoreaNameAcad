import { useState, useEffect, useRef } from "react";
import { Linkify } from "@/lib/linkify";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useLocation } from "wouter";
import { ChevronLeft, AlertTriangle, Share2, Lock, Send, Trash2 } from "lucide-react";
import { useAdmin } from "@/contexts/AdminContext";

// ── 한글 획수 계산 ──────────────────────────────────────────
const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const JUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
const JONG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

const STROKE: Record<string, number> = {
  'ㄱ':1,'ㄴ':1,'ㅡ':1,'ㅣ':1,
  'ㄷ':2,'ㅅ':2,'ㅇ':2,'ㅋ':2,'ㅏ':2,'ㅓ':2,'ㅗ':2,'ㅜ':2,'ㅢ':2,
  'ㄹ':3,'ㅁ':3,'ㅈ':3,'ㅌ':3,'ㅑ':3,'ㅕ':3,'ㅛ':3,'ㅠ':3,'ㅟ':3,'ㅐ':3,'ㅔ':3,'ㅚ':3,
  'ㅂ':4,'ㅊ':4,'ㅍ':4,'ㅎ':4,'ㅖ':4,'ㅒ':4,'ㅝ':4,'ㅘ':4,
  // 쌍자음
  'ㄲ':2,'ㄸ':4,'ㅃ':8,'ㅆ':4,'ㅉ':6,
  // 겹받침
  'ㄳ':3,'ㄵ':4,'ㄶ':5,'ㄺ':4,'ㄻ':6,'ㄼ':7,'ㄽ':4,'ㄾ':6,'ㄿ':7,'ㅀ':7,'ㅄ':6,
  // 기타 모음
  'ㅙ':5,'ㅞ':5,
};

function getStroke(jamo: string): number { return STROKE[jamo] ?? 0; }

function calcChar(ch: string): { strokes: number; breakdown: string } {
  const code = ch.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return { strokes: 0, breakdown: '' };
  const offset = code - 0xAC00;
  const jongIdx = offset % 28;
  const jungIdx = Math.floor(offset / 28) % 21;
  const choIdx = Math.floor(offset / 28 / 21);
  const cho = CHO[choIdx], jung = JUNG[jungIdx], jong = JONG[jongIdx];
  const s = getStroke(cho) + getStroke(jung) + (jong ? getStroke(jong) : 0);
  const parts = [cho, jung, ...(jong ? [jong] : [])].map(j => `${j}(${getStroke(j)})`);
  return { strokes: s, breakdown: parts.join(' + ') };
}

const DANGER = [10, 12, 19];
const DANGER_LABELS: Record<number, string> = {
  10: '독신운 + 단명수',
  12: '독신운 + 단명수',
  19: '독신운',
};

// ── 일일 사용 횟수 제한 ──
const MAX_DAILY = 3;
const USAGE_KEY = 'kna_alone_fate_usage';

function getKSTDateString(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function getTodayUsage(): number {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (!raw) return 0;
    const { date, count } = JSON.parse(raw);
    return date === getKSTDateString() ? (count as number) : 0;
  } catch { return 0; }
}

function incrementUsage(): number {
  try {
    const next = getTodayUsage() + 1;
    localStorage.setItem(USAGE_KEY, JSON.stringify({ date: getKSTDateString(), count: next }));
    return next;
  } catch { return 1; }
}

// ── 욕설/비방 필터 ──
const BLOCKED_WORDS = [
  '씨발','시발','씨팔','시팔','ㅅㅂ','개새끼','개새','새끼','쌍년','쌍놈',
  '병신','ㅂㅅ','미친놈','미친년','미친새끼','지랄','존나','ㅈㄴ','좆','보지','자지',
  '창녀','걸레','찐따','빡대가리','등신','바보새끼','죽어','꺼져','닥쳐','개소리',
  '썅','개같','ㅗ','개년','개놈','ㄱㅅㄲ','ㅁㅊ','욕','혐오','차별',
];

function containsBlockedWord(text: string): boolean {
  const normalized = text.replace(/\s/g, '').toLowerCase();
  return BLOCKED_WORDS.some(w => normalized.includes(w));
}

// ── 댓글 타입 ──
interface Comment {
  id: string;
  nickname: string;
  totalStrokes: number | null;
  content: string;
  isPrivate: boolean;
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
}

// ── 카운트 애니메이션 훅 ──
function useCountUp(target: number, duration = 600) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target === 0) { setVal(0); return; }
    let start = 0;
    const step = Math.ceil(target / (duration / 16));
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setVal(target); clearInterval(timer); }
      else setVal(start);
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return val;
}

function parseReplies(reply: string): Array<{ text: string }> {
  try {
    const parsed = JSON.parse(reply);
    return Array.isArray(parsed) ? parsed : [{ text: reply }];
  } catch {
    return [{ text: reply }];
  }
}

export default function ExperienceAloneFate() {
  const [, setLocation] = useLocation();
  const { isAdmin } = useAdmin();

  // 계산기
  const [name, setName] = useState('');
  const [result, setResult] = useState<{ char: string; strokes: number; breakdown: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [calculated, setCalculated] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [usageCount, setUsageCount] = useState(0);
  const [dataCount, setDataCount] = useState(0);
  const animatedTotal = useCountUp(calculated ? total : 0);

  // 댓글
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
  const commentRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLParagraphElement>(null);

  // 페이지 진입 시 최상단으로
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const el = bannerRef.current;
    if (!el) return;
    let started = false;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started) {
        started = true;
        observer.disconnect();
        setTimeout(() => {
          let frame = 0;
          const steps = 45;
          const id = setInterval(() => {
            frame++;
            setDataCount(Math.min(Math.round((frame / steps) * 45), 45));
            if (frame >= steps) clearInterval(id);
          }, 30);
        }, 1000);
      }
    }, { threshold: 0.5 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isAdmin) setUsageCount(getTodayUsage()); // 어드민은 0으로 시작 (새로고침 리셋)
    fetch('/api/experience-comments/alone-fate')
      .then(r => r.json())
      .then(data => setComments(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  function calculate() {
    const chars = name.trim().replace(/\s/g, '');
    if (!chars) return;
    setIsAnalyzing(true);
    setCalculated(false);
    setResult([]);
    setTimeout(() => {
      const res = Array.from(chars).map(ch => ({ char: ch, ...calcChar(ch) })).filter(r => r.strokes > 0);
      setResult(res);
      setTotal(res.reduce((s, r) => s + r.strokes, 0));
      setCalculated(true);
      setIsAnalyzing(false);
      setUsageCount(isAdmin ? usageCount + 1 : incrementUsage());
    }, 1500);
  }

  function reset() {
    setName('');
    setResult([]);
    setTotal(0);
    setCalculated(false);
    setIsAnalyzing(false);
  }

  function adminReset() {
    reset();
    setUsageCount(0);
  }

  async function submitComment() {
    if (!nickname.trim() || !commentText.trim()) {
      setCommentError('닉네임과 내용을 입력해주세요.');
      return;
    }
    if (containsBlockedWord(nickname) || containsBlockedWord(commentText)) {
      setCommentError('부적절한 표현이 포함되어 있습니다. 수정 후 다시 시도해주세요.');
      return;
    }
    setSubmitting(true);
    setCommentError('');
    try {
      const res = await fetch('/api/experience-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId: 'alone-fate',
          nickname: nickname.trim(),
          totalStrokes: calculated ? total : null,
          content: commentText.trim(),
          isPrivate,
          notifyContact: wantsNotify ? notifyContact.trim() : null,
          notifyContactType: wantsNotify ? notifyContactType : null,
        }),
      });
      if (!res.ok) throw new Error();
      const newComment = await res.json();
      setComments(prev => [newComment, ...prev]);
      setNickname('');
      setCommentText('');
      setIsPrivate(false);
      setWantsNotify(false); setNotifyContact(''); setNotifyContactType('sms');
    } catch {
      setCommentError('저장에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteComment(id: string) {
    const token = localStorage.getItem('kna_admin_token');
    await fetch(`/api/experience-comments/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    setComments(prev => prev.filter(c => c.id !== id));
  }

  async function submitReply(id: string) {
    if (!replyText.trim()) return;
    setReplySubmitting(true);
    const token = localStorage.getItem('kna_admin_token');
    try {
      const res = await fetch(`/api/experience-comments/${id}/reply`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reply: replyText.trim() }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setComments(prev => prev.map(c => c.id === id ? updated : c));
      setReplyingTo(null);
      setReplyText('');
    } catch {
      // 실패 무시
    } finally {
      setReplySubmitting(false);
    }
  }

  async function deleteReply(commentId: string, index: number) {
    if (!confirm('이 답글을 삭제할까요?')) return;
    const token = localStorage.getItem('kna_admin_token');
    try {
      const res = await fetch(`/api/experience-comments/${commentId}/reply/${index}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setComments(prev => prev.map(c => c.id === commentId ? updated : c));
    } catch {}
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
    } catch {
      // 실패 무시
    }
  }

  const isDanger = DANGER.includes(total);

  return (
    <div className="kna-experience-page min-h-screen bg-background flex flex-col">
      <Navbar />

      {/* 히어로 */}
      <section className="relative overflow-hidden pt-16 pb-[150px] md:pt-24 md:pb-56">
        {/* 배경 이미지 */}
        <img src="/alone-fate-hero.png" alt="" className="absolute inset-0 w-full h-full object-cover object-top" fetchPriority="high" loading="eager" decoding="sync" aria-hidden />
        {/* SVG 볼록 하단: 페이지 배경색 U자 컷아웃 → 배경이 중앙에서 더 아래로 볼록하게 보임 */}
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
            <span className="block text-5xl md:text-6xl font-black tracking-tight">혼자 살 팔자</span>
            <span className="block text-3xl md:text-4xl font-light tracking-wide mt-1">1초 만에 알아보기</span>
          </h1>
        </div>
      </section>

      <main className="flex-1 py-10 md:py-14">
        <div className="max-w-2xl mx-auto px-5 space-y-8">

          {/* ── 도입 글 ── */}
          <style>{`
            @keyframes energyPulse {
              0%, 100% { opacity: 0.03; transform: scale(1); }
              50% { opacity: 0.07; transform: scale(1.08); }
            }
            @keyframes energyPulse2 {
              0%, 100% { opacity: 0.04; transform: scale(1.05); }
              50% { opacity: 0.08; transform: scale(0.97); }
            }
            .glow-tiffany {
              text-shadow: 0 0 18px rgba(86,213,219,0.7), 0 0 40px rgba(86,213,219,0.3);
            }
          `}</style>
          <div className="rounded-3xl overflow-hidden shadow-2xl relative" style={{ background: '#0F172A' }}>
            {/* 배경 에너지 애니메이션 */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div style={{
                position: 'absolute', top: '-20%', left: '-10%',
                width: '70%', height: '70%', borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(86,213,219,1) 0%, transparent 70%)',
                animation: 'energyPulse 6s ease-in-out infinite',
              }} />
              <div style={{
                position: 'absolute', bottom: '-20%', right: '-10%',
                width: '60%', height: '60%', borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(86,213,219,1) 0%, transparent 70%)',
                animation: 'energyPulse2 8s ease-in-out infinite',
              }} />
            </div>

            {/* 훅 */}
            <div className="relative px-7 pt-9 pb-7 border-b border-white/8">
              <p className="text-[10px] font-bold tracking-[0.4em] text-[#56D5DB] uppercase mb-5">Energy Frequency Diagnosis</p>
              <p className="text-3xl md:text-4xl font-extrabold text-white leading-[1.5] mb-2">
                "나는 혼자가 편해."
              </p>
              <p className="text-white/40 text-sm font-medium mb-6">이 말, 입버릇처럼 하고 계신가요?</p>
              <div className="border-l-2 border-[#56D5DB]/40 pl-4">
                <p className="text-white/65 text-base leading-[2]">
                  혹시 이름에<br />
                  <span className="glow-tiffany text-[#56D5DB] font-black text-xl">10 · 12 · 19</span>
                  <span className="text-white/65 text-base"> 수리운이 있는 건 아닐까요?</span>
                </p>
              </div>
            </div>

            {/* 카드 3개 */}
            <div className="relative px-7 py-7 border-b border-white/8">
              <p className="text-sm font-bold text-white/50 mb-5">이 숫자가 총운에 들어가면</p>
              <div className="space-y-3">
                {[
                  { icon: '💫', title: '인연의 어긋남', desc: '만나려고 해도 자꾸 어긋납니다.' },
                  { icon: '🧱', title: '관계의 벽', desc: '가까워지려 해도 보이지 않는 벽이 생깁니다.' },
                  { icon: '🌫️', title: '결혼 후 공허함', desc: '결혼을 해도 깊은 공허함이 찾아옵니다.' },
                ].map(({ icon, title, desc }) => (
                  <div key={title} className="flex items-start gap-4 rounded-2xl px-4 py-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <span className="text-xl flex-shrink-0 mt-0.5">{icon}</span>
                    <div>
                      <p className="text-white font-bold text-sm mb-1">{title}</p>
                      <p className="text-white/40 text-sm leading-[1.9]">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 단명수 경고 */}
            <div className="relative px-7 py-7 border-b border-white/8" style={{ background: 'rgba(239,68,68,0.06)' }}>
              <p className="text-[10px] font-bold tracking-[0.3em] text-red-400/50 uppercase mb-4">Critical Warning</p>
              <p className="text-white/70 text-base leading-[1.9] mb-3">
                그리고 <span className="text-white font-bold">10, 12는</span><br />
                고립시키는 것만으로 끝나지 않습니다.
              </p>
              <p className="text-red-400 font-black text-2xl tracking-widest" style={{ textShadow: '0 0 20px rgba(248,113,113,0.5)' }}>
                단명수입니다.
              </p>
            </div>

            {/* 마무리 */}
            <div className="relative px-7 py-7">
              <p className="text-white/35 text-sm leading-[2.1]">
                지금 이름 획수를 더해보세요.<br />
                미신이 아닙니다.<br />
                <span className="text-white/50">이름 구조가 만든 에너지 흐름입니다.</span>
              </p>
            </div>
          </div>

          {/* ── 계산기 ── */}
          <div className="rounded-3xl bg-slate-900 dark:bg-slate-800 overflow-hidden shadow-2xl">
            {/* 헤더 */}
            <div className="px-6 pt-6 pb-4 border-b border-white/10">
              <p className="text-lg font-bold text-white mb-1">이름획수 AI 진단</p>
              <p ref={bannerRef} className="text-sm font-medium text-white/70 leading-relaxed">
                18년간 축적된{' '}
                <span className="text-amber-400 font-black text-xl tabular-nums">{dataCount}만</span>
                {' '}명의 실제 임상 데이터 기반 분석
              </p>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* 입력 */}
              <div className="relative">
                <input
                  value={name}
                  onChange={e => { setName(e.target.value); setCalculated(false); }}
                  onKeyDown={e => e.key === 'Enter' && !isAnalyzing && (isAdmin || usageCount < MAX_DAILY) && calculate()}
                  placeholder="이름을 입력하세요 (예: 홍길동)"
                  disabled={isAnalyzing || (!isAdmin && usageCount >= MAX_DAILY)}
                  className="w-full bg-white/10 text-white placeholder-white/30 rounded-xl px-4 py-4 text-lg font-medium outline-none focus:ring-2 focus:ring-[#18a999] transition disabled:opacity-50"
                  maxLength={6}
                />
                {/* 스캔 애니메이션 */}
                {isAnalyzing && (
                  <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
                    <div className="absolute left-0 right-0 h-0.5 bg-[#56D5DB] shadow-[0_0_12px_#56D5DB]"
                      style={{ animation: 'scanLine 1.5s linear infinite' }} />
                  </div>
                )}
              </div>

              {/* 버튼 */}
              {usageCount >= MAX_DAILY && !calculated ? (
                <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4 text-center">
                  <p className="text-white font-bold text-base leading-relaxed">
                    "이름은 운명을 담은 그릇입니다"
                  </p>
                  <p className="text-white/50 text-sm leading-relaxed">
                    이름이 갖는 귀한 가치를 존중하기 위해,<br />
                    하루 무료 체험 횟수를 {MAX_DAILY}회로 제한하고 있습니다.<br /><br />
                    소중한 사람의 이름 속 운명을 더 깊이 알고 싶다면<br />
                    공식 상담을 신청해 주세요.
                  </p>
                  <button onClick={() => setLocation('/services')}
                    className="px-6 py-2.5 rounded-full bg-[#18a999] text-white font-bold text-sm hover:bg-[#149085] transition">
                    1:1 정밀 에너지 진단 신청하기 &gt;
                  </button>
                  {isAdmin && (
                    <button onClick={adminReset}
                      className="block w-full text-xs text-white/30 hover:text-white/60 transition mt-1">
                      [관리자] 다시 테스트하기
                    </button>
                  )}
                </div>
              ) : calculated ? (
                <button onClick={reset}
                  className="w-full py-3.5 rounded-xl bg-white/10 text-white/60 hover:bg-white/20 font-bold transition">
                  다시 진단하기
                </button>
              ) : (
                <button onClick={calculate} disabled={!name.trim() || isAnalyzing}
                  className="w-full py-3.5 rounded-xl font-bold text-white transition-all disabled:opacity-40 active:scale-[0.98]"
                  style={{ background: isAnalyzing ? '#334155' : '#18a999' }}>
                  {isAnalyzing ? '⚡ 에너지 주파수 분석 중...' : '분석 시작'}
                </button>
              )}

              {/* 진행바 */}
              {usageCount > 0 && usageCount < MAX_DAILY && (!calculated || isAdmin) && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-xs text-white/35">
                    <span>오늘 무료 진단</span>
                    <span className={usageCount >= 4 ? 'text-orange-400 font-semibold' : ''}>
                      {usageCount}/{MAX_DAILY}회 사용 · {MAX_DAILY - usageCount}회 남음
                    </span>
                  </div>
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${usageCount >= 4 ? 'bg-orange-400' : 'bg-[#18a999]'}`}
                      style={{ width: `${(usageCount / MAX_DAILY) * 100}%` }}
                    />
                  </div>
                  <p className={`text-xs text-center ${usageCount >= 4 ? 'text-orange-400' : 'text-white/30'}`}>
                    {usageCount >= 4 ? `오늘 ${MAX_DAILY - usageCount}회 남았습니다` : `${usageCount}/${MAX_DAILY}회 진단함`}
                  </p>
                </div>
              )}

              {/* 결과 */}
              {calculated && result.length > 0 && (
                <div className="space-y-4">
                  {/* 글자별 분해 */}
                  <div className="space-y-2">
                    {result.map(({ char, strokes, breakdown }) => (
                      <div key={char} className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3">
                        <span className="text-2xl font-black text-white w-10 text-center">{char}</span>
                        <div className="flex-1">
                          <span className="text-white/40 text-xs">{breakdown}</span>
                        </div>
                        <span className="text-[#56D5DB] font-black text-lg">{strokes}획</span>
                      </div>
                    ))}
                  </div>

                  {/* 총운 결과 */}
                  <div className={`rounded-2xl border-2 p-6 text-center ${isDanger ? 'bg-red-500/10 border-red-500/40' : 'bg-[#18a999]/10 border-[#18a999]/30'}`}>
                    <p className="text-white/50 text-sm mb-2">{name} 님의 총운 수리</p>
                    <p className={`text-7xl font-black mb-3 ${isDanger ? 'text-red-400' : 'text-[#56D5DB]'}`}>
                      {animatedTotal}
                    </p>
                    {isDanger ? (
                      <div className="space-y-2">
                        <p className="font-bold text-red-300 text-lg flex items-center justify-center gap-2">
                          <AlertTriangle className="w-5 h-5" /> 고독의 에너지 감지
                        </p>
                        <p className="text-red-400/80 text-sm leading-relaxed">
                          {DANGER_LABELS[total]} — 이름에 혼자 살 팔자를 유도하는<br />에너지가 강하게 흐르고 있습니다.
                        </p>
                        <button
                          onClick={() => commentRef.current?.scrollIntoView({ behavior: 'smooth' })}
                          className="mt-3 inline-flex items-center px-4 py-1.5 rounded-full bg-black/60 text-white text-sm font-bold hover:bg-black/80 transition">
                          진단 기록 남기기 &gt;
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3 text-left">
                        <p className="font-bold text-[#56D5DB] text-lg">독신운에는 해당되지 않습니다.</p>
                        <p className="text-white/80 text-base leading-relaxed">
                          다만, 이름 안에는 <strong className="text-white">총 16가지 운</strong>이 존재합니다.<br />
                          지금 확인한 건 그 중 <strong className="text-white">하나</strong>일 뿐입니다.
                        </p>
                        <p className="text-white/55 text-sm leading-relaxed">
                          단명운 · 남편복 · 자식복 · 재물운 등<br />
                          나머지 15가지 운도 모두 좋아야<br />
                          진짜 좋은 이름입니다.
                        </p>
                        <button onClick={() => setLocation('/services')}
                          className="mt-1 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white text-[#18a999] text-sm font-bold border border-white/20 hover:bg-white/90 transition-colors">
                          나머지 15가지 운 분석 받기 &gt;
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 스캔 애니메이션 keyframe */}
          <style>{`
            @keyframes scanLine {
              0% { top: 0%; }
              100% { top: 100%; }
            }
          `}</style>

          {/* ── 위험 수리운 ── */}
          <div className="pt-16">
          <div className="space-y-3">
            <h2 className="text-xl font-bold text-foreground">혼자살 팔자를 만드는 수리운</h2>
            <div className="grid grid-cols-3 gap-3">
              {DANGER.map(n => (
                <div key={n} className="rounded-2xl border border-red-400/20 bg-red-400/5 p-4 text-center space-y-1.5">
                  <div className="text-4xl font-black text-red-400">{n}</div>
                  <div className="text-sm text-muted-foreground leading-snug">{DANGER_LABELS[n]}</div>
                </div>
              ))}
            </div>
            <p className="text-base text-muted-foreground text-center">이름 총획수가 위 숫자면 혼자 살 팔자입니다.</p>
          </div>

          {/* ── 내용 ── */}
          <div className="space-y-4">
            {[
              { icon: '💭', title: '독신주의자가 많습니다', desc: '나름의 가치관인 것 같지만, 실은 혼자 살라는 운이 이름에 있어서 그런 생각을 붙잡고 사는 겁니다.' },
              { icon: '💔', title: '인연이 잘 맺어지지 않습니다', desc: '맘에 드는 사람과 인연을 맺어보려 해도 그게 잘 안 맺어집니다.' },
              { icon: '🚪', title: '결혼해도 헤어집니다', desc: '행여 결혼을 하더라도 헤어집니다. 이별도 있고, 사별도 있습니다.' },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="rounded-2xl bg-card border border-border/50 p-5 flex gap-4"
                style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                <span className="text-2xl flex-shrink-0">{icon}</span>
                <div>
                  <p className="font-bold text-foreground text-lg mb-1">{title}</p>
                  <p className="text-muted-foreground text-base leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── 반론 처리 ── */}
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-6 space-y-4">
            <p className="font-bold text-foreground text-base leading-relaxed">
              혹시 지금은 부부 사이가 좋아서 내 이야기가 아니라고 생각하시나요?
            </p>
            <p className="text-muted-foreground text-base leading-[1.9]">
              이름의 에너지는 스냅샷이 아니라 한 편의 긴 영화와 같습니다. 100세를 사는 오늘날, 40~50대에 문제가 없다고 해서 그 운이 틀린 것이 아닙니다. 60대, 70대에 찾아오는 뒤늦은 이별이나 예기치 못한 사별, 혹은 한집에 살면서도 남보다 못한 남남으로 지내게 되는 <strong className="text-foreground">'심리적 독신'</strong> 역시 이름 속 10, 12, 19 수리가 만들어내는 에너지의 종착역입니다.
            </p>
            <p className="text-muted-foreground text-base leading-[1.9]">
              이 모든 사실은 <strong className="text-foreground">45만 명의 임상 데이터</strong>가 증명합니다.
            </p>
          </div>

          {/* ── 경고 ── */}
          <div className="rounded-2xl border-2 border-red-400/25 bg-red-400/5 p-6 space-y-3">
            <div className="flex items-center gap-2 text-red-500 font-bold text-base">
              <AlertTriangle className="w-5 h-5" /> 실제 사례
            </div>
            <p className="text-foreground text-base leading-relaxed">
              개명한 이름에 <strong>아내는 혼자살 팔자의 운</strong>을, <strong>자식들은 부모복이 없는 운</strong>을 넣어서 남편이 자살한 케이스도 있습니다.
            </p>
            <p className="text-muted-foreground text-base border-t border-red-400/15 pt-3">
              10, 12 총운은 <strong className="text-foreground">단명수까지 있어</strong> 더욱 안 좋습니다.
            </p>
          </div>
          </div>

          {/* ── 획수표 ── */}
          <div className="pt-16 pb-16">
          <div className="space-y-4">
            <div className="text-center">
              <h2 className="text-xl font-bold text-foreground mb-1">획수 암호 해독표</h2>
              <p className="text-muted-foreground text-sm">이름의 자음과 모음을 분리하여 에너지 수치를 확인하세요</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { stroke: 1, consonants: ['ㄱ','ㄴ'], vowels: ['ㅡ','ㅣ'] },
                { stroke: 2, consonants: ['ㄷ','ㅅ','ㅇ','ㅋ'], vowels: ['ㅏ','ㅓ','ㅗ','ㅜ','ㅢ'] },
                { stroke: 3, consonants: ['ㄹ','ㅁ','ㅈ','ㅌ'], vowels: ['ㅑ','ㅕ','ㅛ','ㅠ','ㅟ','ㅐ','ㅔ','ㅚ'] },
                { stroke: 4, consonants: ['ㅂ','ㅊ','ㅍ','ㅎ'], vowels: ['ㅖ','ㅒ','ㅝ','ㅘ'] },
              ].map(item => (
                <div key={item.stroke} className="bg-card border border-border/50 rounded-2xl overflow-hidden hover:shadow-md transition-shadow flex">
                  <div className="w-20 bg-slate-900 dark:bg-slate-700 flex flex-col items-center justify-center text-white p-4 flex-shrink-0">
                    <span className="text-2xl font-black">{item.stroke}획</span>
                  </div>
                  <div className="flex-1 p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-[#18a999]/10 text-[#18a999] border border-[#18a999]/20 flex-shrink-0">자음</span>
                      <div className="flex flex-wrap gap-2 text-lg font-medium text-foreground">
                        {item.consonants.map(c => <span key={c} className="hover:text-[#18a999] cursor-default transition-colors">{c}</span>)}
                      </div>
                    </div>
                    <div className="h-px bg-border w-full" />
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-800 flex-shrink-0">모음</span>
                      <div className="flex flex-wrap gap-2 text-lg font-medium text-foreground">
                        {item.vowels.map(v => <span key={v} className="hover:text-purple-500 cursor-default transition-colors">{v}</span>)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-800 dark:text-amber-300 text-center italic">
              "모든 한글은 고유한 에너지 수치를 가집니다. 합계가 10, 12, 19라면 주목하십시오."
            </div>
          </div>
          </div>

          {/* ── 상담 유도 ── */}
          <div className="rounded-2xl bg-slate-900 dark:bg-slate-800 p-6 text-center space-y-3">
            <p className="text-white font-bold text-lg">내 이름이 걱정되신다면?</p>
            <p className="text-white/50 text-base">전문 이름 분석으로 정확하게 확인하세요</p>
            <button onClick={() => setLocation('/services')}
              className="mt-1 inline-block px-6 py-2.5 rounded-full bg-[#18a999] text-white text-sm font-bold hover:bg-[#149085] transition-colors">
              이름 분석 상담 신청
            </button>
          </div>

          {/* ── 진단 로그 (댓글) ── */}
          <div ref={commentRef} className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-foreground">진단 기록</h2>
              <p className="text-sm text-muted-foreground mt-0.5">다른 분들의 진단 결과와 경험을 확인하세요</p>
            </div>

            {/* 입력 폼 */}
            <div className="rounded-2xl bg-card border border-border/50 p-5 space-y-3"
              style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
              <input
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                placeholder="닉네임 (예: 서울 30대)"
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#18a999] transition"
                maxLength={20}
              />
              {calculated && total > 0 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                  <span>계산된 총운</span>
                  <span className={`font-bold ${isDanger ? 'text-red-500' : 'text-[#18a999]'}`}>{total}획</span>
                  <span className="text-xs">{isDanger ? `(${DANGER_LABELS[total]})` : '(해당 없음)'}</span>
                </div>
              )}
              <textarea
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                placeholder={'예: "홍길*(19획) - 소름 돋네요. 진짜 연애가 안 풀려요."'}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#18a999] transition resize-none min-h-[90px]"
                maxLength={300}
              />
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <input type="checkbox" checked={wantsNotify} onChange={e => setWantsNotify(e.target.checked)} className="rounded accent-[#18a999]" />
                  답변 알림 받기
                </label>
                {wantsNotify && (
                  <div className="flex items-center gap-2 pl-5">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
                      <label className="flex items-center gap-1 cursor-pointer"><input type="radio" name="notifyType-alone" checked={notifyContactType === 'sms'} onChange={() => setNotifyContactType('sms')} className="accent-[#18a999]" />문자</label>
                      <label className="flex items-center gap-1 cursor-pointer"><input type="radio" name="notifyType-alone" checked={notifyContactType === 'email'} onChange={() => setNotifyContactType('email')} className="accent-[#18a999]" />이메일</label>
                    </div>
                    <input value={notifyContact} onChange={e => setNotifyContact(e.target.value)}
                      placeholder={notifyContactType === 'sms' ? '01012345678' : '이메일 주소'} maxLength={100}
                      className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-[#18a999] transition" />
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <input type="checkbox" checked={isPrivate} onChange={e => setIsPrivate(e.target.checked)}
                    className="rounded" />
                  <Lock className="w-3 h-3" />
                  이름의신만 보기 (비공개)
                </label>
                <button onClick={submitComment} disabled={submitting}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-[#18a999] border border-[#18a999]/30 text-sm font-bold hover:bg-[#18a999]/5 disabled:opacity-50 transition flex-shrink-0 whitespace-nowrap">
                  <Send className="w-3.5 h-3.5" />
                  {submitting ? '저장 중...' : '기록 남기기'}
                </button>
              </div>
              {commentError && <p className="text-red-500 text-xs">{commentError}</p>}
            </div>

            {/* 댓글 목록 */}
            <div className="space-y-3">
              {comments.length === 0 && (
                <p className="text-center text-muted-foreground text-base py-8">아직 진단 기록이 없습니다.<br />첫 번째 기록을 남겨보세요!</p>
              )}
              {comments.map(c => (
                c.isPrivate && !isAdmin ? (
                  <div key={c.id} id={`comment-${c.id}`} className="rounded-2xl px-4 py-3 bg-muted/30 border border-dashed border-border/50 flex items-center justify-between text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Lock className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>비밀 댓글입니다.</span>
                    </div>
                    <span className="text-xs">{new Date(c.createdAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}</span>
                  </div>
                ) : (
                  <div key={c.id} id={`comment-${c.id}`} className={`rounded-2xl p-4 space-y-2 ${c.isPrivate ? 'bg-muted/40 border border-dashed border-border' : 'bg-card border border-border/50'}`}
                    style={{ boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base text-foreground">{c.nickname}</span>
                        {c.totalStrokes && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${DANGER.includes(c.totalStrokes) ? 'bg-red-400/15 text-red-500' : 'bg-[#18a999]/10 text-[#18a999]'}`}>
                            총운 {c.totalStrokes}획
                          </span>
                        )}
                        {c.isPrivate && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Lock className="w-3 h-3" /> 비공개
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {new Date(c.createdAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                        </span>
                        {isAdmin && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => { setReplyingTo(replyingTo === c.id ? null : c.id); setReplyText(''); }}
                              className="text-xs text-[#18a999] hover:text-[#149085] font-medium transition">
                              답글
                            </button>
                            <button onClick={() => deleteComment(c.id)} className="text-muted-foreground/50 hover:text-red-500 transition">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap"><Linkify>{c.content}</Linkify></p>

                    {/* 기존 답글 표시 */}
                    {c.reply && parseReplies(c.reply).map((r, i) => (
                      <div key={i} className="mt-2 ml-3 pl-3 border-l-2 border-[#18a999]/30 space-y-0.5">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-[#18a999]">이름의신</p>
                          {isAdmin && (
                            <div className="flex items-center gap-2">
                              <button onClick={() => { setEditingReply({ commentId: c.id, index: i }); setEditReplyText(r.text); }}
                                className="text-xs text-muted-foreground hover:text-[#18a999] transition">수정</button>
                              <button onClick={() => deleteReply(c.id, i)}
                                className="text-xs text-muted-foreground hover:text-red-500 transition">삭제</button>
                            </div>
                          )}
                        </div>
                        {editingReply?.commentId === c.id && editingReply.index === i ? (
                          <div className="flex gap-2 mt-1">
                            <input
                              value={editReplyText}
                              onChange={e => setEditReplyText(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && submitEditReply(c.id, i)}
                              className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[#18a999] transition"
                              maxLength={200}
                              autoFocus
                            />
                            <button onClick={() => submitEditReply(c.id, i)}
                              className="px-3 py-1.5 rounded-lg bg-[#18a999] text-white text-xs font-bold transition">저장</button>
                            <button onClick={() => setEditingReply(null)}
                              className="px-3 py-1.5 rounded-lg border border-border text-xs transition">취소</button>
                          </div>
                        ) : (
                          <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap"><Linkify>{r.text}</Linkify></p>
                        )}
                      </div>
                    ))}

                    {/* 어드민 답글 입력 */}
                    {isAdmin && replyingTo === c.id && (
                      <div className="mt-2 ml-3 pl-3 border-l-2 border-[#18a999]/30 flex gap-2">
                        <input
                          value={replyText}
                          onChange={e => setReplyText(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && !replySubmitting && submitReply(c.id)}
                          placeholder="답글을 입력하세요"
                          className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[#18a999] transition"
                          maxLength={200}
                        />
                        <button
                          onClick={() => submitReply(c.id)}
                          disabled={replySubmitting || !replyText.trim()}
                          className="px-3 py-1.5 rounded-lg bg-[#18a999] text-white text-xs font-bold disabled:opacity-40 transition">
                          {replySubmitting ? '...' : '등록'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              ))}
            </div>

            {/* 공유 */}
            <div className="text-center pt-2">
              <button
                onClick={() => navigator.share?.({ title: '혼자살 팔자 1초 만에 알아보기', url: window.location.href })}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#18a999] text-white text-sm font-bold hover:bg-[#149085] transition"
              >
                <Share2 className="w-4 h-4" />
                친구에게 공유하기
              </button>
            </div>
          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
}
