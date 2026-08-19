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
/** 이름, 첫 글자, 크롬 338px 실측 크기 */
const 표본: Array<[string, string, number]> = [
  ["큰제목", "전문적인 이름 서비스", 32.4],
  ["통합솔루션", "진단부터 작명까지", 22.5],
  ["이름분석", "이름분석", 18.9],
  ["16가지운", "현재 이름에 들어", 16.2],
  ["적합도", "타 작명소에서", 16.2],
  ["진행과정", "진행과정 보기", 12.6],
  ["신청", "신청하기", 12.6],
  ["자세히", "자세히 보기", 12.6],
  ["작은본문", "이름이 맑아야", 18.0],
];

export function PageSizeProbe() {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    if (!/size/i.test(window.location.href)) return;
    // 눈금(/sized)·감사(/sizee)·버튼높이(/sizeh) 화면에서는 뜨지 않는다. 그 숫자를 가린다.
    if (/sized|sizee|sizeh|sizez|sizep|sizem/i.test(window.location.pathname)) return;

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

      // 눈금 시험 주소에서는 눈금만 보여준다. 표본·분포까지 찍으면 상자가 넘쳐 잘린다.
      const 눈금만 = /sized/i.test(window.location.pathname);

      표본.forEach(([name, text, 크롬]) => {
        if (눈금만) return;
        const e = els.find((x) => (x.textContent || "").trim().indexOf(text) === 0);
        if (!e) return;
        const cs = getComputedStyle(e);
        const b = e.getBoundingClientRect();
        // 실제 글자 영역과 줄 수는 Range 로 잰다.
        const r = document.createRange();
        r.selectNodeContents(e);
        const 줄 = r.getClientRects().length;
        const 지금 = parseFloat(cs.fontSize);
        // 인앱 화면 = 계산값 × 1.30 (WebView 균일 확대). 크롬이면 그대로.
        const 인앱 =
          de.classList.contains("ua-instagram") || de.classList.contains("ua-tiktok");
        const 화면 = 인앱 ? 지금 : 지금;
        out.push(
          `${name} ${화면.toFixed(1)}(크롬${크롬}) 줄높이${parseFloat(
            cs.lineHeight
          ).toFixed(1)} 상자${b.width.toFixed(0)}×${b.height.toFixed(
            0
          )} 여백${parseFloat(cs.paddingTop).toFixed(0)}/${parseFloat(
            cs.paddingLeft
          ).toFixed(0)} ${줄}줄`
        );
      });

      if (!눈금만) {
        // 서비스 페이지 버튼 실측 — 폭·높이·글자·여백을 그대로 찍는다.
        // 크롬 338px 기준값을 괄호로 함께 둔다.
        const 버튼기준: Record<string, string> = {
          "진행과정 보기": "107.8×28.8",
          "신청하기": "83.0×28.8",
          "자세히 보기": "96.9×28.8",
          "지금 신청": "94.4×25.2",
        };
        // els 는 '직접 글자를 가진 요소'만 모은다. 감싸개를 넣은 버튼은
        // 직접 글자가 없어 빠지므로 여기서는 DOM 을 직접 훑는다.
        const 버튼 = (
          Array.prototype.slice.call(document.querySelectorAll("button")) as HTMLElement[]
        ).filter((e) => {
          const c = (e.className || "").toString();
          return (
            /rounded-full/.test(c) &&
            /text-sm/.test(c) &&
            e.getBoundingClientRect().width > 2
          );
        });
        버튼.forEach((e, i) => {
          const cs = getComputedStyle(e);
          const b = e.getBoundingClientRect();
          const 글 = (e.textContent || "").trim().slice(0, 7);
          const 키 = Object.keys(버튼기준).find((k) => 글.indexOf(k.slice(0, 4)) === 0);
          const sp = e.querySelector(".kna-btn-fit");
          out.push(
            `버튼${i + 1} ${글}${sp ? "★" : ""} ${b.width.toFixed(1)}×${b.height.toFixed(
              1
            )}${키 ? `(크롬${버튼기준[키]})` : ""} 글자${parseFloat(cs.fontSize).toFixed(
              1
            )} 여백${parseFloat(cs.paddingTop).toFixed(1)}/${parseFloat(
              cs.paddingLeft
            ).toFixed(1)}`
          );
        });

        // 174개 전수 요약 — 크롬 값과 비교하려면 두 화면의 분포를 맞춰 보면 된다.
        let 최소 = Infinity;
        let 최대 = 0;
        let 줄수합 = 0;
        els.forEach((e) => {
          const v = parseFloat(getComputedStyle(e).fontSize);
          if (v < 최소) 최소 = v;
          if (v > 최대) 최대 = v;
          const r = document.createRange();
          r.selectNodeContents(e);
          줄수합 += r.getClientRects().length;
        });
        out.push(
          `전수 ${els.length}개 최소${최소.toFixed(1)} 최대${최대.toFixed(
            1
          )} 총줄수${줄수합}`
        );
      }

      // [시험 D] 폰이 글자를 얼마나 키우는지 법칙 자체를 잰다.
      // 지정한 크기(px)를 넣고 실제로 그려진 크기를 읽어 입력→출력 대응을 만든다.
      // 좁은 칸과 넓은 칸 두 곳에 같은 눈금을 넣어 담는 상자가 영향을 주는지도 본다.
      if (/sized/i.test(window.location.pathname)) {
        const 눈금 = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32];
        // 기준자를 나눠 같은 실제 크기가 되는 rem 값을 만든다.
        const 뿌리 = parseFloat(getComputedStyle(de).fontSize);

        // 화면 밖에 두면 자동확대 판단이 달라질 수 있어 화면 안에 두되
        // 보이지 않게(투명·높이0 겹침) 만들지 않는다 — 실제로 그려진 것을 재야 한다.
        const 만들기 = (폭: string, 단위: "px" | "rem") => {
          const box = document.createElement("div");
          box.style.cssText = `position:fixed;left:0;bottom:0;width:${폭};opacity:0.01;pointer-events:none;z-index:1`;
          document.body.appendChild(box);
          const 값 = 눈금.map((px) => {
            const s = document.createElement("p");
            s.style.margin = "0";
            s.style.fontSize = 단위 === "px" ? `${px}px` : `${px / 뿌리}rem`;
            // 좁은 칸에서도 한 줄로 남도록 짧게 — 줄바꿈이 생기면 높이가 튄다.
            s.textContent = "가나";
            box.appendChild(s);
            const r = document.createRange();
            r.selectNodeContents(s);
            return {
              fs: parseFloat(getComputedStyle(s).fontSize),
              h: r.getBoundingClientRect().height,
            };
          });
          box.remove();
          return 값;
        };

        const 그룹: Array<[string, "px" | "rem", string]> = [
          ["①px좁", "px", "160px"],
          ["②px넓", "px", "320px"],
          ["③rem좁", "rem", "160px"],
          ["④rem넓", "rem", "320px"],
        ];
        그룹.forEach(([이름, 단위, 폭]) => {
          const v = 만들기(폭, 단위);
          out.push(
            `${이름} 크기 ` + 눈금.map((n, i) => `${n}→${v[i].fs.toFixed(1)}`).join(" ")
          );
          out.push(
            `${이름} 글자높이 ` + 눈금.map((n, i) => `${n}→${v[i].h.toFixed(1)}`).join(" ")
          );
        });
        out.push(`뿌리 ${뿌리.toFixed(3)}`);
      }

      if (!눈금만) {
        // 가로로 넘치는 요소가 있는지 (화면 밖으로 삐져나가는지)
        let 넘침 = 0;
        els.forEach((e) => {
          const b = e.getBoundingClientRect();
          if (b.right > window.innerWidth + 1 || b.left < -1) 넘침 += 1;
        });
        out.push(
          `넘침 ${넘침}개 · 문서폭 ${document.documentElement.scrollWidth}`
        );
      }

      if (!눈금만) {
        out.push(
          "분포 " +
            Object.keys(분포)
              .sort((a, b) => parseFloat(b) - parseFloat(a))
              .map((k) => `${k}:${분포[k]}`)
              .join(" ")
        );
      }
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
        font: "9px/1.3 monospace",
        padding: "4px 6px",
        borderRadius: 6,
        pointerEvents: "none",
        whiteSpace: "pre-wrap",
        maxHeight: "80vh",
        overflow: "hidden",
      }}
    >
      {["[페이지 글자 크기]"].concat(lines).join("\n")}
    </div>
  );
}
