import { useEffect, useState } from "react";

/**
 * 서비스 버튼 높이만 조사하는 임시 진단기.
 * 주소에 sizeh 가 있으면 켜진다. (예: /services/sizeh)
 *
 * 고치지 않는다. 실기기에서 아래를 그대로 재고 되돌린다.
 *
 *  1) 지금 상태 높이
 *  2) 화살표(›)만 감췄을 때 높이
 *  3) 글자만 남겼을 때 높이
 *  4) 자식마다 rect 높이·글자·줄높이·여백·display·vertical-align
 *  5) 버튼의 min-height / height / box-sizing / border / gap / align-items
 *
 * 확인이 끝나면 이 파일과 App.tsx 의 사용처를 지운다.
 */
const 대상 = ["진행과정 보기", "신청하기", "자세히 보기"];

export function ButtonHeightProbe() {
  const [줄, set줄] = useState<string[]>([]);

  const 켜짐 =
    typeof window !== "undefined" && /sizeh/i.test(window.location.pathname);

  useEffect(() => {
    if (!켜짐) return;

    const 실행 = () => {
      const out: string[] = [];
      const de = document.documentElement;
      out.push(
        `[버튼 높이 조사] 폭${window.innerWidth} 뿌리${parseFloat(
          getComputedStyle(de).fontSize
        ).toFixed(2)} 표시${de.className || "없음"}`
      );

      대상.forEach((글) => {
        const btn = (
          Array.prototype.slice.call(document.querySelectorAll("button")) as HTMLElement[]
        ).find(
          (e) =>
            (e.textContent || "").trim().indexOf(글) === 0 &&
            e.getBoundingClientRect().width > 2
        );
        if (!btn) {
          out.push(`[${글}] 못찾음`);
          return;
        }

        const cs = getComputedStyle(btn);
        const 지금 = btn.getBoundingClientRect().height;

        out.push(`[${글}] 지금 높이 ${지금.toFixed(1)}`);
        out.push(
          ` 버튼 글자${parseFloat(cs.fontSize).toFixed(1)} 줄높이${parseFloat(
            cs.lineHeight
          ).toFixed(1)} 여백${parseFloat(cs.paddingTop).toFixed(1)}/${parseFloat(
            cs.paddingBottom
          ).toFixed(1)}`
        );
        out.push(
          ` min-height${cs.minHeight} height${cs.height} box${cs.boxSizing} 테두리${parseFloat(
            cs.borderTopWidth
          ).toFixed(1)}/${parseFloat(cs.borderBottomWidth).toFixed(1)}`
        );
        out.push(` gap${cs.gap} align${cs.alignItems} display${cs.display}`);

        // 자식 하나하나
        const 자식 = Array.prototype.slice.call(btn.children) as HTMLElement[];
        자식.forEach((c, i) => {
          const ccs = getComputedStyle(c);
          out.push(
            ` 자식${i + 1} "${(c.textContent || "").trim().slice(0, 4)}" 높이${c
              .getBoundingClientRect()
              .height.toFixed(1)} 글자${parseFloat(ccs.fontSize).toFixed(
              1
            )} 줄높이${parseFloat(ccs.lineHeight).toFixed(1)}`
          );
          out.push(
            `   여백${ccs.margin.replace(/\s+/g, " ")} / ${ccs.padding.replace(
              /\s+/g,
              " "
            )} ${ccs.display} 정렬${ccs.verticalAlign}`
          );
        });

        // 글자 노드가 만드는 줄상자 높이
        const r = document.createRange();
        r.selectNodeContents(btn);
        out.push(` 글자영역 ${r.getBoundingClientRect().height.toFixed(1)}`);

        // 시험 ① 화살표만 감춘다
        const 감춘것: HTMLElement[] = [];
        자식.forEach((c) => {
          if (/[›>]/.test((c.textContent || "").trim())) {
            c.style.display = "none";
            감춘것.push(c);
          }
        });
        if (감춘것.length) {
          out.push(` 화살표 감춤 → ${btn.getBoundingClientRect().height.toFixed(1)}`);
          감춘것.forEach((c) => (c.style.display = ""));
        } else {
          out.push(" 화살표 별도 요소 아님(글자 안에 섞임)");
        }

        // 시험 ② 자식 전부 감춘다 (글자 노드만 남김)
        const 원래 = 자식.map((c) => c.style.display);
        자식.forEach((c) => (c.style.display = "none"));
        out.push(` 자식 전부 감춤 → ${btn.getBoundingClientRect().height.toFixed(1)}`);
        자식.forEach((c, i) => (c.style.display = 원래[i]));

        // 시험 ③ 안쪽을 완전히 비운다 (여백만 남음)
        const 원래HTML = btn.innerHTML;
        btn.innerHTML = "";
        out.push(` 안쪽 비움 → ${btn.getBoundingClientRect().height.toFixed(1)}`);
        btn.innerHTML = 원래HTML;

        out.push(` (크롬 기준 28.8)`);
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
        font: "10px/1.35 monospace",
        whiteSpace: "pre-wrap",
      }}
    >
      {줄.join("\n")}
    </div>
  );
}
