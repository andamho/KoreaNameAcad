import { useEffect, useState } from "react";

/**
 * 체험존 폭 조사용 임시 측정기. 주소 어디에든 zzz 가 있으면 켜진다.
 *   예: korea-name-acad.com/experience-zone?v=15#zzz
 *
 * 지금까지 실기기에서 확정된 것
 *   - ua-instagram 표시 있음, 보정 규칙 있음(1.7308rem), 미디어쿼리 맞음
 *   - 히어로 구역 안이면 무엇이든 1.56 배, 바깥은 1.30 배
 *   - 조각 자신에게 max-height / text-size-adjust 를 줘도 안 막힘
 *   - 히어로 자식 폭을 150→309 로 늘려도 배율은 그대로
 *
 * 마지막 것으로 폐기된 것은 '그 자식의 폭' 하나뿐이다. 폭 원인 전체는 아직
 * 살아 있으므로 화면 폭·문서 폭·조상 사슬·넓은 요소를 한 번에 찍는다.
 * 시험 조각은 넣은 값이 아니라 실제 computed 값을 함께 찍는다.
 *
 * 확인이 끝나면 이 파일과 App.tsx 의 사용처를 지운다.
 */
export function ZoneProbe() {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    if (!/zzz/i.test(window.location.href)) return;

    const f0 = (v: number) => String(Math.round(v));
    const f2 = (v: number) => v.toFixed(2);

    const 재기 = () => {
      const kill = document.createElement("style");
      kill.textContent =
        "*,*::before,*::after{transition:none !important;animation:none !important}";
      document.head.appendChild(kill);

      const out: string[] = [];
      const de = document.documentElement;
      const vv = (window as unknown as { visualViewport?: { width: number } })
        .visualViewport;

      out.push("[폭]");
      out.push(` inner${f0(window.innerWidth)} client${f0(de.clientWidth)}`);
      out.push(
        ` docScr${f0(de.scrollWidth)} bodyScr${f0(document.body.scrollWidth)}`
      );
      out.push(
        ` visualVP${vv ? f0(vv.width) : "-"} 기준자${f2(
          parseFloat(getComputedStyle(de).fontSize)
        )}`
      );

      const 문제 = Array.prototype.slice
        .call(document.querySelectorAll("h1,h2,p,span,div"))
        .find((e: HTMLElement) =>
          Array.prototype.slice
            .call(e.childNodes)
            .some(
              (n: ChildNode) =>
                n.nodeType === 3 &&
                (n.textContent || "").trim().indexOf("체험 ZONE") === 0
            )
        ) as HTMLElement | undefined;

      out.push("");
      out.push("[조상] 체험ZONE→html");
      if (!문제) {
        out.push(" 못 찾음");
      } else {
        let p: HTMLElement | null = 문제;
        let i = 0;
        while (p && i < 12) {
          const b = p.getBoundingClientRect();
          const c = getComputedStyle(p);
          const 이름 =
            p.tagName +
            (typeof p.className === "string" && p.className
              ? "." + p.className.split(/\s+/).slice(0, 2).join(".")
              : "");
          out.push(` ${i} ${이름.slice(0, 28)}`);
          out.push(
            `  rect${f0(b.width)} cli${f0(p.clientWidth)} scr${f0(p.scrollWidth)}`
          );
          out.push(`  w=${c.width} max=${c.maxWidth} min=${c.minWidth}`);
          out.push(`  ovx=${c.overflowX} pos=${c.position} d=${c.display}`);
          const 특이 = [
            c.transform !== "none" ? "tf=" + c.transform.slice(0, 16) : "",
            c.zoom && c.zoom !== "1" ? "zoom=" + c.zoom : "",
            c.contain && c.contain !== "none" ? "contain=" + c.contain : "",
          ]
            .filter(Boolean)
            .join(" ");
          if (특이) out.push("  " + 특이);
          p = p.parentElement;
          i++;
        }
      }

      // 넓은 요소를 세 부류로 가른다.
      //  ① 문제 글자와 같은 레이아웃 나무 안 — 진짜 후보
      //  ② 떠 있는 것(fixed) · 측정기 — 레이아웃을 안 밀므로 별도 표기
      //  ③ 그 밖 페이지 요소
      const 구역 = document.querySelector(
        ".kna-experience-page section"
      ) as HTMLElement | null;
      type 넓 = { n: string; w: number; r: number; 갈: string };
      const 넓은: 넓[] = [];
      Array.prototype.slice
        .call(document.querySelectorAll("body *"))
        .forEach((e: HTMLElement) => {
          const b = e.getBoundingClientRect();
          if (b.width <= 338 && b.right <= 338) return;
          const c = getComputedStyle(e);
          let 갈 = "③그밖";
          if (e.closest("[data-kna-probe]")) 갈 = "②측정기";
          else if (c.position === "fixed") 갈 = "②fixed";
          else if (문제 
            ? e.contains(문제) || (구역 ? 구역.contains(e) : false)
            : false)
            갈 = "①히어로트리";
          넓은.push({
            n:
              e.tagName +
              (typeof e.className === "string" && e.className
                ? "." + e.className.split(/\s+/)[0]
                : ""),
            w: b.width,
            r: b.right,
            갈,
          });
        });
      넓은.sort((a, b) => b.w - a.w);
      out.push("");
      const 후보 = 넓은.filter((o) => o.갈 === "①히어로트리");
      const 밖 = 넓은.filter((o) => o.갈 === "③그밖");
      const 떠있 = 넓은.filter((o) => o.갈.indexOf("②") === 0);
      out.push(
        `[넓은요소] 총${넓은.length} ①후보${후보.length} ②떠있${떠있.length} ③밖${밖.length}`
      );
      out.push(" ① 히어로 나무 안 (진짜 후보)");
      if (!후보.length) out.push("   없음");
      후보.slice(0, 10).forEach((o) =>
        out.push(`   ${o.n.slice(0, 22)} w${f0(o.w)} r${f0(o.r)}`)
      );
      out.push(" ③ 그 밖");
      밖.slice(0, 8).forEach((o) =>
        out.push(`   ${o.n.slice(0, 22)} w${f0(o.w)} r${f0(o.r)}`)
      );
      out.push(" ② 떠있는 것(레이아웃 무관)");
      떠있.slice(0, 5).forEach((o) =>
        out.push(`   ${o.n.slice(0, 22)} w${f0(o.w)}`)
      );

      // 조상 중 rect 는 정상인데 scrollWidth 만 큰 곳을 찾아,
      // 어떤 자식이 안에서 밀고 있는지 본다.
      out.push("");
      out.push("[안에서 미는 자식]");
      let 범인찾음 = false;
      if (문제) {
        let p2: HTMLElement | null = 문제;
        while (p2) {
          const b2 = p2.getBoundingClientRect();
          if (b2.width <= 400 && p2.scrollWidth >= 400) {
            범인찾음 = true;
            out.push(
              ` ${p2.tagName}.${
                typeof p2.className === "string"
                  ? p2.className.split(/\s+/)[0]
                  : ""
              }`.slice(0, 30)
            );
            out.push(`  rect${f0(b2.width)} scr${f0(p2.scrollWidth)}`);
            const 범 = Array.prototype.slice
              .call(p2.querySelectorAll("*"))
              .map((c2: HTMLElement) => ({
                n: c2.tagName + "." + (typeof c2.className === "string" ? c2.className.split(/\s+/)[0] : ""),
                w: c2.getBoundingClientRect().width,
                r: c2.getBoundingClientRect().right,
              }))
              .filter((o: { w: number }) => o.w > b2.width + 1)
              .sort((x: { w: number }, y: { w: number }) => y.w - x.w);
            범.slice(0, 5).forEach((o: { n: string; w: number; r: number }) =>
              out.push(`   → ${o.n.slice(0, 20)} w${f0(o.w)} r${f0(o.r)}`)
            );
          }
          p2 = p2.parentElement;
        }
      }
      if (!범인찾음) out.push(" rect 정상 + scr≥400 인 조상 없음");

      const 히어로 =
        (document.querySelector(
          ".kna-experience-page section"
        ) as HTMLElement | null) || document.body;
      out.push("");
      out.push("[시험조각] 목표25.03");
      const 시험들: Array<[string, number]> = [
        ["그대로", 0],
        ["maxH", 1],
        ["none", 2],
        ["100%", 3],
      ];
      // 히어로 구역의 overflow 를 잠긐 바꿔 보는 시험을 먼저 한다.
      // SECTION 의 overflow:hidden 이 별도 덩어리를 만들어 배율이
      // 달라지는지를 가린다. 푸터는 overflow 가 visible 라 바깥 덩어리에 속한다.
      const 재기 = (부모: HTMLElement) => {
        const d = document.createElement("div");
        d.className = "text-4xl";
        d.textContent = "가나다라마바사";
        부모.appendChild(d);
        const v = parseFloat(getComputedStyle(d).fontSize);
        d.remove();
        return v;
      };
      const 전ovx = 히어로.style.overflow;
      out.push(` body에 ${f2(재기(document.body))}`);
      히어로.style.overflow = "visible";
      out.push(` ovx풀면 ${f2(재기(히어로))}`);
      히어로.style.overflow = 전ovx;
      const 전contain = 히어로.style.contain;
      히어로.style.contain = "none";
      out.push(` contain끔 ${f2(재기(히어로))}`);
      히어로.style.contain = 전contain;

      시험들.forEach(([이름, mode]) => {
        const d = document.createElement("div");
        d.className = "text-4xl";
        d.textContent = "가나다라마바사";
        if (mode === 1) d.style.maxHeight = "999999px";
        if (mode === 2) d.style.setProperty("-webkit-text-size-adjust", "none");
        if (mode === 3) d.style.setProperty("-webkit-text-size-adjust", "100%");
        히어로.appendChild(d);
        const cs = getComputedStyle(d);
        const tsa =
          cs.getPropertyValue("-webkit-text-size-adjust") ||
          cs.getPropertyValue("text-size-adjust") ||
          "(빈)";
        const v = parseFloat(cs.fontSize);
        const w = d.getBoundingClientRect().width;
        d.remove();
        out.push(` ${이름} ${f2(v)} w${f0(w)} tsa=${tsa}`);
      });

      kill.remove();
      return out;
    };

    const ts = [800, 2500, 5000].map((ms) =>
      window.setTimeout(() => setLines(재기()), ms)
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
        font: "10px/1.35 monospace",
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
