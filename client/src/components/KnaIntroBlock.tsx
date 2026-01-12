import { Star } from "lucide-react";
import { Lightbulb } from "@phosphor-icons/react";
import { useState } from "react";

export default function KnaIntroBlock() {
  return (
    <>
      {/* SECTION 1: 상단 소개 (사선 처리) */}
      <section 
        className="kna-intro-block relative overflow-hidden text-white"
        style={{
          background: 'linear-gradient(135deg, #141E30 0%, #243B55 100%)',
          clipPath: 'polygon(0 0, 100% 0, 100% 85%, 0 100%)',
          paddingBottom: '180px',
        }}
      >
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[#2FB5B5]/15 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[#2FB5B5]/10 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6 pt-24 pb-8 lg:px-8">
          <header className="mx-auto max-w-3xl text-center mb-16">
            <h2 className="text-[#56D5DB] text-[28px] font-extrabold leading-tight sm:text-3xl md:text-4xl break-keep">
              열심히 노력하며 살아가지만
            </h2>
            <p className="mt-4 text-lg md:text-xl text-white/90 break-keep">
              삶이 뜻대로 풀리지 않아 답답하신 마음을 잘 압니다
            </p>
          </header>

          <div className="grid items-center gap-12 md:gap-16 lg:gap-20 md:grid-cols-2 max-w-6xl mx-auto">
            {/* Left: 신뢰 문구 + 슬로건 + SNS */}
            <div className="order-2 md:order-1 text-center md:text-left">
              <p className="text-lg md:text-xl leading-[1.8] text-white/90 mb-10">
                한국이름학교는<br />
                <strong className="text-white text-[22px] border-b-2 border-[#2FB5B5]/50">18년간 45만 명</strong>의 임상 경험을 바탕으로,<br />
                사주 없이 <strong className="text-white text-[22px] border-b-2 border-[#2FB5B5]/50">한글·한자 이름만으로</strong><br />
                <strong className="text-white text-[22px] border-b-2 border-[#2FB5B5]/50">80% 이상의 정확도</strong>를 갖춘<br />
                운명상담을 제공합니다.
              </p>
              
              {/* 슬로건 영역 */}
              <div className="border-l-4 border-[#56D5DB] pl-6 mb-10 text-left">
                <p className="text-2xl font-bold text-white/95 mb-2 break-keep tracking-tight">
                  이름대로 삽니다.
                </p>
                <p className="text-2xl font-bold text-white/95 mb-4 break-keep tracking-tight">
                  이름을 바꾸면, 삶이 바뀝니다.
                </p>
                <p className="text-2xl font-extrabold text-[#56D5DB] break-keep leading-snug">
                  이름은 희망입니다.
                </p>
              </div>
              
              {/* SNS 팔로워 */}
              <div className="inline-flex items-start gap-3 bg-white/10 backdrop-blur-sm px-5 py-4 rounded-xl">
                <span className="text-yellow-400 text-lg">⭐</span>
                <p className="text-[15px] text-white/80 text-left">
                  이미 SNS 팔로워 <b className="text-white">5만 명</b>이 관심을 가지고 있습니다.<br />
                  <span className="text-[13px] text-white/60">(200만 뷰 이상 조회수 다수)</span>
                </p>
              </div>
            </div>

            {/* Right: 실제 후기 박스 */}
            <div className="order-1 md:order-2 mt-8">
              <div className="relative rounded-2xl bg-white/95 p-10 pt-14 pb-14 shadow-2xl text-gray-800">
                {/* 전구 아이콘 */}
                <div className="absolute -top-9 left-1/2 -translate-x-1/2 w-[70px] h-[70px] rounded-full bg-[#2FB5B5] flex items-center justify-center shadow-lg border-4 border-white z-10">
                  <Lightbulb size={32} weight="fill" color="white" />
                </div>
                
                {/* 큰 따옴표 - 상단 */}
                <div className="absolute top-10 left-7 text-[#8FD8D8] text-[80px] leading-none font-serif select-none" aria-hidden="true">
                  "
                </div>
                
                {/* 후기 리스트 */}
                <div className="space-y-3 relative z-10 mt-5 mb-5">
                  <Testimonial quote="내 삶을 조종한 건 이름이었다니!" />
                  <Testimonial quote="개명 전후, 정말 이름대로 살아왔네요." />
                  <Testimonial quote="개명 후 6년, 세상에서 가장 행복한 사람" />
                </div>
                
                {/* 큰 따옴표 - 하단 */}
                <div className="absolute bottom-2 right-7 text-[#8FD8D8] text-[80px] leading-none font-serif select-none" aria-hidden="true">
                  "
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: 운명 카드 (하단) */}
      <section 
        className="relative text-white"
        style={{
          background: '#0f2027',
          marginTop: '-100px',
          paddingTop: '130px',
          paddingBottom: '80px',
        }}
      >
        {/* 배경 빛 효과 */}
        <div 
          className="absolute pointer-events-none"
          style={{
            top: '-20%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '80%',
            height: '80%',
            background: 'radial-gradient(circle, rgba(47,181,181,0.15) 0%, rgba(0,0,0,0) 70%)',
          }}
        />

        <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
          <header className="text-center mb-14">
            <h3 className="text-[28px] md:text-[32px] font-extrabold text-white mb-4 break-keep">
              내 삶, 어디가 막혀 있을까요?
            </h3>
            <p className="text-white/70 text-base md:text-lg">
              카드를 뒤집어 내 이름 속에 숨겨진 운명의 비밀을 확인해보세요.
            </p>
          </header>

          <div className="grid gap-8 md:grid-cols-3 max-w-5xl mx-auto" style={{ perspective: '1000px' }}>
            <FateCard 
              icon="💰"
              question="아무리 열심히 일해도 통장이 자꾸 비어가나요?"
              backIcon="🔑"
              title="새는 재물운을 막으세요"
              answer={<>이름에 재물운이 약하거나 재물이 새어나가는 운을 가지고 있습니다.<br/><br/>당신에게 맞는 <span className="text-[#2FB5B5] font-bold">부(富)의 기운</span>을 채워 돈이 모이는 구조로 바꿔 드립니다.</>}
            />
            <FateCard 
              icon="💔"
              question="믿었던 사람에게 상처받고 늘 혼자라고 느끼시나요?"
              backIcon="🤝"
              title="고독한 기운을 푸세요"
              answer={<>이름 속 강한 고독운이 사람을 밀어낼 수 있습니다.<br/><br/>부족한 <span className="text-[#2FB5B5] font-bold">인복과 인기운</span>을 보완하면 귀인이 찾아오기 시작합니다.</>}
            />
            <FateCard 
              icon="🧭"
              question="이유 없이 불안하고 앞길이 막막하신가요?"
              backIcon="🌟"
              title="나만의 길을 찾으세요"
              answer={<>나와 맞지 않는 이름은 삶을 혼란스럽게 합니다.<br/><br/>기존의 이름운과 희망 사항까지 반영한 <span className="text-[#2FB5B5] font-bold">딱 맞는 맞춤 이름</span>으로 삶의 명확한 방향을 찾아드립니다.</>}
            />
          </div>
        </div>
      </section>
    </>
  );
}

function Testimonial({ quote }: { quote: string }) {
  return (
    <figure className="rounded-xl border border-gray-100 bg-white p-4 md:p-5 shadow-sm transition-all duration-200 hover:translate-x-1 hover:border-[#2FB5B5] cursor-default">
      <blockquote className="text-base md:text-lg font-semibold text-gray-600">{quote}</blockquote>
    </figure>
  );
}

function FateCard({ 
  icon, 
  question, 
  backIcon, 
  title, 
  answer 
}: { 
  icon: string; 
  question: string; 
  backIcon: string;
  title: string;
  answer: React.ReactNode;
}) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div 
      className="h-[420px] md:h-[440px] cursor-pointer"
      onMouseEnter={() => setIsFlipped(true)}
      onMouseLeave={() => setIsFlipped(false)}
      onClick={() => setIsFlipped(!isFlipped)}
    >
      <div 
        className="relative w-full h-full transition-transform duration-700 rounded-2xl shadow-2xl"
        style={{ 
          transformStyle: 'preserve-3d',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* Front */}
        <div 
          className="absolute w-full h-full rounded-2xl p-8 md:p-10 flex flex-col justify-center items-center text-center"
          style={{ 
            backfaceVisibility: 'hidden',
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <div className="text-5xl mb-8 opacity-90">{icon}</div>
          <h3 className="text-xl md:text-[22px] font-bold text-white leading-snug mb-6 break-keep">
            "{question}"
          </h3>
          <p className="text-sm text-[#2FB5B5] font-semibold mt-auto animate-bounce">
            👆 마우스를 올려 해답 보기
          </p>
        </div>
        
        {/* Back */}
        <div 
          className="absolute w-full h-full rounded-2xl p-8 md:p-10 flex flex-col justify-center items-center text-center bg-white border-4 border-[#2FB5B5]"
          style={{ 
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          <div className="text-4xl mb-5 text-[#2FB5B5]">{backIcon}</div>
          <h3 className="text-xl md:text-[22px] font-extrabold text-gray-900 mb-4 break-keep">
            {title}
          </h3>
          <p className="text-base text-gray-600 leading-relaxed break-keep tracking-tight">
            {answer}
          </p>
        </div>
      </div>
    </div>
  );
}
