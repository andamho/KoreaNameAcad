import { useEffect, useRef } from "react";

const SCROLL_STORAGE_PREFIX = "__scroll_";

export function useInAppScrollRestore(pageKey: string) {
  const isRestoringRef = useRef(false);
  const mountedRef = useRef(false);
  const storageKey = SCROLL_STORAGE_PREFIX + pageKey;

  useEffect(() => {
    mountedRef.current = true;

    // sessionStorage에서 스크롤 위치 읽기
    const savedScrollY = sessionStorage.getItem(storageKey);
    const scrollY = savedScrollY ? parseInt(savedScrollY, 10) : 0;
    
    if (scrollY > 0) {
      isRestoringRef.current = true;
      
      // 레이아웃이 완료될 때까지 기다린 후 복원
      let attempts = 0;
      const maxAttempts = 30;
      
      const tryRestore = () => {
        if (!mountedRef.current) return;
        attempts++;
        
        const documentHeight = document.documentElement.scrollHeight;
        
        // 문서 높이가 스크롤 위치보다 크면 복원
        if (documentHeight > scrollY || attempts >= maxAttempts) {
          window.scrollTo(0, scrollY);
          isRestoringRef.current = false;
          
          // 복원 완료 후 저장값 삭제 (다음 방문 시 영향 없도록)
          sessionStorage.removeItem(storageKey);
        } else {
          requestAnimationFrame(tryRestore);
        }
      };
      
      // 약간의 지연 후 시작 (레이아웃 안정화)
      setTimeout(() => {
        requestAnimationFrame(tryRestore);
      }, 50);
    }

    // 스크롤 시 sessionStorage에 저장
    const handleScroll = () => {
      if (isRestoringRef.current) return;
      
      const currentScrollY = window.scrollY;
      if (currentScrollY > 0) {
        sessionStorage.setItem(storageKey, String(currentScrollY));
      }
    };

    const throttledScroll = throttle(handleScroll, 100);
    window.addEventListener("scroll", throttledScroll, { passive: true });

    // 페이지 이탈 시에도 저장 (링크 클릭 등)
    const handleBeforeUnload = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > 0) {
        sessionStorage.setItem(storageKey, String(currentScrollY));
      }
    };
    
    // 클릭 시 현재 스크롤 위치 즉시 저장
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a');
      if (link) {
        const currentScrollY = window.scrollY;
        if (currentScrollY > 0) {
          sessionStorage.setItem(storageKey, String(currentScrollY));
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleClick, { capture: true });

    return () => {
      mountedRef.current = false;
      window.removeEventListener("scroll", throttledScroll);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClick, { capture: true });
    };
  }, [pageKey, storageKey]);
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
