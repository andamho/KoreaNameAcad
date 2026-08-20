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
      // 기준 하나를 정해 두고 변수를 한 번에 하나씩만 바꿜다.
      // 태그·글꿴·굵기·display·글자 내용은 모두 같게 못박는다.
      // 클래스를 쓰는 것들도 글꿴·굵기·display 는 같이 못박아서
      // 클래스가 기여하는 것이 크기와 줄간격뿐이 되게 한다.
      const 글 = "가나다라마바사아자차";
      const 변형 = (꺾: (d: HTMLDivElement) => void) => {
        const d = document.createElement("div");
        d.style.fontFamily = "sans-serif";
        d.style.fontWeight = "400";
        d.style.display = "block";
        d.style.margin = "0";
        d.style.padding = "0";
        d.textContent = 글;
        꺾(d);
        구역2.appendChild(d);
        // 부품림은 글을 실제로 배치할 때만 걸린다. display:none 으로 먼저 읽으면
        // 부품리기 전 CSS 계산값을 알 수 있다. 조각들이 정말 같은 크기인지
        // 확인해야 비교가 유효하다.
        const 전d = d.style.display;
        d.style.display = "none";
        const css = parseFloat(getComputedStyle(d).fontSize);
        d.style.display = 전d;
        const v = parseFloat(getComputedStyle(d).fontSize);
        const w = d.getBoundingClientRect().width;
        d.remove();
        return f2(css) + "→" + f2(v) + " w" + Math.round(w);
      };
      const 재 = (이름: string, 꺾: (d: HTMLDivElement) => void) =>
        out.push(` ${이름} ${변형(꺾)}`);

      out.push("[조건별] 히어로 안 · 32.5=1.30배 39=1.56배");
      // 기준: inline 크기만
      재("A 기준25px", (d) => {
        d.style.fontSize = "25px";
      });
      재("B +줄간30", (d) => {
        d.style.fontSize = "25px";
        d.style.lineHeight = "30px";
      });
      재("C +폭300", (d) => {
        d.style.fontSize = "25px";
        d.style.width = "300px";
      });
      재("D +줄간+폭", (d) => {
        d.style.fontSize = "25px";
        d.style.lineHeight = "30px";
        d.style.width = "300px";
      });
      // 클래스 쪽 — 크기·줄간격만 클래스에서 온다
      재("E 클래스", (d) => {
        d.className = "text-4xl";
      });
      재("F 클+폭300", (d) => {
        d.className = "text-4xl";
        d.style.width = "300px";
      });
      재("G 클+줄간30", (d) => {
        d.className = "text-4xl";
        d.style.lineHeight = "30px";
      });
      재("H 한자만", (d) => {
        d.style.fontSize = "25px";
        d.textContent = "가";
      });

      // 여덟 개가 모두 같을 때를 대비해 다음 변수도 미리 찍는다.
      // A~M 에서 단일 변수 열 개가 모두 32.50 이고 클래스를 쓴 E/F/G 만 39 였다.
      // G(클래스 + 줄간격 inline 덮어쓰기)가 39 이므로 줄간격은 아니고,
      // F(클래스 + 폭)도 39 이므로 폭도 아니다.
      // 남은 차이는 둘뿐이다 — 선언을 inline 로 하느냐 스타일시트로 하느냐,
      // 그리고 단위가 px 이냐 rem 이냐. 두 축을 가른다.
      const 시트 = document.createElement("style");
      시트.textContent =
        ".knaTestPx{font-size:25px}" +
        ".knaTestRem{font-size:1.7308rem}" +
        ".knaTestEm{font-size:1.7308em}";
      document.head.appendChild(시트);

      out.push("[축 가르기] 선언방식 · 단위");
      재("N inline-rem", (d) => {
        d.style.fontSize = "1.7308rem";
      });
      재("O 시트-px", (d) => {
        d.className = "knaTestPx";
      });
      재("P 시트-rem", (d) => {
        d.className = "knaTestRem";
      });
      재("Q 시트-em", (d) => {
        d.className = "knaTestEm";
      });
      재("R 클+inline px", (d) => {
        d.className = "text-4xl";
        d.style.fontSize = "25px";
      });
      재("S 클+inline rem", (d) => {
        d.className = "text-4xl";
        d.style.fontSize = "1.7308rem";
      });
      // 결정적 시험 — 같은 클래스를 푸터에 넣으면?
      // 39 가 나오면 자리와 무관하게 '클래스가 같은 것끼리 묶여' 배율을
      // 나눠 쓴다는 뜻이다. 32.5 면 자리도 같이 작용하는 것이다.
      const 푸터자리 = document.querySelector("footer") as HTMLElement | null;
      if (푸터자리) {
        const d2 = document.createElement("div");
        d2.style.fontFamily = "sans-serif";
        d2.style.fontWeight = "400";
        d2.style.display = "block";
        d2.style.margin = "0";
        d2.style.padding = "0";
        d2.textContent = 글;
        d2.className = "text-4xl";
        d2.style.fontSize = "25px";
        푸터자리.appendChild(d2);
        d2.style.display = "none";
        const css2 = parseFloat(getComputedStyle(d2).fontSize);
        d2.style.display = "block";
        const v2 = parseFloat(getComputedStyle(d2).fontSize);
        d2.remove();
        out.push(` T 클+px를푸터에 ${f2(css2)}→${f2(v2)}`);
      }
      시트.remove();

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
