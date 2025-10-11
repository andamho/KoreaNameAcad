export function Footer() {
  const handleContactClick = () => {
    window.open('https://pf.kakao.com/_Sxnvbb/chat', '_blank');
  };

  const openDialog = (type: "analysis" | "naming") => {
    window.location.href = `/?open=${type}`;
  };

  return (
    <footer className="border-t bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        {/* Hero 텍스트 중앙 정렬 */}
        <div className="text-center mb-12 space-y-3">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground">
            고달픈 인생<br />
            이름 하나로 이유를 찾고
          </h2>
          <h2 className="text-3xl md:text-4xl font-bold">
            <span className="bg-gradient-to-r from-[#58C4C4] to-[#6DD4D4] bg-clip-text text-transparent">
              운이 술술 풀리는
            </span>
          </h2>
          <h2 className="text-3xl md:text-4xl font-bold">
            <span className="bg-gradient-to-r from-[#A0E7E5] to-[#B8F3F1] bg-clip-text text-transparent">
              새 이름으로, 인생역전하세요.
            </span>
          </h2>
          <p className="text-lg text-muted-foreground mt-4">
            한글·한자이름만으로 운명상담
          </p>
          <p className="text-base text-muted-foreground">
            [정확도 80% 이상]
          </p>
        </div>

        {/* 버튼들 - Navbar 버튼 위치와 동일하게 배치 */}
        <div className="flex justify-center gap-4 mb-12">
          <button
            onClick={() => openDialog("analysis")}
            className="px-6 py-2.5 rounded-md text-white font-semibold hover-elevate active-elevate-2 transition-colors"
            style={{ backgroundColor: '#0f766e' }}
            data-testid="button-footer-apply"
          >
            지금 신청
          </button>
          <button
            onClick={handleContactClick}
            className="px-6 py-2.5 rounded-md border-2 font-semibold hover-elevate active-elevate-2 transition-colors"
            style={{ 
              borderColor: '#0f766e',
              color: '#0f766e'
            }}
            data-testid="button-contact"
          >
            문의
          </button>
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
