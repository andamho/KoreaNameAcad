import { useEffect, useState } from "react";

/**
 * 자동문구 블록의 부모 계통을 끝까지 추적하는 임시 진단기.
 * 주소에 sizep 가 있으면 켜진다.
 *
 * 중요: computed 값과 화면 환산값을 절대 섞지 않는다.
 *   · "계산"  = getComputedStyle 이 준 값 그대로 (인앱 WebView 가 이미 확대해 준 값)
 *   · "쟀다"  = getBoundingClientRect / Range 로 실제 그려진 상자를 잰 값
 * 두 값을 각각 따로 찍는다. 환산은 하지 않는다.
 *
 * 고치지 않는다. 확인이 끝나면 이 파일과 App.tsx 의 사용처를 지운다.
 */
type 단계 = {
  이름: string;
  el: HTMLElement | null;
};

function 값(el: HTMLElement) {
  const cs = getComputedStyle(el) as unknown as Record<string, string> & CSSStyleDeclaration;
  const b = el.getBoundingClientRect();
  const tf = cs.transform && cs.transform !== "none" ? cs.transform.match(/matrix\(([-\d.]+)/) : null;
  return {
    fs: parseFloat(cs.fontSize),
    lh: parseFloat(cs.lineHeight),
    zoom: cs.zoom,
    scale: tf ? parseFloat(tf[1]).toFixed(4) : "none",
    origin: cs.transformOrigin,
    adjust: cs["webkitTextSizeAdjust"] || cs["textSizeAdjust"] || "-",
    w: b.width,
    h: b.height,
    inline: el.getAttribute("style") || "",
    본문안: !!el.closest(".kna-detail-body"),
    tag: el.tagName,
    cls: (el.className || "").toString().slice(0, 26),
  };
}

export function PromoChainProbe() {
  const [줄, set줄] = useState<string[]>([]);
  const 켜짐 = typeof window !== "undefined" && /sizep/i.test(window.location.pathname);

  useEffect(() => {
    if (!켜짐) return;
    const 실행 = () => {
      const promo = document.querySelector<HTMLElement>(".kna-promo");
      if (!promo) {
        set줄([".kna-promo 없음"]);
        return;
      }
      const 찾 = (t: string) =>
        (Array.prototype.slice.call(promo.querySelectorAll("span,a")) as HTMLElement[]).find(
          (e) =>
            (e.textContent || "").trim().indexOf(t) === 0 &&
            Array.prototype.slice
              .call(e.childNodes)
              .some((n: Node) => n.nodeType === 3 && (n.textContent || "").trim()),
        ) || null;

      const 대표: 단계[] = [
        { 이름: "① 이름이 맑아야 (inline rem 상속)", el: 찾("이름이 맑아야") },
        { 이름: "② 이름 안에 너 있다 (inline font-size)", el: 찾("이름 안에 너 있다") },
        { 이름: "③ 지금 신청 (.text-sm 보정 걸린 것)", el: 찾("지금 신청") },
      ];

      const out: string[] = [
        `[자동문구 부모계통] 폭${window.innerWidth} 표시${document.documentElement.className || "없음"}`,
        `계산=getComputedStyle 그대로 · 쟀다=실제 그려진 상자. 환산 안 함.`,
        `뿌리 계산 ${parseFloat(getComputedStyle(document.documentElement).fontSize).toFixed(2)}`,
      ];

      대표.forEach(({ 이름, el }) => {
        out.push(`── ${이름} ──`);
        if (!el) {
          out.push("   못찾음");
          return;
        }
        // 글자 자체가 그려진 크기
        const rg = document.createRange();
        rg.selectNodeContents(el);
        const 글상자 = rg.getBoundingClientRect();
        out.push(`   글자영역 쟀다 ${글상자.width.toFixed(1)}×${글상자.height.toFixed(1)}`);

        let p: HTMLElement | null = el;
        let 단계번호 = 0;
        while (p && 단계번호 < 9) {
          const v = 값(p);
          const 표 =
            단계번호 === 0
              ? "본인"
              : p.classList.contains("kna-promo")
              ? "kna-promo"
              : p.classList.contains("kna-detail-body")
              ? "kna-detail-body"
              : `부모${단계번호}`;
          out.push(
            `   ${표} ${v.tag}[${v.cls || "-"}] ${v.본문안 ? "본문안" : "본문밖"}`,
          );
          out.push(
            `      계산 fs${v.fs.toFixed(2)} lh${v.lh.toFixed(2)} zoom${v.zoom} scale${v.scale}`,
          );
          out.push(
            `      쟀다 ${v.w.toFixed(1)}×${v.h.toFixed(1)} adjust${v.adjust} origin${v.origin.slice(0, 14)}`,
          );
          if (v.inline) out.push(`      inline ${v.inline.slice(0, 46)}`);
          if (p === document.body) break;
          p = p.parentElement;
          단계번호 += 1;
        }
      });
      set줄(out);
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
