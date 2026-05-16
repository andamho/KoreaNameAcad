import { useState, useEffect, useRef } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useLocation } from "wouter";
import { ChevronLeft, AlertTriangle, Share2, Lock, Send, Trash2 } from "lucide-react";
import { useAdmin } from "@/contexts/AdminContext";

// ── 한글 획수 계산 ──
const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const JUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
const JONG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

const STROKE: Record<string, number> = {
  'ㄱ':1,'ㄴ':1,'ㅡ':1,'ㅣ':1,
  'ㄷ':2,'ㅅ':2,'ㅇ':2,'ㅋ':2,'ㅏ':2,'ㅓ':2,'ㅗ':2,'ㅜ':2,'ㅢ':2,
  'ㄹ':3,'ㅁ':3,'ㅈ':3,'ㅌ':3,'ㅑ':3,'ㅕ':3,'ㅛ':3,'ㅠ':3,'ㅟ':3,'ㅐ':3,'ㅔ':3,'ㅚ':3,
  'ㅂ':4,'ㅊ':4,'ㅍ':4,'ㅎ':4,'ㅖ':4,'ㅒ':4,'ㅝ':4,'ㅘ':4,
  'ㄲ':2,'ㄸ':4,'ㅃ':8,'ㅆ':4,'ㅉ':6,
  'ㄳ':3,'ㄵ':4,'ㄶ':5,'ㄺ':4,'ㄻ':6,'ㄼ':7,'ㄽ':4,'ㄾ':6,'ㄿ':7,'ㅀ':7,'ㅄ':6,
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

const DANGER = [10, 12, 14, 20];
const DANGER_LABELS: Record<number, string> = {
  10: '단명수',
  12: '단명수',
  14: '이산파멸(단명수)',
  20: '백사실패(단명수)',
};

// ── 욕설 필터 ──
const BLOCKED = ['씨발','시발','개새끼','병신','미친놈','미친년','지랄','존나','좆','보지','창녀','찐따','등신','죽어','닥쳐'];
function hasBadWord(t: string) { return BLOCKED.some(w => t.replace(/\s/g,'').includes(w)); }

// ── 일일 사용 횟수 제한 ──
const MAX_DAILY = 3;
const USAGE_KEY = 'kna_short_life_usage';

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

// ── 카운트 애니메이션 ──
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

interface Comment {
  id: string; nickname: string; totalStrokes: number | null;
  content: string; isPrivate: boolean; reply: string | null;
  repliedAt: string | null; createdAt: string;
}

export default function ExperienceShortLife() {
  const [, setLocation] = useLocation();
  const { isAdmin } = useAdmin();

  const [name, setName] = useState('');
  const [result, setResult] = useState<{ char: string; strokes: number; breakdown: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [calculated, setCalculated] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [usageCount, setUsageCount] = useState(0);
  const [dataCount, setDataCount] = useState(0);
  const animatedTotal = useCountUp(calculated ? total : 0);

  const [comments, setComments] = useState<Comment[]>([]);
  const [nickname, setNickname] = useState('');
  const [commentText, setCommentText] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replySubmitting, setReplySubmitting] = useState(false);
  const commentRef = useRef<HTMLDivElement>(null);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  useEffect(() => {
    let frame = 0;
    const steps = 45;
    const id = setInterval(() => {
      frame++;
      setDataCount(Math.min(Math.round((frame / steps) * 45), 45));
      if (frame >= steps) clearInterval(id);
    }, 30);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!isAdmin) setUsageCount(getTodayUsage());
    fetch('/api/experience-comments/short-life')
      .then(r => r.json())
      .then(data => setComments(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  function calculate() {
    const chars = name.trim().replace(/\s/g, '');
    if (!chars) return;
    setIsAnalyzing(true); setCalculated(false); setResult([]);
    setTimeout(() => {
      const res = Array.from(chars).map(ch => ({ char: ch, ...calcChar(ch) })).filter(r => r.strokes > 0);
      setResult(res);
      setTotal(res.reduce((s, r) => s + r.strokes, 0));
      setCalculated(true); setIsAnalyzing(false);
      setUsageCount(isAdmin ? usageCount + 1 : incrementUsage());
    }, 1500);
  }

  function reset() { setName(''); setResult([]); setTotal(0); setCalculated(false); setIsAnalyzing(false); }

  function adminReset() { reset(); setUsageCount(0); }

  async function submitComment() {
    if (!nickname.trim() || !commentText.trim()) { setCommentError('닉네임과 내용을 입력해주세요.'); return; }
    if (hasBadWord(nickname) || hasBadWord(commentText)) { setCommentError('부적절한 표현이 포함되어 있습니다.'); return; }
    setSubmitting(true); setCommentError('');
    try {
      const res = await fetch('/api/experience-comments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: 'short-life', nickname: nickname.trim(), totalStrokes: calculated ? total : null, content: commentText.trim(), isPrivate }),
      });
      if (!res.ok) throw new Error();
      const newComment = await res.json();
      setComments(prev => [newComment, ...prev]);
      setNickname(''); setCommentText(''); setIsPrivate(false);
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

  const isDanger = DANGER.includes(total);

  return (
    <div className="kna-experience-page min-h-screen bg-background flex flex-col">
      <Navbar />

      {/* 히어로 */}
      <section className="relative overflow-hidden pt-16 pb-[150px] md:pt-24 md:pb-56">
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
            <span className="block text-5xl md:text-6xl font-black tracking-tight">단명운</span>
            <span className="block text-3xl md:text-4xl font-light tracking-wide mt-1">1초 만에 알아보기</span>
          </h1>
        </div>
      </section>

      <main className="flex-1 py-10 md:py-14">
        <div className="max-w-2xl mx-auto px-5 space-y-8">

          {/* 도입 글 */}
          <style>{`
            @keyframes sl1 { 0%,100%{opacity:.03;transform:scale(1)} 50%{opacity:.07;transform:scale(1.08)} }
            @keyframes sl2 { 0%,100%{opacity:.04;transform:scale(1.05)} 50%{opacity:.08;transform:scale(.97)} }
            @keyframes scanLine { 0%{top:0%} 100%{top:100%} }
            .glow-red { text-shadow: 0 0 18px rgba(248,113,113,.7),0 0 40px rgba(248,113,113,.3); }
          `}</style>
          <div className="rounded-3xl overflow-hidden shadow-2xl relative" style={{ background: '#0F172A' }}>
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div style={{ position:'absolute',top:'-20%',left:'-10%',width:'70%',height:'70%',borderRadius:'50%',background:'radial-gradient(circle,rgba(86,213,219,1) 0%,transparent 70%)',animation:'sl1 6s ease-in-out infinite' }} />
              <div style={{ position:'absolute',bottom:'-20%',right:'-10%',width:'60%',height:'60%',borderRadius:'50%',background:'radial-gradient(circle,rgba(86,213,219,1) 0%,transparent 70%)',animation:'sl2 8s ease-in-out infinite' }} />
            </div>

            {/* 실화 */}
            <div className="relative px-7 pt-9 pb-7 border-b border-white/8">
              <p className="text-[10px] font-bold tracking-[0.4em] text-[#56D5DB] uppercase mb-5">A True Story</p>
              <p className="text-white/70 text-base leading-[2]">
                정말 가까운 분이<br />
                얼마 전에 스스로 생을 마감하셨습니다.
              </p>
              <p className="text-white/45 text-sm leading-[2] mt-4">
                이름에 단명수와 흉운이 많아<br />
                워낙 닫혀있는 분이라 말조차 못했었습니다.<br /><br />
                그런데 그런 황망한 일을 겪고 나니<br />
                얘기도 못해준 게 너무 미안했습니다.
              </p>
              <div className="mt-5 border-l-2 border-[#56D5DB]/40 pl-4">
                <p className="text-white/65 text-base leading-[2]">
                  그래서 <span className="text-[#56D5DB] font-bold">알려드릴 건 알려드리려고 합니다.</span><br />
                  선택은 각자의 몫입니다.
                </p>
              </div>
            </div>

            {/* 단명운 설명 */}
            <div className="relative px-7 py-7 border-b border-white/8">
              <p className="text-[10px] font-bold tracking-[0.3em] text-white/25 uppercase mb-5">단명운이란</p>
              <p className="text-white/65 text-base leading-[2] mb-5">
                이름 획수를 모두 더했을 때 나오는 숫자, <span className="text-white font-bold">총운</span>에<br />
                <span className="text-red-400 font-black text-xl glow-red">14 · 20 · 10 · 12</span>가 들어있다면<br />
                단명하는 운입니다.
              </p>
              <div className="flex items-start gap-4 rounded-2xl px-4 py-4" style={{ background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)' }}>
                <span className="text-xl flex-shrink-0">🌪️</span>
                <div>
                  <p className="text-white font-bold text-sm mb-1">14수 — 이산파멸(離散破滅)</p>
                  <p className="text-white/40 text-sm leading-[1.9]">
                    '바람'과 '태풍'을 분석하면 14수가 나옵니다.<br />
                    14수는 흩어버리고 부숴버립니다.<br />
                    인생에 바람 잘 날 없게 만듭니다.
                  </p>
                </div>
              </div>
              <div className="mt-3 rounded-xl px-4 py-3" style={{ background:'rgba(248,113,113,0.07)',border:'1px solid rgba(248,113,113,0.15)' }}>
                <p className="text-white/55 text-sm leading-[1.9]">
                  단명이라는 것은 빠른 죽음도 있지만<br />
                  <span className="text-red-400 font-semibold">강한 이별수</span>입니다.<br />
                  연애·가족관계·리더십·인기·승진에 태클을 겁니다.
                </p>
                <p className="text-white/45 text-sm leading-[1.9] mt-2">
                  또한 단명운은 건강관련 문제를 일으킬 수 있습니다.
                </p>
              </div>
            </div>

            {/* 예시 */}
            <div className="relative px-7 py-6">
              <p className="text-[10px] font-bold tracking-[0.3em] text-white/25 uppercase mb-4">Example · 홍길동</p>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[{ char:'홍', stroke:8 }, { char:'길', stroke:5 }, { char:'동', stroke:6 }].map(({ char, stroke }) => (
                  <div key={char} className="rounded-xl px-3 py-3 text-center" style={{ background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)' }}>
                    <p className="text-white font-black text-xl">{char}</p>
                    <p className="text-[#56D5DB] text-sm font-bold mt-1">{stroke}획</p>
                  </div>
                ))}
              </div>
              <div className="rounded-xl px-4 py-3 text-center" style={{ background:'rgba(86,213,219,0.08)',border:'1px solid rgba(86,213,219,0.2)' }}>
                <p className="text-[#56D5DB] font-bold text-sm">8 + 5 + 6 = 총운 <span className="text-xl font-black">19획</span></p>
                <p className="text-white/30 text-xs mt-1">19는 독신운 — 단명수는 10·12·14·20</p>
              </div>
            </div>
          </div>

          {/* 계산기 */}
          <div className="rounded-3xl bg-slate-900 dark:bg-slate-800 overflow-hidden shadow-2xl">
            <div className="px-6 pt-6 pb-4 border-b border-white/10">
              <p className="text-center text-sm font-medium text-white/70 leading-relaxed">
                18년간 축적된{' '}
                <span className="text-amber-400 font-black text-xl tabular-nums">{dataCount}만</span>
                {' '}명의<br />실제 임상 데이터 기반 분석
              </p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="relative">
                <input
                  value={name} onChange={e => { setName(e.target.value); setCalculated(false); }}
                  onKeyDown={e => e.key === 'Enter' && !isAnalyzing && (isAdmin || usageCount < MAX_DAILY) && calculate()}
                  placeholder="이름을 입력하세요 (예: 홍길동)"
                  disabled={isAnalyzing || (!isAdmin && usageCount >= MAX_DAILY)}
                  className="w-full bg-white/10 text-white placeholder-white/30 rounded-xl px-4 py-4 text-lg font-medium outline-none focus:ring-2 focus:ring-[#18a999] transition disabled:opacity-50"
                  maxLength={6}
                />
                {isAnalyzing && (
                  <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
                    <div className="absolute left-0 right-0 h-0.5 bg-[#56D5DB] shadow-[0_0_12px_#56D5DB]" style={{ animation:'scanLine 1.5s linear infinite' }} />
                  </div>
                )}
              </div>

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
                <button onClick={reset} className="w-full py-3.5 rounded-xl bg-white/10 text-white/60 hover:bg-white/20 font-bold transition">
                  다시 진단하기
                </button>
              ) : (
                <button onClick={calculate} disabled={!name.trim() || isAnalyzing}
                  className="w-full py-3.5 rounded-xl font-bold text-white transition-all disabled:opacity-40 active:scale-[0.98]"
                  style={{ background: isAnalyzing ? '#334155' : '#18a999' }}>
                  {isAnalyzing ? '⚡ 에너지 주파수 분석 중...' : '단명운 진단하기'}
                </button>
              )}

              {usageCount > 0 && usageCount < MAX_DAILY && (!calculated || isAdmin) && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-xs text-white/35">
                    <span>오늘 무료 진단</span>
                    <span>{usageCount}/{MAX_DAILY}회 사용 · {MAX_DAILY - usageCount}회 남음</span>
                  </div>
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500 bg-[#18a999]"
                      style={{ width: `${(usageCount / MAX_DAILY) * 100}%` }} />
                  </div>
                  <p className="text-xs text-center text-white/30">{usageCount}/{MAX_DAILY}회 진단함</p>
                </div>
              )}

              {calculated && result.length > 0 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    {result.map(({ char, strokes, breakdown }) => (
                      <div key={char} className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3">
                        <span className="text-2xl font-black text-white w-10 text-center">{char}</span>
                        <div className="flex-1"><span className="text-white/40 text-xs">{breakdown}</span></div>
                        <span className="text-[#56D5DB] font-black text-lg">{strokes}획</span>
                      </div>
                    ))}
                  </div>

                  <div className={`rounded-2xl border-2 p-6 text-center ${isDanger ? 'bg-red-500/10 border-red-500/40' : 'bg-[#18a999]/10 border-[#18a999]/30'}`}>
                    <p className="text-white/50 text-sm mb-2">{name} 님의 총운 수리</p>
                    <p className={`text-7xl font-black mb-3 ${isDanger ? 'text-red-400' : 'text-[#56D5DB]'}`}>{animatedTotal}</p>
                    {isDanger ? (
                      <div className="space-y-2">
                        <p className="font-bold text-red-300 text-lg flex items-center justify-center gap-2">
                          <AlertTriangle className="w-5 h-5" /> 단명 에너지 감지
                        </p>
                        <p className="text-red-400/80 text-sm leading-relaxed">
                          {DANGER_LABELS[total]} — 이름에 단명을 유도하는<br />에너지가 흐르고 있습니다.
                        </p>
                        <button onClick={() => commentRef.current?.scrollIntoView({ behavior:'smooth' })}
                          className="mt-3 inline-block text-sm text-white underline underline-offset-2 hover:text-[#56D5DB] transition">
                          진단 기록 남기기 &gt;
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3 text-left">
                        <p className="font-bold text-[#56D5DB] text-lg">단명운에는 해당되지 않습니다.</p>
                        <p className="text-white/80 text-base leading-relaxed">
                          다만, 이름 안에는 <strong className="text-white">총 16가지 운</strong>이 존재합니다.<br />
                          지금 확인한 건 그 중 <strong className="text-white">하나</strong>일 뿐입니다.
                        </p>
                        <p className="text-white/55 text-sm leading-relaxed">
                          혼자살팔자 · 남편복 · 자식복 · 재물운 등<br />
                          나머지 15가지 운도 모두 좋아야<br />
                          진짜 좋은 이름입니다.
                        </p>
                        <button onClick={() => setLocation('/services')}
                          className="mt-1 inline-flex items-center px-4 py-1.5 rounded-full bg-white text-[#18a999] text-sm font-bold hover:bg-white/90 transition">
                          나머지 15가지 운 분석 받기 &gt;
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 단명수 */}
          <div className="space-y-3">
            <h2 className="text-xl font-bold text-foreground">단명을 만드는 수리운</h2>
            <div className="grid grid-cols-4 gap-3">
              {DANGER.map(n => (
                <div key={n} className="rounded-2xl border border-red-400/20 bg-red-400/5 p-4 text-center space-y-1.5">
                  <div className="text-3xl font-black text-red-400">{n}</div>
                  <div className="text-xs text-muted-foreground leading-snug">{DANGER_LABELS[n]}</div>
                </div>
              ))}
            </div>
            <p className="text-base text-muted-foreground text-center">이름 총획수가 위 숫자면 단명운이 있는 이름입니다.</p>
          </div>

          {/* 획수표 */}
          <div className="space-y-4">
            <div className="text-center">
              <h2 className="text-xl font-bold text-foreground mb-1">획수 암호 해독표</h2>
              <p className="text-muted-foreground text-sm">이름의 자음과 모음을 분리하여 획수를 확인하세요</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { stroke:1, consonants:['ㄱ','ㄴ'], vowels:['ㅡ','ㅣ'] },
                { stroke:2, consonants:['ㄷ','ㅅ','ㅇ','ㅋ'], vowels:['ㅏ','ㅓ','ㅗ','ㅜ','ㅢ'] },
                { stroke:3, consonants:['ㄹ','ㅁ','ㅈ','ㅌ'], vowels:['ㅑ','ㅕ','ㅛ','ㅠ','ㅟ','ㅐ','ㅔ','ㅚ'] },
                { stroke:4, consonants:['ㅂ','ㅊ','ㅍ','ㅎ'], vowels:['ㅖ','ㅒ','ㅝ','ㅘ'] },
              ].map(item => (
                <div key={item.stroke} className="bg-card border border-border/50 rounded-2xl overflow-hidden hover:shadow-md transition-shadow flex">
                  <div className="w-20 bg-slate-900 dark:bg-slate-700 flex flex-col items-center justify-center text-white p-4 flex-shrink-0">
                    <span className="text-2xl font-black">{item.stroke}획</span>
                  </div>
                  <div className="flex-1 p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-[#18a999]/10 text-[#18a999] border border-[#18a999]/20 flex-shrink-0">자음</span>
                      <div className="flex flex-wrap gap-2 text-lg font-medium text-foreground">
                        {item.consonants.map(c => <span key={c}>{c}</span>)}
                      </div>
                    </div>
                    <div className="h-px bg-border w-full" />
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-800 flex-shrink-0">모음</span>
                      <div className="flex flex-wrap gap-2 text-lg font-medium text-foreground">
                        {item.vowels.map(v => <span key={v}>{v}</span>)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 상담 유도 */}
          <div className="rounded-2xl bg-slate-900 dark:bg-slate-800 p-6 text-center space-y-3">
            <p className="text-white font-bold text-lg">내 이름이 걱정되신다면?</p>
            <p className="text-white/50 text-base">전문 이름 분석으로 정확하게 확인하세요</p>
            <button onClick={() => setLocation('/services')}
              className="mt-1 inline-block px-6 py-2.5 rounded-full bg-[#18a999] text-white text-sm font-bold hover:bg-[#149085] transition-colors">
              이름 분석 상담 신청
            </button>
          </div>

          {/* 진단 기록 */}
          <div ref={commentRef} className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-foreground">진단 기록</h2>
              <p className="text-sm text-muted-foreground mt-0.5">다른 분들의 진단 결과를 확인하세요</p>
            </div>
            <div className="rounded-2xl bg-card border border-border/50 p-5 space-y-3" style={{ boxShadow:'0 2px 12px rgba(0,0,0,0.04)' }}>
              <input value={nickname} onChange={e => setNickname(e.target.value)}
                placeholder="닉네임 (예: 서울 30대)" maxLength={20}
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#18a999] transition" />
              {calculated && total > 0 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                  <span>계산된 총운</span>
                  <span className={`font-bold ${isDanger ? 'text-red-500' : 'text-[#18a999]'}`}>{total}획</span>
                  <span>{isDanger ? `(${DANGER_LABELS[total]})` : '(해당 없음)'}</span>
                </div>
              )}
              <textarea value={commentText} onChange={e => setCommentText(e.target.value)}
                placeholder={'예: "홍○○(14획) - 요즘 여기저기 자주 아파요."'}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#18a999] transition resize-none min-h-[90px]" maxLength={300} />
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
              {comments.map(c => c.isPrivate && !isAdmin ? null : (
                <div key={c.id} className={`rounded-2xl p-4 space-y-2 ${c.isPrivate ? 'bg-muted/40 border border-dashed border-border' : 'bg-card border border-border/50'}`}
                  style={{ boxShadow:'0 1px 8px rgba(0,0,0,0.04)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base text-foreground">{c.nickname}</span>
                      {c.totalStrokes && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${DANGER.includes(c.totalStrokes) ? 'bg-red-400/15 text-red-500' : 'bg-[#18a999]/10 text-[#18a999]'}`}>
                          총운 {c.totalStrokes}획
                        </span>
                      )}
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
                  {c.reply && (
                    <div className="mt-2 ml-3 pl-3 border-l-2 border-[#18a999]/30 space-y-0.5">
                      <p className="text-xs font-bold text-[#18a999]">이름의신</p>
                      <p className="text-sm text-foreground/80 leading-relaxed">{c.reply}</p>
                    </div>
                  )}
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
              <button onClick={() => navigator.share?.({ title:'단명운 1초 만에 알아보기', url: window.location.href })}
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
