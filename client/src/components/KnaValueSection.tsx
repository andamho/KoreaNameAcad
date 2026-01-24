import React, { useState, useEffect, useRef } from "react";
import { Scale, Link2, Lock } from "lucide-react";
import { Link } from "wouter";
import logoImage from "@assets/file_000000009b2c7206ad0a70c0142cb99a_1766915164756.png";
import wingLogoImage from "@assets/KakaoTalk_20260116_215645320_1768568272743.jpg";
import { clearScrollPosition } from "@/hooks/use-scroll-restore";

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

const iconProps = "w-10 h-10 text-gray-700 dark:text-gray-300 mb-3";
const mobileIconProps = "w-10 h-10 text-gray-700 dark:text-gray-300";

type Node = {
  key: string;
  title: string;
  mobileTitle?: string;
  body: string;
  angle: number;
  icon: React.ReactNode;
  mobileIcon: React.ReactNode;
  textSide: "right" | "left";
  textAlign: "left" | "right";
};

const nodes: Node[] = [
  {
    key: "trust",
    title: "신뢰의 증거",
    body: "전국 최다 후기로\n검증된 만족도를 확인하세요",
    angle: 0,
    icon: <ShieldIcon className={iconProps} />,
    mobileIcon: <ShieldIcon className={mobileIconProps} />,
    textSide: "right",
    textAlign: "left",
  },
  {
    key: "root",
    title: "근본 원인\n발견",
    body: "반복되는 어려움의 이유를\n이름에서 명확히 찾아드립니다",
    angle: 300,
    icon: <SearchIcon className={iconProps} />,
    mobileIcon: <SearchIcon className={mobileIconProps} />,
    textSide: "left",
    textAlign: "right",
  },
  {
    key: "match",
    title: "이름 · 삶\n일치 증명",
    body: "이름대로 살고 있음을\n구체적으로 보여드립니다.",
    angle: 60,
    icon: <Scale className={iconProps} strokeWidth={1.5} />,
    mobileIcon: <Scale className={mobileIconProps} strokeWidth={1.5} />,
    textSide: "right",
    textAlign: "left",
  },
  {
    key: "rename",
    title: "개명 전·후\n삶 증명",
    body: "개명하셨다면 전·후 이름대로\n살았다는 걸 증명해드립니다.",
    angle: 240,
    icon: <Link2 className={iconProps} strokeWidth={1.5} />,
    mobileIcon: <Link2 className={mobileIconProps} strokeWidth={1.5} />,
    textSide: "left",
    textAlign: "right",
  },
  {
    key: "family",
    title: "가족 이해\n향상",
    body: "이름을 통해 서로의 장점과\n문제의 뿌리를 알아 관계가 개선됩니다.",
    angle: 120,
    icon: <FamilyIcon className={iconProps} />,
    mobileIcon: <FamilyIcon className={mobileIconProps} />,
    textSide: "right",
    textAlign: "left",
  },
  {
    key: "talent",
    title: "강점과 재능 발견",
    mobileTitle: "강점·재능\n발견",
    body: "미처 몰랐던\n본연의 장점을 알려드립니다.",
    angle: 180,
    icon: <SparkIcon className={iconProps} />,
    mobileIcon: <SparkIcon className={mobileIconProps} />,
    textSide: "right",
    textAlign: "left",
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
        <div className="rounded-full border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-[6px] shadow-lg group-hover:border-[#7EE8E2] transition-colors">
          <div className="w-32 h-32 md:w-44 md:h-44 rounded-full bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 shadow-md flex flex-col items-center justify-center p-4 text-center">
            <div className="mb-2">{node.icon}</div>
            <span className="text-gray-900 dark:text-foreground font-semibold text-[21px] md:text-[22px] leading-tight whitespace-pre-line tracking-tight">
              {node.title}
            </span>
          </div>
        </div>
      </div>

      <div
        className={`hidden lg:flex absolute flex-col w-[300px] ${textPosClass} ${textAlignClass} transition-transform duration-300 group-hover:scale-105`}
      >
        <div className="text-gray-700 dark:text-muted-foreground text-lg leading-relaxed whitespace-pre-line break-keep">
          {node.body}
        </div>
      </div>
    </div>
  );
}

function MobileCircleItem({ node }: { node: Node }) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      {
        threshold: 0.6,
        rootMargin: "-10% 0px -30% 0px",
      }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="flex flex-col items-center text-center transition-all duration-500">
      <div 
        className={`w-32 h-32 rounded-full bg-white dark:bg-gray-800 border-[3px] shadow-lg flex flex-col items-center justify-center p-4 mb-5 transition-all duration-500 ${
          isVisible 
            ? 'border-[#7EE8E2] scale-[0.99] shadow-[0_0_30px_rgba(126,232,226,0.3)]' 
            : 'border-gray-200 dark:border-gray-600 scale-100'
        }`}
      >
        <div className="mb-2">{node.mobileIcon}</div>
        <span 
          className={`text-gray-900 dark:text-foreground font-semibold leading-tight whitespace-pre-line tracking-tight transition-all duration-500 text-center ${
            isVisible ? 'text-[20px]' : 'text-[21px]'
          }`}
        >
          {node.mobileTitle || node.title}
        </span>
      </div>
      <p 
        className={`leading-relaxed break-keep max-w-[320px] transition-all duration-500 text-lg origin-top whitespace-pre-line ${
          isVisible 
            ? 'text-gray-800 dark:text-gray-200 scale-[0.95]' 
            : 'text-gray-600 dark:text-muted-foreground scale-100'
        }`}
      >
        {node.body}
      </p>
    </div>
  );
}

function MobileCenterLogo() {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      {
        threshold: 0.6,
        rootMargin: "-10% 0px -30% 0px",
      }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="flex justify-center">
      <div 
        className={`relative w-40 h-40 rounded-full bg-white dark:bg-gray-800 border-[3px] border-gray-200 dark:border-gray-600 shadow-lg flex items-center justify-center overflow-hidden transition-all duration-500 ${
          isVisible 
            ? 'scale-[0.99] shadow-[0_0_30px_rgba(0,0,0,0.1)]' 
            : 'scale-100'
        }`}
      >
        {/* 로고 레이어 - 스크롤 시 선명하게 나타남 (데스크탑과 동일) */}
        <div className={`absolute inset-0 z-10 transition-all duration-700 ease-out flex items-center justify-center bg-white dark:bg-gray-800 rounded-full ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}>
          <img
            src={wingLogoImage}
            alt="한국이름학교 로고"
            className="w-full h-full object-contain"
          />
        </div>
        
        {/* 텍스트 레이어 - 스크롤 전에만 표시 */}
        <div className={`flex flex-col items-center justify-center transition-opacity duration-500 ease-in-out ${isVisible ? 'opacity-0' : 'opacity-100'}`}>
          <span className="font-black text-[#18a999] tracking-tight text-[18px]">
            한국이름학교
          </span>
          <div className="w-8 h-[2px] bg-[#18a999]/40 my-1.5 rounded-full" />
          <p className="text-[9px] text-gray-400 font-bold uppercase tracking-[0.3em]">Identity</p>
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

      <div className="relative mx-auto max-w-6xl px-6 pt-24 pb-24 lg:pt-48 lg:pb-48 lg:px-8">
        {/* 헤더 */}
        <header className="relative z-10 text-left mb-16 lg:mb-24">
          <p className="text-sm font-medium tracking-wide text-gray-500 dark:text-gray-400 mb-2">WHY CHOOSE US</p>
          <h2 className="text-[#18a999] text-[25px] sm:text-3xl md:text-4xl font-extrabold tracking-tight">
            알면 알수록, 한국이름학교
          </h2>
          <p className="mt-3 text-lg text-gray-700 dark:text-muted-foreground">
            전국 최다 후기로 검증된, 가장 신뢰받는 이름 분석
          </p>
        </header>

        {/* 모바일 레이아웃: 세로 원형 배치 (lg 미만) */}
        <div className="lg:hidden space-y-12 mb-16">
          {nodes.map((node) => (
            <MobileCircleItem key={node.key} node={node} />
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
                {/* 로고 레이어 */}
                <div className={`absolute inset-0 z-10 transition-all duration-500 ease-out flex items-center justify-center bg-white dark:bg-gray-800 rounded-full ${showLogo ? 'opacity-100 scale-100' : 'opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100'}`}>
                  <img
                    src={wingLogoImage}
                    alt="한국이름학교 로고"
                    className="w-full h-full object-contain"
                  />
                </div>

                {/* 텍스트 레이어 */}
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

        {/* 한국이름학교 중앙 원형 (모바일) - 두 번의 확인 위에 배치 */}
        <div className="lg:hidden pb-12">
          <MobileCenterLogo />
        </div>

        {/* 두 번의 확인, 평생의 안심 */}
        <div className="pt-12 lg:pt-0 lg:mt-24">
          {/* 섹션 타이틀 영역 */}
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-foreground flex items-center justify-center gap-2 flex-wrap">
              <Lock size={28} className="text-[#2dd4bf]" strokeWidth={2.5} />
              <span>두 번의 확인, <span className="text-[#2dd4bf]">평생의 안심</span></span>
            </h2>
            <p className="mt-3 text-gray-500 dark:text-muted-foreground text-sm md:text-base">
              철저한 검증 시스템으로 이름에 대한 확신을 드립니다.
            </p>
          </div>

          {/* 카드 분할 영역 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* STEP 01 */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-100 dark:border-gray-700 shadow-[0_10px_30px_rgba(0,0,0,0.05)] hover:shadow-[0_10px_40px_rgba(45,212,191,0.15)] transition-all duration-300 transform hover:-translate-y-1">
              <div className="flex flex-col items-center text-center">
                <span className="step-label text-[15px] md:text-[16px] font-bold tracking-widest mb-4 px-4 py-2 rounded-full bg-teal-50 dark:bg-teal-900/30 text-[#2dd4bf]">
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

            {/* STEP 02 */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-100 dark:border-gray-700 shadow-[0_10px_30px_rgba(0,0,0,0.05)] hover:shadow-[0_10px_40px_rgba(45,212,191,0.15)] transition-all duration-300 transform hover:-translate-y-1">
              <div className="flex flex-col items-center text-center">
                <span className="step-label text-[15px] md:text-[16px] font-bold tracking-widest mb-4 px-4 py-2 rounded-full bg-teal-50 dark:bg-teal-900/30 text-[#2dd4bf]">
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

          {/* 버튼 영역 */}
          <div className="flex items-center gap-4 mt-10">
            <Link to="/reviews" onClick={() => clearScrollPosition("/reviews")} className="inline-flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition">
              1차 후기 보기 <span className="ml-0.5">›</span>
            </Link>
            <Link to="/services" className="inline-flex items-center justify-center rounded-full bg-gray-900 dark:bg-white px-4 py-1.5 text-sm font-medium text-white dark:text-gray-900 transition hover:bg-gray-800 dark:hover:bg-gray-100">
              2차 지금 신청 <span className="ml-1">›</span>
            </Link>
          </div>

        </div>
      </div>
    </section>
  );
}
