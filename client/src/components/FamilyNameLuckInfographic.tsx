export function FamilyNameLuckInfographic() {
  return (
    <div className="relative w-full rounded-2xl overflow-hidden" style={{ aspectRatio: '1398/768' }}>
      <img
        src="/family-consulting-rule.webp"
        alt="가족과 함께 나누는 이름운"
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* SVG 텍스트 오버레이 - viewBox 좌표계로 완벽 스케일 */}
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

        {/* ── 타이틀 ── */}
        <text x="56" y="48" fontSize="30" fontWeight="800" fill="#1e2d3d" fontFamily="sans-serif" letterSpacing="-0.5">
          가족과 함께 나누는 이름운
        </text>

        {/* ── 왼쪽 패널 배지: 결혼할 때 ── */}
        <rect x="160" y="57" width="200" height="34" rx="17" fill="#0c3530" />
        <text x="260" y="80" fontSize="15" fontWeight="600" fill="white" fontFamily="sans-serif" textAnchor="middle">
          💍 결혼할 때
        </text>

        {/* ── 오른쪽 패널 배지: 출산할 때 ── */}
        <rect x="852" y="57" width="200" height="34" rx="17" fill="#0c3530" />
        <text x="952" y="80" fontSize="15" fontWeight="600" fill="white" fontFamily="sans-serif" textAnchor="middle">
          👶 출산할 때
        </text>

        {/* ── 숫자 배지 ── */}
        {/* 왼쪽 패널 1 */}
        <rect x="22" y="100" width="26" height="26" rx="5" fill="#c9a570" />
        <text x="35" y="118" fontSize="15" fontWeight="700" fill="white" fontFamily="sans-serif" textAnchor="middle">1</text>

        {/* 왼쪽 패널 2 */}
        <rect x="320" y="100" width="26" height="26" rx="5" fill="#c9a570" />
        <text x="333" y="118" fontSize="15" fontWeight="700" fill="white" fontFamily="sans-serif" textAnchor="middle">2</text>

        {/* 오른쪽 패널 1 */}
        <rect x="690" y="100" width="26" height="26" rx="5" fill="#c9a570" />
        <text x="703" y="118" fontSize="15" fontWeight="700" fill="white" fontFamily="sans-serif" textAnchor="middle">1</text>

        {/* 오른쪽 패널 2 */}
        <rect x="988" y="100" width="26" height="26" rx="5" fill="#c9a570" />
        <text x="1001" y="118" fontSize="15" fontWeight="700" fill="white" fontFamily="sans-serif" textAnchor="middle">2</text>

        {/* ── 캡션 ── */}
        <text x="168" y="468" fontSize="13" fill="white" fontFamily="sans-serif" textAnchor="middle">아내가 사온 소파</text>
        <text x="468" y="468" fontSize="13" fill="white" fontFamily="sans-serif" textAnchor="middle">남편도 당연히 앉죠</text>

        <text x="822" y="455" fontSize="13" fill="white" fontFamily="sans-serif" textAnchor="middle">아이 태어날 때</text>
        <text x="822" y="472" fontSize="13" fill="white" fontFamily="sans-serif" textAnchor="middle">갖고 온 냉장고</text>
        <text x="1155" y="468" fontSize="13" fill="white" fontFamily="sans-serif" textAnchor="middle">엄마 아빠도 당연히 씁니다</text>

        {/* ── 하단 배너: 이름운 대형 텍스트 ── */}
        <text x="228" y="635" fontSize="58" fontWeight="900" fontStyle="italic" fill="url(#goldGrad)" fontFamily="sans-serif">이름</text>
        <text x="245" y="710" fontSize="58" fontWeight="900" fontStyle="italic" fill="url(#goldGrad)" fontFamily="sans-serif">운</text>

        {/* ── 하단 배너: 이름운 타이틀 + 설명 ── */}
        <text x="390" y="585" fontSize="20" fontWeight="700" fill="#d4af37" fontFamily="sans-serif">이름운</text>
        <text x="390" y="612" fontSize="13" fill="#c9a96e" fontFamily="sans-serif">(NAME LUCK)</text>
        <text x="390" y="648" fontSize="14" fill="white" fontFamily="sans-serif">각자 갖고 오는 운이 있어요</text>
        <text x="390" y="672" fontSize="14" fill="white" fontFamily="sans-serif">그 운, 가족이 함께 나눠 씁니다.</text>
      </svg>
    </div>
  );
}
