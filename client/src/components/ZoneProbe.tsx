import { useEffect, useState } from "react";

/**
 * 체험존 확인용 임시 측정기. 주소 어디에든 zzz 가 있으면 켜진다.
 *   예: korea-name-acad.com/experience-zone#zzz
 *
 * 맨 위에 띄운다 — 아래에 두면 인스타 도구막대에 가린다.
 *
 * 첫 줄의 [주입블록] 이 가장 중요하다. '있음' 이면 폰이 옛 파일을 붙들고 있는
 * 것이고, '없음' 이면 새 파일을 받은 것이다. 새 파일인데도 글자가 크면
 * 그때는 다른 원인을 찾아야 한다.
 *
 * 재기 전에 전환·애니메이션을 끈다. 안 끄면 값이 바뀌는 도중에 읽힌다.
 *
 * 확인이 끝나면 이 파일과 App.tsx 의 사용처를 지운다.
 */
export function ZoneProbe() {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    if (!/zzz/i.test(window.location.href)) return;

    const f2 = (v: number) => v.toFixed(2);
    const size = (el: Element | null) =>
      el ? f2(parseFloat(getComputedStyle(el).fontSize)) : "없음";

    // 앞글자로 찾는다. 크롬 338px 에서 재 둔 값을 괄호에 같이 적는다.
    const 볼것: Array<[string, string]> = [
      ["체험 ZONE", "32.4"],
      ["내 이름으로 직접", "16.2"],
      ["남편복", "16.2"],
      ["이름이 맑아야", "25.2"],
      ["[정확도", "12.6"],
    ];

    const 재기 = () => {
      const kill = document.createElement("style");
      kill.textContent =
        "*,*::before,*::after{transition:none !important;animation:none !important}";
      document.head.appendChild(kill);

      const 주입 =
        document.getElementById("inapp-style-ua-instagram") ||
        document.getElementById("inapp-style-ua-tiktok");

      const all = Array.prototype.slice.call(
        document.querySelectorAll("h1,h2,h3,p,span,div,a,button")
      ) as HTMLElement[];

      const out = [
        `[주입블록] ${주입 ? "있음 — 옛 파일" : "없음 — 새 파일"}`,
        `폭${window.innerWidth} 기준자${f2(
          parseFloat(getComputedStyle(document.documentElement).fontSize)
        )}`,
      ];

      볼것.forEach(([t, 크롬]) => {
        const el = all.find((e) =>
          Array.prototype.slice
            .call(e.childNodes)
            .some(
              (nd: ChildNode) =>
                nd.nodeType === 3 &&
                (nd.textContent || "").trim().indexOf(t) === 0
            )
        );
        out.push(`${t.slice(0, 10)} ${size(el || null)} (크롬 ${크롬})`);
      });

      kill.remove();
      return out;
    };

    const ts = [300, 1200, 3000, 6000].map((ms) =>
      window.setTimeout(() => setLines(재기()), ms)
    );
    return () => ts.forEach((t) => window.clearTimeout(t));
  }, []);

  if (!lines.length) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 4,
        right: 4,
        top: 4,
        zIndex: 2147483647,
        background: "rgba(10,40,80,0.94)",
        color: "#fff",
        font: "11px/1.4 monospace",
        padding: "6px 8px",
        borderRadius: 6,
        pointerEvents: "none",
        whiteSpace: "pre",
        overflow: "hidden",
        maxHeight: "40vh",
      }}
    >
      {lines.join("\n")}
    </div>
  );
}
