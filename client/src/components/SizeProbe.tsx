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
    // 주소 어디에든 size 라는 글자가 있으면 켠다.
    // 인스타·틱톡은 링크를 자기 주소로 감싸면서 물음표 뒤를 떼기도 해서,
    // #size 처럼 붙여도 되도록 넓게 잡는다.
    if (!/size/i.test(window.location.href)) return;

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
        // 화면이 옛 것인지 새 것인지 구분하려고 붙인 표시.
        // 이 줄이 안 보이면 캐시에 남은 옛 화면이다.
        `버전 B · ${ua} · 폭 ${window.innerWidth} · 기준자 ${n(px("html"))}`,
        `기기폭 ${window.screen.width} · 배율 ${window.devicePixelRatio}`,
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
        // '두 번의 확인, 평생의 안심' 아래 STEP 01/02 — 글자 크기와 이름표 상자
        `STEP ${n(
          (() => {
            const s = Array.prototype.slice.call(document.querySelectorAll(".kna-value-section *")).find(
              (e) => !e.children.length && (e.textContent || "").trim().startsWith("STEP 0")
            );
            return s ? parseFloat(getComputedStyle(s).fontSize) : null;
          })()
        )} · 안심 ${n(
          (() => {
            const s = Array.prototype.slice.call(document.querySelectorAll(".kna-value-section *")).find(
              (e) => (e.textContent || "").includes("평생의 안심") && !e.querySelector("span span")
            );
            return s ? parseFloat(getComputedStyle(s).fontSize) : null;
          })()
        )}`,
        // '열심히 노력하면 살아가지만' ~ '내 삶, 어디가 막혀 있을까요?' 구간.
        // 글자 크기별로 몇 개씩 있는지 묶어서 보여준다(작은 화면에 다 못 넣으므로).
        `인트로 ${(() => {
          const box = document.querySelector(".kna-intro-top");
          const box2 = document.querySelector(".kna-intro-bottom");
          const list = Array.prototype.slice
            .call(document.querySelectorAll(".kna-intro-top *, .kna-intro-bottom *"))
            .filter((e) => {
              if (e.children.length) return false;
              if (!(e.textContent || "").trim()) return false;
              const r = e.getBoundingClientRect();
              return r.width > 1 && r.height > 1;
            });
          if (!list.length) return box || box2 ? "요소없음" : "-";
          const cnt: Record<string, number> = {};
          list.forEach((e) => {
            const k = parseFloat(getComputedStyle(e).fontSize).toFixed(1);
            cnt[k] = (cnt[k] || 0) + 1;
          });
          return Object.keys(cnt)
            .sort((a, b) => parseFloat(b) - parseFloat(a))
            .slice(0, 6)
            .map((k) => `${k}×${cnt[k]}`)
            .join(" ");
        })()}`,
        `이름표 ${(() => {
          const a = Array.prototype.slice.call(document.querySelectorAll(".anchor")).find(
            (e) => (e.textContent || "").trim() === "홍길동"
          );
          if (!a) return "-";
          const r = a.getBoundingClientRect();
          return `${r.width.toFixed(0)}×${r.height.toFixed(0)} 글자 ${n(
            parseFloat(getComputedStyle(a).fontSize)
          )}${a.scrollWidth > a.clientWidth + 1 ? " 넘침" : ""}`;
        })()}`,
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
