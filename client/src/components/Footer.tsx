import { SiInstagram, SiYoutube, SiTiktok } from 'react-icons/si';
import { ChevronDown } from 'lucide-react';
import { useLocation } from 'wouter';
import { useState } from 'react';

// 네이버 블로그 N 아이콘 (틱톡 굵기 참조)
function NaverIcon({ className }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      className={className}
      fill="currentColor"
    >
      <path d="M16.273 12.845L7.376 0H0v24h7.726V11.156L16.624 24H24V0h-7.727v12.845z" transform="scale(0.75) translate(4, 4)" />
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
      icon: NaverIcon, 
      url: 'https://m.blog.naver.com/whats_ur_name_777',
      testId: 'link-blog'
    },
  ];

  const serviceLinks = [
    { label: '이름분석 · 감명', path: '/services' },
    { label: '작명 · 개명', path: '/services' },
    { label: '한국이름학교 전문가 과정', path: '/expert-course' },
  ];

  const supportLinks = [
    { label: '공지사항', path: '/notice' },
    { label: '이용약관', path: '/terms' },
    { label: '개인정보처리방침', path: '/privacy' },
  ];

  return (
    <footer className="kna-footer bg-black text-white">
      <div className="max-w-7xl mx-auto px-6 sm:px-8 py-12 sm:py-16">
        
        {/* 소셜 아이콘 영역 - 상단 */}
        <div className="flex items-center justify-center gap-6 sm:gap-8 mb-6">
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

        {/* 상단 메시지 영역 - 히어로 섹션과 동일 스타일 */}
        <div className="text-center mb-6">
          <h2 className="font-bold tracking-tight text-base sm:text-lg md:text-xl flex flex-col items-center" style={{ lineHeight: '1.4' }}>
            <span className="text-white">고달픈 인생</span>
            <span className="text-white">이름 하나로 이유를 찾고</span>
            <span className="kna-highlight kna-footer-highlight">
              <span className="kna-shine">운이 술술 풀리는</span>
            </span>
            <span className="kna-highlight kna-footer-highlight">
              <span className="kna-shine">새 이름으로, 인생역전하세요.</span>
              <span className="kna-underline" aria-hidden="true" />
            </span>
          </h2>
          <p className="text-sm text-white/80 mt-3">
            한글·한자이름만으로 운명상담
            <br />
            <span className="text-white/60">[정확도 80% 이상]</span>
          </p>
        </div>

        {/* CTA 버튼 영역 - 히어로 섹션 스타일 */}
        <div className="flex items-center justify-center gap-6 my-12">
          <button
            onClick={() => setLocation('/services')}
            className="px-5 py-1 bg-white text-black font-semibold rounded-full text-sm hover:bg-gray-200 transition-colors flex items-center gap-1"
            data-testid="button-footer-apply"
          >
            지금 신청 <span className="ml-1">›</span>
          </button>
          <button
            onClick={handleKakaoClick}
            className="text-white font-semibold text-sm hover:opacity-70 transition-opacity flex items-center gap-1"
            data-testid="button-footer-kakao"
          >
            카톡 실시간 상담 <span>›</span>
          </button>
        </div>

        {/* 티파니 블루 구분선 - 양쪽 그라데이션 */}
        <div className="max-w-xl mx-auto h-px mb-10" style={{ background: 'linear-gradient(90deg, transparent 0%, #56D5DB 15%, #56D5DB 85%, transparent 100%)' }} />

        {/* 3단 레이아웃 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-0 mb-10">
          
          {/* SERVICE */}
          <div className="text-center md:border-r md:border-[#56D5DB]/50 md:pr-8">
            <h3 className="text-[#56D5DB] font-semibold text-sm tracking-wider mb-2">SERVICE</h3>
            <div className="w-24 h-px mx-auto mb-4" style={{ background: 'linear-gradient(90deg, transparent 0%, #56D5DB 20%, #56D5DB 80%, transparent 100%)' }} />
            <ul className="space-y-2">
              {serviceLinks.map((link, idx) => (
                <li key={idx}>
                  <button
                    onClick={() => setLocation(link.path)}
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
          <div className="text-center md:border-r md:border-[#56D5DB]/50 md:px-8">
            <h3 className="text-[#56D5DB] font-semibold text-sm tracking-wider mb-2">SUPPORT</h3>
            <div className="w-24 h-px mx-auto mb-4" style={{ background: 'linear-gradient(90deg, transparent 0%, #56D5DB 20%, #56D5DB 80%, transparent 100%)' }} />
            <ul className="space-y-2">
              {supportLinks.map((link, idx) => (
                <li key={idx}>
                  <button
                    onClick={() => setLocation(link.path)}
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
          <div className="text-center flex flex-col items-center md:pl-8">
            <h3 className="text-[#56D5DB] font-semibold text-sm tracking-wider mb-2">CONTACT</h3>
            <div className="w-24 h-px mx-auto mb-4" style={{ background: 'linear-gradient(90deg, transparent 0%, #56D5DB 20%, #56D5DB 80%, transparent 100%)' }} />
            <p className="text-white/80 text-sm">수~일 10:00 ~ 18:00</p>
          </div>
        </div>

        {/* 하단 티파니 블루 구분선 - 3단 레이아웃과 동일 너비, 양쪽 그라데이션 */}
        <div className="w-full h-px mb-8" style={{ background: 'linear-gradient(90deg, transparent 0%, #56D5DB 3%, #56D5DB 97%, transparent 100%)' }} />

        {/* 하단 정보 영역 */}
        <div className="text-center">
          <p className="text-white/70 text-sm footer-org-name mb-2">
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
