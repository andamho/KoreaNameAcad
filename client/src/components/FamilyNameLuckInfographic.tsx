export function FamilyNameLuckInfographic() {
  return (
    <div className="relative w-full rounded-2xl overflow-hidden" style={{ aspectRatio: '1398/768' }}>
      <img
        src="/family-consulting-rule.webp"
        alt="가족과 함께 나누는 이름운"
        className="absolute inset-0 w-full h-full object-cover"
      />

      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 1398 768"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="goldGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f5e076" />
            <stop offset="50%" stopColor="#d4af37" />
            <stop offset="100%" stopColor="#c9a96e" />
          </linearGradient>
        </defs>

        {/* 타이틀 */}
        <text x="44" y="44" fontSize="34" fontWeight="800" fill="#1a2535" fontFamily="sans-serif">
          가족과 함께 나누는 이름운
        </text>

        {/* 왼쪽 배지 텍스트 - 기존 이미지 배지 안에 삽입 */}
        <text x="268" y="79" fontSize="16" fontWeight="600" fill="white" fontFamily="sans-serif" textAnchor="middle">
          결혼할 때
        </text>

        {/* 오른쪽 배지 텍스트 - 기존 이미지 배지 안에 삽입 */}
        <text x="862" y="79" fontSize="16" fontWeight="600" fill="white" fontFamily="sans-serif" textAnchor="middle">
          출산할 때
        </text>

        {/* 숫자 배지 - 왼쪽 패널 */}
        <rect x="22" y="100" width="26" height="26" rx="5" fill="#c9a570" />
        <text x="35" y="118" fontSize="15" fontWeight="700" fill="white" fontFamily="sans-serif" textAnchor="middle">1</text>

        <rect x="320" y="100" width="26" height="26" rx="5" fill="#c9a570" />
        <text x="333" y="118" fontSize="15" fontWeight="700" fill="white" fontFamily="sans-serif" textAnchor="middle">2</text>

        {/* 숫자 배지 - 오른쪽 패널 */}
        <rect x="688" y="100" width="26" height="26" rx="5" fill="#c9a570" />
        <text x="701" y="118" fontSize="15" fontWeight="700" fill="white" fontFamily="sans-serif" textAnchor="middle">1</text>

        <rect x="983" y="100" width="26" height="26" rx="5" fill="#c9a570" />
        <text x="996" y="118" fontSize="15" fontWeight="700" fill="white" fontFamily="sans-serif" textAnchor="middle">2</text>

        {/* 캡션 - 왼쪽 패널 */}
        <text x="160" y="466" fontSize="13" fill="white" fontFamily="sans-serif" textAnchor="middle">아내가 사온 소파</text>
        <text x="450" y="466" fontSize="13" fill="white" fontFamily="sans-serif" textAnchor="middle">남편도 당연히 앉죠</text>

        {/* 캡션 - 오른쪽 패널 */}
        <text x="810" y="456" fontSize="13" fill="white" fontFamily="sans-serif" textAnchor="middle">아이 태어날 때</text>
        <text x="810" y="473" fontSize="13" fill="white" fontFamily="sans-serif" textAnchor="middle">갖고 온 냉장고</text>
        <text x="1145" y="466" fontSize="13" fill="white" fontFamily="sans-serif" textAnchor="middle">엄마 아빠도 당연히 씁니다</text>

        {/* 하단 배너 - 이름운 대형 */}
        <text x="175" y="638" fontSize="88" fontWeight="900" fontStyle="italic" fill="url(#goldGrad)" fontFamily="sans-serif">이름</text>
        <text x="205" y="730" fontSize="88" fontWeight="900" fontStyle="italic" fill="url(#goldGrad)" fontFamily="sans-serif">운</text>

        {/* 하단 배너 - 중앙 텍스트 */}
        <text x="350" y="578" fontSize="20" fontWeight="700" fill="#d4af37" fontFamily="sans-serif">이름운</text>
        <text x="350" y="604" fontSize="14" fill="#c9a96e" fontFamily="sans-serif">(NAME LUCK)</text>
        <text x="350" y="642" fontSize="14" fill="white" fontFamily="sans-serif">각자 갖고 오는 운이 있어요</text>
        <text x="350" y="666" fontSize="14" fill="white" fontFamily="sans-serif">그 운, 가족이 함께 나눠 씁니다.</text>
      </svg>
    </div>
  );
}
