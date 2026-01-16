import { useEffect } from "react";

const SCROLL_POSITIONS_KEY = "kna_scroll_positions";

export function saveScrollPosition(key: string) {
  try {
    const positions = JSON.parse(sessionStorage.getItem(SCROLL_POSITIONS_KEY) || "{}");
    positions[key] = window.scrollY;
    sessionStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(positions));
  } catch {}
}

export function restoreScrollPosition(key: string) {
  try {
    const positions = JSON.parse(sessionStorage.getItem(SCROLL_POSITIONS_KEY) || "{}");
    const savedPosition = positions[key];
    if (typeof savedPosition === "number" && savedPosition > 0) {
      setTimeout(() => {
        window.scrollTo(0, savedPosition);
      }, 100);
      delete positions[key];
      sessionStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(positions));
    }
  } catch {}
}

export function useScrollRestore(key: string) {
  useEffect(() => {
    restoreScrollPosition(key);
  }, [key]);
}
