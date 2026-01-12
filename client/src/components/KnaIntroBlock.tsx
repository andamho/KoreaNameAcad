import { Star } from "lucide-react";
import { Lightbulb } from "@phosphor-icons/react";
import { useState } from "react";

export default function KnaIntroBlock() {
  return (
    <>
      {/* SECTION 1: 상단 소개 (사선 처리) */}
      <section 
        className="kna-intro-block relative overflow-hidden text-white z-10"
        style={{
          background: 'linear-gradient(135deg, #141E30 0%, #243B55 100%)',
          clipPath: 'polygon(0 0, 100% 0, 100% 92%, 0 100%)',
          paddingBottom: '220px',
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

          <div className="grid items-center gap-8 md:gap-16 lg:gap-20 md:grid-cols-2 max-w-6xl mx-auto">
            {/* 1. 신뢰 문구 (모바일 첫번째) */}
            <div className="order-1 md:order-1 text-center md:text-left">
              <p className="text-lg md:text-xl leading-[1.8] text-white/90 md:mb-10">
                한국이름학교는<br />
                <strong className="text-white text-[22px] border-b-2 border-[#2FB5B5]/50">18년간 45만 명</strong>의 임상 경험을 바탕으로,<br />
                사주 없이 <strong className="text-white text-[22px] border-b-2 border-[#2FB5B5]/50">한글·한자 이름만으로</strong><br />
                <strong className="text-white text-[22px] border-b-2 border-[#2FB5B5]/50">80% 이상의 정확도</strong>를 갖춘<br />
                운명상담을 제공합니다.
              </p>
              
              {/* 슬로건 영역 - 데스크톱에서만 보임 */}
              <div className="hidden md:block border-l-4 border-[#56D5DB] pl-6 mb-10 text-left">
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
              
              {/* SNS 팔로워 - 데스크톱에서만 보임 */}
              <div className="hidden md:inline-flex items-start gap-3 bg-white/10 backdrop-blur-sm px-5 py-4 rounded-xl">
                <span className="text-yellow-400 text-lg">⭐</span>
                <p className="text-[15px] text-white/80 text-left">
                  이미 SNS 팔로워 <b className="text-white">5만 명</b>이 관심을 가지고 있습니다.<br />
                  <span className="text-[13px] text-white/60">(200만 뷰 이상 조회수 다수)</span>
                </p>
              </div>
            </div>

            {/* 2. 후기 박스 (모바일 두번째) */}
            <div className="order-2 md:order-2">
              <div className="relative rounded-2xl bg-white/95 p-8 pt-16 pb-16 shadow-2xl text-gray-800">
                {/* 전구 아이콘 */}
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full bg-[#56D5DB] flex items-center justify-center shadow-lg border-4 border-white z-10">
                  <Lightbulb size={24} weight="fill" color="white" />
                </div>
                
                {/* 큰 따옴표 - 상단 (SVG) */}
                <svg 
                  className="absolute top-8 left-5 w-8 h-8 text-[#56D5DB] opacity-80"
                  viewBox="0 0 24 24" 
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"/>
                </svg>
                
                {/* 후기 리스트 - 중앙 정렬 */}
                <div className="space-y-3 relative z-10 flex flex-col justify-center">
                  <Testimonial quote="내 삶을 조종한 건 이름이었다니!" />
                  <Testimonial quote="개명 전후, 정말 이름대로 살아왔네요." />
                  <Testimonial quote="개명 후 6년, 세상에서 가장 행복한 사람" />
                </div>
                
                {/* 큰 따옴표 - 하단 (SVG) */}
                <svg 
                  className="absolute bottom-8 right-5 w-8 h-8 text-[#56D5DB] opacity-80"
                  viewBox="0 0 24 24" 
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M9.983 3v7.391c0 5.704-3.731 9.57-8.983 10.609l-.995-2.151c2.432-.917 3.995-3.638 3.995-5.849h-4v-10h9.983zm14.017 0v7.391c0 5.704-3.748 9.57-9 10.609l-.996-2.151c2.433-.917 3.996-3.638 3.996-5.849h-3.983v-10h9.983z"/>
                </svg>
              </div>
            </div>

            {/* 3. 슬로건 영역 - 모바일에서만 보임 */}
            <div className="order-3 md:hidden border-l-4 border-[#56D5DB] pl-6 text-left">
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

            {/* 4. SNS 팔로워 - 모바일에서만 보임 */}
            <div className="order-4 md:hidden flex justify-center">
              <div className="inline-flex items-start gap-3 bg-white/10 backdrop-blur-sm px-5 py-4 rounded-xl">
                <span className="text-yellow-400 text-lg">⭐</span>
                <p className="text-[15px] text-white/80 text-left">
                  이미 SNS 팔로워 <b className="text-white">5만 명</b>이 관심을 가지고 있습니다.<br />
                  <span className="text-[13px] text-white/60">(200만 뷰 이상 조회수 다수)</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: 운명 카드 (하단) */}
      <section 
        className="relative text-white z-0"
        style={{
          background: '#0f2027',
          marginTop: '-350px',
          paddingTop: '380px',
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
