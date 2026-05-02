import { useState, useEffect, useRef } from "react";
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

// ── 댓글 타입 ──
interface Comment {
  id: string;
  nickname: string;
  totalStrokes: number | null;
  content: string;
  isPrivate: boolean;
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

export default function ExperienceAloneFate() {
  const [, setLocation] = useLocation();
  const { isAdmin } = useAdmin();

  // 계산기
  const [name, setName] = useState('');
  const [result, setResult] = useState<{ char: string; strokes: number; breakdown: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [calculated, setCalculated] = useState(false);
  const animatedTotal = useCountUp(calculated ? total : 0);

  // 댓글
  const [comments, setComments] = useState<Comment[]>([]);
  const [nickname, setNickname] = useState('');
  const [commentText, setCommentText] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [commentError, setCommentError] = useState('');
  const commentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/experience-comments/alone-fate')
      .then(r => r.json())
      .then(data => setComments(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  function calculate() {
    const chars = name.trim().replace(/\s/g, '');
    if (!chars) return;
    const res = Array.from(chars).map(ch => ({ char: ch, ...calcChar(ch) })).filter(r => r.strokes > 0);
    setResult(res);
    setTotal(res.reduce((s, r) => s + r.strokes, 0));
    setCalculated(true);
  }

  function reset() {
    setName('');
    setResult([]);
    setTotal(0);
    setCalculated(false);
  }

  async function submitComment() {
    if (!nickname.trim() || !commentText.trim()) {
      setCommentError('닉네임과 내용을 입력해주세요.');
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
        }),
      });
      if (!res.ok) throw new Error();
      const newComment = await res.json();
      setComments(prev => [newComment, ...prev]);
      setNickname('');
      setCommentText('');
      setIsPrivate(false);
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

  const isDanger = DANGER.includes(total);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      {/* 히어로 */}
      <section className="relative overflow-hidden py-16 md:py-24">
        <img src="/bank-card-bg-opt.webp" alt="" className="absolute inset-0 w-full h-full object-cover object-top" aria-hidden />
        <div className="relative max-w-2xl mx-auto px-5 text-center">
          <button onClick={() => setLocation('/experience-zone')}
            className="inline-flex items-center gap-1 text-white/60 hover:text-white text-sm mb-5 transition-colors">
            <ChevronLeft className="w-4 h-4" /> 체험 ZONE
          </button>
          <p className="text-xs font-bold tracking-[0.3em] text-[#56D5DB] mb-3 uppercase">수리운 진단</p>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white leading-tight mb-3">
            혼자살 팔자<br /><span className="text-[#56D5DB]">10초 만에 아는 법</span>
          </h1>
          <p className="text-white/70 text-sm md:text-base">이름의 총획수로 알아보는 나의 독신운</p>
        </div>
      </section>

      <main className="flex-1 py-10 md:py-14">
        <div className="max-w-2xl mx-auto px-5 space-y-8">

          {/* ── 계산기 ── */}
          <div className="rounded-2xl bg-slate-900 dark:bg-slate-800 overflow-hidden shadow-xl">
            <div className="px-6 pt-6 pb-4 border-b border-white/10">
              <p className="text-xs font-bold tracking-[0.25em] text-[#56D5DB] uppercase mb-1">이름 획수 자동 계산기</p>
              <p className="text-white/50 text-xs">이름을 입력하면 총운을 자동으로 계산합니다</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="flex gap-2">
                <input
                  value={name}
                  onChange={e => { setName(e.target.value); setCalculated(false); }}
                  onKeyDown={e => e.key === 'Enter' && calculate()}
                  placeholder="이름 입력 (예: 홍길동)"
                  className="flex-1 bg-white/10 text-white placeholder-white/30 rounded-xl px-4 py-3 text-base outline-none focus:ring-2 focus:ring-[#18a999] transition"
                  maxLength={6}
                />
                {calculated
                  ? <button onClick={reset} className="px-4 py-3 rounded-xl bg-white/10 text-white/60 hover:bg-white/20 text-sm transition">초기화</button>
                  : <button onClick={calculate} disabled={!name.trim()} className="px-5 py-3 rounded-xl bg-[#18a999] text-white font-bold text-sm hover:bg-[#149085] disabled:opacity-40 transition">계산</button>
                }
              </div>

              {/* 결과 */}
              {calculated && result.length > 0 && (
                <div className="space-y-3 animate-in fade-in duration-300">
                  <div className="space-y-2">
                    {result.map(({ char, strokes, breakdown }) => (
                      <div key={char} className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-2.5">
                        <span className="text-xl font-black text-white w-8 text-center">{char}</span>
                        <span className="text-[#56D5DB] font-bold w-8">{strokes}획</span>
                        <span className="text-white/35 text-xs flex-1 truncate">{breakdown}</span>
                      </div>
                    ))}
                  </div>

                  <div className={`rounded-xl p-4 flex items-center justify-between border ${isDanger ? 'bg-red-500/10 border-red-500/30' : 'bg-[#18a999]/10 border-[#18a999]/20'}`}>
                    <div>
                      <p className="text-white/60 text-xs mb-0.5">총운 (총획수)</p>
                      <p className="text-3xl font-black text-white">{animatedTotal}획</p>
                    </div>
                    {isDanger ? (
                      <div className="text-right">
                        <div className="flex items-center gap-1.5 text-red-400 font-bold text-sm mb-1">
                          <AlertTriangle className="w-4 h-4" />
                          주의
                        </div>
                        <p className="text-red-300 text-xs">{DANGER_LABELS[total]}</p>
                      </div>
                    ) : (
                      <div className="text-[#18a999] text-sm font-bold">해당 없음 ✓</div>
                    )}
                  </div>

                  {isDanger && (
                    <div className="text-center">
                      <button
                        onClick={() => commentRef.current?.scrollIntoView({ behavior: 'smooth' })}
                        className="text-xs text-[#56D5DB] underline underline-offset-2 hover:text-white transition"
                      >
                        아래에 진단 기록 남기기 →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── 위험 수리운 ── */}
          <div className="space-y-3">
            <h2 className="text-base font-bold text-foreground">혼자살 팔자를 만드는 수리운</h2>
            <div className="grid grid-cols-3 gap-3">
              {DANGER.map(n => (
                <div key={n} className="rounded-2xl border border-red-400/20 bg-red-400/5 p-4 text-center space-y-1.5">
                  <div className="text-4xl font-black text-red-400">{n}</div>
                  <div className="text-[11px] text-muted-foreground leading-snug">{DANGER_LABELS[n]}</div>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground text-center">이름 총획수가 위 숫자면 혼자 살 팔자입니다.</p>
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
                  <p className="font-bold text-foreground text-base mb-1">{title}</p>
                  <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── 경고 ── */}
          <div className="rounded-2xl border-2 border-red-400/25 bg-red-400/5 p-6 space-y-3">
            <div className="flex items-center gap-2 text-red-500 font-bold text-sm">
              <AlertTriangle className="w-4 h-4" /> 실제 사례
            </div>
            <p className="text-foreground text-sm leading-relaxed">
              개명한 이름에 <strong>아내는 혼자살 팔자의 운</strong>을, <strong>자식들은 부모복이 없는 운</strong>을 넣어서 남편이 자살한 케이스도 있습니다.
            </p>
            <p className="text-muted-foreground text-sm border-t border-red-400/15 pt-3">
              10, 12 총운은 <strong className="text-foreground">단명수까지 있어</strong> 더욱 안 좋습니다.
            </p>
          </div>

          {/* ── 획수표 ── */}
          <div className="space-y-3">
            <h2 className="text-base font-bold text-foreground">한글 획수 참조표</h2>
            <div className="rounded-2xl overflow-hidden border border-border/50" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
              <div className="grid grid-cols-3 bg-[#18a999] text-white text-xs font-bold px-4 py-2.5">
                <span>획수</span><span>자음</span><span>모음</span>
              </div>
              {[
                { s: '1획', c: 'ㄱ ㄴ', v: 'ㅡ ㅣ' },
                { s: '2획', c: 'ㄷ ㅅ ㅇ ㅋ', v: 'ㅏ ㅓ ㅗ ㅜ ㅢ' },
                { s: '3획', c: 'ㄹ ㅁ ㅈ ㅌ', v: 'ㅑ ㅕ ㅛ ㅠ ㅟ ㅐ ㅔ ㅚ' },
                { s: '4획', c: 'ㅂ ㅊ ㅍ ㅎ', v: 'ㅖ ㅒ ㅝ ㅘ' },
              ].map(({ s, c, v }, i) => (
                <div key={s} className={`grid grid-cols-3 px-4 py-3 text-sm gap-2 ${i % 2 === 0 ? 'bg-card' : 'bg-muted/30'}`}>
                  <span className="font-bold text-[#18a999]">{s}</span>
                  <span className="text-foreground tracking-wider text-xs">{c}</span>
                  <span className="text-muted-foreground tracking-wider text-xs">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── 상담 유도 ── */}
          <div className="rounded-2xl bg-slate-900 dark:bg-slate-800 p-6 text-center space-y-3">
            <p className="text-white font-bold">내 이름이 걱정되신다면?</p>
            <p className="text-white/50 text-sm">전문 이름 분석으로 정확하게 확인하세요</p>
            <button onClick={() => setLocation('/services')}
              className="mt-1 inline-block px-6 py-2.5 rounded-full bg-[#18a999] text-white text-sm font-bold hover:bg-[#149085] transition-colors">
              이름 분석 상담 신청
            </button>
          </div>

          {/* ── 진단 로그 (댓글) ── */}
          <div ref={commentRef} className="space-y-5">
            <div>
              <h2 className="text-base font-bold text-foreground">진단 기록</h2>
              <p className="text-xs text-muted-foreground mt-0.5">다른 분들의 진단 결과와 경험을 확인하세요</p>
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
                placeholder="내 이름의 총운과 경험을 나눠주세요&#10;(총운 수리, 실제 경험 등)"
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#18a999] transition resize-none min-h-[90px]"
                maxLength={300}
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <input type="checkbox" checked={isPrivate} onChange={e => setIsPrivate(e.target.checked)}
                    className="rounded" />
                  <Lock className="w-3 h-3" />
                  원장님만 보기 (비공개)
                </label>
                <button onClick={submitComment} disabled={submitting}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#18a999] text-white text-sm font-bold hover:bg-[#149085] disabled:opacity-50 transition">
                  <Send className="w-3.5 h-3.5" />
                  {submitting ? '저장 중...' : '기록 남기기'}
                </button>
              </div>
              {commentError && <p className="text-red-500 text-xs">{commentError}</p>}
            </div>

            {/* 댓글 목록 */}
            <div className="space-y-3">
              {comments.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-8">아직 진단 기록이 없습니다.<br />첫 번째 기록을 남겨보세요!</p>
              )}
              {comments.map(c => (
                c.isPrivate && !isAdmin ? null : (
                  <div key={c.id} className={`rounded-2xl p-4 space-y-2 ${c.isPrivate ? 'bg-muted/40 border border-dashed border-border' : 'bg-card border border-border/50'}`}
                    style={{ boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-foreground">{c.nickname}</span>
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
                          <button onClick={() => deleteComment(c.id)} className="text-muted-foreground/50 hover:text-red-500 transition">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-foreground/80 leading-relaxed">{c.content}</p>
                  </div>
                )
              ))}
            </div>

            {/* 공유 */}
            <div className="text-center pt-2">
              <button
                onClick={() => navigator.share?.({ title: '혼자살 팔자 10초 만에 아는 법', url: window.location.href })}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-[#18a999]/30 text-[#18a999] text-sm font-bold hover:bg-[#18a999]/10 transition"
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
