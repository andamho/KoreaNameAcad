import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";

// 작명·개명 신청 안내 (2026-11-04 대표님 '작명·개명 신청하기를 홈페이지로, 세련되게').
// 블로그 안내 4편(개명 221277653666 · 아기 이름 221277647598 · 상호 221274436174 · 비용 Q&A 221266616435)을 한 쪽으로 합친 것.
// 작명·개명은 이름분석 상담 뒤에 정하므로 신청 버튼은 모두 이름분석 신청서(홈 ?open=analysis)로 간다.
// 갈래는 주소 끝 #rename · #baby · #biz 로 바로 열 수 있다(서비스 쪽 카드가 씀).

type Kind = "rename" | "baby" | "biz";
const KINDS: { id: Kind; label: string }[] = [
  { id: "rename", label: "개명" },
  { id: "baby", label: "아기 이름" },
  { id: "biz", label: "상호 · 브랜드" },
];

const flowSteps = [
  { title: "먼저 살펴보기", desc: "홈페이지와 블로그의 글과 후기를 읽고, 이름을 맡길 만한 곳인지 직접 판단해 주세요." },
  { title: "이름분석 상담", desc: "사주 없이 한글·한자 이름만으로 지금까지의 삶을 읽어 드립니다.", key: true },
  { title: "작명·개명 상담", desc: "\"정말 이름대로 살아왔구나\" 느끼셨다면, 그때 작명과 비용에 대해 이야기를 나눕니다." },
];

const fourThings = ["타고난 장점과 좋은 자질", "그 가능성으로 꾸었던 꿈", "꿈을 향해 가며 만난 어려움", "앞으로 그려질 삶의 방향"];

// 서비스 쪽 renameSteps 와 같은 6단계
const renameSteps = [
  { title: "개명 비용 결제 · 맞춤 작명 시작", desc: "지금 이름의 운과 상담 내용을 바탕으로 바로 시작합니다." },
  { title: "희망사항 제출 (최대 10가지)", desc: "결제 후 1주 안에 보내 주세요.", key: true },
  { title: "정밀 작명 · 검토", desc: "희망사항을 반영한 심층 작명", key: true },
  { title: "새 이름 제안 및 심층 전화 상담", desc: "완성된 이름 평균 3개 제안 · 이름운 직접 상세 설명", key: true },
  { title: "한글 이름 최종 선택", desc: "후보 가운데 직접 고르십니다." },
  { title: "작명서(PDF) 발송", desc: "고른 이름의 한자와 해설을 담아 보내 드립니다." },
];

const bizQuestions = [
  "회사가 추구하는 가치와 장기 목표",
  "정확한 업종, 경쟁사와 다른 강점",
  "주요 고객과 시장(국내·해외)",
  "원하는 느낌(감성·기술·전통·모던)과 언어",
  "꼭 넣고 싶은 말이나 대표자 이름",
];

const reviewLines = [
  { q: "지옥 같던 결혼생활… 이름 바꾸고 신기할 정도로 남편이 변했어요", by: "개명 후기" },
  { q: "알바 인생 끝! 이름 바꾸고 딱 맞는 직장까지 생겼어요", by: "개명 후기" },
  { q: "생일 축하와 함께 날아온, 가족 3대의 개명 후 변화 소식", by: "가족 개명 후기" },
];

const eyebrow = "text-sm font-medium tracking-wide text-[#0b7f82] dark:text-[#58C4C4]";
const heading = "text-[1.5625rem] sm:text-3xl md:text-4xl font-extrabold leading-tight text-foreground";
const dot = "mt-[0.55em] h-2 w-2 flex-none rounded-full bg-[#56D5DB]";

function kindFromHash(): Kind {
  const h = window.location.hash.replace("#", "");
  return h === "baby" || h === "biz" ? h : "rename";
}

function StepNo({ n, keyStep }: { n: string; keyStep?: boolean }) {
  return (
    <div
      className={`relative z-10 flex h-9 w-9 flex-none items-center justify-center rounded-full border text-sm font-bold tabular-nums ${
        keyStep ? "bg-[#56D5DB] text-white border-[#56D5DB]" : "bg-white dark:bg-slate-800 text-[#0b7f82] dark:text-[#58C4C4] border-[#56D5DB]/50"
      }`}
    >
      {n}
    </div>
  );
}

export default function NamingGuide() {
  const [, setLocation] = useLocation();
  const [kind, setKind] = useState<Kind>(() => (typeof window === "undefined" ? "rename" : kindFromHash()));

  // 갈래(#baby 등)로 들어와도 맨 위부터 보여 준다(2026-11-04 대표님 '중간쯤이 나옴') — 갈래 선택만 미리 해 둠
  useEffect(() => {
    if (!window.history.state?.scrollY) {
      window.scrollTo(0, 0);
    }
  }, []);

  const apply = () => setLocation("/?open=analysis&from=/naming");
  const pick = (k: Kind) => {
    setKind(k);
    window.history.replaceState(window.history.state, "", `/naming#${k}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* 첫 화면 */}
      <section className="py-14 md:py-24 border-b border-slate-100 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid gap-8 md:grid-cols-[1.35fr_1fr] md:gap-16 md:items-center">
          <div className="flex flex-col gap-4 md:gap-5">
            <p className={eyebrow}>작명 · 개명 신청</p>
            <h1 className="text-[1.875rem] sm:text-4xl md:text-5xl font-extrabold leading-snug text-foreground" data-testid="text-naming-title">
              새 이름은<br />
              <span className="bg-gradient-to-r from-[#0f766e] to-[#4fd1c5] dark:from-[#58C4C4] dark:to-[#6DD4D4] bg-clip-text text-transparent">지금 이름</span>을 읽는 데서<br />
              시작합니다
            </h1>
            <p className="text-base md:text-lg text-muted-foreground max-w-xl">
              저희는 바로 이름을 지어 드리지 않습니다. 먼저 지금 이름으로 살아온 길을 함께 확인하고, 그다음에 새 이름을 이야기합니다.
            </p>
          </div>
          <div className="flex flex-col gap-3 rounded-2xl bg-[#56D5DB]/[0.08] dark:bg-[#56D5DB]/10 p-5 md:p-8">
            <button
              onClick={apply}
              className="w-full rounded-full bg-[#0b7f82] dark:bg-[#58C4C4] px-5 py-3 text-base font-bold text-white dark:text-slate-900 transition hover:opacity-90"
              data-testid="button-naming-apply-top"
            >
              이름분석 상담 신청하기
            </button>
            <button
              onClick={() => setLocation("/reviews")}
              className="w-full rounded-full border border-[#0b7f82] dark:border-[#58C4C4] px-5 py-3 text-base font-bold text-[#0b7f82] dark:text-[#58C4C4] transition hover:bg-[#56D5DB]/10"
              data-testid="button-naming-reviews-top"
            >
              개명 후기 보기
            </button>
            <p className="text-center text-sm text-muted-foreground">
              18년간 45만 명 임상<br />
              사주 없이 한글·한자 이름만으로 운명상담<br />
              <span className="font-semibold text-[#0b7f82] dark:text-[#58C4C4]">[정확도 80% 이상]</span>
            </p>
          </div>
        </div>
      </section>

      {/* 신청 순서 */}
      <section className="py-14 md:py-20 border-b border-slate-100 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col gap-6 md:gap-8">
          <div className="flex flex-col gap-2">
            <p className={eyebrow}>신청 순서</p>
            <h2 className={heading}>신청은 이렇게 이어집니다</h2>
          </div>
          <ol className="grid gap-5 md:grid-cols-3 md:gap-8">
            {flowSteps.map((s, i) => (
              <li key={s.title} className="relative flex gap-3 md:flex-col md:gap-3">
                {i < flowSteps.length - 1 && (
                  <span aria-hidden className="absolute left-[18px] top-9 bottom-[-20px] w-px bg-slate-200 dark:bg-slate-700 md:left-12 md:right-[-24px] md:top-[18px] md:bottom-auto md:h-px md:w-auto" />
                )}
                <StepNo n={String(i + 1)} keyStep={s.key} />
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-foreground">{s.title}</p>
                  <p className="mt-1 text-base text-muted-foreground">{s.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 상담에서 확인하는 네 가지 */}
      <section className="py-14 md:py-20 border-b border-slate-100 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <p className={eyebrow}>이름분석 상담</p>
            <h2 className={heading}>상담에서 확인하는 네 가지</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            {fourThings.map((t) => (
              <div key={t} className="rounded-xl bg-[#56D5DB]/[0.08] dark:bg-[#56D5DB]/10 p-4 md:p-6 text-base md:text-lg font-medium text-foreground">
                {t}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 비용 안내 */}
      <section className="py-14 md:py-20 bg-[#56D5DB]/[0.08] dark:bg-[#56D5DB]/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid gap-4 md:grid-cols-2 md:gap-16 md:items-center">
          <div className="flex flex-col gap-3">
            <p className={eyebrow}>비용 안내</p>
            <h2 className={heading}>비용을 상담 뒤에 알려 드리는 이유</h2>
            <p className="text-xl md:text-2xl font-bold leading-relaxed text-[#0b7f82] dark:text-[#58C4C4]">
              사주 없이 이름만으로 상담해 드리고, 80% 이상의 정확도를 체험하실 때만 개명·작명을 권해 드립니다.
            </p>
          </div>
          <p className="text-base md:text-lg text-foreground/80 leading-relaxed">
            그렇지 않다면 저희 이론으로 이름을 바꿔도 도움이 되지 않으니, 맡기실 이유도 저희가 권할 이유도 없습니다. 이름은 평생 쓰는 것이라, 가격보다 먼저 믿고 맡길 곳인지를 보셔야 합니다.
          </p>
        </div>
      </section>

      {/* 갈래: 개명 · 아기 이름 · 상호 */}
      <section id="kinds" className="scroll-mt-20 py-14 md:py-20 border-b border-slate-100 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <p className={eyebrow}>무엇을 지으시나요</p>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="작명 종류">
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  role="tab"
                  aria-selected={kind === k.id}
                  onClick={() => pick(k.id)}
                  className={`rounded-full border px-4 py-1.5 text-base font-bold transition ${
                    kind === k.id
                      ? "border-[#0b7f82] dark:border-[#58C4C4] bg-[#56D5DB]/10 text-[#0b7f82] dark:text-[#58C4C4]"
                      : "border-slate-200 dark:border-slate-700 text-muted-foreground hover:border-[#56D5DB]"
                  }`}
                  data-testid={`tab-naming-${k.id}`}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          {kind === "rename" && (
            <div className="flex flex-col gap-5" role="tabpanel">
              <h3 className="text-2xl md:text-3xl font-extrabold text-foreground">운이 술술 풀리는 개명</h3>
              <div className="flex flex-wrap gap-2">
                {["개인 약 1개월", "가족 약 2개월", "후보 평균 3개"].map((f) => (
                  <span key={f} className="rounded-full bg-[#56D5DB]/15 px-3 py-1 text-sm font-semibold text-[#0b7f82] dark:text-[#58C4C4]">{f}</span>
                ))}
              </div>
              <ol className="grid gap-4 md:grid-flow-col md:grid-cols-2 md:grid-rows-3 md:gap-x-14">
                {renameSteps.map((s, i) => (
                  <li key={s.title} className="flex gap-3">
                    <StepNo n={String(i + 1).padStart(2, "0")} keyStep={s.key} />
                    <div className="min-w-0">
                      <p className="text-lg font-semibold text-foreground">{s.title}</p>
                      <p className="mt-0.5 text-base text-muted-foreground">{s.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {kind === "baby" && (
            <div className="flex flex-col gap-4 max-w-3xl" role="tabpanel">
              <h3 className="text-2xl md:text-3xl font-extrabold text-foreground">아기 이름은 부모님 이름에서 시작합니다</h3>
              <p className="text-base md:text-lg text-foreground/80">
                아기가 태어나 처음 만나는 환경은 부모님입니다. 자식의 초년운은 부모의 중년운에, 부모의 중년운은 자식의 초년운에 서로 큰 영향을 줍니다.
              </p>
              <ul className="flex flex-col gap-2">
                {[
                  "먼저 엄마 아빠 이름에 담긴 삶의 흐름과 운을 살핍니다.",
                  "그 흐름을 고려해 아기의 첫 시간이 가장 밝게 빛나도록 짓습니다.",
                  "아기 이름이 엄마 아빠의 삶에도 좋은 영향을 주도록 짓습니다.",
                ].map((t) => (
                  <li key={t} className="flex gap-3 text-base md:text-lg text-foreground"><span className={dot} />{t}</li>
                ))}
              </ul>
            </div>
          )}

          {kind === "biz" && (
            <div className="flex flex-col gap-4" role="tabpanel">
              <h3 className="text-2xl md:text-3xl font-extrabold text-foreground">운이 트이고, 기억에 남는 상호</h3>
              <p className="text-base md:text-lg text-foreground/80 max-w-3xl">
                상호명도 사람 이름처럼 운의 흐름과 조화가 맞아야 사업이 힘차게, 오래 갑니다. 오행운과 수리운을 바탕으로 세 가지 조화를 맞춥니다.
              </p>
              <ul className="flex flex-col gap-2">
                {["대표자와의 조화", "업종과의 조화", "상호명 자체의 좋은 수리운"].map((t) => (
                  <li key={t} className="flex gap-3 text-base md:text-lg text-foreground"><span className={dot} />{t}</li>
                ))}
              </ul>
              <p className="mt-2 text-base font-bold text-foreground">상담 전에 생각해 오시면 좋은 다섯 가지</p>
              <div className="grid gap-2 md:grid-cols-2">
                {bizQuestions.map((q, i) => (
                  <div key={q} className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-base text-foreground">
                    <b className="mr-2 text-[#0b7f82] dark:text-[#58C4C4]">{i + 1}</b>{q}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 후기 */}
      <section className="py-14 md:py-20 border-b border-slate-100 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <p className={eyebrow}>개명 후기</p>
            <h2 className={heading}>이름을 바꾼 분들의 이야기</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3 md:gap-6">
            {reviewLines.map((r) => (
              <blockquote key={r.q} className="border-l-[3px] border-[#56D5DB] pl-4 text-base md:text-lg font-medium text-foreground">
                "{r.q}"
                <cite className="mt-1 block text-sm not-italic font-normal text-muted-foreground">{r.by}</cite>
              </blockquote>
            ))}
          </div>
          <button
            onClick={() => setLocation("/reviews")}
            className="self-stretch md:self-start rounded-full border border-[#0b7f82] dark:border-[#58C4C4] px-6 py-2.5 text-base font-bold text-[#0b7f82] dark:text-[#58C4C4] transition hover:bg-[#56D5DB]/10"
            data-testid="button-naming-reviews"
          >
            후기 200여 개 모두 보기
          </button>
        </div>
      </section>

      {/* 마무리 */}
      <section className="py-16 md:py-24">
        <div className="max-w-xl mx-auto px-4 sm:px-6 flex flex-col items-stretch gap-4 text-center">
          <h2 className={heading}>지금 이름부터 읽어 보세요</h2>
          <p className="text-base md:text-lg text-muted-foreground">작명·개명은 이름분석 상담을 받으신 뒤에 진행합니다.</p>
          <button
            onClick={apply}
            className="mt-2 rounded-full bg-[#0b7f82] dark:bg-[#58C4C4] px-6 py-3.5 text-base font-bold text-white dark:text-slate-900 transition hover:opacity-90"
            data-testid="button-naming-apply-bottom"
          >
            이름분석 상담 신청하기
          </button>
        </div>
      </section>

      <Footer />
    </div>
  );
}
