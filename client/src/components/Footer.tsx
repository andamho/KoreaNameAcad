import { SiInstagram, SiYoutube, SiTiktok, SiNaver } from 'react-icons/si';

export function Footer() {
  const handleContactClick = () => {
    window.open('https://pf.kakao.com/_Sxnvbb/chat', '_blank');
  };

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
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
    <footer className="border-t bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        {/* Hero 텍스트와 팔로우 섹션 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 mb-12">
          {/* 왼쪽: Hero 텍스트 */}
          <div className="text-center lg:text-left">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              <span className="text-foreground">
                고달픈 인생<br />
                이름 하나로 이유를 찾고
              </span>
              <br />
              <span className="kna-highlight">
                <span className="kna-shine">
                  운이 술술 풀리는<br/>
                  새 이름으로, 인생역전하세요.
                </span>
                <span className="kna-underline" aria-hidden="true" />
              </span>
            </h2>
            
            <p className="text-lg text-muted-foreground mt-6">
              한글·한자이름만으로 운명상담<br/>
              [정확도 80% 이상]
            </p>
          </div>

          {/* 우측: 팔로우 섹션 (검은색 배경) */}
          <div className="flex items-center justify-center lg:justify-end">
            <div className="bg-black rounded-2xl px-8 py-6 w-full max-w-md">
              <h3 className="text-white text-[31px] text-center mb-5">
                팔로우
              </h3>
              
              <div className="flex justify-center gap-[31px]">
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
                    <social.icon className="w-[26px] h-[26px]" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 버튼들 */}
        <div className="flex justify-center gap-4 mb-12">
          <button
            onClick={() => scrollToSection('services')}
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
