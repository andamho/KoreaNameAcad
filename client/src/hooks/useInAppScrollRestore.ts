import { useEffect, useRef } from "react";

const SCROLL_KEY_PREFIX = "inapp_scroll_";

export function useInAppScrollRestore(pageKey: string) {
  const hasRestoredRef = useRef(false);
  const scrollKey = `${SCROLL_KEY_PREFIX}${pageKey}`;

  useEffect(() => {
    // 브라우저의 기본 스크롤 복원 비활성화 (인앱에서 zoom과 충돌 방지)
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }

    const navigationType = (
      performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming
    )?.type;
    const isBackForward = navigationType === "back_forward";

    if (isBackForward && !hasRestoredRef.current) {
      const savedPosition = sessionStorage.getItem(scrollKey);
      if (savedPosition) {
        const scrollY = parseInt(savedPosition, 10);
        hasRestoredRef.current = true;
        // 여러 번 시도하여 레이아웃 완료 후 정확한 위치로 복원
        requestAnimationFrame(() => {
          window.scrollTo(0, scrollY);
          requestAnimationFrame(() => {
            window.scrollTo(0, scrollY);
            setTimeout(() => {
              window.scrollTo(0, scrollY);
            }, 50);
          });
        });
      }
    }

    const handleScroll = () => {
      sessionStorage.setItem(scrollKey, String(window.scrollY));
    };

    const throttledScroll = throttle(handleScroll, 100);
    window.addEventListener("scroll", throttledScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", throttledScroll);
    };
  }, [scrollKey]);
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
