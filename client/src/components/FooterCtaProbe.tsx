import { useEffect, useState } from "react";

/**
 * 푸터 '지금 신청' 버튼 하나를 실기기에서 재는 임시 측정기.
 * 주소에 ?ftr 을 붙였을 때만 켜진다 (예: /?ftr · /reviews?ftr).
 * 다른 측정기들은 주소에 size 가 들어가면 같이 떠서 같은 자리를 덮는다.
 * 그래서 size 가 안 들어가는 표시를 쓴다.
 *
 * 크롬 338px 에서 맞춰 둔 값과 나란히 보여 준다. 인앱에서 이 근처면 완료다.
 *   가로 87.2 / 세로 28.8 / 글자 12.62 / 줄간격 18.03
 *   좌우 여백 14.42 / 위아래 여백 5.41
 *
 * 이 영역은 크롬 모의측정만 믿었다가 실기기에서 깨졌던 곳이라(64156118),
 * 실기기 숫자를 받기 전에는 완료로 보지 않는다.
 *
 * 재기 전에 전환·애니메이션을 끈다 — 켜 두면 값이 바뀌는 도중에 읽혀
 * 멀쩡한 버튼이 어긋난 것처럼 나온다.
 *
 * 확인이 끝나면 이 파일과 App.tsx 의 사용처를 지운다.
 */
export function FooterCtaProbe() {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    if (!/[?&]ftr/i.test(window.location.search)) return;

    const n = (v: string) => parseFloat(v) || 0;
    const f2 = (v: number) => v.toFixed(2);

    // 푸터에서 대표 글자를 앞글자로 찾는다.
    const 대표 = ["이름이 맑아야", "이름 안에 너 있다", "한글·한자이름만으로", "[정확도", "© 2026"];

    const 재기 = () => {
      const footer = document.querySelector("footer");
      const btn = document.querySelector(
        '[data-testid="button-footer-apply"]'
      ) as HTMLElement | null;
      if (!footer || !btn) return ["푸터/버튼 아직 없음"];

      // 전환·애니메이션을 잠깐 끈다.
      const kill = document.createElement("style");
      kill.textContent =
        "*,*::before,*::after{transition:none !important;animation:none !important}";
      document.head.appendChild(kill);
      // 강제로 다시 계산시킨다.
      void btn.offsetWidth;

      const c = getComputedStyle(btn);
      const r = btn.getBoundingClientRect();
      const arrow = btn.querySelector("span") as HTMLElement | null;

      const out = [
        `[푸터 지금신청] 폭${window.innerWidth} 기준자${f2(
          n(getComputedStyle(document.documentElement).fontSize)
        )}`,
        `가로 ${f2(r.width)}  (크롬 87.2)`,
        `세로 ${f2(r.height)}  (크롬 28.8)`,
        `글자 ${f2(n(c.fontSize))}  (크롬 12.62)`,
        `줄간 ${f2(n(c.lineHeight))}  (크롬 18.03)`,
        `좌우 ${f2(n(c.paddingLeft))}/${f2(n(c.paddingRight))}  (크롬 14.42)`,
        `상하 ${f2(n(c.paddingTop))}/${f2(n(c.paddingBottom))}  (크롬 5.41)`,
        `틈 ${f2(n(c.columnGap || c.gap))}${
          arrow ? ` 화살표여백 ${f2(n(getComputedStyle(arrow).marginLeft))}` : ""
        }`,
      ];

      // 푸터 대표 글자 — 오전에 맞춘 것이 그대로인지 확인용. 크기만 본다.
      const leaves = Array.prototype.slice.call(
        footer.querySelectorAll("span,p,h2,div,a")
      ) as HTMLElement[];
      out.push("[푸터 글자]");
      대표.forEach((t) => {
        const el = leaves.find((e) =>
          Array.prototype.slice
            .call(e.childNodes)
            .some(
              (nd: ChildNode) =>
                nd.nodeType === 3 && (nd.textContent || "").trim().indexOf(t) === 0
            )
        );
        out.push(
          `${t.slice(0, 9)} ${el ? f2(n(getComputedStyle(el).fontSize)) : "없음"}`
        );
      });

      kill.remove();
      return out;
    };

    // 푸터가 그려지고 글꼴이 자리잡은 뒤에 잰다.
    const t1 = window.setTimeout(() => setLines(재기()), 2500);
    const t2 = window.setTimeout(() => setLines(재기()), 5000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  if (!lines.length) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 4,
        right: 4,
        bottom: 4,
        zIndex: 2147483647,
        background: "rgba(10,60,20,0.94)",
        color: "#fff",
        font: "10px/1.35 monospace",
        padding: "5px 7px",
        borderRadius: 6,
        pointerEvents: "none",
        whiteSpace: "pre",
        overflow: "hidden",
        maxHeight: "42vh",
      }}
    >
      {lines.join("\n")}
    </div>
  );
}
