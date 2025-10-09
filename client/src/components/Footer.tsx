export function Footer() {
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleContactClick = () => {
    window.open('https://pf.kakao.com/_Sxnvbb/chat', '_blank');
  };

  return (
    <footer className="border-t bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-foreground">한국이름학교 | 와츠유어네임 이름연구협회</h3>
            <p className="text-sm text-muted-foreground tracking-wide">
              바른 이름을 통해, 널리 세상을 이롭게
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
                  이름분석
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection('services')}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="footer-link-naming"
                >
                  이름감명
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection('services')}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="footer-link-guide"
                >
                  이름상담안내
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection('services')}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="footer-link-namechange"
                >
                  개명
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection('services')}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="footer-link-baby"
                >
                  신생아작명
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection('services')}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="footer-link-business"
                >
                  상호작명
                </button>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-foreground">문의</h4>
            <p className="text-sm text-muted-foreground">
              궁금한 사항에 대해 문의해주세요
            </p>
            <button
              onClick={handleContactClick}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover-elevate active-elevate-2 text-sm font-medium transition-colors"
              data-testid="button-contact"
            >
              문의하기
            </button>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t text-center">
          <p className="text-sm text-muted-foreground">
            © 2024 한국이름학교 | 와츠유어네임 이름연구협회. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
