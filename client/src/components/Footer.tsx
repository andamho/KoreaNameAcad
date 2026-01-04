import { SiInstagram, SiYoutube, SiTiktok } from 'react-icons/si';
import { MessageCircle, ChevronDown } from 'lucide-react';
import { useLocation } from 'wouter';
import { useState } from 'react';

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
  const [legalOpen, setLegalOpen] = useState(false);

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

        {/* 티파니 블루 구분선 - 양쪽 그라데이션 */}
        <div className="max-w-xl mx-auto h-px mb-10" style={{ background: 'linear-gradient(90deg, transparent 0%, #56D5DB 15%, #56D5DB 85%, transparent 100%)' }} />

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

        {/* 하단 티파니 블루 구분선 - 3단 레이아웃 너비에 맞춤, 양쪽 그라데이션 */}
        <div className="w-full h-px mb-8" style={{ background: 'linear-gradient(90deg, transparent 0%, #56D5DB 10%, #56D5DB 90%, transparent 100%)' }} />

        {/* 하단 정보 영역 */}
        <div className="text-center">
          <p className="text-white/70 text-sm mb-2">
            한국이름학교 | 와츠유어네임 이름연구협회
          </p>
          
          {/* 데스크탑: 항상 표시 */}
          <div className="hidden md:block text-white/50 text-xs mb-2 space-y-1">
            <p>대표: 안서호 | 사업자번호: 250-96-01311</p>
            <p>주소: 충남 서산시 지곡면 산성서골길 26-6 | 통신판매업신고: 2023-충남서산-0094</p>
          </div>
          
          {/* 모바일: 아코디언 */}
          <div className="md:hidden mb-2">
            <button
              onClick={() => setLegalOpen(!legalOpen)}
              className="inline-flex items-center gap-1 text-white/50 text-xs hover:text-white/70 transition-colors"
              data-testid="button-legal-toggle"
            >
              <span>사업자 정보</span>
              <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${legalOpen ? 'rotate-180' : ''}`} />
            </button>
            {legalOpen && (
              <div className="mt-2 text-white/50 text-xs space-y-1">
                <p>대표: 안서호 | 사업자번호: 250-96-01311</p>
                <p>주소: 충남 서산시 지곡면 산성서골길 26-6</p>
                <p>통신판매업신고: 2023-충남서산-0094</p>
              </div>
            )}
          </div>
          
          <p className="text-white/50 text-xs">
            © 2026 KOREA NAME ACADEMY. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
