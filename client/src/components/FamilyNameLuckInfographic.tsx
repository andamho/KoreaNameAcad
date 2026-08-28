// 등본상 가족 상담 원칙 팝업 맨 위 그림.
//
// 예전에는 1.2MB PNG 라 팝업을 열고 한참 뒤에야 떴다. 같은 그림을 WebP 로
// 바꿔 75KB 가 됐다(16배). 화면에는 315px 로 그려지는데 파일만 컸던 것이다.
// PNG 원본은 그대로 두었다 — 혹시 다른 데서 쓸 수 있어서다.
import familyRuleImg from "@/assets/family-consulting-rule.webp";

export function FamilyNameLuckInfographic() {
  return (
    <img
      src={familyRuleImg}
      alt="가족과 함께 나누는 이름운"
      className="w-full rounded-2xl"
      width={768}
      height={1376}
      fetchPriority="high"
      loading="eager"
      decoding="sync"
    />
  );
}
