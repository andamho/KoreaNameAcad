import { useEffect, useRef } from "react";

const SCROLL_KEY_PREFIX = "inapp_scroll_";
const NAVIGATING_KEY = "inapp_navigating";

export function useInAppScrollRestore(pageKey: string) {
  const scrollKey = `${SCROLL_KEY_PREFIX}${pageKey}`;
  const hasRestoredRef = useRef(false);

  useEffect(() => {
    // 브라우저의 기본 스크롤 복원 비활성화
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }

    // 다른 페이지로 이동했다가 돌아온 경우 복원
    const wasNavigating = sessionStorage.getItem(NAVIGATING_KEY);
    if (wasNavigating && !hasRestoredRef.current) {
      const savedPosition = sessionStorage.getItem(scrollKey);
      if (savedPosition) {
        const scrollY = parseInt(savedPosition, 10);
        if (scrollY > 0) {
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
      // 복원 후 플래그 삭제
      sessionStorage.removeItem(NAVIGATING_KEY);
    }

    // 스크롤 위치 저장 (throttled)
    const handleScroll = () => {
      sessionStorage.setItem(scrollKey, String(window.scrollY));
    };

    const throttledScroll = throttle(handleScroll, 100);
    window.addEventListener("scroll", throttledScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", throttledScroll);
      // 페이지를 떠날 때 네비게이션 플래그 설정
      sessionStorage.setItem(NAVIGATING_KEY, "true");
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
