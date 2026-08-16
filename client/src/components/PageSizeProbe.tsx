import { useEffect, useState } from "react";

/**
 * 지금 보고 있는 페이지의 글자 크기를 실기기에서 그대로 재는 임시 측정기.
 * 주소에 size 가 있으면 켜진다. (예: /services?size)
 *
 * 두 가지를 보여준다.
 *  1) 이름 붙인 표본 몇 개 — 글자 크기와 상자 크기
 *  2) 페이지 전체의 글자 크기 분포 (크기:개수)
 *
 * 분포를 크롬 값과 나란히 놓으면 "전부 큰지" "일부만 큰지"가 한 번에 갈린다.
 * 전환(transition)이 걸린 요소가 있으므로 화면이 자리잡은 뒤에 재고,
 * 스크롤할 때마다 다시 잰다.
 *
 * 확인이 끝나면 이 파일과 App.tsx 의 사용처를 지운다.
 */
const 표본: Array<[string, string]> = [
  ["통합솔루션", "진단부터 작명까지"],
  ["진행과정", "진행과정 보기"],
  ["이름분석", "이름분석"],
  ["신청", "신청하기"],
  ["자세히", "자세히 보기"],
  ["16가지운", "현재 이름에 들어"],
  ["적합도", "타 작명소에서"],
];

export function PageSizeProbe() {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    if (!/size/i.test(window.location.href)) return;

    const measure = () => {
      const els: HTMLElement[] = [];
      document.querySelectorAll("body *").forEach((n) => {
        const e = n as HTMLElement;
        const b = e.getBoundingClientRect();
        if (b.width < 2 || b.height < 2) return;
        if (getComputedStyle(e).visibility === "hidden") return;
        const own = Array.prototype.slice
          .call(e.childNodes)
          .some((c: Node) => c.nodeType === 3 && (c.textContent || "").trim());
        if (own) els.push(e);
      });
      if (!els.length) return;

      const 분포: Record<string, number> = {};
      els.forEach((e) => {
        const k = parseFloat(getComputedStyle(e).fontSize).toFixed(1);
        분포[k] = (분포[k] || 0) + 1;
      });

      const out: string[] = [
        `폭 ${window.innerWidth} · 기준자 ${parseFloat(
          getComputedStyle(document.documentElement).fontSize
        ).toFixed(2)}`,
      ];

      표본.forEach(([name, text]) => {
        const e = els.find((x) => (x.textContent || "").trim().indexOf(text) === 0);
        if (!e) return;
        const b = e.getBoundingClientRect();
        out.push(
          `${name} ${parseFloat(getComputedStyle(e).fontSize).toFixed(
            1
          )}px 상자${b.width.toFixed(0)}×${b.height.toFixed(0)}`
        );
      });

      out.push(
        "분포 " +
          Object.keys(분포)
            .sort((a, b) => parseFloat(b) - parseFloat(a))
            .map((k) => `${k}:${분포[k]}`)
            .join(" ")
      );
      setLines(out);
    };

    // 전환이 끝난 뒤에 재고, 스크롤로 늦게 나타나는 것도 다시 잰다.
    const t1 = setTimeout(measure, 1800);
    const t2 = setTimeout(measure, 4000);
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
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
        background: "rgba(20,0,60,0.93)",
        color: "#fff",
        font: "9px/1.3 monospace",
        padding: "4px 6px",
        borderRadius: 6,
        pointerEvents: "none",
        whiteSpace: "pre-wrap",
        maxHeight: "30vh",
        overflow: "hidden",
      }}
    >
      {["[페이지 글자 크기]"].concat(lines).join("\n")}
    </div>
  );
}
