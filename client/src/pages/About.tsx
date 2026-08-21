import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ContentGrid } from "@/components/ContentGrid";
import { useEffect } from "react";
import { useScrollRestore } from "@/hooks/use-scroll-restore";

const _heroBgPreload = new Image();
_heroBgPreload.src = "/academy-bg.webp";

export default function About() {
  useScrollRestore("/about");

  useEffect(() => {
    const userAgent = navigator.userAgent || '';
    const isInstagram = userAgent.includes('Instagram');
    const isTikTok = userAgent.includes('TikTok') || userAgent.includes('musical_ly');
    
    if (isInstagram || isTikTok) {
      const className = isInstagram ? "ua-instagram" : "ua-tiktok";
      // 인앱 표시(ua-instagram / ua-tiktok)는 App 이 전역으로 관리한다. 여기서 붙이지 않는다.

      // 인앱 font-size 강제 주입은 없앱다.
      //
      // 예전에는 <style>(inapp-style-*)을 만들어 기준자(html)를 14px 로 못박고
      // h1~h4 · p/li/span · .text-sm ~ .text-4xl 을 px 로 고정했다. !important 라
      // index.css 의 공통 ÷1.3 보정을 전부 이겼다.
      //
      // 선택자에 페이지 제한이 없어 문서 전체에 걸렸고, 이 화면의 푸터까지
      // 망가뜨렸다. 비용 페이지(124aaf0d)에서는 글자 90개 중 78개가 어긋났고
      // 그중 27개가 푸터였다. 여기도 같은 블록이다.
      //
      // 체험존·서비스·후기·이름이야기·비용과 같은 정리다. 크기는 공통 보정에 맡긴다.
      // 빈 <style> 을 만들지도 않는다. id 를 여러 페이지가 함께 쓰기 때문에
      // 빈 태그가 남으면 다른 페이지가 자기 스타일을 못 만든다.
      console.log(`[About] 인앱 브라우저 감지: ${className}, User Agent: ${userAgent}`);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      
      {/* Hero Section - 다른 페이지와 동일한 패턴 */}
      <section className="relative overflow-hidden py-16 md:py-24">
        <img
          src="/academy-bg.webp"
          alt=""
          className="absolute inset-0 w-full h-full object-fill"
          fetchPriority="high"
          loading="eager"
          decoding="sync"
          aria-hidden="true"
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12">
            <img
              src="/about-character-opt.webp"
              alt="협회 소개 캐릭터"
              className="w-auto h-40 md:h-56 flex-shrink-0"
              fetchPriority="high"
              loading="eager"
              decoding="async"
            />
            <div className="text-center md:text-left">
              <p className="text-sm font-medium tracking-wide text-slate-600 mb-2">ABOUT US</p>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white mb-6" data-testid="text-about-title">
                협회 소개
              </h1>
              <p className="text-lg md:text-2xl text-slate-700">
                와츠유어네임 이름연구협회를<br />
                소개합니다
              </p>
            </div>
          </div>
        </div>
      </section>

      <main className="flex-1 py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <ContentGrid 
            category="about" 
            basePath="/about"
            emptyMessage="협회 소개 콘텐츠가 준비 중입니다."
          />
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
