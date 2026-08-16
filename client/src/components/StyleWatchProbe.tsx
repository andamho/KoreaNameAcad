import { useEffect, useState } from "react";

/**
 * 글자가 갑자기 작아지는 순간을 잡기 위한 임시 감시기.
 * 주소에 watch 가 있으면 켜진다. (예: /?watch, /services?watch)
 *
 * 고치지 않는다. 기록만 한다.
 *
 * 남기는 값
 *  - html className
 *  - html / body 의 computed font-size
 *  - <head> 의 style[id^="inapp-style-"] 전체 (id 와 내용 앞부분)
 *  - 지금 route
 *
 * 값이 바뀐 순간만 줄로 쌓아 두므로, 정상일 때와 작아졌을 때를 나란히 볼 수 있다.
 * 확인이 끝나면 이 파일과 App.tsx 의 사용처를 지운다.
 */
export function StyleWatchProbe() {
  const [줄, set줄] = useState<string[]>([]);

  const 켜짐 =
    typeof window !== "undefined" && /watch/i.test(window.location.href);

  useEffect(() => {
    if (!켜짐) return;

    const 시작 = performance.now();
    let 이전 = "";

    const 재기 = () => {
      const de = document.documentElement;
      const 태그 = Array.prototype.slice.call(
        document.querySelectorAll('style[id^="inapp-style-"], style#inapp-experience-global')
      ) as HTMLStyleElement[];

      const html크기 = parseFloat(getComputedStyle(de).fontSize);
      const body크기 = document.body
        ? parseFloat(getComputedStyle(document.body).fontSize)
        : 0;

      // 태그마다 html 기준자를 강제하는지 따로 표시한다 — 이게 범인일 때가 많다.
      const 목록 = 태그.map((s) => {
        const t = (s.textContent || "").replace(/\s+/g, " ").trim();
        const 기준자강제 = /html\.[\w-]+\s*\{\s*font-size/.test(t);
        return `${s.id}${기준자강제 ? "★기준자강제" : ""}(${t.length}자)`;
      });

      const 키 = [
        de.className || "없음",
        html크기.toFixed(2),
        body크기.toFixed(2),
        목록.join(" "),
        window.location.pathname,
      ].join("|");

      if (키 === 이전) return;
      이전 = 키;

      const t = Math.round(performance.now() - 시작);
      const 새줄 = [
        `${t}ms ${window.location.pathname}`,
        ` 표시 ${de.className || "없음"}`,
        ` html ${html크기.toFixed(2)} body ${body크기.toFixed(2)}`,
        ` 주입 ${태그.length}개 ${목록.join(" ") || "-"}`,
      ];
      // 기준자를 강제하는 태그가 있으면 그 내용 앞부분도 남긴다.
      태그.forEach((s) => {
        const t2 = (s.textContent || "").replace(/\s+/g, " ").trim();
        if (/html\.[\w-]+\s*\{\s*font-size/.test(t2)) {
          새줄.push(`  ${s.id}: ${t2.slice(0, 70)}`);
        }
      });

      set줄((이전줄) => 이전줄.concat(새줄).slice(-40));
    };

    재기();
    const id = window.setInterval(재기, 400);
    window.addEventListener("popstate", 재기);
    window.addEventListener("pageshow", 재기);
    document.addEventListener("visibilitychange", 재기);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("popstate", 재기);
      window.removeEventListener("pageshow", 재기);
      document.removeEventListener("visibilitychange", 재기);
    };
  }, [켜짐]);

  if (!켜짐 || !줄.length) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 3,
        right: 3,
        top: 3,
        zIndex: 2147483647,
        background: "rgba(60,0,0,0.94)",
        color: "#fff",
        font: "9px/1.3 monospace",
        padding: "4px 6px",
        borderRadius: 5,
        pointerEvents: "none",
        whiteSpace: "pre-wrap",
        maxHeight: "60vh",
        overflow: "hidden",
      }}
    >
      {["[스타일 감시] 값이 바뀐 순간만"].concat(줄).join("\n")}
    </div>
  );
}
