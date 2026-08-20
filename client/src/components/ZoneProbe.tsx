import { useEffect, useState } from "react";

/**
 * 체험존 원인 추적용 임시 측정기. 주소 어디에든 zzz 가 있으면 켜진다.
 *   예: korea-name-acad.com/experience-zone?v=18#zzz
 *
 * 실기기에서 떨어진 후보 — 인앱 표시 없음 · 보정 규칙 없음 · 미디어쿼리 ·
 * 글자 상자 폭 · 400px 넓은 요소 · text-size-adjust · overflow · contain.
 * 남은 사실은 '어느 자리에 넣느냐' 로만 1.30 배와 1.56 배가 갈린다는 것뿐이다.
 *
 * 그래서 세 가지를 한 번에 한다.
 *  ① 완전히 같은 조각을 자리만 바꿔 넣어 경계를 찾는다.
 *     태그·inline font-size·line-height·글꼴·굵기·폭을 모두 똑같이 맞춘다.
 *     클래스를 쓰면 자리마다 다른 규칙이 걸릴 수 있어 inline 으로만 준다.
 *  ② 경계로 지목된 곳과 그 부모의 computed 를 나란히 찍는다.
 *  ③ 그 곳의 속성을 하나씩 지워 보며 배율이 돌아오는지 본다(A/B).
 *
 * 39 가 처음 나오는 자리를 원인으로 단정하지 않는다. 경계일 뿐이다.
 *
 * 확인이 끝나면 이 파일과 App.tsx 의 사용처를 지운다.
 */
export function ZoneProbe() {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    if (!/zzz/i.test(window.location.href)) return;

    const f2 = (v: number) => v.toFixed(2);

    // 여섯 자리에 똑같은 조각을 넣는다. 다른 것은 자리뿐이다.
    const 조각만들기 = () => {
      const d = document.createElement("div");
      d.style.fontSize = "25px";
      d.style.lineHeight = "30px";
      d.style.fontFamily = "sans-serif";
      d.style.fontWeight = "400";
      d.style.width = "300px";
      d.style.display = "block";
      d.style.margin = "0";
      d.style.padding = "0";
      d.textContent = "가나다라마바사아자차";
      return d;
    };

    const 재기 = (부모: HTMLElement | null) => {
      if (!부모) return null;
      const d = 조각만들기();
      부모.appendChild(d);
      const v = parseFloat(getComputedStyle(d).fontSize);
      d.remove();
      return v;
    };

    const 재기본 = () => {
      const kill = document.createElement("style");
      kill.textContent =
        "*,*::before,*::after{transition:none !important;animation:none !important}";
      document.head.appendChild(kill);

      const out: string[] = [];
      const page = document.querySelector(
        ".kna-experience-page"
      ) as HTMLElement | null;
      const main = document.querySelector("main") as HTMLElement | null;
      const section = document.querySelector(
        ".kna-experience-page section"
      ) as HTMLElement | null;
      const footer = document.querySelector("footer") as HTMLElement | null;

      // 자리는 원인이 아니었다 — 여섯 자리 모두 32.50 이었다.
      // 예전 시험(class="text-4xl", 폭 auto)은 같은 구역에서 39.00 이었으므로
      // 차이는 조각에 준 조건에 있다. 하나씩 벗겨가며 본다.
      const 구역2 =
        (document.querySelector(".kna-experience-page section") as HTMLElement | null) ||
        document.body;
      const 변형 = (꺾: (d: HTMLDivElement) => void) => {
        const d = document.createElement("div");
        d.textContent = "가나다라마바사아자차";
        꺾(d);
        구역2.appendChild(d);
        const v = parseFloat(getComputedStyle(d).fontSize);
        const w = d.getBoundingClientRect().width;
        d.remove();
        return f2(v) + " w" + Math.round(w);
      };
      out.push("[조건 별] 히어로 안, 32.5=1.30배 39=1.56배");
      out.push(
        " A 크기만 " +
          변형((d) => {
            d.style.fontSize = "25px";
          })
      );
      out.push(
        " B +줄간격 " +
          변형((d) => {
            d.style.fontSize = "25px";
            d.style.lineHeight = "30px";
          })
      );
      out.push(
        " C +폭300 " +
          변형((d) => {
            d.style.fontSize = "25px";
            d.style.lineHeight = "30px";
            d.style.width = "300px";
          })
      );
      out.push(
        " D 폭만300 " +
          변형((d) => {
            d.style.fontSize = "25px";
            d.style.width = "300px";
          })
      );
      out.push(
        " E 클래스 " +
          변형((d) => {
            d.className = "text-4xl";
          })
      );
      out.push(
        " F 클래스+폭 " +
          변형((d) => {
            d.className = "text-4xl";
            d.style.width = "300px";
          })
      );
      out.push(
        " G 클래스+줄간 " +
          변형((d) => {
            d.className = "text-4xl";
            d.style.lineHeight = "30px";
          })
      );
      out.push(
        " H 글자수적음 " +
          변형((d) => {
            d.className = "text-4xl";
            d.textContent = "가";
          })
      );

      // main 과 그 부모의 computed 를 나란히.
      const 볼속성 = [
        "display",
        "flexGrow",
        "flexBasis",
        "flexDirection",
        "width",
        "maxWidth",
        "minWidth",
        "height",
        "minHeight",
        "fontSize",
        "lineHeight",
        "position",
        "overflow",
        "transform",
        "zoom",
        "contain",
        "columnCount",
        "columnWidth",
      ];
      out.push("");
      out.push("[main vs 부모] 다른 것만");
      if (main && main.parentElement) {
        const a = getComputedStyle(main);
        const b = getComputedStyle(main.parentElement);
        볼속성.forEach((k) => {
          const va = (a as unknown as Record<string, string>)[k];
          const vb = (b as unknown as Record<string, string>)[k];
          if (va !== vb) out.push(` ${k}: main=${va} 부모=${vb}`);
        });
        out.push(` 부모=${main.parentElement.tagName}.${
          typeof main.parentElement.className === "string"
            ? main.parentElement.className.split(/\s+/)[0]
            : ""
        }`.slice(0, 40));
      } else {
        out.push(" main 없음");
      }

      // main 의 속성을 하나씩 지워 보며 배율이 돌아오는지.
      out.push("");
      out.push("[main A/B] 32.5면 그게 원인");
      if (main) {
        const 끄기: Array<[string, string]> = [
          ["display", "block"],
          ["flex-grow", "0"],
          ["flex-basis", "auto"],
          ["width", "auto"],
          ["max-width", "none"],
          ["min-height", "0"],
          ["height", "auto"],
          ["position", "static"],
          ["overflow", "visible"],
          ["contain", "none"],
          ["padding", "0"],
        ];
        끄기.forEach(([prop, val]) => {
          const 전 = main.style.getPropertyValue(prop);
          const 전우선 = main.style.getPropertyPriority(prop);
          main.style.setProperty(prop, val, "important");
          const v = 재기(main);
          if (전) main.style.setProperty(prop, 전, 전우선);
          else main.style.removeProperty(prop);
          out.push(` ${prop}=${val} → ${v === null ? "-" : f2(v)}`);
        });
      }

      kill.remove();
      return out;
    };

    const ts = [900, 2600, 5200].map((ms) =>
      window.setTimeout(() => setLines(재기본()), ms)
    );
    return () => ts.forEach((t) => window.clearTimeout(t));
  }, []);

  if (!lines.length) return null;

  return (
    <div
      data-kna-probe="1"
      style={{
        position: "fixed",
        left: 2,
        right: 2,
        top: 2,
        zIndex: 2147483647,
        background: "rgba(10,40,80,0.96)",
        color: "#fff",
        font: "11px/1.4 monospace",
        padding: "5px 6px",
        borderRadius: 6,
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
        overflowY: "auto",
        maxHeight: "92vh",
      }}
    >
      {lines.join("\n")}
    </div>
  );
}
