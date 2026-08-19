import { useEffect, useState } from "react";

/**
 * 본문 아래 자동문구 영역을 화면 순서대로 처음부터 끝까지 훑어
 * 보이는 글자를 빠짐없이 번호 매겨 재는 임시 진단기.
 * 주소에 sizem 이 있으면 켜진다.
 *
 * 앞선 진단기(DetailAuditProbe)는 계산식이 틀려 모든 항목이 자동으로
 * 1.30 배로 나왔다. 여기서는 환산을 아예 하지 않는다.
 *   · "계산" = getComputedStyle 값 그대로. 인앱에서는 이미 확대가 반영된 값이라
 *              그 자체가 화면에 보이는 크기다.
 *   · "쟀다" = Range 로 잰 실제 글자 상자.
 *   · "배율" = 조상들의 zoom · transform scale 을 곱한 값.
 * 크롬 값은 여기서 만들지 않는다. 같은 순서로 크롬에서 따로 재어 나란히 놓는다.
 *
 * 고치지 않는다. 확인이 끝나면 이 파일과 App.tsx 의 사용처를 지운다.
 */
export function PromoMapProbe() {
  const [줄, set줄] = useState<string[]>([]);
  const 켜짐 = typeof window !== "undefined" && /sizem/i.test(window.location.pathname);

  useEffect(() => {
    if (!켜짐) return;
    const 실행 = () => {
      const promo = document.querySelector<HTMLElement>(".kna-promo");
      if (!promo) {
        set줄([".kna-promo 없음"]);
        return;
      }
      const 시작y = promo.getBoundingClientRect().top + window.scrollY;

      // 자동문구 시작점부터 페이지 끝까지, 보이는 글자를 전부 모은다.
      const 모음: HTMLElement[] = [];
      document.querySelectorAll("body *").forEach((n) => {
        const e = n as HTMLElement;
        if (e.closest("[data-probe]")) return;
        const b = e.getBoundingClientRect();
        if (b.width < 2 || b.height < 2) return;
        const cs = getComputedStyle(e);
        if (cs.visibility === "hidden" || cs.display === "none") return;
        if (b.top + window.scrollY < 시작y - 1) return;
        const own = Array.prototype.slice
          .call(e.childNodes)
          .some((c: Node) => c.nodeType === 3 && (c.textContent || "").trim());
        if (own) 모음.push(e);
      });
      // 화면 순서(위→아래, 같은 줄이면 왼→오)
      모음.sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return Math.abs(ra.top - rb.top) > 2 ? ra.top - rb.top : ra.left - rb.left;
      });

      const 배율 = (el: HTMLElement) => {
        let m = 1;
        let p: HTMLElement | null = el;
        while (p && p !== document.documentElement) {
          const cs = getComputedStyle(p);
          const z = parseFloat(cs.zoom);
          if (z && z !== 1) m *= z;
          if (cs.transform && cs.transform !== "none") {
            const t = cs.transform.match(/matrix\(([-\d.]+)/);
            if (t) m *= parseFloat(t[1]);
          }
          p = p.parentElement;
        }
        return m;
      };

      const out: string[] = [
        `[자동문구 크기지도] 폭${window.innerWidth} 표시${document.documentElement.className || "없음"}`,
        `계산=getComputedStyle 그대로(환산 없음) · 쟀다=Range 실제 상자 · 배율=조상 zoom·scale 곱`,
        `뿌리 ${parseFloat(getComputedStyle(document.documentElement).fontSize).toFixed(2)} · 요소 ${모음.length}개`,
      ];
      모음.forEach((e, i) => {
        const cs = getComputedStyle(e);
        const rg = document.createRange();
        rg.selectNodeContents(e);
        const r = rg.getBoundingClientRect();
        const 어디 = e.closest(".kna-promo")
          ? "자동문구"
          : e.closest(".kna-footer")
          ? "푸터"
          : "기타";
        out.push(
          `${i + 1}. "${(e.textContent || "").trim().slice(0, 16).replace(/\s+/g, " ")}" [${어디}]`,
        );
        out.push(
          `   계산 fs${parseFloat(cs.fontSize).toFixed(2)} lh${parseFloat(cs.lineHeight).toFixed(2)} · 쟀다 ${r.width.toFixed(1)}×${r.height.toFixed(1)} · 배율${배율(e).toFixed(3)}`,
        );
      });
      set줄(out);
    };
    const t = window.setTimeout(실행, 2200);
    return () => window.clearTimeout(t);
  }, [켜짐]);

  if (!켜짐 || !줄.length) return null;
  return (
    <div
      data-probe
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
