import { useEffect, useRef } from "react";

const SCROLL_KEY_PREFIX = "inapp_scroll_";

export function useInAppScrollRestore(pageKey: string) {
  const scrollKey = `${SCROLL_KEY_PREFIX}${pageKey}`;
  const isRestoringRef = useRef(false);

  useEffect(() => {
    // 브라우저의 기본 스크롤 복원 비활성화
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }

    // 저장된 스크롤 위치가 있으면 복원 시도
    const savedPosition = sessionStorage.getItem(scrollKey);
    if (savedPosition && !isRestoringRef.current) {
      const scrollY = parseInt(savedPosition, 10);
      if (scrollY > 0) {
        isRestoringRef.current = true;
        // 레이아웃 완료 후 복원
        requestAnimationFrame(() => {
          window.scrollTo(0, scrollY);
          requestAnimationFrame(() => {
            window.scrollTo(0, scrollY);
            setTimeout(() => {
              window.scrollTo(0, scrollY);
              isRestoringRef.current = false;
            }, 100);
          });
        });
      }
    }

    // 스크롤 위치 저장 (throttled)
    let lastSave = 0;
    const handleScroll = () => {
      const now = Date.now();
      if (now - lastSave >= 100) {
        lastSave = now;
        sessionStorage.setItem(scrollKey, String(window.scrollY));
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    // 페이지 떠나기 전 최종 저장
    const handleBeforeUnload = () => {
      sessionStorage.setItem(scrollKey, String(window.scrollY));
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      // 클린업 시 현재 위치 저장 (SPA 라우팅용)
      sessionStorage.setItem(scrollKey, String(window.scrollY));
    };
  }, [scrollKey]);
}
