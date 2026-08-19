import { useEffect, useState } from "react";

/**
 * 후기·이름이야기 상세 화면에서 본문 아래로 자동으로 붙는 문구·안내문·버튼을
 * 하나씩 따로 재는 임시 진단기. 주소에 sizez 가 있으면 켜진다.
 *
 * 평균으로 묶지 않는다. 요소마다 따로 재고, 크기를 정한 selector 까지 찍는다.
 * 고치지 않는다. 확인이 끝나면 이 파일과 App.tsx 의 사용처를 지운다.
 */
const 확대 = 1.303; // 인앱 화면에서 글자에 곱해지는 배수(실기기 확인값)

/** 한 요소에 실제로 적용된 어떤 속성의 '이긴 선언' 을 찾는다. */
function 이긴선언(el: HTMLElement, 속성: string): string {
  let 최고 = "(못찾음)";
  let 최고점수 = -1;
  for (let i = 0; i < document.styleSheets.length; i++) {
    let rs: CSSRuleList;
    try {
      rs = document.styleSheets[i].cssRules;
    } catch {
      continue;
    }
    const walk = (list: CSSRuleList, cond: string | null) => {
      for (let j = 0; j < list.length; j++) {
        const r = list[j] as CSSStyleRule & { cssRules?: CSSRuleList };
        if (!r.selectorText) {
          if (r.cssRules) walk(r.cssRules, (r as unknown as CSSMediaRule).conditionText || cond);
          continue;
        }
        if (!r.style) continue;
        const v = r.style.getPropertyValue(속성);
        if (!v) continue;
        if (cond && !window.matchMedia(cond).matches) continue;
        const 맞 = r.selectorText.split(",").map((s) => s.trim()).filter((s) => {
          try {
            return el.matches(s);
          } catch {
            return false;
          }
        });
        if (!맞.length) continue;
        const imp = r.style.getPropertyPriority(속성) ? 1000 : 0;
        const sel = 맞[0];
        const 점수 =
          imp +
          (sel.match(/#/g) || []).length * 100 +
          (sel.match(/\.|\[|:(?!:)/g) || []).length * 10 +
          (sel.match(/(^|[\s>+~])[a-zA-Z]/g) || []).length;
        if (점수 >= 최고점수) {
          최고점수 = 점수;
          최고 = `${sel.slice(0, 34)} = ${v}${imp ? " !imp" : ""}`;
        }
      }
    };
    walk(rs, null);
  }
  if (el.style.getPropertyValue(속성)) 최고 = `inline = ${el.style.getPropertyValue(속성)}`;
  return 최고;
}

export function DetailAuditProbe() {
  const [줄, set줄] = useState<string[]>([]);
  const 켜짐 = typeof window !== "undefined" && /sizez/i.test(window.location.pathname);

  useEffect(() => {
    if (!켜짐) return;
    const 실행 = () => {
      const de = document.documentElement;
      const 본문 = document.querySelector(".kna-detail-body");
      if (!본문) {
        set줄(["본문(.kna-detail-body) 없음"]);
        return;
      }
      // 본문 아래(자동문구 블록)부터 페이지 끝까지 — 푸터 포함
      const 대상: HTMLElement[] = [];
      const 담기 = (root: Element | null) => {
        if (!root) return;
        root.querySelectorAll("*").forEach((n) => {
          const e = n as HTMLElement;
          const b = e.getBoundingClientRect();
          if (b.width < 2 || b.height < 2) return;
          if (getComputedStyle(e).visibility === "hidden") return;
          const own = Array.prototype.slice
            .call(e.childNodes)
            .some((c: Node) => c.nodeType === 3 && (c.textContent || "").trim());
          if (own) 대상.push(e);
        });
      };
      담기(document.querySelector(".kna-promo"));
      document.querySelectorAll(".kna-promo a, .kna-promo button").forEach((e) => {
        if (!대상.includes(e as HTMLElement)) 대상.push(e as HTMLElement);
      });

      const 재기 = () =>
        대상.map((e) => {
          const cs = getComputedStyle(e);
          const b = e.getBoundingClientRect();
          return {
            fs: parseFloat(cs.fontSize),
            lh: parseFloat(cs.lineHeight),
            fw: cs.fontWeight,
            w: b.width,
            h: b.height,
          };
        });

      const 인앱중 = de.classList.contains("ua-instagram") || de.classList.contains("ua-tiktok");
      const 표시 = de.classList.contains("ua-instagram") ? "ua-instagram" : "ua-tiktok";
      const A = 재기();
      if (인앱중) de.classList.remove(표시);
      window.setTimeout(() => {
        const B = 재기();
        if (인앱중) de.classList.add(표시);
        const out: string[] = [
          `[자동문구 전수] 폭${window.innerWidth} 표시${de.className || "없음"} 요소${대상.length}개`,
          `A=지금(인앱) B=표시뗀값 · 인앱화면 = A×${확대}`,
        ];
        대상.forEach((e, i) => {
          const 인앱 = 인앱중 ? A[i].fs * 확대 : A[i].fs;
          const 크롬 = 인앱중 ? B[i].fs : A[i].fs;
          const 인앱줄 = 인앱중 ? A[i].lh * 확대 : A[i].lh;
          const 크롬줄 = 인앱중 ? B[i].lh : A[i].lh;
          const 판정 =
            Math.abs(인앱 - 크롬) <= 0.3 ? "동일" : 인앱 > 크롬 ? "인앱이 큼" : "인앱이 작음";
          out.push(
            `${i + 1}. "${(e.textContent || "").trim().slice(0, 18).replace(/\s+/g, " ")}"`,
          );
          out.push(
            `   ${e.tagName} [${(e.className || "").toString().slice(0, 30) || "-"}] inline:${e.getAttribute("style") ? "있음" : "없음"}`,
          );
          out.push(
            `   글자 ${인앱.toFixed(1)}/${크롬.toFixed(1)} · 줄간격 ${인앱줄.toFixed(1)}/${크롬줄.toFixed(1)} · 굵기 ${A[i].fw} → ${판정}`,
          );
          out.push(`   fs출처 ${이긴선언(e, "font-size")}`);
          out.push(`   lh출처 ${이긴선언(e, "line-height")}`);
        });
        set줄(out);
      }, 400);
    };
    const t = window.setTimeout(실행, 2000);
    return () => window.clearTimeout(t);
  }, [켜짐]);

  if (!켜짐 || !줄.length) return null;
  return (
    <div
      style={{
        position: "relative",
        zIndex: 2147483646,
        background: "#fff",
        color: "#000",
        borderBottom: "2px solid #000",
        padding: "6px 5px",
        font: "9px/1.3 monospace",
        whiteSpace: "pre-wrap",
      }}
    >
      {줄.join("\n")}
    </div>
  );
}
