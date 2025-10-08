import { StoryCard } from '../StoryCard'

export default function StoryCardExample() {
  return (
    <StoryCard
      title="이름에 담긴 부모의 마음"
      excerpt="이름은 단순한 호칭이 아닙니다. 부모가 자녀에게 주는 첫 번째 선물이자, 평생을 함께할 정체성입니다. 한국 전통 작명법에서는..."
      category="전통"
      onClick={() => console.log('Story clicked')}
    />
  )
}
