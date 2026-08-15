/**
 * 인앱에서 글자가 순간적으로 커졌다가 작아지는 현상의 원인을 찾기 위한 임시 기록기.
 *
 * main.tsx 맨 위에서 불러 화면이 그려지기 전부터 기록을 시작한다.
 * 2초 동안 50ms 간격으로 아래 값을 남기고, 값이 바뀐 순간만 추려 보관한다.
 *
 *  - document.documentElement.className   (ua-instagram 이 언제 붙는지)
 *  - window.innerWidth / visualViewport.width
 *  - html / body 의 computed font-size
 *  - '두 번의 확인, 평생의 안심' 요소의 computed font-size 와 상자 크기
 *  - text-size-adjust
 *  - document.fonts.ready 시점
 *
 * 확인이 끝나면 이 파일과 사용처를 지운다.
 */
type Sample = {
  t: number;
  cls: string;
  iw: number;
  vw: number;
  html: string;
  body: string;
  target: string;
  box: string;
  adjust: string;
  note?: string;
};

declare global {
  interface Window {
    __FLASH?: Sample[];
    __FLASH_DONE?: boolean;
  }
}

export function startFlashRecorder() {
  if (!/size/i.test(window.location.href)) return;

  const t0 = performance.now();
  const log: Sample[] = [];
  window.__FLASH = log;

  const findTarget = (): HTMLElement | null => {
    const list = Array.prototype.slice.call(
      document.querySelectorAll(".kna-value-section h2, .kna-value-section h3, .kna-value-section span")
    ) as HTMLElement[];
    return list.find((e) => (e.textContent || "").includes("평생의 안심")) || null;
  };

  const take = (note?: string) => {
    const de = document.documentElement;
    const target = findTarget();
    const cs = getComputedStyle(de);
    const s: Sample = {
      t: Math.round(performance.now() - t0),
      cls: de.className || "(없음)",
      iw: window.innerWidth,
      vw: window.visualViewport ? Math.round(window.visualViewport.width) : -1,
      html: cs.fontSize,
      body: document.body ? getComputedStyle(document.body).fontSize : "-",
      target: target ? getComputedStyle(target).fontSize : "-",
      box: target
        ? `${target.getBoundingClientRect().width.toFixed(0)}×${target
            .getBoundingClientRect()
            .height.toFixed(0)}`
        : "-",
      adjust:
        (cs as unknown as Record<string, string>)["webkitTextSizeAdjust"] ||
        (cs as unknown as Record<string, string>)["textSizeAdjust"] ||
        "-",
      note,
    };
    log.push(s);
  };

  take("시작");
  const id = window.setInterval(take, 50);
  window.setTimeout(() => {
    window.clearInterval(id);
    take("끝");
    window.__FLASH_DONE = true;
  }, 2000);

  // 웹폰트 로딩 전후 비교
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => take("폰트로딩완료"));
  }
  window.addEventListener("load", () => take("load"));
  document.addEventListener("DOMContentLoaded", () => take("DOM준비"));
}
