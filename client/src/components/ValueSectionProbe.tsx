import { useEffect, useState } from "react";

/**
 * '두 번의 확인, 평생의 안심' 구간 6개 요소를, 그 자리에서 실제 렌더된 값으로 재는
 * 임시 측정기. 주소에 size 라는 글자가 있으면 켜진다.
 *
 * 예상값(computed × 1.3 같은 것)은 절대 보여주지 않는다. 지금 화면에 실제로
 * 그려진 결과만 보여준다.
 *
 * 재는 값
 *  - window.innerWidth
 *  - getComputedStyle().fontSize / lineHeight
 *  - getBoundingClientRect().width / height   (요소 상자)
 *  - Range.getBoundingClientRect().width / height  (실제 글자 영역)
 *  - Range.getClientRects().length            (실제 줄 수)
 *
 * 확인이 끝나면 이 파일과 App.tsx 의 사용처를 지운다.
 */
type Row = {
  name: string;
  fs: number | null;
  lh: string;
  boxW: number;
  boxH: number;
  textW: number;
  textH: number;
  lines: number;
};

export function ValueSectionProbe() {
  const [rows, setRows] = useState<Row[]>([]);
  const [vw, setVw] = useState(0);

  useEffect(() => {
    if (!/size/i.test(window.location.href)) return;

    const all = (sel: string) =>
      Array.prototype.slice.call(document.querySelectorAll(sel)) as HTMLElement[];

    const measure = () => {
      const sec = document.querySelector(".kna-value-section");
      if (!sec) {
        setRows([]);
        return;
      }

      // 실제 글자가 차지한 영역과 줄 수는 Range 로 잰다.
      const rangeOf = (el: HTMLElement) => {
        const r = document.createRange();
        r.selectNodeContents(el);
        const box = r.getBoundingClientRect();
        const lines = r.getClientRects().length;
        r.detach?.();
        return { w: box.width, h: box.height, lines };
      };

      const pick = (name: string, el: HTMLElement | undefined | null): Row | null => {
        if (!el) return null;
        const cs = getComputedStyle(el);
        const b = el.getBoundingClientRect();
        const t = rangeOf(el);
        return {
          name,
          fs: parseFloat(cs.fontSize),
          lh: cs.lineHeight,
          boxW: b.width,
          boxH: b.height,
          textW: t.w,
          textH: t.h,
          lines: t.lines,
        };
      };

      const title = all(".kna-value-section h2, .kna-value-section h3, .kna-value-section span").find(
        (e) => (e.textContent || "").includes("평생의 안심")
      );
      const desc = all(".kna-value-section p").find((e) =>
        (e.textContent || "").includes("철저한 검증")
      );
      const step1 = all(".kna-value-section .step-label").find((e) =>
        (e.textContent || "").includes("STEP 01")
      );
      const step2 = all(".kna-value-section .step-label").find((e) =>
        (e.textContent || "").includes("STEP 02")
      );
      const h1 = all(".kna-value-section h3").find((e) =>
        (e.textContent || "").includes("1차 검증")
      );
      const h2 = all(".kna-value-section h3").find((e) =>
        (e.textContent || "").includes("2차 검증")
      );

      // 원 안 글자 — 스크롤에 따라 1.1875rem ↔ 1.25rem 으로 바뀌는 요소.
      // 화면에 실제로 보이는 것만 고른다.
      const circles = all(".kna-value-section span").filter((e) => {
        const c = e.className;
        return (
          typeof c === "string" &&
          /text-\[1\.(25|1875)rem\]/.test(c) &&
          e.getBoundingClientRect().width > 0
        );
      });

      const out = [
        pick("안심제목", title),
        pick("설명문", desc),
        pick("STEP01", step1),
        pick("STEP01내용", h1),
        pick("STEP02", step2),
        pick("STEP02내용", h2),
      ].filter(Boolean) as Row[];

      // 원 자체 크기도 같이 본다 (글자가 원 밖으로 나가는지 판단하려고)
      circles.forEach((el, i) => {
        const r = pick(
          `원${i + 1}${/1\.25rem/.test(el.className as string) ? "후" : "전"}`,
          el
        );
        if (!r) return;
        const circle = el.closest("div.rounded-full") as HTMLElement | null;
        if (circle) {
          const cb = circle.getBoundingClientRect();
          r.name += `/원${cb.width.toFixed(0)}`;
        }
        out.push(r);
      });

      setVw(window.innerWidth);
      setRows(out);
    };

    // 글꼴 로딩과 전환이 끝난 뒤 재고, 스크롤로 늦게 나타나는 것도 다시 잰다.
    const t1 = setTimeout(measure, 1500);
    const t2 = setTimeout(measure, 4000);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, []);

  if (!rows.length) return null;

  const n = (v: number | null) => (v == null ? "-" : v.toFixed(1));

  return (
    <div
      style={{
        position: "fixed",
        left: 6,
        right: 6,
        bottom: 6,
        zIndex: 2147483647,
        background: "rgba(0,0,0,0.9)",
        color: "#fff",
        font: "11px/1.45 monospace",
        padding: "7px 8px",
        borderRadius: 8,
        pointerEvents: "none",
        whiteSpace: "pre",
        overflowX: "auto",
      }}
    >
      {[`실측 · 화면폭 ${vw}`]
        .concat(
          rows.map(
            (r) =>
              `${r.name} ${n(r.fs)}px 줄높이${parseFloat(r.lh).toFixed(1)} 글자${n(
                r.textW
              )}×${n(r.textH)} ${r.lines}줄`
          )
        )
        .join("\n")}
    </div>
  );
}
