// 검색엔진용 FAQ 표시(2026-11-01 대표님): 화면에는 안 보이고, 구글·AI 검색이 질문과 답으로 알아보게 하는 schema.org FAQPage 정보.
export function FaqLd({ items }: { items: { q: string; a: string }[] }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({ "@type": "Question", name: it.q, acceptedAnswer: { "@type": "Answer", text: it.a } })),
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}
