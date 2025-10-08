import { ConsultationForm } from '../ConsultationForm'
import { Toaster } from '@/components/ui/toaster'

export default function ConsultationFormExample() {
  return (
    <>
      <ConsultationForm type="analysis" />
      <Toaster />
    </>
  )
}
