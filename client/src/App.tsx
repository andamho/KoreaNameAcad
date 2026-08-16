import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import { AdminProvider } from "@/contexts/AdminContext";
import type { Content } from "@shared/schema";
import Home from "@/pages/Home";
import InstagramHome from "@/pages/InstagramHome";
import TikTokHome from "@/pages/TikTokHome";
import DetailInfo from "@/pages/DetailInfo";
import FamilyPolicy from "@/pages/FamilyPolicy";
import Admin from "@/pages/Admin";
import Services from "@/pages/Services";
import Reviews from "@/pages/Reviews";
import Pricing from "@/pages/Pricing";
import NameStories from "@/pages/NameStories";
import NameStoryDetail from "@/pages/NameStoryDetail";
import Terms from "@/pages/Terms";
import Privacy from "@/pages/Privacy";
import Notice from "@/pages/Notice";
import ExpertCourse from "@/pages/ExpertCourse";
import ContentDetail from "@/pages/ContentDetail";
import Drafts from "@/pages/Drafts";
import About from "@/pages/About";
import ExperienceZone from "@/pages/ExperienceZone";
import ExperienceAloneFate from "@/pages/ExperienceAloneFate";
import ExperienceHusbandLuck from "@/pages/ExperienceHusbandLuck";
import ExperienceShortLife from "@/pages/ExperienceShortLife";
import ExperienceChildrenLuck from "@/pages/ExperienceChildrenLuck";
import ExperienceNameRank from "@/pages/ExperienceNameRank";
import Inquiry from "@/pages/Inquiry";
import InquiryThread from "@/pages/InquiryThread";
import NotFound from "@/pages/not-found";
import { SizeProbe } from "@/components/SizeProbe";
import { ValueSectionProbe } from "@/components/ValueSectionProbe";
import { CircleFrameProbe } from "@/components/CircleFrameProbe";
import { PageSizeProbe } from "@/components/PageSizeProbe";
import { RulerProbe } from "@/components/RulerProbe";
import { AuditProbe } from "@/components/AuditProbe";
import { FlashProbe } from "@/components/FlashProbe";

import servicesCharacterImage from "@assets/KakaoTalk_20251226_140639616_1766725668691.png";
import reviewsCharacterImage from "@assets/KakaoTalk_20251226_140721227_1766725962281.png";
import pricingCharacterImage from "@assets/KakaoTalk_20251226_150428417_1766729101276.png";
import storiesCharacterImage from "@assets/KakaoTalk_20251226_141747822_1766726282057.png";
import dangerCharacterImage from "@assets/KakaoTalk_20251226_152419337_1766730274782.png";
import effortCharacterImage from "@assets/KakaoTalk_20251226_152116391_1766730095506.png";
import stepsCharacterImage from "@assets/KakaoTalk_20251226_164036756_1766734877281.png";
import guideCharacterImage from "@assets/KakaoTalk_20251226_151729031_1766729868877.png";
import newYearImage from "@assets/newYearPopup_optimized.jpg";
import formLogoImage from "@assets/file_00000000e75c71fabfe62e47dff1209b_1766979230188.png";
import navbarLogoImage from "@assets/file_000000009b2c7206ad0a70c0142cb99a_1766915164756.png";

// 모든 페이지 배경이미지 즉시 다운로드 (앱 로드 시 바로 시작)
const _bgPreloads = [
  // 홈 모바일/데스크탑 히어로는 Hero.tsx에서 @assets 임포트로 처리
  '/expzone-bg.webp',      // 체험존(데스크탑·모바일 공통)
  '/namestory-bg.webp',    // 이름이야기
  '/academy-bg.webp',      // 협회소개
  '/astronot.webp',        // 체험존 캐릭터
  '/mesh-header-hero.png', // 체험존 모바일 기존
  '/gradbg2.png',          // 헤더 그라디언트
  '/about-character-opt.webp',
  '/alone-fate-hero.png',
  '/pagebg.webp',          // 서비스 페이지 모바일 히어로
].map(src => { const i = new Image(); i.src = src; return i; });

const characterImages = [
  servicesCharacterImage,
  reviewsCharacterImage,
  pricingCharacterImage,
  storiesCharacterImage,
  dangerCharacterImage,
  effortCharacterImage,
  stepsCharacterImage,
  guideCharacterImage,
  '/about-character-opt.webp',
  '/alone-fate-hero.png',
  '/mesh-header-hero.png',
  '/gradbg2.png',
];

// 팝업 이미지 (최우선 로드)
const popupImage = newYearImage;

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home}/>
      {/* 크기 확인용 — 홈과 같은 화면인데 확인 상자가 함께 뜬다.
          인스타·틱톡 프로필 링크에는 물음표(?)를 못 넣는 경우가 있어
          물음표 없는 주소로도 열 수 있게 둔다. 확인이 끝나면 지운다. */}
      <Route path="/size" component={Home}/>
      <Route path="/ig" component={InstagramHome}/>
      <Route path="/tt" component={TikTokHome}/>
      <Route path="/detail-info" component={DetailInfo}/>
      <Route path="/family-policy" component={FamilyPolicy}/>
      <Route path="/admin" component={Admin}/>
      <Route path="/drafts" component={Drafts}/>
      <Route path="/services" component={Services}/>
      {/* 물음표 없는 크기 확인용 주소 — 인앱이 ?size 를 떼어내도 살아남는다 */}
      <Route path="/services/size" component={Services}/>
      {/* [임시 시험 B] 자동확대를 끄고 ÷1.3 보정도 뗀 상태를 보는 주소 */}
      <Route path="/services/sizeb" component={Services}/>
      {/* [임시 시험 C] A 와 같되 text-size-adjust 만 none 인 주소 */}
      <Route path="/services/sizec" component={Services}/>
      {/* [임시 시험 D] 폰이 글자를 키우는 법칙 자체를 재는 주소 */}
      <Route path="/services/sized" component={Services}/>
      {/* [임시 감사] 전수 비교 + 주입 스타일 수명 확인용 주소 */}
      <Route path="/services/sizee" component={Services}/>
      <Route path="/pricing/sizee" component={Pricing}/>
      <Route path="/reviews/sizee" component={Reviews}/>
      <Route path="/reviews" component={Reviews}/>
      <Route path="/reviews/:id">
        {(params) => <ContentDetail backPath="/reviews" backLabel="후기 목록" />}
      </Route>
      <Route path="/pricing" component={Pricing}/>
      <Route path="/name-stories" component={NameStories}/>
      <Route path="/name-stories/:id" component={NameStoryDetail}/>
      <Route path="/terms" component={Terms}/>
      <Route path="/privacy" component={Privacy}/>
      <Route path="/notice" component={Notice}/>
      <Route path="/notice/:id">
        {(params) => <ContentDetail backPath="/notice" backLabel="공지사항 목록" />}
      </Route>
      <Route path="/expert-course" component={ExpertCourse}/>
      <Route path="/expert-course/:id">
        {(params) => <ContentDetail backPath="/expert-course" backLabel="전문가 과정 목록" />}
      </Route>
      <Route path="/about" component={About}/>
      <Route path="/about/:id">
        {(params) => <ContentDetail backPath="/about" backLabel="협회 소개 목록" />}
      </Route>
      <Route path="/experience-zone" component={ExperienceZone}/>
      <Route path="/experience-zone/alone-fate" component={ExperienceAloneFate}/>
      <Route path="/experience-zone/husband-luck" component={ExperienceHusbandLuck}/>
      <Route path="/experience-zone/short-life" component={ExperienceShortLife}/>
      <Route path="/experience-zone/children-luck" component={ExperienceChildrenLuck}/>
      <Route path="/experience-zone/name-rank" component={ExperienceNameRank}/>
      <Route path="/inquiry" component={Inquiry}/>
      <Route path="/inquiry/thread/:token" component={InquiryThread}/>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // 인앱 브라우저 전역 감지
  useEffect(() => {
    const userAgent = navigator.userAgent || '';
    const isInstagram = userAgent.includes('Instagram');
    const isTikTok = userAgent.includes('TikTok') || userAgent.includes('musical_ly');
    
    // 클래스는 index.html 의 인라인 코드가 첫 화면 전에 이미 붙인다.
    // 여기서는 혹시 그 코드가 못 돌았을 때를 대비한 보조 장치로만 둔다
    // (이미 붙어 있으면 아무 일도 하지 않는다).
    const de = document.documentElement;
    // [임시 시험] /services/sizeb 에서는 인앱 표시를 붙이지 않는다. index.html 과 같은 조건.
    const 시험중 = /sizeb/i.test(window.location.pathname);
    // [임시 시험 C] 인앱 표시는 그대로 두고 text-size-adjust 만 none 으로 바꾼다.
    if (/sizec/i.test(window.location.pathname)) {
      de.classList.add('probe-sizeadjust-none');
    }
    if (시험중) {
      de.classList.remove('ua-instagram');
      de.classList.remove('ua-tiktok');
      de.classList.add('probe-noadjust');
    } else if (isInstagram && !de.classList.contains('ua-instagram')) {
      de.classList.add('ua-instagram');
    } else if (isTikTok && !de.classList.contains('ua-tiktok')) {
      de.classList.add('ua-tiktok');
    }

    // 체험존 페이지 전용 인앱 브라우저 스타일 (82% 비율, 영구 주입)
    if (isInstagram || isTikTok) {
      const cn = isInstagram ? 'ua-instagram' : 'ua-tiktok';
      const styleId = 'inapp-experience-global';
      if (!document.getElementById(styleId)) {
        const s = document.createElement('style');
        s.id = styleId;
        s.textContent = `
          html.${cn} .kna-experience-page .text-lg  { font-size: 15px !important; }
          html.${cn} .kna-experience-page .text-xl  { font-size: 16px !important; }
          html.${cn} .kna-experience-page .text-2xl { font-size: 20px !important; }
          html.${cn} .kna-experience-page .text-3xl { font-size: 25px !important; }
          html.${cn} .kna-experience-page .text-4xl { font-size: 30px !important; }
          html.${cn} .kna-experience-page .text-5xl { font-size: 39px !important; }
          html.${cn} .kna-experience-page .text-6xl { font-size: 49px !important; }
          html.${cn} .kna-experience-page .text-7xl { font-size: 59px !important; }
        `;
        document.head.appendChild(s);
      }
    }
  }, []);

  // 팝업 이미지 최우선 로딩 + 캐릭터 이미지 미리 로딩 + 콘텐츠 이미지 프리로드
  useEffect(() => {
    // 1. 팝업 이미지 최우선 로드 (가장 먼저!)
    const popupLink = document.createElement('link');
    popupLink.rel = 'preload';
    popupLink.as = 'image';
    popupLink.href = popupImage;
    popupLink.setAttribute('fetchpriority', 'high');
    document.head.insertBefore(popupLink, document.head.firstChild);
    
    const popupImg = new Image();
    popupImg.src = popupImage;

    // 1.5. 내비바 로고 최우선 로드
    const navbarLogoLink = document.createElement('link');
    navbarLogoLink.rel = 'preload';
    navbarLogoLink.as = 'image';
    navbarLogoLink.href = navbarLogoImage;
    navbarLogoLink.setAttribute('fetchpriority', 'high');
    document.head.insertBefore(navbarLogoLink, document.head.firstChild);
    
    const navbarLogoImg = new Image();
    navbarLogoImg.src = navbarLogoImage;

    // 1.6. 상담신청서 로고 로드
    const formLogoLink = document.createElement('link');
    formLogoLink.rel = 'preload';
    formLogoLink.as = 'image';
    formLogoLink.href = formLogoImage;
    formLogoLink.setAttribute('fetchpriority', 'high');
    document.head.insertBefore(formLogoLink, document.head.firstChild);
    
    const formLogoImg = new Image();
    formLogoImg.src = formLogoImage;
    
    // 1.7. 전국순위 영상 미리 버퍼링
    const nrVideo = document.createElement('video');
    nrVideo.preload = 'auto';
    nrVideo.muted = true;
    nrVideo.src = '/namerank.mp4';

    // 2. 캐릭터 이미지 로딩
    characterImages.forEach((src) => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = src;
      link.setAttribute('fetchpriority', 'high');
      document.head.appendChild(link);
      
      const img = new Image();
      img.src = src;
    });

    // 3. 콘텐츠 이미지 즉시 프리로드 (API 호출과 이미지 로딩 동시 시작)
    const preloadContentImages = async () => {
      try {
        // 모든 카테고리 동시에 fetch
        const categories = ['review', 'nameStory', 'announcement', 'expert', 'about'];
        const results = await Promise.all(
          categories.map(cat => 
            fetch(`/api/contents?category=${cat}`)
              .then(res => res.ok ? res.json() : [])
              .catch(() => [])
          )
        );
        
        // 각 카테고리에서 첫 6개씩 이미지 추출
        const allThumbnails: string[] = [];
        results.forEach((contents: Content[]) => {
          if (Array.isArray(contents)) {
            contents.slice(0, 6).forEach(content => {
              if (content.thumbnail) {
                allThumbnails.push(content.thumbnail);
              }
            });
          }
        });

        // 중복 제거 후 프리로드
        const uniqueThumbnails = Array.from(new Set(allThumbnails));
        uniqueThumbnails.forEach((url) => {
          // preload link 추가
          const link = document.createElement('link');
          link.rel = 'preload';
          link.as = 'image';
          link.href = url;
          link.setAttribute('fetchpriority', 'high');
          document.head.appendChild(link);
          
          // Image 객체로도 즉시 로딩 시작
          const img = new Image();
          img.src = url;
        });

        // React Query 캐시에도 미리 저장
        categories.forEach((cat, idx) => {
          if (results[idx] && Array.isArray(results[idx])) {
            queryClient.setQueryData(['/api/contents', cat], results[idx]);
          }
        });
      } catch (e) {
        // 프리로드 실패해도 앱 동작에는 영향 없음
      }
    };

    // 즉시 실행 (await 없이)
    preloadContentImages();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AdminProvider>
        <TooltipProvider>
          <Toaster />
          {/* 임시 눈금 시험 — 페이지 맨 위에 실제로 보이게 둔다 */}
          <RulerProbe />
          {/* 임시 감사기 — 전수 비교 + 주입 스타일 수명 */}
          <AuditProbe />
          <Router />
          {/* 주소에 ?size=1 을 붙였을 때만 뜨는 크기 확인용 상자 */}
          <SizeProbe />
          {/* 임시 측정기 — 확인 끝나면 제거 */}
          <ValueSectionProbe />
          <CircleFrameProbe />
          <PageSizeProbe />
          <FlashProbe />
        </TooltipProvider>
      </AdminProvider>
    </QueryClientProvider>
  );
}

export default App;
