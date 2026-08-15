import { useEffect, useState } from "react";

/**
 * 화면에 실제로 그려지는 글자 크기를 재서 보여주는 확인용 상자.
 *
 * 주소에 ?size=1 을 붙였을 때만 뜬다. 평소 방문자에게는 보이지 않는다.
 *
 * 왜 필요한가 — 인스타·틱톡 앱 안의 브라우저는 글자를 자체적으로 키운다.
 * 개발용 미리보기는 그걸 재현하지 못해서, CSS 에 적힌 값과 실제 화면 크기가
 * 다르다. 폰에서 이 상자를 열어 실제 값을 봐야 정확히 맞출 수 있다.
 */
export function SizeProbe() {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("size")) return;

    const px = (sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      return parseFloat(getComputedStyle(el).fontSize);
    };
    const wide = (sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      return el.getBoundingClientRect().width;
    };
    const n = (v: number | null) => (v == null ? "-" : v.toFixed(1));

    const measure = () => {
      const html = document.documentElement;
      const ua = html.classList.contains("ua-instagram")
        ? "인스타"
        : html.classList.contains("ua-tiktok")
        ? "틱톡"
        : "일반";
      const title = document.querySelector(".hero-title");

      setLines([
        `${ua} · 폭 ${window.innerWidth} · 기준자 ${n(px("html"))}`,
        `제목 ${n(px(".hero-title"))} · 안내문 ${n(px(".hero-sub"))}`,
        `셋째줄 ${n(
          title?.lastElementChild
            ? parseFloat(getComputedStyle(title.lastElementChild).fontSize)
            : null
        )} · 구름 ${n(wide(".hero-cloud-m"))}`,
        `브랜드 ${n(px(".kna-brand-main"))} · 로고 ${n(
          (() => {
            const el = document.querySelector(".kna-navbar img");
            return el ? parseFloat(getComputedStyle(el).height) : null;
          })()
        )}`,
        `비용제목 ${n(px(".kna-pricing-inner h2"))} · 위험본문 ${n(
          px(".kna-danger-section p.text-lg")
        )}`,
      ]);
    };

    measure();
    // 화면을 돌리거나 주소창이 접힐 때도 다시 잰다
    window.addEventListener("resize", measure);
    const t = setTimeout(measure, 1200); // 글꼴이 늦게 올라오는 경우 대비
    return () => {
      window.removeEventListener("resize", measure);
      clearTimeout(t);
    };
  }, []);

  if (!lines.length) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 8,
        bottom: 8,
        zIndex: 2147483647,
        background: "rgba(0,0,0,0.85)",
        color: "#fff",
        font: "12px/1.5 monospace",
        padding: "8px 10px",
        borderRadius: 8,
        maxWidth: "calc(100vw - 16px)",
        pointerEvents: "none",
        whiteSpace: "pre",
      }}
    >
      {lines.join("\n")}
    </div>
  );
}
