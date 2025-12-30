import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
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
import NotFound from "@/pages/not-found";

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

const characterImages = [
  servicesCharacterImage,
  reviewsCharacterImage,
  pricingCharacterImage,
  storiesCharacterImage,
  dangerCharacterImage,
  effortCharacterImage,
  stepsCharacterImage,
  guideCharacterImage,
];

// 팝업 이미지 (최우선 로드)
const popupImage = newYearImage;

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home}/>
      <Route path="/ig" component={InstagramHome}/>
      <Route path="/tt" component={TikTokHome}/>
      <Route path="/detail-info" component={DetailInfo}/>
      <Route path="/family-policy" component={FamilyPolicy}/>
      <Route path="/admin" component={Admin}/>
      <Route path="/services" component={Services}/>
      <Route path="/reviews" component={Reviews}/>
      <Route path="/pricing" component={Pricing}/>
      <Route path="/name-stories" component={NameStories}/>
      <Route path="/name-stories/:id" component={NameStoryDetail}/>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // 인앱 브라우저 전역 감지 및 설정 (모든 페이지에서 유지)
  useEffect(() => {
    const userAgent = navigator.userAgent || '';
    const isInstagram = userAgent.includes('Instagram');
    const isTikTok = userAgent.includes('TikTok') || userAgent.includes('musical_ly');
    const isInAppBrowser = isInstagram || isTikTok;
    
    if (isInstagram) {
      document.documentElement.classList.add('ua-instagram');
    } else if (isTikTok) {
      document.documentElement.classList.add('ua-tiktok');
    }
    
    // 인앱 브라우저일 때 전역 설정 적용 (페이지 이동해도 유지)
    if (isInAppBrowser) {
      // viewport 메타 태그 설정
      let viewport = document.querySelector('meta[name="viewport"]');
      if (viewport) {
        viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
      }
      
      // text-size-adjust 비활성화
      document.documentElement.style.setProperty('-webkit-text-size-adjust', 'none', 'important');
      document.documentElement.style.setProperty('text-size-adjust', 'none', 'important');
      document.body.style.setProperty('-webkit-text-size-adjust', 'none', 'important');
      document.body.style.setProperty('text-size-adjust', 'none', 'important');
    }
  }, []);

  // 팝업 이미지 최우선 로딩 + 캐릭터 이미지 미리 로딩
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
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
