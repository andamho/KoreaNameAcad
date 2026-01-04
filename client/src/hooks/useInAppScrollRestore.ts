import { useEffect, useRef } from "react";

const SCROLL_KEY_PREFIX = "inapp_scroll_";
const SCROLL_LOCK_KEY = "inapp_scroll_locked";

export function useInAppScrollRestore(pageKey: string) {
  const hasRestoredRef = useRef(false);
  const scrollKey = `${SCROLL_KEY_PREFIX}${pageKey}`;
  const lastValidScrollRef = useRef(0);

  useEffect(() => {
    // 브라우저의 기본 스크롤 복원 비활성화 (인앱에서 zoom과 충돌 방지)
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }

    // 잠금 해제
    sessionStorage.removeItem(SCROLL_LOCK_KEY);

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
      // 잠금 상태면 저장하지 않음
      if (sessionStorage.getItem(SCROLL_LOCK_KEY) === "true") {
        return;
      }
      const scrollY = window.scrollY;
      // 유효한 스크롤 위치만 저장 (0이 아닌 경우 또는 처음 로드 시)
      if (scrollY > 0) {
        lastValidScrollRef.current = scrollY;
        sessionStorage.setItem(scrollKey, String(scrollY));
      }
    };

    const throttledScroll = throttle(handleScroll, 100);
    window.addEventListener("scroll", throttledScroll, { passive: true });

    // 페이지 떠나기 전 마지막 유효 스크롤 위치 저장 + 잠금
    const handleBeforeUnload = () => {
      if (lastValidScrollRef.current > 0) {
        sessionStorage.setItem(scrollKey, String(lastValidScrollRef.current));
      }
      sessionStorage.setItem(SCROLL_LOCK_KEY, "true");
    };

    // 링크 클릭 시 스크롤 위치 잠금
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("a, button")) {
        if (lastValidScrollRef.current > 0) {
          sessionStorage.setItem(scrollKey, String(lastValidScrollRef.current));
        }
        sessionStorage.setItem(SCROLL_LOCK_KEY, "true");
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleClick, { capture: true });

    return () => {
      window.removeEventListener("scroll", throttledScroll);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClick, { capture: true });
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
