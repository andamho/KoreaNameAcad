import { useEffect, useRef, useState } from "react";

/**
 * 글자 크기 눈금 시험. 주소가 /services/sized 일 때만 뜬다.
 *
 * 이전 시험은 요소를 opacity 로 숨겨 화면 밖에 두었는데, 폰에서 지정값이
 * 전부 한 값으로 뭉개져 결과를 믿을 수 없었다. 그래서 이번에는
 *  - 화면 맨 위에 100% 보이게 두고
 *  - 크기 클래스나 인앱 보정 클래스를 하나도 붙이지 않은 순수 span 으로 만들고
 *  - 같은 크기를 '일반 inline' 과 'inline !important' 두 방식으로 나란히 만든다.
 *
 * 일반만 뭉개지고 important 가 살아나면 우리 CSS 의 !important 가 덮은 것이고,
 * 둘 다 뭉개지면 WebView 쪽 동작이다.
 *
 * 확인이 끝나면 이 파일과 App.tsx 의 사용처를 지운다.
 */
const 눈금 = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32];

type 줄 = {
  키: string;
  지정: string;
  inline: string;
  attr: string;
  computed: string;
  lh: string;
  높이: string;
};

export function RulerProbe() {
  const [rows, setRows] = useState<줄[]>([]);
  const [머리, set머리] = useState("");
  const [규칙, set규칙] = useState<string[]>([]);
  const 좁Ref = useRef<HTMLDivElement>(null);
  const 넓Ref = useRef<HTMLDivElement>(null);

  const 켜짐 = /sized/i.test(
    typeof window === "undefined" ? "" : window.location.pathname
  );

  useEffect(() => {
    if (!켜짐) return;

    const 재기 = () => {
      const de = document.documentElement;
      const out: 줄[] = [];

      [
        ["좁", 좁Ref.current],
        ["넓", 넓Ref.current],
      ].forEach(([폭이름, box]) => {
        if (!box) return;
        (Array.prototype.slice.call(
          (box as HTMLElement).querySelectorAll("span[data-px]")
        ) as HTMLElement[]).forEach((e) => {
          const cs = getComputedStyle(e);
          const r = document.createRange();
          r.selectNodeContents(e);
          out.push({
            키: `${폭이름}${e.dataset.mode}${e.dataset.px}`,
            지정: `${e.dataset.px}px`,
            inline: e.style.fontSize || "-",
            attr: (e.getAttribute("style") || "").replace(/\s+/g, "").slice(0, 26),
            computed: parseFloat(cs.fontSize).toFixed(1),
            lh: parseFloat(cs.lineHeight).toFixed(1),
            높이: r.getBoundingClientRect().height.toFixed(1),
          });
        });
      });

      set머리(
        `폭${window.innerWidth} 뿌리${parseFloat(
          getComputedStyle(de).fontSize
        ).toFixed(2)} body${
          document.body
            ? parseFloat(getComputedStyle(document.body).fontSize).toFixed(2)
            : "-"
        } 표시[${de.className || "없음"}]`
      );

      // 대표 8px 요소에 font-size 를 주는 규칙을 모두 찾는다.
      const 대표 = 좁Ref.current?.querySelector<HTMLElement>(
        'span[data-px="8"][data-mode="A"]'
      );
      const 목록: string[] = [];
      if (대표) {
        for (let i = 0; i < document.styleSheets.length; i++) {
          let rs: CSSRuleList;
          try {
            rs = document.styleSheets[i].cssRules;
          } catch {
            목록.push(`시트${i} 열람불가`);
            continue;
          }
          const walk = (list: CSSRuleList, cond: string | null) => {
            for (let j = 0; j < list.length; j++) {
              const r = list[j] as CSSStyleRule & { cssRules?: CSSRuleList };
              if (r.cssRules) {
                walk(r.cssRules, (r as unknown as CSSMediaRule).conditionText || cond);
                continue;
              }
              if (!r.selectorText || !r.style) continue;
              const v = r.style.getPropertyValue("font-size");
              if (!v) continue;
              const 맞음 = r.selectorText
                .split(",")
                .map((s) => s.trim())
                .filter((s) => {
                  try {
                    return 대표.matches(s);
                  } catch {
                    return false;
                  }
                });
              if (!맞음.length) continue;
              목록.push(
                `${맞음[0].slice(0, 40)} = ${v}${
                  r.style.getPropertyPriority("font-size") ? " !imp" : ""
                }${cond ? ` @${cond}` : ""}`
              );
            }
          };
          walk(rs, null);
        }
      }
      set규칙(목록.length ? 목록.slice(0, 6) : ["매칭 규칙 없음"]);
      setRows(out);
    };

    const t0 = setTimeout(재기, 500);
    const t1 = setTimeout(재기, 2000);
    window.addEventListener("resize", 재기);
    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
      window.removeEventListener("resize", 재기);
    };
  }, [켜짐]);

  // 'inline !important' 는 React 로 지정할 수 없어 ref 콜백에서 직접 준다.
  const 중요 = (px: number) => (el: HTMLSpanElement | null) => {
    if (el) el.style.setProperty("font-size", `${px}px`, "important");
  };

  if (!켜짐) return null;

  const 칸 = (폭: number, ref: React.RefObject<HTMLDivElement>, 이름: string) => (
    <div style={{ marginTop: 4 }}>
      <div style={{ font: "10px/1.2 monospace" }}>{`— ${이름} ${폭}px —`}</div>
      <div ref={ref} style={{ width: `${폭}px`, background: "#fff" }}>
        {눈금.map((px) => (
          <div key={px} style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
            <span data-px={px} data-mode="A" style={{ fontSize: `${px}px` }}>
              가{px}
            </span>
            <span data-px={px} data-mode="B" ref={중요(px)}>
              가{px}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div
      style={{
        position: "relative",
        zIndex: 2147483646,
        background: "#fff",
        color: "#000",
        borderBottom: "2px solid #000",
        padding: "6px 4px",
      }}
    >
      <div style={{ font: "10px/1.3 monospace", whiteSpace: "pre-wrap" }}>
        {`[눈금 시험] A=보통 inline · B=inline !important\n${머리}\n규칙: ${규칙.join(
          " | "
        )}`}
      </div>
      {칸(160, 좁Ref, "좁")}
      {칸(320, 넓Ref, "넓")}
      <div style={{ font: "9px/1.25 monospace", whiteSpace: "pre-wrap" }}>
        {rows
          .map(
            (r) =>
              `${r.키} 지정${r.지정} inline${r.inline} 계산${r.computed} 줄높이${r.lh} 높이${r.높이}`
          )
          .join("\n")}
      </div>
    </div>
  );
}
