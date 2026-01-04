import { useEffect, useRef } from "react";

const SCROLL_STATE_KEY = "__scrollY";

export function useInAppScrollRestore(pageKey: string) {
  const isRestoringRef = useRef(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    // history.state에서 스크롤 위치 읽기
    const savedScrollY = window.history.state?.[SCROLL_STATE_KEY];
    
    if (typeof savedScrollY === "number" && savedScrollY > 0) {
      isRestoringRef.current = true;
      
      // 레이아웃이 완료될 때까지 기다린 후 복원
      const restoreScroll = () => {
        const documentHeight = document.documentElement.scrollHeight;
        
        // 문서 높이가 스크롤 위치보다 크면 복원
        if (documentHeight > savedScrollY) {
          window.scrollTo(0, savedScrollY);
          isRestoringRef.current = false;
          return true;
        }
        return false;
      };

      // 즉시 시도
      if (!restoreScroll()) {
        // 레이아웃 완료 대기 (최대 1초)
        let attempts = 0;
        const maxAttempts = 20;
        
        const tryRestore = () => {
          if (!mountedRef.current) return;
          attempts++;
          
          if (restoreScroll() || attempts >= maxAttempts) {
            // 마지막 시도
            window.scrollTo(0, savedScrollY);
            isRestoringRef.current = false;
          } else {
            requestAnimationFrame(tryRestore);
          }
        };
        
        requestAnimationFrame(tryRestore);
      }
    }

    // 스크롤 시 history.state에 저장
    const handleScroll = () => {
      if (isRestoringRef.current) return;
      
      const scrollY = window.scrollY;
      if (scrollY > 0) {
        // 기존 state 유지하면서 스크롤 위치만 업데이트
        const currentState = window.history.state || {};
        window.history.replaceState(
          { ...currentState, [SCROLL_STATE_KEY]: scrollY },
          ""
        );
      }
    };

    const throttledScroll = throttle(handleScroll, 150);
    window.addEventListener("scroll", throttledScroll, { passive: true });

    return () => {
      mountedRef.current = false;
      window.removeEventListener("scroll", throttledScroll);
    };
  }, [pageKey]);
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
