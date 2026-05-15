import { useState, useEffect, useRef } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useLocation } from "wouter";
import { ChevronLeft, Share2, Lock, Send, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { useAdmin } from "@/contexts/AdminContext";

// ── 초성 추출 ──
const CHO_LIST = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
function getChosung(char: string): string {
  const code = char.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return '';
  return CHO_LIST[Math.floor((code - 0xAC00) / 28 / 21)];
}

// ── 오행 ──
type Ohang = '목' | '화' | '토' | '금' | '수';
const OHANG_MAP: Record<string, Ohang> = {
  'ㄱ':'목','ㄲ':'목','ㅋ':'목',
  'ㄴ':'화','ㄷ':'화','ㄸ':'화','ㄹ':'화','ㅌ':'화',
  'ㅇ':'토','ㅎ':'토',
  'ㅅ':'금','ㅆ':'금','ㅈ':'금','ㅉ':'금','ㅊ':'금',
  'ㅁ':'수','ㅂ':'수','ㅃ':'수','ㅍ':'수',
};
const OHANG_COLOR: Record<Ohang, string> = {
  '목':'#4ade80','화':'#f87171','토':'#fbbf24','금':'#c4b5fd','수':'#60a5fa',
};
const OHANG_HANJA: Record<Ohang, string> = {
  '목':'木','화':'火','토':'土','금':'金','수':'水',
};
const OHANG_ICON: Record<Ohang, string> = {
  '목':'/ohang-mok.png','화':'/ohang-hwa.png','토':'/ohang-to.png','금':'/ohang-geum.png','수':'/ohang-su.png',
};
const OHANG_GLASS: Record<Ohang, { bg: string; border: string }> = {
  '목': { bg: 'rgba(34,139,34,0.12)',   border: 'rgba(255,255,255,0.15)' },
  '화': { bg: 'rgba(178,34,34,0.12)',   border: 'rgba(255,255,255,0.15)' },
  '토': { bg: 'rgba(139,69,19,0.12)',   border: 'rgba(255,255,255,0.15)' },
  '금': { bg: 'rgba(192,192,192,0.10)', border: 'rgba(255,255,255,0.15)' },
  '수': { bg: 'rgba(0,71,171,0.14)',    border: 'rgba(255,255,255,0.15)' },
};

const SANGSEONG = new Set([
  '목목','토토',
  '목화','화목','화토','토화','토금','금토','금수','수금','수목','목수',
]);
function getOhang(char: string): Ohang {
  return OHANG_MAP[getChosung(char)] || '토';
}
function isSangseong(o1: Ohang, o2: Ohang) { return SANGSEONG.has(o1 + o2); }

const BLOCKED = ['씨발','시발','개새끼','병신','미친놈','미친년','지랄','존나','좆','보지','창녀','찐따','등신','죽어','닥쳐'];
function hasBadWord(t: string) { return BLOCKED.some(w => t.replace(/\s/g,'').includes(w)); }

// ── 일일 사용 횟수 제한 ──
const MAX_DAILY = 3;
const USAGE_KEY = 'kna_children_luck_usage';

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

interface Comment {
  id: string; nickname: string; totalStrokes: number | null;
  content: string; isPrivate: boolean; reply: string | null;
  repliedAt: string | null; createdAt: string;
}

export default function ExperienceChildrenLuck() {
  const [, setLocation] = useLocation();
  const { isAdmin } = useAdmin();

  const [name, setName] = useState('');
  const [result, setResult] = useState<{
    midChar: string; lastChar: string;
    midOhang: Ohang; lastOhang: Ohang; good: boolean;
  } | null>(null);
  const [calculated, setCalculated] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [usageCount, setUsageCount] = useState(0);

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
    if (!isAdmin) setUsageCount(getTodayUsage());
    fetch('/api/experience-comments/children-luck')
      .then(r => r.json())
      .then(data => setComments(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  function calculate() {
    const chars = name.trim().replace(/\s/g, '');
    if (chars.length < 3) return;
    setIsAnalyzing(true); setCalculated(false); setResult(null);
    setTimeout(() => {
      const midChar = chars[Math.floor(chars.length / 2)];
      const lastChar = chars[chars.length - 1];
      const midOhang = getOhang(midChar);
      const lastOhang = getOhang(lastChar);
      setResult({ midChar, lastChar, midOhang, lastOhang, good: isSangseong(midOhang, lastOhang) });
      setCalculated(true); setIsAnalyzing(false);
      setUsageCount(isAdmin ? usageCount + 1 : incrementUsage());
    }, 1200);
  }

  function reset() { setName(''); setResult(null); setCalculated(false); setIsAnalyzing(false); }

  function adminReset() { reset(); setUsageCount(0); }

  async function submitComment() {
    if (!nickname.trim() || !commentText.trim()) { setCommentError('닉네임과 내용을 입력해주세요.'); return; }
    if (hasBadWord(nickname) || hasBadWord(commentText)) { setCommentError('부적절한 표현이 포함되어 있습니다.'); return; }
    setSubmitting(true); setCommentError('');
    try {
      const res = await fetch('/api/experience-comments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: 'children-luck', nickname: nickname.trim(), totalStrokes: null, content: commentText.trim(), isPrivate }),
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

  const OHANG_TABLE: { ohang: Ohang; cho: string; note?: string }[] = [
    { ohang:'목', cho:'ㄱ ㄲ ㅋ' },
    { ohang:'화', cho:'ㄴ ㄷ ㄹ ㅌ' },
    { ohang:'토', cho:'ㅇ ㅎ' },
    { ohang:'금', cho:'ㅅ ㅈ ㅊ ㅆ', note:'김씨(金氏)의 ㄱ' },
    { ohang:'수', cho:'ㅁ ㅂ ㅍ' },
  ];

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
            <span className="block text-5xl md:text-6xl font-black tracking-tight">자식복</span>
            <span className="block text-3xl md:text-4xl font-light tracking-wide mt-1">1초 만에 알아보기</span>
          </h1>
        </div>
      </section>

      <main className="flex-1 py-10 md:py-14">
        <div className="max-w-2xl mx-auto px-5 space-y-8">

          {/* 도입 글 */}
          <style>{`
            @keyframes cl1 { 0%,100%{opacity:.03;transform:scale(1)} 50%{opacity:.07;transform:scale(1.08)} }
            @keyframes cl2 { 0%,100%{opacity:.04;transform:scale(1.05)} 50%{opacity:.08;transform:scale(.97)} }
            @keyframes scanLine { 0%{top:0%} 100%{top:100%} }
            .glow-tiffany3 { text-shadow: 0 0 18px rgba(86,213,219,.7),0 0 40px rgba(86,213,219,.3); }
          `}</style>
          <div className="rounded-3xl overflow-hidden shadow-2xl relative" style={{ background:'#0F172A' }}>
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div style={{ position:'absolute',top:'-20%',left:'-10%',width:'70%',height:'70%',borderRadius:'50%',background:'radial-gradient(circle,rgba(86,213,219,1) 0%,transparent 70%)',animation:'cl1 6s ease-in-out infinite' }} />
              <div style={{ position:'absolute',bottom:'-20%',right:'-10%',width:'60%',height:'60%',borderRadius:'50%',background:'radial-gradient(circle,rgba(86,213,219,1) 0%,transparent 70%)',animation:'cl2 8s ease-in-out infinite' }} />
            </div>

            <div className="relative px-7 pt-9 pb-7 border-b border-white/8">
              <p className="text-[10px] font-bold tracking-[0.4em] text-[#56D5DB] uppercase mb-5">Children Fortune Analysis</p>
              <p className="text-3xl md:text-4xl font-extrabold text-white leading-[1.5] mb-2">"자식과의 관계,<br />이름이 결정합니다."</p>
              <p className="text-white/40 text-sm font-medium mb-6">노력해도 잘 안 되는 건 이름의 관계운 영향이 크기 때문입니다.</p>
              <div className="border-l-2 border-[#56D5DB]/40 pl-4">
                <p className="text-white/65 text-base leading-[2]">
                  이름의 <span className="glow-tiffany3 text-[#56D5DB] font-black">중간 글자</span>와<br />
                  <span className="glow-tiffany3 text-[#56D5DB] font-black">마지막 글자</span>의 첫 자음 관계를 보면<br />
                  자식복을 알 수 있습니다.
                </p>
              </div>
            </div>

            {/* 예시: 안정환 */}
            <div className="relative px-7 py-6 border-b border-white/8">
              <p className="text-[10px] font-bold tracking-[0.3em] text-white/25 uppercase mb-4">Example · 안정환</p>
              <div className="flex items-center gap-3 mb-4">
                {['안','정','환'].map((c, i) => (
                  <div key={c} className={`flex-1 rounded-xl px-3 py-3 text-center transition-all ${i === 0 ? 'opacity-30' : ''}`}
                    style={{ background:'rgba(255,255,255,0.05)', border: i > 0 ? '1px solid rgba(86,213,219,0.25)' : '1px solid rgba(255,255,255,0.08)' }}>
                    <p className="text-white font-black text-xl">{c}</p>
                    <p className="text-white/30 text-[10px] mt-1">{i === 0 ? '성씨' : i === 1 ? '중간 글자' : '마지막 글자'}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 rounded-xl px-4 py-3 text-center" style={{ background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)' }}>
                  <p className="text-white/40 text-xs mb-1">정 → ㅈ</p>
                  <p className="font-black text-xl" style={{ color: OHANG_COLOR['금'] }}>金(금)</p>
                  <p className="text-white/25 text-xs mt-1">중간 글자</p>
                </div>
                <div className="text-[#56D5DB] text-2xl font-black">↔</div>
                <div className="flex-1 rounded-xl px-4 py-3 text-center" style={{ background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)' }}>
                  <p className="text-white/40 text-xs mb-1">환 → ㅎ</p>
                  <p className="font-black text-xl" style={{ color: OHANG_COLOR['토'] }}>土(토)</p>
                  <p className="text-white/25 text-xs mt-1">마지막 글자</p>
                </div>
              </div>
              <div className="mt-3 rounded-xl px-4 py-3 text-center" style={{ background:'rgba(86,213,219,0.08)',border:'1px solid rgba(86,213,219,0.2)' }}>
                <p className="text-[#56D5DB] font-bold text-sm">금 + 토 = 상생 → 자식복 좋음 ✓</p>
              </div>
            </div>

            <div className="relative px-7 py-6">
              <p className="text-white/35 text-sm leading-[2]">
                상생이면 자식과의 관계운이 좋고,<br />
                상극이면 관계운이 약합니다.<br />
                <span className="text-white/50">물론 이름에 있는 흉운까지 봐야 정확합니다.</span>
              </p>
            </div>
          </div>

          {/* 계산기 */}
          <div className="rounded-3xl bg-slate-900 dark:bg-slate-800 overflow-hidden shadow-2xl">
            <div className="px-6 pt-6 pb-4 border-b border-white/10">
              <p className="text-lg font-bold text-white">자식복 자동 진단기</p>
              <p className="text-white/40 text-sm mt-0.5">이름 중간·마지막 글자의 오행 관계를 분석합니다 (3글자 이상)</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="relative">
                <input
                  value={name} onChange={e => { setName(e.target.value); setCalculated(false); }}
                  onKeyDown={e => e.key === 'Enter' && !isAnalyzing && (isAdmin || usageCount < MAX_DAILY) && calculate()}
                  placeholder="이름을 입력하세요 (예: 안정환)"
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
              {name.trim().replace(/\s/g,'').length > 0 && name.trim().replace(/\s/g,'').length < 3 && (
                <p className="text-orange-400 text-xs">3글자 이상 입력해주세요 (성+이름 2자)</p>
              )}

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
                <button onClick={calculate} disabled={name.trim().replace(/\s/g,'').length < 3 || isAnalyzing}
                  className="w-full py-3.5 rounded-xl font-bold text-white transition-all disabled:opacity-40 active:scale-[0.98]"
                  style={{ background: isAnalyzing ? '#334155' : '#18a999' }}>
                  {isAnalyzing ? '⚡ 오행 에너지 분석 중...' : '자식복 진단하기'}
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

              {calculated && result && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/5 rounded-xl px-4 py-4 text-center">
                      <p className="text-white/40 text-xs mb-2">중간 글자 · {result.midChar}</p>
                      <div className="w-12 h-12 rounded-xl overflow-hidden mx-auto mb-1">
                        <img src={OHANG_ICON[result.midOhang]} alt={result.midOhang} className="w-full h-full object-cover" />
                      </div>
                      <p className="text-xs mt-1 font-bold" style={{ color: OHANG_COLOR[result.midOhang] }}>
                        {OHANG_HANJA[result.midOhang]}({result.midOhang})
                      </p>
                    </div>
                    <div className="bg-white/5 rounded-xl px-4 py-4 text-center">
                      <p className="text-white/40 text-xs mb-2">마지막 글자 · {result.lastChar}</p>
                      <div className="w-12 h-12 rounded-xl overflow-hidden mx-auto mb-1">
                        <img src={OHANG_ICON[result.lastOhang]} alt={result.lastOhang} className="w-full h-full object-cover" />
                      </div>
                      <p className="text-xs mt-1 font-bold" style={{ color: OHANG_COLOR[result.lastOhang] }}>
                        {OHANG_HANJA[result.lastOhang]}({result.lastOhang})
                      </p>
                    </div>
                  </div>

                  <div className={`rounded-2xl border-2 p-6 text-center ${result.good ? 'bg-[#18a999]/10 border-[#18a999]/30' : 'bg-red-500/10 border-red-500/40'}`}>
                    <p className="text-white/50 text-sm mb-2">{name.trim()} 님의 자식 오행 관계</p>
                    <p className={`text-4xl font-black mb-2 ${result.good ? 'text-[#56D5DB]' : 'text-red-400'}`}>
                      {result.good ? '상생 (相生)' : '상극 (相克)'}
                    </p>
                    {result.good ? (
                      <div className="space-y-2">
                        <p className="font-bold text-[#56D5DB] text-base">자식복이 좋은 이름입니다.</p>
                        <p className="text-white/55 text-sm leading-relaxed">
                          이름의 오행이 자식과의 관계를<br />살려주는 에너지가 흐르고 있습니다.
                        </p>
                        <p className="text-white/35 text-xs leading-relaxed pt-1">
                          다만, 이름 안에는 총 16가지 운이 존재합니다.<br />더 정확한 분석은 전문 상담으로 확인하세요.
                        </p>
                        <button onClick={() => setLocation('/services')}
                          className="mt-2 inline-flex items-center px-4 py-1.5 rounded-full bg-white text-[#18a999] text-sm font-bold hover:bg-white/90 transition">
                          나머지 운 분석 받기 &gt;
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="font-bold text-red-300 text-base">자식과의 관계운이 약한 이름입니다.</p>
                        <p className="text-red-400/80 text-sm leading-relaxed">
                          이름의 오행이 충돌하여<br />자식과의 관계에 어려움이 생길 수 있습니다.
                        </p>
                        <button onClick={() => commentRef.current?.scrollIntoView({ behavior:'smooth' })}
                          className="mt-2 inline-block text-sm text-white underline underline-offset-2 hover:text-[#56D5DB] transition">
                          진단 기록 남기기 &gt;
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 오행표 */}
          <div className="space-y-4">
            <div className="text-center">
              <h2 className="text-xl font-bold text-foreground mb-1">자음 오행 해독표</h2>
              <p className="text-muted-foreground text-sm">한글 자음마다 고유한 오행 에너지가 있습니다</p>
            </div>
            <div className="rounded-2xl p-3" style={{ background: '#0F172A' }}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {OHANG_TABLE.map(({ ohang, cho, note }, i) => (
                <div
                  key={ohang}
                  className={`relative flex items-center gap-3 rounded-2xl px-4 py-4 overflow-hidden${i === OHANG_TABLE.length - 1 && OHANG_TABLE.length % 2 !== 0 ? ' md:col-span-2' : ''}`}
                  style={{
                    background: OHANG_GLASS[ohang].bg,
                    border: `1px solid ${OHANG_GLASS[ohang].border}`,
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                  }}
                >
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-4xl font-black select-none pointer-events-none"
                    style={{ color: OHANG_COLOR[ohang], opacity: 0.1 }}>
                    {OHANG_HANJA[ohang]}
                  </span>
                  <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0">
                    <img src={OHANG_ICON[ohang]} alt={ohang} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white text-sm leading-tight">{ohang}({OHANG_HANJA[ohang]})</p>
                    <p className="text-white/60 text-sm font-medium tracking-widest mt-1">{cho}</p>
                    {note && <p className="text-sm text-white/55 font-medium mt-0.5">{note}</p>}
                  </div>
                </div>
              ))}
            </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-[#18a999]/5 border border-[#18a999]/20 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-4 h-4 text-[#18a999] flex-shrink-0" />
                  <p className="font-bold text-[#18a999] text-sm tracking-wide">상생 (Good)</p>
                </div>
                {['목화  화토  토금  금수  수목','화목  토화  금토  수금  목수','목목  토토'].map((line, i) => (
                  <p key={i} className="text-muted-foreground text-sm leading-[2]">{line}</p>
                ))}
              </div>
              <div className="bg-red-500/5 border border-red-400/20 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="font-bold text-red-500 text-sm tracking-wide">상극 (Bad)</p>
                </div>
                {['목/토  목/금  화/금  화/수  토/수','토/목  금/목  금/화  수/화  수/토','화/화  금/금  수/수'].map((line, i) => (
                  <p key={i} className="text-muted-foreground text-sm leading-[2]">{line}</p>
                ))}
              </div>
            </div>
          </div>

          {/* 상담 유도 */}
          <div className="rounded-2xl bg-slate-900 dark:bg-slate-800 p-6 text-center space-y-3">
            <p className="text-white font-bold text-lg">더 정확한 분석이 필요하신가요?</p>
            <p className="text-white/50 text-base">오행 관계 외 16가지 운을 모두 확인하세요</p>
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
                placeholder="닉네임 (예: 서울 40대)" maxLength={20}
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#18a999] transition" />
              <textarea value={commentText} onChange={e => setCommentText(e.target.value)}
                placeholder={'예: "안○○(상극) - 자식과 대화가 너무 안 돼요."'}
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
              <button onClick={() => navigator.share?.({ title:'자식복 1초 만에 알아보기', url: window.location.href })}
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
