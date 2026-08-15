import { useEffect, useState } from "react";

/**
 * flashRecorder 가 모은 기록에서 '값이 바뀐 순간'만 추려 화면에 보여준다.
 * 주소에 size 가 있을 때만 뜬다. 확인이 끝나면 이 파일과 사용처를 지운다.
 */
export function FlashProbe() {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    if (!/size/i.test(window.location.href)) return;

    const build = () => {
      const log = window.__FLASH || [];
      if (!log.length) return;
      const out: string[] = [];
      let prev: string | null = null;
      log.forEach((s) => {
        // 화면에 영향 주는 값만 묶어서 비교 — 바뀐 순간만 남긴다
        const key = [s.cls, s.iw, s.vw, s.html, s.body, s.target, s.box].join("|");
        if (key === prev && !s.note) return;
        prev = key;
        const ua = s.cls.includes("ua-instagram")
          ? "인스타"
          : s.cls.includes("ua-tiktok")
          ? "틱톡"
          : "표시없음";
        out.push(
          `${s.t}ms ${ua} 폭${s.iw}/${s.vw} html${s.html} body${s.body} 안심${s.target} ${s.box}${
            s.note ? " ←" + s.note : ""
          }`
        );
      });
      setLines(out.slice(0, 14));
    };

    const t1 = setTimeout(build, 2300);
    const t2 = setTimeout(build, 4500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (!lines.length) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 4,
        right: 4,
        top: 4,
        zIndex: 2147483647,
        background: "rgba(120,0,0,0.92)",
        color: "#fff",
        font: "10px/1.4 monospace",
        padding: "6px 7px",
        borderRadius: 6,
        pointerEvents: "none",
        whiteSpace: "pre",
        overflowX: "auto",
      }}
    >
      {["[깜빡임 기록] 값이 바뀐 순간만"].concat(lines).join("\n")}
    </div>
  );
}
