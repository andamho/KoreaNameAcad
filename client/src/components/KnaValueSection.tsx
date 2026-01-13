import React, { useState } from "react";
import { Scale, Link2, Lock, AlertTriangle, Users, DollarSign, FileQuestion, MessageCircleQuestion } from "lucide-react";
import logoImage from "@assets/file_000000009b2c7206ad0a70c0142cb99a_1766915164756.png";

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M12 3l7 4v5a9 9 0 0 1-7 8 9 9 0 0 1-7-8V7l7-4Z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-3.4-3.4" />
    </svg>
  );
}

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M12 2v6M12 16v6M2 12h6M16 12h6M5 5l4 4M15 15l4 4M19 5l-4 4M5 19l4-4" />
    </svg>
  );
}

function FamilyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden>
      <circle cx="6" cy="8" r="2.5" />
      <circle cx="18" cy="8" r="2.5" />
      <path d="M6 11c-2.5 0-4 1.5-4 3.5v1.5h8v-1.5c0-2-1.5-3.5-4-3.5z" />
      <path d="M18 11c-2.5 0-4 1.5-4 3.5v1.5h8v-1.5c0-2-1.5-3.5-4-3.5z" />
      <path d="M8 12.5c1.5 1 4.5 1 6 0" strokeLinecap="round" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" fill="white" stroke="white" strokeWidth="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const iconProps = "w-10 h-10 text-gray-700 dark:text-gray-300 mb-3";

type Node = {
  key: string;
  title: string;
  body: string;
  angle: number;
  icon: React.ReactNode;
  textSide: "right" | "left";
  textAlign: "left" | "right";
};

const nodes: Node[] = [
  {
    key: "top",
    title: "신뢰의 증거",
    body: "전국 최다 후기로 검증된\n만족도를 확인하세요.",
    angle: 0,
    icon: <ShieldIcon className={iconProps} />,
    textSide: "right",
    textAlign: "left",
  },
  {
    key: "topRight",
    title: "이름 · 삶\n일치 증명",
    body: "이름대로 살고 있음을\n구체적으로 보여드립니다.",
    angle: 60,
    icon: <Scale className={iconProps} strokeWidth={1.5} />,
    textSide: "right",
    textAlign: "left",
  },
  {
    key: "bottomRight",
    title: "가족 이해 향상",
    body: "이름을 통해 서로의 장점과 문제의\n뿌리를 알아 관계가 개선됩니다.",
    angle: 120,
    icon: <FamilyIcon className={iconProps} />,
    textSide: "right",
    textAlign: "left",
  },
  {
    key: "bottom",
    title: "강점과 재능 발견",
    body: "당신이 몰랐던 본연의\n장점을 알려드립니다.",
    angle: 180,
    icon: <SparkIcon className={iconProps} />,
    textSide: "right",
    textAlign: "left",
  },
  {
    key: "bottomLeft",
    title: "개명 전·후\n삶 증명",
    body: "개명하셨다면 전·후 이름대로\n살았다는 걸 증명해드립니다.",
    angle: 240,
    icon: <Link2 className={iconProps} strokeWidth={1.5} />,
    textSide: "left",
    textAlign: "right",
  },
  {
    key: "topLeft",
    title: "근본 원인 발견",
    body: "반복되는 어려움의 이유를\n이름에서 명확히 찾아드립니다.",
    angle: 300,
    icon: <SearchIcon className={iconProps} />,
    textSide: "left",
    textAlign: "right",
  },
];

type MobileCard = {
  key: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  highlight?: boolean;
};

const mobileCards: MobileCard[] = [
  {
    key: "clear",
    title: "이름이 맑아야 인생이 맑다",
    description: "운칠기삼(運七技三), 운이 70%입니다. 이름의 강력한 운을 모른 채, 30%의 노력만으로는 인생이 바뀌지 않습니다.",
    icon: <SparkIcon className="w-8 h-8 text-[#2dd4bf]" />,
  },
  {
    key: "badName",
    title: "안 좋은 이름에 바람 잘 날 없다",
    description: "안좋은 이름은,\n평생을 따라 다니며 괴롭힙니다.",
    icon: <AlertTriangle className="w-8 h-8 text-[#2dd4bf]" strokeWidth={1.5} />,
  },
  {
    key: "family",
    title: "가족은 운명공동체",
    description: "이름은 자신뿐만 아니라,\n가족 전체에 영향을 미칩니다.",
    icon: <Users className="w-8 h-8 text-[#2dd4bf]" strokeWidth={1.5} />,
  },
  {
    key: "warning",
    title: "이러시면 안됩니다",
    description: "",
    icon: null,
    highlight: true,
  },
];

type WarningItem = {
  key: string;
  question: string;
  warning: string;
};

const warningItems: WarningItem[] = [
  {
    key: "cost",
    question: '"비용을 먼저 물어보시나요?"',
    warning: "이름은 생각보다 훨씬 막강합니다.\n비용만 아끼려다,\n더 비싼 대가를 치릅니다.",
  },
  {
    key: "saju",
    question: '"사주 기반 작명소를 찾으시나요?"',
    warning: "그곳은 한글이름 작명이론이 없습니다.\n한글 이름의 운이 무너지면,\n삶이 흔들립니다.",
  },
  {
    key: "review",
    question: '"후기도 안살펴보시나요?"',
    warning: "검증 없는 작명,\n고생은 결국 본인의 몫입니다.",
  },
];

function CircleNode({ node, radius }: { node: Node; radius: number }) {
  const x = Math.sin((node.angle * Math.PI) / 180) * radius;
  const y = -Math.cos((node.angle * Math.PI) / 180) * radius;

  const textPosClass =
    node.textSide === "right"
      ? "left-[110%] top-1/2 -translate-y-1/2 origin-left"
      : "right-[110%] top-1/2 -translate-y-1/2 origin-right";

  const textAlignClass =
    node.textAlign === "left" ? "text-left items-start" : "text-right items-end";

  return (
    <div
      className="absolute z-20 group cursor-pointer"
      style={{
        left: `calc(50% + ${x}px)`,
        top: `calc(50% + ${y}px)`,
        transform: "translate(-50%, -50%)",
      }}
    >
      <div className="relative transition-transform duration-300 group-hover:scale-110">
        <div className="rounded-full border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-[6px] shadow-lg group-hover:border-[#18a999] transition-colors">
          <div className="w-32 h-32 md:w-44 md:h-44 rounded-full bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 shadow-md flex flex-col items-center justify-center p-4 text-center">
            <div className="mb-2">{node.icon}</div>
            <span className="text-gray-900 dark:text-foreground font-bold text-[16px] md:text-[19px] leading-tight whitespace-pre-line tracking-tight">
              {node.title}
            </span>
          </div>
        </div>
      </div>

      <div
        className={`hidden lg:flex absolute flex-col w-[300px] ${textPosClass} ${textAlignClass} transition-transform duration-300 group-hover:scale-105`}
      >
        <div className="text-gray-700 dark:text-muted-foreground text-[16px] md:text-[17px] leading-relaxed whitespace-pre-line font-medium break-keep">
          {node.body}
        </div>
      </div>
    </div>
  );
}

function MobileValueCard({ card }: { card: MobileCard }) {
  if (card.highlight) {
    return (
      <div className="bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 rounded-2xl p-6 border border-red-200/50 dark:border-red-700/50">
        <h3 className="text-xl font-bold text-red-600 dark:text-red-400 mb-6 text-center">
          {card.title}
        </h3>
        <div className="space-y-5">
          {warningItems.map((item) => (
            <div key={item.key} className="bg-white/80 dark:bg-gray-800/80 rounded-xl p-4">
              <p className="text-[17px] font-semibold text-gray-800 dark:text-gray-200 mb-2">
                {item.question}
              </p>
              <p className="text-[15px] text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-line break-keep">
                {item.warning}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-14 h-14 rounded-full bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center shrink-0">
          {card.icon}
        </div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-foreground break-keep">
          {card.title}
        </h3>
      </div>
      <p className="text-[15px] text-gray-600 dark:text-muted-foreground leading-relaxed whitespace-pre-line break-keep pl-[72px]">
        {card.description}
      </p>
    </div>
  );
}

export default function KnaValueSection() {
  const radius = 300;
  const [showLogo, setShowLogo] = useState(false);

  return (
    <section className="kna-value-section relative overflow-hidden bg-white dark:bg-background text-gray-900 dark:text-foreground">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-[#7fe1d3]/20 dark:bg-[#58C4C4]/20 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-[#0f766e]/10 dark:bg-[#45B8B8]/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 pt-24 pb-24 lg:px-8">
        {/* 헤더 */}
        <header className="relative z-40 text-center mb-16 lg:mb-24">
          <h2 className="text-[#18a999] text-[25px] sm:text-3xl md:text-4xl font-extrabold tracking-tight">
            알면 알수록, 한국이름학교
          </h2>
          <p className="mt-3 text-lg text-gray-700 dark:text-muted-foreground">
            전국 최다 후기로 검증된,<br className="md:hidden" /> 가장 신뢰받는 이름 분석
          </p>
        </header>

        {/* 모바일 레이아웃 (lg 미만) */}
        <div className="lg:hidden space-y-4 mb-16">
          {mobileCards.map((card) => (
            <MobileValueCard key={card.key} card={card} />
          ))}
        </div>

        {/* 데스크톱 원형 다이어그램 (lg 이상) */}
        <div className="hidden lg:flex relative w-full h-[800px] items-center justify-center">
          {/* 연결선 SVG */}
          <svg className="absolute inset-0 w-full h-full z-10 pointer-events-none opacity-30">
            <g stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="6 6">
              {nodes.map((node, i) => {
                const x = Math.sin((node.angle * Math.PI) / 180) * radius;
                const y = -Math.cos((node.angle * Math.PI) / 180) * radius;
                return (
                  <line
                    key={`line-${i}`}
                    x1="50%"
                    y1="50%"
                    x2={`calc(50% + ${x * 0.72}px)`}
                    y2={`calc(50% + ${y * 0.72}px)`}
                  />
                );
              })}
            </g>
          </svg>

          {/* 중앙 한국이름학교 */}
          <div className="z-30 relative">
            <div className="rounded-full border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-[8px] shadow-xl">
              <div 
                className="group w-48 h-48 md:w-56 md:h-56 rounded-full bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 shadow-md relative flex items-center justify-center cursor-pointer overflow-hidden transition-transform duration-300 hover:scale-105 active:scale-95"
                onClick={() => setShowLogo(!showLogo)}
                onTouchEnd={(e) => { e.preventDefault(); setShowLogo(!showLogo); }}
              >
                {/* 로고 레이어 (호버 또는 클릭 시 보임) */}
                <div className={`absolute inset-0 z-10 transition-opacity duration-300 ease-in-out flex items-center justify-center bg-white dark:bg-gray-800 rounded-full ${showLogo ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                  <img
                    src={logoImage}
                    alt="한국이름학교 로고"
                    className="w-[150%] h-[150%] object-cover rounded-full"
                  />
                </div>

                {/* 텍스트 레이어 (기본 보임, 호버 또는 클릭 시 숨김) */}
                <div className={`flex flex-col items-center justify-center transition-opacity duration-300 ease-in-out ${showLogo ? 'opacity-0' : 'opacity-100 group-hover:opacity-0'}`}>
                  <h3 className="text-[26px] md:text-[32px] font-black tracking-tighter text-[#18a999] mb-2 select-none">
                    한국이름학교
                  </h3>
                  <div className="w-10 h-[3px] bg-[#18a999]/40 my-2 rounded-full" />
                  <p className="text-[12px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-[0.4em] select-none">
                    Identity
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 주변 노드들 */}
          <div className="absolute inset-0 w-full h-full">
            {nodes.map((node) => (
              <CircleNode key={node.key} node={node} radius={radius} />
            ))}
          </div>
        </div>

        {/* 두 번의 확인, 평생의 안심 */}
        <div className="mt-8 lg:mt-24">
          {/* 섹션 타이틀 영역 */}
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-foreground flex items-center justify-center gap-2 flex-wrap">
              <Lock size={28} className="text-[#2dd4bf]" strokeWidth={2.5} />
              <span>두 번의 확인으로 완성되는 <span className="text-[#2dd4bf]">평생의 안심</span></span>
            </h2>
            <p className="mt-3 text-gray-500 dark:text-muted-foreground text-sm md:text-base">
              철저한 검증 시스템으로 이름에 대한 확신을 드립니다.
            </p>
          </div>

          {/* 카드 분할 영역 (Grid Layout) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 좌측 카드: STEP 01 */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-100 dark:border-gray-700 shadow-[0_10px_30px_rgba(0,0,0,0.05)] hover:shadow-[0_10px_40px_rgba(45,212,191,0.15)] transition-all duration-300 transform hover:-translate-y-1">
              <div className="flex flex-col items-center text-center">
                <span className="text-[15px] md:text-[16px] font-bold tracking-widest mb-4 px-4 py-2 rounded-full bg-teal-50 dark:bg-teal-900/30 text-[#2dd4bf]">
                  STEP 01
                </span>
                <h3 className="text-[21px] md:text-[22px] font-semibold text-gray-900 dark:text-foreground mb-3 break-keep">
                  상담·개명 후기 기반<br/>1차 검증
                </h3>
                <p className="text-lg leading-relaxed text-gray-700 dark:text-muted-foreground break-keep">
                  실제 고객들의 데이터를 바탕으로<br/>
                  검증된 만족도를 확인합니다.
                </p>
              </div>
            </div>

            {/* 우측 카드: STEP 02 */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-100 dark:border-gray-700 shadow-[0_10px_30px_rgba(0,0,0,0.05)] hover:shadow-[0_10px_40px_rgba(45,212,191,0.15)] transition-all duration-300 transform hover:-translate-y-1">
              <div className="flex flex-col items-center text-center">
                <span className="text-[15px] md:text-[16px] font-bold tracking-widest mb-4 px-4 py-2 rounded-full bg-teal-50 dark:bg-teal-900/30 text-[#2dd4bf]">
                  STEP 02
                </span>
                <h3 className="text-[21px] md:text-[22px] font-semibold text-gray-900 dark:text-foreground mb-3 break-keep">
                  이름만으로 운명상담 통해<br/>2차 검증
                </h3>
                <p className="text-lg leading-relaxed text-gray-700 dark:text-muted-foreground break-keep">
                  이름 속에 담긴 운명의 흐름을<br/>
                  정밀하게 분석하여 증명합니다.
                </p>
              </div>
            </div>
          </div>

          {/* 한국이름학교 중앙 강조 (모바일) */}
          <div className="lg:hidden mt-10 flex justify-center">
            <div 
              className="relative w-40 h-40 rounded-full bg-white dark:bg-gray-800 border-2 border-[#2dd4bf]/30 shadow-lg flex items-center justify-center cursor-pointer overflow-hidden"
              onClick={() => setShowLogo(!showLogo)}
            >
              <div className={`absolute inset-0 z-10 transition-opacity duration-300 ease-in-out flex items-center justify-center bg-white dark:bg-gray-800 rounded-full ${showLogo ? 'opacity-100' : 'opacity-0'}`}>
                <img
                  src={logoImage}
                  alt="한국이름학교 로고"
                  className="w-[140%] h-[140%] object-cover rounded-full"
                />
              </div>
              <div className={`flex flex-col items-center justify-center transition-opacity duration-300 ${showLogo ? 'opacity-0' : 'opacity-100'}`}>
                <span className="text-[20px] font-black text-[#18a999] tracking-tight">한국이름학교</span>
                <div className="w-8 h-[2px] bg-[#18a999]/40 my-2 rounded-full" />
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.3em]">Identity</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
