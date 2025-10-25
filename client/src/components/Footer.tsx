import { SiInstagram, SiYoutube, SiTiktok, SiNaver } from 'react-icons/si';
import { useLocation } from 'wouter';

export function Footer() {
  const [, setLocation] = useLocation();

  const handleContactClick = () => {
    window.open('https://pf.kakao.com/_Sxnvbb/chat', '_blank');
  };

  const socialLinks = [
    { 
      name: '인스타그램', 
      icon: SiInstagram, 
      url: 'https://www.instagram.com/whats_ur_name.777/',
      testId: 'link-instagram'
    },
    { 
      name: '유튜브', 
      icon: SiYoutube, 
      url: 'https://www.youtube.com/@whats_ur_name.777',
      testId: 'link-youtube'
    },
    { 
      name: '틱톡', 
      icon: SiTiktok, 
      url: 'https://www.tiktok.com/@whats_ur_name.777?_t=ZS-90SP0kmBDEG&_r=1',
      testId: 'link-tiktok'
    },
    { 
      name: '블로그', 
      icon: SiNaver, 
      url: 'https://m.blog.naver.com/whats_ur_name_777',
      testId: 'link-blog'
    },
  ];

  return (
    <footer className="kna-footer bg-black text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        {/* 팔로우 - 상단 한 줄 */}
        <div className="flex items-center justify-center gap-6 mb-12">
          <span className="text-[23px]">팔로우</span>
          <div className="w-px h-6 bg-white/30"></div>
          <div className="flex gap-6">
            {socialLinks.map((social) => (
              <a
                key={social.name}
                href={social.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white hover:text-[#58C4C4] transition-colors duration-200"
                aria-label={social.name}
                data-testid={social.testId}
              >
                <social.icon className="w-6 h-6" />
              </a>
            ))}
          </div>
        </div>

        {/* Hero 텍스트 중앙 정렬 */}
        <div className="text-center mb-12">
          <h2 className="text-[16px] md:text-[24px] tracking-tight leading-tight">
            <span className="text-white">고달픈 인생</span><br />
            <span className="text-white">이름 하나로 이유를 찾고</span><br />
            <span className="kna-highlight">
              <span className="kna-shine">운이 술술 풀리는</span>
            </span><br/>
            <span className="kna-highlight">
              <span className="kna-shine">새 이름으로, 인생역전하세요.</span>
              <span className="kna-underline" aria-hidden="true" />
            </span>
          </h2>
          
          <p className="text-[14px] text-white/70 mt-6">
            한글·한자이름만으로 운명상담<br/>
            [정확도 80% 이상]
          </p>
        </div>

        {/* 버튼들 */}
        <div className="flex justify-center gap-4 mb-12">
          <button
            onClick={() => {
              setLocation('/services');
              window.scrollTo(0, 0);
            }}
            className="px-5 py-2 md:px-6 md:py-2.5 rounded-md text-white font-semibold hover-elevate active-elevate-2 transition-colors"
            style={{ backgroundColor: '#58C4C4' }}
            data-testid="button-footer-apply"
          >
            지금 신청
          </button>
          <button
            onClick={handleContactClick}
            className="px-5 py-2 md:px-6 md:py-2.5 rounded-md border-2 border-white text-white font-semibold hover-elevate active-elevate-2 transition-colors"
            data-testid="button-contact"
          >
            문의
          </button>
        </div>

        <div className="mt-8 pt-8 border-t border-white/20 text-center">
          <p className="text-sm text-white/50">
            © {new Date().getFullYear()} 한국이름학교 | 와츠유어네임 이름연구협회. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
