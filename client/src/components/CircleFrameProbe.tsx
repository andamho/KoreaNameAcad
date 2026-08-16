import { useEffect, useState } from "react";

/**
 * 원1 하나만 프레임 단위로 추적하는 임시 진단기. 주소에 size 가 있으면 켜진다.
 *
 * 스크롤이 멈춘 뒤 2초 동안 requestAnimationFrame 으로 매 프레임 아래를 기록하고,
 * 값이 바뀐 프레임만 남긴다. 무엇이 실제로 변하는지(클래스인지, transform 인지,
 * rect 인지) 눈으로 가리기 위한 것이다.
 *
 *  - 바깥 wrapper / 원 / 글자 의 className
 *  - 세 요소의 getComputedStyle().transform
 *  - 세 요소의 getBoundingClientRect().width × height
 *  - 글자의 font-size
 *  - Range.getBoundingClientRect() 로 잰 실제 글자 렌더링 영역
 *  - 원의 부모 3단계 rect
 *
 * transform: scale() 은 레이아웃 크기를 바꾸지 않아 ResizeObserver 로는 못 잡는다.
 * 그래서 관찰자에 기대지 않고 매 프레임 직접 읽는다.
 *
 * 확인이 끝나면 이 파일과 App.tsx 의 사용처를 지운다.
 */
export function CircleFrameProbe() {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    if (!/size/i.test(window.location.href)) return;

    const shortCls = (el: Element | null) => {
      const c = (el && (el.className as unknown)) || "";
      if (typeof c !== "string") return "-";
      // 크기·상태에 관련된 조각만 남긴다 (화면이 좁아서)
      const keep = c
        .split(/\s+/)
        .filter((x) =>
          /^(text-\[|scale-|w-\d|h-\d|border-\[|opacity-|shadow-\[)/.test(x)
        );
      return keep.length ? keep.join(" ") : "(관련없음)";
    };

    const tf = (el: Element | null) => {
      if (!el) return "-";
      const t = getComputedStyle(el).transform;
      if (!t || t === "none") return "none";
      const m = t.match(/matrix\(([-\d.]+)/);
      return m ? `scale${parseFloat(m[1]).toFixed(3)}` : t.slice(0, 18);
    };

    const rect = (el: Element | null) => {
      if (!el) return "-";
      const b = el.getBoundingClientRect();
      return `${b.width.toFixed(1)}×${b.height.toFixed(1)}`;
    };

    // 원1 = 화면에 보이는 첫 번째 모바일 원
    const find = () => {
      const sec = document.querySelector(".kna-value-section");
      if (!sec) return null;
      const txt = (
        Array.prototype.slice.call(sec.querySelectorAll("span")) as HTMLElement[]
      ).filter(
        (e) =>
          typeof e.className === "string" &&
          /text-\[1\.(25|1875)rem\]/.test(e.className) &&
          e.getBoundingClientRect().width > 0
      )[0];
      if (!txt) return null;
      const circle = txt.closest("div.rounded-full") as HTMLElement | null;
      const wrapper = circle?.parentElement || null;
      return { txt, circle, wrapper };
    };

    const snap = () => {
      const t = find();
      if (!t) return "요소없음";
      const { txt, circle, wrapper } = t;
      const cs = getComputedStyle(txt);
      const r = document.createRange();
      r.selectNodeContents(txt);
      const rb = r.getBoundingClientRect();
      const p1 = circle?.parentElement || null;
      const p2 = p1?.parentElement || null;
      const p3 = p2?.parentElement || null;
      return [
        `겉${shortCls(wrapper)}|${tf(wrapper)}|${rect(wrapper)}`,
        `원${shortCls(circle)}|${tf(circle)}|${rect(circle)}`,
        `글${shortCls(txt)}|${tf(txt)}|${rect(txt)}`,
        `크기${parseFloat(cs.fontSize).toFixed(2)}`,
        `렌더${rb.width.toFixed(1)}×${rb.height.toFixed(1)}`,
        `부모${rect(p1)} ${rect(p2)} ${rect(p3)}`,
      ].join("\n");
    };

    let raf = 0;
    let stop = 0;
    let prev = "";
    const run = () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(stop);
      const out: string[] = [];
      prev = "";
      const t0 = performance.now();
      const step = () => {
        const now = Math.round(performance.now() - t0);
        const s = snap();
        if (s !== prev) {
          prev = s;
          out.push(`${now}ms\n${s}`);
          setLines(out.slice(-6));
        }
        if (now < 2000) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };

    // 스크롤이 멈춘 뒤 시작한다.
    const onScroll = () => {
      window.clearTimeout(stop);
      stop = window.setTimeout(run, 160);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    const first = window.setTimeout(run, 1800);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(stop);
      window.clearTimeout(first);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  if (!lines.length) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 4,
        right: 4,
        top: "22%",
        zIndex: 2147483647,
        background: "rgba(0,40,90,0.94)",
        color: "#fff",
        font: "10px/1.35 monospace",
        padding: "6px 7px",
        borderRadius: 6,
        pointerEvents: "none",
        whiteSpace: "pre",
        overflowX: "auto",
        maxHeight: "46%",
      }}
    >
      {["[원1 프레임 기록] 바뀐 프레임만"].concat(lines).join("\n")}
    </div>
  );
}
