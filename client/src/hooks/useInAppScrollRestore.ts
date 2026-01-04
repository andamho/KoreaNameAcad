import { useEffect, useRef } from "react";

const SCROLL_KEY_PREFIX = "inapp_scroll_";
const BACK_NAV_KEY = "inapp_back_nav";

export function useInAppScrollRestore(pageKey: string) {
  const scrollKey = `${SCROLL_KEY_PREFIX}${pageKey}`;
  const isRestoringRef = useRef(false);

  useEffect(() => {
    // 브라우저의 기본 스크롤 복원 비활성화
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }

    // 뒤로가기 플래그 확인 후 복원
    const isBackNav = sessionStorage.getItem(BACK_NAV_KEY) === "true";
    if (isBackNav) {
      sessionStorage.removeItem(BACK_NAV_KEY);
      const savedPosition = sessionStorage.getItem(scrollKey);
      if (savedPosition) {
        const scrollY = parseInt(savedPosition, 10);
        isRestoringRef.current = true;
        
        // 여러 번 시도하여 레이아웃 완료 후 정확한 위치로 복원
        const restore = () => {
          window.scrollTo(0, scrollY);
        };
        
        restore();
        requestAnimationFrame(() => {
          restore();
          requestAnimationFrame(() => {
            restore();
            setTimeout(() => {
              restore();
              isRestoringRef.current = false;
            }, 100);
          });
        });
      }
    }

    // 스크롤 위치 저장 (복원 중이 아닐 때만)
    const handleScroll = () => {
      if (isRestoringRef.current) return;
      const scrollY = window.scrollY;
      if (scrollY > 0) {
        sessionStorage.setItem(scrollKey, String(scrollY));
      }
    };

    const throttledScroll = throttle(handleScroll, 100);
    window.addEventListener("scroll", throttledScroll, { passive: true });

    // popstate로 뒤로가기 감지
    const handlePopState = () => {
      sessionStorage.setItem(BACK_NAV_KEY, "true");
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("scroll", throttledScroll);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [scrollKey]);
}

// 네비게이션 직전 스크롤 위치 저장 (CTA 핸들러에서 호출)
export function saveScrollPosition(pageKey: string) {
  const scrollKey = `${SCROLL_KEY_PREFIX}${pageKey}`;
  const scrollY = window.scrollY;
  if (scrollY > 0) {
    sessionStorage.setItem(scrollKey, String(scrollY));
  }
}

function throttle<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
  let lastCall = 0;
  return ((...args: unknown[]) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      fn(...args);
    }
  }) as T;
}
