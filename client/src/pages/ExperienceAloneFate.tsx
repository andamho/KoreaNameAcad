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

// ── 일일 사용 횟수 제한 ──
const MAX_DAILY = 5;
const USAGE_KEY = 'kna_alone_fate_usage';

function getTodayUsage(): number {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (!raw) return 0;
    const { date, count } = JSON.parse(raw);
    return date === new Date().toISOString().slice(0, 10) ? (count as number) : 0;
  } catch { return 0; }
}

function incrementUsage(): number {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const next = getTodayUsage() + 1;
    localStorage.setItem(USAGE_KEY, JSON.stringify({ date: today, count: next }));
    return next;
  } catch { return 1; }
}

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
  const { isAdmin, isVerifying } = useAdmin();

  // 계산기
  const [name, setName] = useState('');
  const [result, setResult] = useState<{ char: string; strokes: number; breakdown: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [calculated, setCalculated] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [usageCount, setUsageCount] = useState(0);
  const animatedTotal = useCountUp(calculated ? total : 0);

  // 댓글
  const [comments, setComments] = useState<Comment[]>([]);
  const [nickname, setNickname] = useState('');
  const [commentText, setCommentText] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [commentError, setCommentError] = useState('');
  const commentRef = useRef<HTMLDivElement>(null);

  // 어드민 가드
  useEffect(() => {
    if (!isVerifying && !isAdmin) {
      setLocation('/experience-zone');
    }
  }, [isVerifying, isAdmin, setLocation]);

  useEffect(() => {
    setUsageCount(getTodayUsage());
    fetch('/api/experience-comments/alone-fate')
      .then(r => r.json())
      .then(data => setComments(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // 모든 hooks 이후 조건부 렌더링
  if (isVerifying || !isAdmin) return null;

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
      setUsageCount(incrementUsage());
    }, 1500);
  }

  function reset() {
    setName('');
    setResult([]);
    setTotal(0);
    setCalculated(false);
    setIsAnalyzing(false);
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
            className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900 font-semibold text-base mb-5 transition-colors">
            <ChevronLeft className="w-4 h-4" /> 체험 ZONE
          </button>
          <h1 className="text-4xl md:text-5xl font-extrabold leading-tight mb-3">
            <span className="text-slate-800">혼자살 팔자</span><br />
            <span className="text-[#0f766e]">10초 만에 아는 법</span>
          </h1>
        </div>
      </section>

      <main className="flex-1 py-10 md:py-14">
        <div className="max-w-2xl mx-auto px-5 space-y-8">

          {/* ── 계산기 ── */}
          <div className="rounded-3xl bg-slate-900 dark:bg-slate-800 overflow-hidden shadow-2xl">
            {/* 헤더 */}
            <div className="px-6 pt-6 pb-4 border-b border-white/10">
              <p className="text-xs font-bold tracking-[0.3em] text-[#56D5DB] uppercase mb-1">성명 에너지 정밀 진단</p>
              <p className="text-lg font-bold text-white">이름 획수 자동 계산기</p>
              <p className="text-white/40 text-sm mt-0.5">자음·모음을 자동 분리하여 총운 수리를 계산합니다</p>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* 입력 */}
              <div className="relative">
                <input
                  value={name}
                  onChange={e => { setName(e.target.value); setCalculated(false); }}
                  onKeyDown={e => e.key === 'Enter' && !isAnalyzing && usageCount < MAX_DAILY && calculate()}
                  placeholder="성함을 입력하세요 (예: 홍길동)"
                  disabled={isAnalyzing || usageCount >= MAX_DAILY}
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
                    하루 무료 체험 횟수를 5회로 제한하고 있습니다.<br /><br />
                    소중한 사람의 이름 속 운명을 더 깊이 알고 싶다면<br />
                    공식 상담을 신청해 주세요.
                  </p>
                  <button onClick={() => setLocation('/services')}
                    className="px-6 py-2.5 rounded-full bg-[#18a999] text-white font-bold text-sm hover:bg-[#149085] transition">
                    1:1 정밀 에너지 진단 신청하기 &gt;
                  </button>
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
                  {isAnalyzing ? '⚡ 에너지 주파수 분석 중...' : '이름 에너지 진단하기'}
                </button>
              )}

              {/* 진행바 (4~5회차 경고) */}
              {usageCount > 0 && usageCount < MAX_DAILY && !calculated && (
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
                  {usageCount >= 4 && (
                    <p className="text-xs text-orange-400 text-center">오늘 {MAX_DAILY - usageCount}회 남았습니다</p>
                  )}
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
                          className="mt-3 inline-block text-sm text-[#56D5DB] underline underline-offset-2 hover:text-white transition">
                          진단 기록 남기기 →
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

          {/* ── 획수표 ── */}
          <div className="space-y-4">
            <div className="text-center">
              <h2 className="text-xl font-bold text-foreground mb-1">성명 에너지 해독표</h2>
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
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <input type="checkbox" checked={isPrivate} onChange={e => setIsPrivate(e.target.checked)}
                    className="rounded" />
                  <Lock className="w-3 h-3" />
                  원장님만 보기 (비공개)
                </label>
                <button onClick={submitComment} disabled={submitting}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-[#18a999] border border-[#18a999]/30 text-sm font-bold hover:bg-[#18a999]/5 disabled:opacity-50 transition">
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
                c.isPrivate && !isAdmin ? null : (
                  <div key={c.id} className={`rounded-2xl p-4 space-y-2 ${c.isPrivate ? 'bg-muted/40 border border-dashed border-border' : 'bg-card border border-border/50'}`}
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
