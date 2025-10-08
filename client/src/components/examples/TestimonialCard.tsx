import { TestimonialCard } from '../TestimonialCard'

export default function TestimonialCardExample() {
  return (
    <TestimonialCard
      name="김민수"
      service="이름 분석"
      content="이름 분석을 통해 제 이름에 담긴 의미를 깊이 이해할 수 있었습니다. 전문적이고 세심한 상담에 매우 만족합니다."
      rating={5}
    />
  )
}
