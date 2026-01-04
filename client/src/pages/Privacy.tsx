import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="pt-[100px] pb-16">
        <div className="max-w-4xl mx-auto px-6">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
            개인정보 처리방침
          </h1>
          
          <p className="text-muted-foreground leading-relaxed mb-8">
            한국이름학교 | 와츠유어네임 이름연구협회(이하 "회사")는 「개인정보 보호법」 등 관련 법령을 준수하며, 이용자의 개인정보를 중요시하고 이를 보호하기 위해 다음과 같이 개인정보 처리방침을 수립·공개합니다.
            <br /><br />
            본 방침은 회사가 제공하는 모든 서비스에 적용됩니다.
          </p>
          
          <div className="space-y-8 text-foreground">
            
            <section>
              <h2 className="text-xl font-bold mb-3">제1조 (개인정보의 처리 목적)</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">회사는 다음의 목적을 위하여 개인정보를 처리합니다.</p>
              <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc list-inside mb-3">
                <li>이름 분석·감명·작명·개명 서비스 제공</li>
                <li>전화번호·차량번호 선별 및 분석 서비스 제공</li>
                <li>상담 신청 접수 및 상담 결과 전달</li>
                <li>고객 문의 응대 및 상담 이력 관리</li>
                <li>맞춤형 상담 제공 및 서비스 품질 개선</li>
                <li>법령상 의무 이행 및 분쟁 대응</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed">
                처리된 개인정보는 위 목적 이외의 용도로 사용되지 않으며, 목적 변경 시 사전 동의를 받습니다.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">제2조 (처리하는 개인정보 항목)</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                회사는 서비스 제공에 필요한 최소한의 개인정보만을 수집합니다.
              </p>
              
              <h3 className="text-lg font-semibold mb-2">1. 필수 수집 항목</h3>
              <ul className="space-y-1 text-muted-foreground leading-relaxed list-disc list-inside mb-4">
                <li>이름</li>
                <li>나이</li>
                <li>성별</li>
                <li>하는 일(직업 또는 주요 활동)</li>
                <li>상담받고자 하는 이유</li>
                <li>개명 여부</li>
                <li>개명 전 이름</li>
                <li>연락처(휴대전화번호)</li>
                <li>상담 요청 내용</li>
                <li>상담 결과 전달을 위한 정보</li>
              </ul>
              
              <h3 className="text-lg font-semibold mb-2">2. 선택 수집 항목</h3>
              <ul className="space-y-1 text-muted-foreground leading-relaxed list-disc list-inside mb-3">
                <li>추가 분석 요청 정보</li>
              </ul>
              
              <p className="text-sm text-muted-foreground/80 italic">
                ※ 서비스 이용 과정에서 IP주소, 접속 기록, 기기 정보 등이 자동으로 생성·수집될 수 있습니다.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">제3조 (개인정보의 처리 및 보유 기간)</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                회사는 개인정보를 다음 기간 동안 보유·처리합니다.
              </p>
              <div className="bg-muted/30 p-4 rounded-lg mb-3">
                <p className="font-semibold mb-1">상담 및 개명·작명 서비스 제공 정보</p>
                <p className="text-muted-foreground">보유 기간: 상담 종료 후 3년</p>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                단, 관계 법령에 따라 보존이 필요한 경우 해당 법령에서 정한 기간 동안 보관합니다.
                <br />
                보유 기간이 경과한 개인정보는 지체 없이 파기합니다.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">제4조 (개인정보의 제3자 제공)</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                회사는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다.
                <br />
                다만, 다음의 경우에는 예외로 합니다.
              </p>
              <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc list-inside">
                <li>이용자가 사전에 동의한 경우</li>
                <li>법령에 따라 제공이 요구되는 경우</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">제5조 (개인정보 처리의 위탁)</h2>
              <p className="text-muted-foreground leading-relaxed">
                회사는 현재 개인정보 처리 업무를 외부에 위탁하지 않습니다.
                <br />
                향후 위탁이 발생할 경우, 관련 사항을 사전에 공지하고 동의를 받겠습니다.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">제6조 (정보주체의 권리 및 행사 방법)</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                정보주체는 언제든지 다음 권리를 행사할 수 있습니다.
              </p>
              <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc list-inside mb-3">
                <li>개인정보 열람 요청</li>
                <li>개인정보 정정·삭제 요청</li>
                <li>개인정보 처리 정지 요청</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed">
                권리 행사는 홈페이지, 카카오톡 상담, 서면 등을 통해 가능하며 회사는 지체 없이 조치합니다.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">제7조 (개인정보의 파기 절차 및 방법)</h2>
              <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc list-inside">
                <li><strong className="text-foreground">전자적 파일:</strong> 복구 불가능한 방식으로 영구 삭제</li>
                <li><strong className="text-foreground">종이 문서:</strong> 분쇄 또는 소각 처리</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">제8조 (개인정보의 안전성 확보 조치)</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                회사는 개인정보 보호를 위해 다음과 같은 조치를 취합니다.
              </p>
              <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc list-inside">
                <li>개인정보 접근 권한 최소화</li>
                <li>내부 관리계획 수립 및 시행</li>
                <li>개인정보 취급자 보안 교육</li>
                <li>기술적·관리적 보호 조치 시행</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">제9조 (개인정보 보호책임자)</h2>
              <ul className="space-y-2 text-muted-foreground leading-relaxed">
                <li><strong className="text-foreground">개인정보 보호책임자:</strong> 한국이름학교 | 와츠유어네임 이름연구협회 운영책임자</li>
                <li><strong className="text-foreground">문의 방법:</strong> 홈페이지 상담 / 카카오톡 상담 채널</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">제10조 (개인정보 처리방침 변경)</h2>
              <p className="text-muted-foreground leading-relaxed">
                본 개인정보 처리방침은 법령 또는 내부 정책 변경에 따라 수정될 수 있으며,
                <br />
                변경 시 홈페이지를 통해 공지합니다.
              </p>
            </section>

            <section className="pt-4 border-t border-border">
              <p className="text-muted-foreground font-semibold">
                시행일자: 2026년 1월 1일
              </p>
            </section>

          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
