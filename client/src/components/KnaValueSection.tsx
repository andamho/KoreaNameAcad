import React, { useState } from "react";
import { Scale, Link2 } from "lucide-react";
import logoImage from "@assets/file_000000009b2c7206ad0a70c0142cb99a_1766915164756.png";

// 기존 아이콘 컴포넌트들
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
        <header className="relative z-40 text-center mb-8">
          <h2 className="text-[#18a999] text-[25px] sm:text-3xl md:text-4xl font-extrabold tracking-tight">
            알면 알수록, 한국이름학교
          </h2>
          <p className="mt-3 text-lg text-gray-700 dark:text-muted-foreground">
            전국 최다 후기로 검증된,<br className="md:hidden" /> 가장 신뢰받는 이름 분석
          </p>
        </header>

        {/* 원형 다이어그램 */}
        <div className="relative w-full h-[600px] md:h-[800px] flex items-center justify-center">
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
                    className="w-full h-full object-cover rounded-full"
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

        {/* 두 번의 확인, 평생의 안심 - 기존 유지 */}
        <section className="mt-12 rounded-2xl border border-[#56D5DB] bg-[#56D5DB] p-6 shadow-lg shadow-[#56D5DB]/40 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[#56D5DB]/50">
          <h3 className="text-[21px] md:text-[22px] font-bold tracking-tight text-white break-keep flex items-center gap-2">
            <span className="animate-pulse-scale-white">
              <LockIcon className="h-6 w-6 md:h-7 md:w-7 flex-shrink-0" />
            </span>
            <span className="md:whitespace-nowrap">두 번의 확인, 평생의 안심</span>
          </h3>
          <ul className="mt-4 space-y-3">
            <li className="flex items-start gap-3">
              <span className="kna-value-badge inline-flex h-6 w-6 flex-none items-center justify-center rounded-full border-2 border-white text-sm font-bold text-white">
                1
              </span>
              <span className="kna-value-text text-lg text-white">
                상담·개명 후기 기반 1차 검증
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="kna-value-badge inline-flex h-6 w-6 flex-none items-center justify-center rounded-full border-2 border-white text-sm font-bold text-white">
                2
              </span>
              <span className="kna-value-text text-lg text-white">
                이름만으로 운명상담 통해 2차 검증
              </span>
            </li>
          </ul>
        </section>
      </div>
    </section>
  );
}
