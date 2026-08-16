import { useEffect, useState } from "react";

/**
 * 임시 감사기. 주소에 sizee 가 있으면 켜진다. (예: /services/sizee)
 *
 * 두 가지를 한다.
 *
 * 1) 전수 비교 — 화면의 모든 글자 요소를 두 번 잰다.
 *    (가) 지금 상태(인앱 표시 있음)
 *    (나) 인앱 표시를 잠깐 뗀 상태
 *    인앱 확대는 균일한 ×1.303 이므로 (나) ÷ 1.303 이 크롬 값이 된다.
 *    실기기에서 크롬 값을 따로 들고 오지 않아도 요소별로 맞출 수 있다.
 *    폭·줄수·줄높이가 어긋난 요소만 목록으로 보여준다.
 *
 * 2) 주입 스타일 수명 — <head> 의 inapp-style-* 태그 상태를 항상 보여준다.
 *    페이지를 옮겨 다니며 태그가 몇 개 생기고 지워지는지, 인앱 표시가
 *    남아 있는지 눈으로 따라갈 수 있다.
 *
 * 확인이 끝나면 이 파일과 App.tsx 의 사용처를 지운다.
 */
const 확대 = 1.303;

export function AuditProbe() {
  const [줄, set줄] = useState<string[]>([]);

  const 켜짐 =
    typeof window !== "undefined" && /sizee/i.test(window.location.pathname);

  useEffect(() => {
    if (!켜짐) return;

    const 모으기 = () => {
      const out: HTMLElement[] = [];
      document.querySelectorAll("body *").forEach((n) => {
        const e = n as HTMLElement;
        if (e.closest("[data-audit]")) return; // 감사기 자신은 뺀다
        const b = e.getBoundingClientRect();
        if (b.width < 2 || b.height < 2) return;
        if (getComputedStyle(e).visibility === "hidden") return;
        const own = Array.prototype.slice
          .call(e.childNodes)
          .some((c: Node) => c.nodeType === 3 && (c.textContent || "").trim());
        if (own) out.push(e);
      });
      return out;
    };

    const 재기 = (els: HTMLElement[]) =>
      els.map((e) => {
        const cs = getComputedStyle(e);
        const r = document.createRange();
        r.selectNodeContents(e);
        const b = r.getBoundingClientRect();
        return {
          fs: parseFloat(cs.fontSize),
          lh: parseFloat(cs.lineHeight),
          lines: r.getClientRects().length,
          w: b.width,
        };
      });

    const 실행 = () => {
      const de = document.documentElement;
      const els = 모으기();
      if (!els.length) return;

      const 인앱표시 = de.classList.contains("ua-instagram")
        ? "ua-instagram"
        : de.classList.contains("ua-tiktok")
        ? "ua-tiktok"
        : "";

      const A = 재기(els);

      if (인앱표시) de.classList.remove(인앱표시);
      window.setTimeout(() => {
        const B = 재기(els);
        if (인앱표시) de.classList.add(인앱표시);

        const 결과: string[] = [];
        const 배수 = 인앱표시 ? 확대 : 1;
        let 크기틀림 = 0;
        let 줄틀림 = 0;
        const 크기목록: string[] = [];
        const 줄목록: string[] = [];
        const 작은것: string[] = [];

        els.forEach((e, i) => {
          const 크롬 = B[i].fs / 배수;
          const 차 = A[i].fs - 크롬;
          const 글 = (e.textContent || "").trim().slice(0, 10).replace(/\s+/g, " ");
          if (Math.abs(차) > 0.3) {
            크기틀림 += 1;
            if (크기목록.length < 8)
              크기목록.push(
                `${글} 크롬${크롬.toFixed(1)} 인앱${A[i].fs.toFixed(1)} 차${차.toFixed(1)}`
              );
          }
          if (A[i].lines !== B[i].lines) {
            줄틀림 += 1;
            if (줄목록.length < 8)
              줄목록.push(
                `${글} 크롬${B[i].lines}줄 인앱${A[i].lines}줄 크기${A[i].fs.toFixed(
                  1
                )} 줄높이${A[i].lh.toFixed(1)} 폭${A[i].w.toFixed(0)}`
              );
          }
          if (A[i].fs <= 10.6 && 작은것.length < 6) {
            작은것.push(
              `${글} ${A[i].fs.toFixed(1)} ← ${(e.className || "")
                .toString()
                .slice(0, 34)}`
            );
          }
        });

        // 가로로 넘치는 요소
        let 넘침 = 0;
        els.forEach((e) => {
          const b = e.getBoundingClientRect();
          if (b.right > window.innerWidth + 1 || b.left < -1) 넘침 += 1;
        });

        결과.push(`[감사] 표시${인앱표시 || "없음"} 요소${els.length}개`);
        결과.push(
          `크기어긋남 ${크기틀림}개 · 줄수어긋남 ${줄틀림}개 · 넘침 ${넘침}개 · 문서폭 ${document.documentElement.scrollWidth}`
        );
        크기목록.forEach((s) => 결과.push(" 크기 " + s));
        줄목록.forEach((s) => 결과.push(" 줄 " + s));
        결과.push("가장 작은 글자:");
        작은것.forEach((s) => 결과.push(" " + s));

        // 버튼 줄높이 추적 — 어떤 선언이 이기는지 이름으로 본다.
        const 버튼 = els.find(
          (e) => (e.textContent || "").trim().indexOf("진행과정 보기") === 0
        );
        if (버튼) {
          const cs = getComputedStyle(버튼);
          결과.push(
            `[버튼] 크기${parseFloat(cs.fontSize).toFixed(1)} 줄높이${parseFloat(
              cs.lineHeight
            ).toFixed(1)} 상자${버튼.getBoundingClientRect().height.toFixed(0)}`
          );
          결과.push(
            ` class=${(버튼.className || "").toString().slice(0, 46)}`
          );
          const 목록: string[] = [];
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
                  if (r.cssRules)
                    walk(
                      r.cssRules,
                      (r as unknown as CSSMediaRule).conditionText || cond
                    );
                  continue;
                }
                if (!r.style) continue;
                const v = r.style.getPropertyValue("line-height");
                if (!v) continue;
                const 맞 = r.selectorText
                  .split(",")
                  .map((s) => s.trim())
                  .filter((s) => {
                    try {
                      return 버튼.matches(s);
                    } catch {
                      return false;
                    }
                  });
                if (!맞.length) continue;
                const 켜 = cond ? window.matchMedia(cond).matches : true;
                목록.push(
                  ` ${목록.length + 1}) ${맞[0].slice(0, 40)} = ${v}${
                    r.style.getPropertyPriority("line-height") ? " !imp" : ""
                  }${cond ? ` @${cond.slice(0, 20)}${켜 ? "" : "(꺼짐)"}` : ""} [시트${i}]`
                );
              }
            };
            walk(rs, null);
          }
          (목록.length ? 목록 : [" 매칭 line-height 규칙 없음"]).forEach((s) =>
            결과.push(s)
          );
        }
        set줄(결과);
      }, 350);
    };

    const t1 = window.setTimeout(실행, 2200);
    return () => window.clearTimeout(t1);
  }, [켜짐]);

  if (!켜짐) return null;

  const 태그 =
    typeof document === "undefined"
      ? []
      : (Array.prototype.slice.call(
          document.querySelectorAll('style[id^="inapp-style"]')
        ) as HTMLStyleElement[]);

  return (
    <div
      data-audit
      style={{
        position: "relative",
        zIndex: 2147483646,
        background: "#fff",
        color: "#000",
        borderBottom: "2px solid #000",
        padding: "6px 5px",
        font: "10px/1.35 monospace",
        whiteSpace: "pre-wrap",
      }}
    >
      {[
        `[주입태그] ${태그.length}개 ${태그
          .map((s) => `${s.id}(${s.textContent?.length ?? 0}자)`)
          .join(" ")}`,
        `[표시] ${document.documentElement.className || "없음"}`,
      ]
        .concat(줄)
        .join("\n")}
    </div>
  );
}
