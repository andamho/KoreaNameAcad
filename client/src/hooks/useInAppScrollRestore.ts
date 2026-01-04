import { useEffect, useRef } from "react";

const SCROLL_STORAGE_PREFIX = "__scroll_";
const DEBUG_SCROLL = true;

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
  const restoredRef = useRef(false);
  const storageKey = SCROLL_STORAGE_PREFIX + pageKey;

  useEffect(() => {
    mountedRef.current = true;
    restoredRef.current = false;

    // 1순위: 브라우저 자동 복원 비활성화
    const previousScrollRestoration = history.scrollRestoration;
    history.scrollRestoration = 'manual';

    if (DEBUG_SCROLL) {
      console.log('[SCROLL] ========== 페이지 마운트 ==========');
      console.log('[SCROLL] pageKey:', pageKey);
      console.log('[SCROLL] history.scrollRestoration 변경: auto → manual');
      console.log('[SCROLL] sessionStorage keys:', 
        Object.keys(sessionStorage).filter(k => k.startsWith(SCROLL_STORAGE_PREFIX))
      );
      logScrollState('마운트 직후');
    }

    const handlePageShow = (e: PageTransitionEvent) => {
      if (DEBUG_SCROLL) {
        console.log('[SCROLL] pageshow 이벤트, persisted:', e.persisted);
        logScrollState('pageshow');
      }
    };

    const handlePopState = () => {
      if (DEBUG_SCROLL) {
        console.log('[SCROLL] popstate 이벤트');
        logScrollState('popstate');
      }
    };

    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('popstate', handlePopState);

    let footerObserver: ResizeObserver | null = null;
    let lastFooterHeight = 0;
    let footerStableCount = 0;

    const savedScrollY = sessionStorage.getItem(storageKey);
    const targetScrollY = savedScrollY ? parseInt(savedScrollY, 10) : 0;
    
    if (DEBUG_SCROLL) {
      console.log('[SCROLL] 저장된 scrollY:', targetScrollY);
    }

    // 레이아웃 안정화 후 1회만 복원하는 함수
    const performRestore = () => {
      if (!mountedRef.current || restoredRef.current || targetScrollY <= 0) return;
      
      restoredRef.current = true;
      isRestoringRef.current = true;

      if (DEBUG_SCROLL) {
        console.log('[SCROLL] ===== 레이아웃 안정화 확인, 복원 실행! =====');
        console.log('[SCROLL] 목표 scrollY:', targetScrollY);
        logScrollState('복원 직전');
      }

      window.scrollTo(0, targetScrollY);

      if (DEBUG_SCROLL) {
        setTimeout(() => logScrollState('복원 후 0ms'), 0);
        setTimeout(() => logScrollState('복원 후 50ms'), 50);
        setTimeout(() => logScrollState('복원 후 100ms'), 100);
        setTimeout(() => logScrollState('복원 후 300ms'), 300);
        setTimeout(() => logScrollState('복원 후 500ms'), 500);
      }

      setTimeout(() => {
        isRestoringRef.current = false;
        sessionStorage.removeItem(storageKey);
        if (DEBUG_SCROLL) {
          console.log('[SCROLL] 복원 완료, sessionStorage 삭제');
        }
      }, 600);
    };

    if (targetScrollY > 0) {
      // Footer를 기다리고, 높이가 안정화될 때까지 대기
      const waitForLayoutStability = () => {
        const footer = document.querySelector('[data-testid="footer"]');
        
        if (!footer) {
          // Footer가 아직 없으면 계속 대기
          if (DEBUG_SCROLL) {
            console.log('[SCROLL] Footer 대기 중...');
          }
          setTimeout(waitForLayoutStability, 50);
          return;
        }

        // Footer ResizeObserver로 안정화 감지
        footerObserver = new ResizeObserver((entries) => {
          const currentHeight = entries[0]?.contentRect.height ?? 0;
          
          if (DEBUG_SCROLL) {
            console.log('[SCROLL] Footer 크기:', currentHeight, '이전:', lastFooterHeight);
          }

          if (Math.abs(currentHeight - lastFooterHeight) < 1) {
            footerStableCount++;
            if (DEBUG_SCROLL) {
              console.log('[SCROLL] Footer 안정화 카운트:', footerStableCount);
            }
            
            // 3번 연속 동일하면 안정화된 것으로 판단
            if (footerStableCount >= 3 && !restoredRef.current) {
              footerObserver?.disconnect();
              performRestore();
            }
          } else {
            footerStableCount = 0;
          }
          
          lastFooterHeight = currentHeight;
        });

        footerObserver.observe(footer);

        // 최대 대기 시간 (1초) 후 강제 복원
        setTimeout(() => {
          if (!restoredRef.current) {
            if (DEBUG_SCROLL) {
              console.log('[SCROLL] 타임아웃 - 강제 복원');
            }
            footerObserver?.disconnect();
            performRestore();
          }
        }, 1000);
      };

      // 초기 지연 (transform 적용 대기)
      setTimeout(() => {
        if (DEBUG_SCROLL) {
          console.log('[SCROLL] 레이아웃 안정화 대기 시작 (200ms 후)');
        }
        waitForLayoutStability();
      }, 200);
    }

    // 스크롤 시 저장
    const handleScroll = () => {
      if (isRestoringRef.current) return;
      const currentScrollY = window.scrollY;
      if (currentScrollY > 0) {
        sessionStorage.setItem(storageKey, String(currentScrollY));
      }
    };

    const throttledScroll = throttle(handleScroll, 100);
    window.addEventListener("scroll", throttledScroll, { passive: true });

    const handleBeforeUnload = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > 0) {
        sessionStorage.setItem(storageKey, String(currentScrollY));
      }
    };

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
      // 원래 scrollRestoration 복원
      history.scrollRestoration = previousScrollRestoration;
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
