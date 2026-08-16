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

      // 어떤 요소든 font-size 를 지정하는 매칭 규칙을 전부 찾아 준다.
      const 추적 = (el: HTMLElement | null | undefined) => {
        if (!el) return ["요소 없음"];
        const 목록: string[] = [];
        let 못연시트 = 0;
        for (let i = 0; i < document.styleSheets.length; i++) {
          let rs: CSSRuleList;
          try {
            rs = document.styleSheets[i].cssRules;
          } catch {
            못연시트 += 1;
            continue;
          }
          const walk = (list: CSSRuleList, cond: string | null) => {
            for (let j = 0; j < list.length; j++) {
              const r = list[j] as CSSStyleRule & { cssRules?: CSSRuleList };
              // 주의: 요즘 브라우저는 일반 규칙도 cssRules 를 갖는다(중첩 지원).
              // 그래서 selectorText 가 있으면 먼저 일반 규칙으로 다룬다.
              if (!r.selectorText) {
                if (r.cssRules) {
                  walk(r.cssRules, (r as unknown as CSSMediaRule).conditionText || cond);
                }
                continue;
              }
              if (!r.style) continue;
              const v = r.style.getPropertyValue("font-size");
              if (!v) continue;
              const 맞음 = r.selectorText
                .split(",")
                .map((s) => s.trim())
                .filter((s) => {
                  try {
                    return el.matches(s);
                  } catch {
                    return false;
                  }
                });
              if (!맞음.length) continue;
              const 켜짐 = cond ? window.matchMedia(cond).matches : true;
              목록.push(
                `${목록.length + 1}) ${맞음[0].slice(0, 46)} = ${v}${
                  r.style.getPropertyPriority("font-size") ? " !imp" : ""
                }${cond ? ` @${cond.slice(0, 22)}${켜짐 ? "" : "(꺼짐)"}` : ""} [시트${i}]`
              );
            }
          };
          walk(rs, null);
        }
        if (못연시트) 목록.push(`(열람불가 시트 ${못연시트}개)`);
        return 목록.length ? 목록 : ["매칭 규칙 없음"];
      };

      const 대표 = 좁Ref.current?.querySelector<HTMLElement>(
        'span[data-px="8"][data-mode="A"]'
      );

      const 줄들: string[] = [];
      줄들.push(
        `[시험 8px A] style="${대표?.getAttribute("style") || "-"}" 계산=${
          대표 ? getComputedStyle(대표).fontSize : "-"
        }`
      );
      추적(대표).forEach((s) => 줄들.push("  " + s));

      // 실제 서비스 페이지 대표 5개도 같은 방식으로 추적한다.
      const 찾기 = (글: string) => {
        const all = Array.prototype.slice.call(
          document.querySelectorAll("main *, section *, body > div *")
        ) as HTMLElement[];
        return all.find(
          (e) =>
            (e.textContent || "").trim().indexOf(글) === 0 &&
            e.getBoundingClientRect().width > 2 &&
            Array.prototype.slice
              .call(e.childNodes)
              .some((n: Node) => n.nodeType === 3 && (n.textContent || "").trim())
        );
      };
      const 실제: Array<[string, string, number, number]> = [
        // 이름, 첫 글자, 크롬 원본, 우리가 의도한 보정값
        ["큰제목", "전문적인 이름 서비스", 32.45, 24.96],
        ["통합솔루션", "진단부터 작명까지", 22.53, 17.33],
        ["이름분석", "이름분석", 18.93, 14.56],
        ["16가지운", "현재 이름에 들어", 16.22, 12.48],
        ["진행과정", "진행과정 보기", 12.62, 9.71],
      ];
      실제.forEach(([이름, 글, 크롬, 의도]) => {
        const e = 찾기(글);
        if (!e) {
          줄들.push(`[${이름}] 못찾음`);
          return;
        }
        const r = document.createRange();
        r.selectNodeContents(e);
        줄들.push(
          `[${이름}] 크롬${크롬} 의도${의도} 계산${parseFloat(
            getComputedStyle(e).fontSize
          ).toFixed(1)} 렌더높이${r.getBoundingClientRect().height.toFixed(1)}`
        );
        줄들.push(`  class=${(e.className || "").toString().slice(0, 60)}`);
        추적(e).forEach((s) => 줄들.push("  " + s));
      });
      set규칙(줄들);
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
        {`[눈금 시험] A=보통 inline · B=inline !important\n${머리}\n${규칙.join("\n")}`}
      </div>
      {칸(160, 좁Ref, "좁")}
      {칸(320, 넓Ref, "넓")}
      <div style={{ font: "10px/1.3 monospace", whiteSpace: "pre-wrap" }}>
        {["좁", "넓"]
          .map((폭) =>
            눈금
              .map((px) => {
                const a = rows.find((r) => r.키 === `${폭}A${px}`);
                const b = rows.find((r) => r.키 === `${폭}B${px}`);
                if (!a || !b) return "";
                return `${폭}${px} A${a.computed}/${a.높이} B${b.computed}/${b.높이} inline${a.inline}`;
              })
              .filter(Boolean)
              .join("\n")
          )
          .join("\n")}
      </div>
    </div>
  );
}
