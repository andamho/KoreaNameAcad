export function Footer() {
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <footer className="border-t bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-foreground">한국이름학교</h3>
            <p className="text-sm text-muted-foreground tracking-wide">
              전문적인 이름 분석과 작명 서비스로
              <br />
              새로운 시작을 함께합니다.
            </p>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-foreground">서비스</h4>
            <ul className="space-y-2">
              <li>
                <button
                  onClick={() => scrollToSection('services')}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="footer-link-analysis"
                >
                  이름 분석
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection('services')}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="footer-link-naming"
                >
                  작명 서비스
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection('testimonials')}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="footer-link-testimonials"
                >
                  고객 후기
                </button>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-foreground">연락처</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li data-testid="text-phone">전화: 02-1234-5678</li>
              <li data-testid="text-email">이메일: info@koreanname.school</li>
              <li data-testid="text-hours">운영시간: 평일 09:00 - 18:00</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t text-center">
          <p className="text-sm text-muted-foreground">
            © 2024 한국이름학교. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
