import { ServiceCard } from '../ServiceCard'
import { Sparkles } from 'lucide-react'

export default function ServiceCardExample() {
  return (
    <ServiceCard
      icon={Sparkles}
      title="이름 분석"
      description="당신의 이름에 담긴 의미와 운세를 전문적으로 분석해드립니다."
      onClick={() => console.log('Service card clicked')}
    />
  )
}
