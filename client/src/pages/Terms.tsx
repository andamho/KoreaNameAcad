import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="pt-[100px] pb-16 legal-page-content">
        <div className="max-w-4xl mx-auto px-6">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-8">
            한국이름학교 | 와츠유어네임 이름연구협회 이용약관
          </h1>
          
          <div className="space-y-8 text-foreground">
            
            <section>
              <h2 className="text-xl font-bold mb-3">제1조 (목적)</h2>
              <p className="text-muted-foreground leading-relaxed">
                본 약관은 한국이름학교 및 와츠유어네임 이름연구협회(이하 "회사")가 제공하는 이름 관련 서비스의 이용과 관련하여 회사와 이용자 간의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">제2조 (용어의 정의)</h2>
              <ul className="space-y-3 text-muted-foreground leading-relaxed">
                <li>
                  <strong className="text-foreground">"서비스"</strong>란 회사가 제공하는 이름 분석·감명, 작명·개명, 전화번호 및 차량번호 분석·선별, 이름 관련 교육 및 콘텐츠 제공 등 일체의 용역 서비스를 의미합니다.
                </li>
                <li>
                  <strong className="text-foreground">"이용자"</strong>란 본 약관에 동의하고 회사의 서비스를 이용하는 회원 및 비회원을 말합니다.
                </li>
                <li>
                  <strong className="text-foreground">"작명 작업"</strong>이란 작명 및 개명을 위해 회사가 정보를 검토하고, 이름을 구상·구성·분석·정리하는 모든 행위를 포함합니다.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">제3조 (약관의 효력 및 변경)</h2>
              <ul className="space-y-3 text-muted-foreground leading-relaxed list-disc list-inside">
                <li>본 약관은 회사의 홈페이지 또는 서비스 화면에 게시함으로써 효력이 발생합니다.</li>
                <li>회사는 관련 법령을 위반하지 않는 범위 내에서 약관을 변경할 수 있으며, 변경 시 적용일자 및 변경 사유를 사전에 공지합니다.</li>
                <li>이용자가 변경된 약관에 동의하지 않을 경우 서비스 이용을 중단할 수 있으며, 변경된 약관의 효력 발생 이후 서비스를 계속 이용하는 경우에는 변경된 약관에 동의한 것으로 봅니다.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">제4조 (서비스의 제공)</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">회사는 다음과 같은 서비스를 제공합니다.</p>
              <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc list-inside mb-3">
                <li>이름 분석·감명 서비스</li>
                <li>작명·개명 서비스</li>
                <li>전화번호 및 차량번호 분석·선별 서비스</li>
                <li>이름 관련 교육 및 콘텐츠 제공</li>
                <li>기타 회사가 정하는 서비스</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed">
                회사는 서비스의 내용, 제공 방식 및 제공 시기를 필요에 따라 변경할 수 있으며, 이 경우 사전 또는 사후에 이를 공지할 수 있습니다.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">제5조 (서비스 이용 신청)</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                이용자는 회사가 정한 절차에 따라 서비스 이용을 신청할 수 있습니다.
              </p>
              <p className="text-muted-foreground leading-relaxed mb-2">회사는 다음 각 호에 해당하는 경우 서비스 제공을 제한하거나 거절할 수 있습니다.</p>
              <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc list-inside">
                <li>허위 정보 제공 또는 타인의 정보 도용</li>
                <li>서비스 목적에 부합하지 않는 요청</li>
                <li>회사의 운영에 현저한 지장을 초래하는 경우</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">제6조 (이용자의 의무)</h2>
              <p className="text-muted-foreground leading-relaxed mb-2">이용자는 다음 행위를 하여서는 안 됩니다.</p>
              <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc list-inside">
                <li>회사 또는 제3자의 저작권 및 지식재산권을 침해하는 행위</li>
                <li>서비스 결과물, 콘텐츠, 자료를 무단으로 복제·배포·상업적으로 이용하는 행위</li>
                <li>회사의 서비스 운영을 방해하거나 회사의 명예를 훼손하는 행위</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">제7조 (저작권 및 지식재산권)</h2>
              <ul className="space-y-3 text-muted-foreground leading-relaxed list-disc list-inside">
                <li>회사가 제공하는 모든 서비스 결과물, 분석 자료, 작명 결과, 교육 콘텐츠에 대한 저작권 및 지식재산권은 회사에 귀속됩니다.</li>
                <li>이용자는 회사의 사전 서면 동의 없이 이를 복제, 배포, 수정, 2차적 저작물로 이용할 수 없습니다.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">제8조 (결제 및 환불)</h2>
              <ul className="space-y-3 text-muted-foreground leading-relaxed list-disc list-inside">
                <li>유료 서비스의 요금, 결제 및 환불 기준은 본 약관에 따릅니다.</li>
                <li>상담 일정이 확정되거나 작명 작업이 개시된 이후에는(작명비 입금 후 즉시 작명 작업이 개시됩니다) 서비스의 특성상 환불이 불가합니다.</li>
                <li>본 조항은 맞춤형 용역 서비스의 특성을 반영한 것이며, 관계 법령에 따른 소비자 보호 규정이 우선 적용되는 경우에는 해당 법령을 따릅니다.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">제9조 (면책조항)</h2>
              <ul className="space-y-3 text-muted-foreground leading-relaxed list-disc list-inside">
                <li>회사가 제공하는 이름 분석·감명, 작명·개명, 번호 분석·선별 결과는 참고 자료이며, 법률·의료·재정 등 전문적 판단을 대체하지 않습니다.</li>
                <li>서비스 결과에 대한 최종 선택 및 그에 따른 책임은 이용자 본인에게 있습니다.</li>
                <li>회사는 천재지변, 시스템 장애, 기타 불가항력적 사유로 인한 서비스 중단에 대하여 책임을 지지 않습니다.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">제10조 (개인정보 보호)</h2>
              <p className="text-muted-foreground leading-relaxed">
                회사는 관련 법령에 따라 이용자의 개인정보를 보호하며, 개인정보의 수집·이용·보관에 관해서는 별도의 개인정보처리방침에 따릅니다.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">제11조 (분쟁 해결 및 관할)</h2>
              <ul className="space-y-3 text-muted-foreground leading-relaxed list-disc list-inside">
                <li>회사와 이용자 간 발생한 분쟁은 성실한 협의를 통해 해결하도록 합니다.</li>
                <li>협의가 이루어지지 않을 경우, 관할 법원은 회사의 본점 소재지를 따릅니다.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">제12조 (준거법)</h2>
              <p className="text-muted-foreground leading-relaxed">
                본 약관은 대한민국 법률을 준거법으로 합니다.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">부칙</h2>
              <p className="text-muted-foreground leading-relaxed">
                본 약관은 2026년 1월 1일부터 시행합니다.
              </p>
            </section>

          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
