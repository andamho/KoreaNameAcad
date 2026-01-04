import { SiInstagram, SiYoutube, SiTiktok } from 'react-icons/si';
import { MessageCircle } from 'lucide-react';
import { useLocation } from 'wouter';

// 커스텀 블로그 아이콘 (B자 스타일)
function BlogIcon({ className }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      className={className}
      fill="currentColor"
    >
      <text x="4" y="18" fontSize="16" fontWeight="bold" fontFamily="Arial, sans-serif">B</text>
      <text x="12" y="18" fontSize="16" fontWeight="bold" fontFamily="Arial, sans-serif">L</text>
    </svg>
  );
}

export function Footer() {
  const [, setLocation] = useLocation();

  const handleKakaoClick = () => {
    window.open('https://pf.kakao.com/_Sxnvbb/chat', '_blank');
  };

  const socialLinks = [
    { 
      name: 'Instagram', 
      icon: SiInstagram, 
      url: 'https://www.instagram.com/whats_ur_name.777/',
      testId: 'link-instagram'
    },
    { 
      name: 'YouTube', 
      icon: SiYoutube, 
      url: 'https://www.youtube.com/@whats_ur_name.777',
      testId: 'link-youtube'
    },
    { 
      name: 'TikTok', 
      icon: SiTiktok, 
      url: 'https://www.tiktok.com/@whats_ur_name.777?_t=ZS-90SP0kmBDEG&_r=1',
      testId: 'link-tiktok'
    },
    { 
      name: 'Blog', 
      icon: BlogIcon, 
      url: 'https://m.blog.naver.com/whats_ur_name_777',
      testId: 'link-blog'
    },
  ];

  const serviceLinks = [
    { label: '이름분석 · 감명', path: '/services' },
    { label: '작명 · 개명', path: '/services' },
    { label: '이름분석학 전문가 과정', path: '/services' },
  ];

  const supportLinks = [
    { label: '공지사항', path: '/' },
    { label: '이용약관', path: '/' },
    { label: '개인정보처리방침', path: '/' },
  ];

  return (
    <footer className="kna-footer bg-black text-white">
      <div className="max-w-7xl mx-auto px-6 sm:px-8 py-12 sm:py-16">
        
        {/* 상단 메시지 영역 */}
        <div className="text-center mb-8">
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white tracking-tight">
            고달픈 인생, 이름 하나로 이유와 해결책을!
          </h2>
          <p className="text-sm sm:text-base text-white/70 mt-3">
            한글·한자이름만으로 운명상담 [정확도 80% 이상]
          </p>
        </div>

        {/* 소셜 아이콘 영역 */}
        <div className="flex items-center justify-center gap-6 sm:gap-8 mb-8">
          {socialLinks.map((social) => (
            <a
              key={social.name}
              href={social.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:text-[#56D5DB] transition-colors duration-200"
              aria-label={social.name}
              data-testid={social.testId}
            >
              <social.icon className="w-6 h-6 sm:w-7 sm:h-7" />
            </a>
          ))}
        </div>

        {/* 티파니 블루 구분선 */}
        <div className="max-w-4xl mx-auto h-px bg-[#56D5DB] mb-10" />

        {/* 3단 레이아웃 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 mb-10">
          
          {/* SERVICE */}
          <div className="text-center">
            <h3 className="text-[#56D5DB] font-semibold text-sm tracking-wider mb-4">SERVICE</h3>
            <ul className="space-y-2">
              {serviceLinks.map((link, idx) => (
                <li key={idx}>
                  <button
                    onClick={() => {
                      setLocation(link.path);
                      window.scrollTo(0, 0);
                    }}
                    className="text-white/80 hover:text-white text-sm transition-colors inline-flex items-center gap-2"
                    data-testid={`footer-service-${idx}`}
                  >
                    <span className="text-white/50">•</span>
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* SUPPORT */}
          <div className="text-center">
            <h3 className="text-[#56D5DB] font-semibold text-sm tracking-wider mb-4">SUPPORT</h3>
            <ul className="space-y-2">
              {supportLinks.map((link, idx) => (
                <li key={idx}>
                  <button
                    onClick={() => {
                      setLocation(link.path);
                      window.scrollTo(0, 0);
                    }}
                    className="text-white/80 hover:text-white text-sm transition-colors inline-flex items-center gap-2"
                    data-testid={`footer-support-${idx}`}
                  >
                    <span className="text-white/50">•</span>
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* CONTACT */}
          <div className="text-center">
            <h3 className="text-[#56D5DB] font-semibold text-sm tracking-wider mb-4">CONTACT</h3>
            <p className="text-white/80 text-sm mb-4">수~일 10:00 ~ 18:00</p>
            <button
              onClick={handleKakaoClick}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-white text-black font-medium text-sm border-2 border-[#56D5DB] hover:bg-[#56D5DB] hover:text-white transition-colors"
              data-testid="button-kakao-contact"
            >
              <MessageCircle className="w-4 h-4" />
              카톡 실시간 상담
            </button>
          </div>
        </div>

        {/* 하단 티파니 블루 구분선 */}
        <div className="max-w-4xl mx-auto h-px bg-[#56D5DB] mb-8" />

        {/* 하단 정보 영역 */}
        <div className="text-center">
          <p className="text-white/70 text-sm mb-2">
            한국이름학교 | 와츠유어네임 이름연구협회
          </p>
          <p className="text-white/50 text-xs">
            © 2026 KOREA NAME ACADEMY. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
