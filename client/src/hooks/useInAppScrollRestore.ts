import { useEffect, useRef } from "react";

const SCROLL_STORAGE_PREFIX = "__scroll_";
const DEBUG_SCROLL = true; // 테스트 후 false로 변경

// 디버깅: 스크롤 상태 로깅
function logScrollState(label: string) {
  if (!DEBUG_SCROLL) return;
  const footer = document.querySelector('[data-testid="footer"]');
  console.log(`[SCROLL] ${label}:`, {
    scrollY: window.scrollY,
    scrollHeight: document.documentElement.scrollHeight,
    footerTop: footer?.getBoundingClientRect().top ?? 'N/A',
    timestamp: Date.now()
  });
}

export function useInAppScrollRestore(pageKey: string) {
  const isRestoringRef = useRef(false);
  const mountedRef = useRef(false);
  const storageKey = SCROLL_STORAGE_PREFIX + pageKey;

  useEffect(() => {
    mountedRef.current = true;

    // 디버깅: 초기 상태 로깅
    if (DEBUG_SCROLL) {
      console.log('[SCROLL] ========== 페이지 마운트 ==========');
      console.log('[SCROLL] pageKey:', pageKey);
      console.log('[SCROLL] history.scrollRestoration:', history.scrollRestoration);
      console.log('[SCROLL] sessionStorage keys:', 
        Object.keys(sessionStorage).filter(k => k.startsWith(SCROLL_STORAGE_PREFIX))
      );
      logScrollState('마운트 직후');
    }

    // 디버깅: pageshow 이벤트
    const handlePageShow = (e: PageTransitionEvent) => {
      if (DEBUG_SCROLL) {
        console.log('[SCROLL] pageshow 이벤트, persisted:', e.persisted);
        logScrollState('pageshow');
      }
    };

    // 디버깅: popstate 이벤트
    const handlePopState = () => {
      if (DEBUG_SCROLL) {
        console.log('[SCROLL] popstate 이벤트');
        logScrollState('popstate');
      }
    };

    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('popstate', handlePopState);

    // 디버깅: Footer ResizeObserver
    let footerObserver: ResizeObserver | null = null;
    if (DEBUG_SCROLL) {
      const footer = document.querySelector('[data-testid="footer"]');
      if (footer) {
        footerObserver = new ResizeObserver((entries) => {
          const height = entries[0]?.contentRect.height;
          console.log('[SCROLL] Footer 크기 변경:', height);
        });
        footerObserver.observe(footer);
      }
    }

    // sessionStorage에서 스크롤 위치 읽기
    const savedScrollY = sessionStorage.getItem(storageKey);
    const scrollY = savedScrollY ? parseInt(savedScrollY, 10) : 0;
    
    if (DEBUG_SCROLL) {
      console.log('[SCROLL] 저장된 scrollY:', scrollY);
    }
    
    if (scrollY > 0) {
      isRestoringRef.current = true;
      
      // 레이아웃이 완료될 때까지 기다린 후 복원
      let attempts = 0;
      const maxAttempts = 30;
      
      const tryRestore = () => {
        if (!mountedRef.current) return;
        attempts++;
        
        const documentHeight = document.documentElement.scrollHeight;
        
        if (DEBUG_SCROLL) {
          logScrollState(`복원 시도 #${attempts}`);
        }
        
        // 문서 높이가 스크롤 위치보다 크면 복원
        if (documentHeight > scrollY || attempts >= maxAttempts) {
          if (DEBUG_SCROLL) {
            console.log('[SCROLL] 복원 실행! 목표:', scrollY);
          }
          
          window.scrollTo(0, scrollY);
          
          if (DEBUG_SCROLL) {
            // 복원 직후 상태
            setTimeout(() => {
              logScrollState('복원 직후 (0ms)');
            }, 0);
            setTimeout(() => {
              logScrollState('복원 후 50ms');
            }, 50);
            setTimeout(() => {
              logScrollState('복원 후 100ms');
            }, 100);
            setTimeout(() => {
              logScrollState('복원 후 300ms');
            }, 300);
          }
          
          isRestoringRef.current = false;
          
          // 복원 완료 후 저장값 삭제 (다음 방문 시 영향 없도록)
          sessionStorage.removeItem(storageKey);
        } else {
          requestAnimationFrame(tryRestore);
        }
      };
      
      // 약간의 지연 후 시작 (레이아웃 안정화)
      setTimeout(() => {
        if (DEBUG_SCROLL) {
          console.log('[SCROLL] 복원 시작 (50ms 지연 후)');
        }
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
        if (DEBUG_SCROLL) {
          console.log('[SCROLL] 링크 클릭, 저장할 scrollY:', currentScrollY);
        }
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
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('popstate', handlePopState);
      if (footerObserver) {
        footerObserver.disconnect();
      }
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
