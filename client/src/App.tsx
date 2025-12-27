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
  // 인앱 브라우저 전역 감지
  useEffect(() => {
    const userAgent = navigator.userAgent || '';
    const isInstagram = userAgent.includes('Instagram');
    const isTikTok = userAgent.includes('TikTok') || userAgent.includes('musical_ly');
    
    if (isInstagram || isTikTok) {
      // html 클래스 추가
      document.documentElement.classList.add(isInstagram ? 'ua-instagram' : 'ua-tiktok');
      // body에 ig-shell 추가하여 기존 CSS 규칙 적용
      document.body.classList.add('ig-shell');
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
