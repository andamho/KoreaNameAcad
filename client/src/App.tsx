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
import stepsCharacterImage from "@assets/KakaoTalk_20251226_152750745_1766730485133.png";
import guideCharacterImage from "@assets/KakaoTalk_20251226_151729031_1766729868877.png";

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
  // 캐릭터 이미지 미리 로딩 (페이지 전환 시 빠른 표시)
  useEffect(() => {
    characterImages.forEach((src) => {
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
