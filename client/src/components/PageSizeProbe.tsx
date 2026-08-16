import { useEffect, useState } from "react";

/**
 * 지금 보고 있는 페이지의 글자 크기를 실기기에서 그대로 재는 임시 측정기.
 * 주소에 size 가 있으면 켜진다. (예: /services?size)
 *
 * 두 가지를 보여준다.
 *  1) 이름 붙인 표본 몇 개 — 글자 크기와 상자 크기
 *  2) 페이지 전체의 글자 크기 분포 (크기:개수)
 *
 * 분포를 크롬 값과 나란히 놓으면 "전부 큰지" "일부만 큰지"가 한 번에 갈린다.
 * 전환(transition)이 걸린 요소가 있으므로 화면이 자리잡은 뒤에 재고,
 * 스크롤할 때마다 다시 잰다.
 *
 * 확인이 끝나면 이 파일과 App.tsx 의 사용처를 지운다.
 */
const 표본: Array<[string, string]> = [
  ["큰제목", "전문적인 이름 서비스"],
  ["통합솔루션", "진단부터 작명까지"],
  ["이름분석", "이름분석"],
  ["16가지운", "현재 이름에 들어"],
  ["적합도", "타 작명소에서"],
  ["진행과정", "진행과정 보기"],
  ["신청", "신청하기"],
  ["자세히", "자세히 보기"],
  ["작은본문", "이름이 맑아야"],
];

export function PageSizeProbe() {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    if (!/size/i.test(window.location.href)) return;

    const measure = () => {
      const els: HTMLElement[] = [];
      document.querySelectorAll("body *").forEach((n) => {
        const e = n as HTMLElement;
        const b = e.getBoundingClientRect();
        if (b.width < 2 || b.height < 2) return;
        if (getComputedStyle(e).visibility === "hidden") return;
        const own = Array.prototype.slice
          .call(e.childNodes)
          .some((c: Node) => c.nodeType === 3 && (c.textContent || "").trim());
        if (own) els.push(e);
      });
      if (!els.length) return;

      const 분포: Record<string, number> = {};
      els.forEach((e) => {
        const k = parseFloat(getComputedStyle(e).fontSize).toFixed(1);
        분포[k] = (분포[k] || 0) + 1;
      });

      const de = document.documentElement;
      const 인앱 =
        de.classList.contains("ua-instagram") || de.classList.contains("ua-tiktok");
      const 모드 = de.classList.contains("probe-noadjust")
        ? "B(표시없음·adjust none)"
        : de.classList.contains("probe-sizeadjust-none")
        ? 인앱
          ? "C(인앱보정+adjust none)"
          : "C(크롬)"
        : 인앱
        ? "A(인앱보정·기본)"
        : "A(크롬)";

      // text-size-adjust 실제 computed 값 — A 와 C 가 정말 다른지 눈으로 본다.
      const rec = getComputedStyle(de) as unknown as Record<string, string>;
      const bod = document.body
        ? (getComputedStyle(document.body) as unknown as Record<string, string>)
        : null;
      const adj = (o: Record<string, string> | null) =>
        o ? o["webkitTextSizeAdjust"] || o["textSizeAdjust"] || "-" : "-";

      const out: string[] = [
        `${모드} 폭${window.innerWidth}`,
        `adjust html${adj(rec)} body${adj(bod)}`,
        `html${parseFloat(getComputedStyle(de).fontSize).toFixed(2)} body${
          document.body
            ? parseFloat(getComputedStyle(document.body).fontSize).toFixed(2)
            : "-"
        }`,
      ];

      표본.forEach(([name, text]) => {
        const e = els.find((x) => (x.textContent || "").trim().indexOf(text) === 0);
        if (!e) return;
        const cs = getComputedStyle(e);
        const b = e.getBoundingClientRect();
        // 실제 글자 영역과 줄 수는 Range 로 잰다.
        const r = document.createRange();
        r.selectNodeContents(e);
        const 줄 = r.getClientRects().length;
        out.push(
          `${name} ${parseFloat(cs.fontSize).toFixed(1)}px 줄높이${parseFloat(
            cs.lineHeight
          ).toFixed(1)} 상자${b.width.toFixed(0)}×${b.height.toFixed(
            0
          )} 여백${parseFloat(cs.paddingTop).toFixed(0)}/${parseFloat(
            cs.paddingLeft
          ).toFixed(0)} ${줄}줄`
        );
      });

      // [시험 D] 폰이 글자를 얼마나 키우는지 법칙 자체를 잰다.
      // 지정한 크기(px)를 넣고 실제로 그려진 크기를 읽어 입력→출력 대응을 만든다.
      // 좁은 칸과 넓은 칸 두 곳에 같은 눈금을 넣어 담는 상자가 영향을 주는지도 본다.
      if (/sized/i.test(window.location.pathname)) {
        const 눈금 = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32];
        const 만들기 = (폭: string) => {
          const box = document.createElement("div");
          box.style.cssText = `position:absolute;left:-9999px;top:0;width:${폭}`;
          document.body.appendChild(box);
          const 값 = 눈금.map((px) => {
            const s = document.createElement("p");
            s.style.fontSize = px + "px";
            s.textContent = "한글 글자 크기 시험 문장입니다";
            box.appendChild(s);
            return parseFloat(getComputedStyle(s).fontSize);
          });
          box.remove();
          return 값;
        };
        const 좁 = 만들기("160px");
        const 넓 = 만들기("320px");
        out.push(
          "눈금(좁) " + 눈금.map((v, i) => `${v}→${좁[i].toFixed(1)}`).join(" ")
        );
        out.push(
          "눈금(넓) " + 눈금.map((v, i) => `${v}→${넓[i].toFixed(1)}`).join(" ")
        );
      }

      // 가로로 넘치는 요소가 있는지 (화면 밖으로 삐져나가는지)
      let 넘침 = 0;
      els.forEach((e) => {
        const b = e.getBoundingClientRect();
        if (b.right > window.innerWidth + 1 || b.left < -1) 넘침 += 1;
      });
      out.push(
        `넘침 ${넘침}개 · 문서폭 ${document.documentElement.scrollWidth}`
      );

      out.push(
        "분포 " +
          Object.keys(분포)
            .sort((a, b) => parseFloat(b) - parseFloat(a))
            .map((k) => `${k}:${분포[k]}`)
            .join(" ")
      );
      setLines(out);
    };

    // 전환이 끝난 뒤에 재고, 스크롤로 늦게 나타나는 것도 다시 잰다.
    // 늦게 뜬다는 말이 없도록 이른 시점에도 한 번 잰다.
    const t0 = setTimeout(measure, 400);
    const t1 = setTimeout(measure, 1800);
    const t2 = setTimeout(measure, 4000);
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, []);

  if (!lines.length) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 4,
        right: 4,
        // 아래쪽은 인앱 도구막대에 가려질 수 있어 위쪽에 붙인다.
        top: 4,
        zIndex: 2147483647,
        background: "rgba(20,0,60,0.96)",
        color: "#fff",
        font: "10px/1.35 monospace",
        padding: "4px 6px",
        borderRadius: 6,
        pointerEvents: "none",
        whiteSpace: "pre-wrap",
        maxHeight: "30vh",
        overflow: "hidden",
      }}
    >
      {["[페이지 글자 크기]"].concat(lines).join("\n")}
    </div>
  );
}
