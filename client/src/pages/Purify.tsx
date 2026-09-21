// 과거 이름 정화하기 — 개명 허가 뒤 '정화하기' 안내 문자에 링크로 보내는 페이지.
//
// 원장님이 ChatGPT 로 만든 페이지(past-name-purification.namezeus.chatgpt.site)를 그대로 옮겼다(2026-09-21).
// 메뉴·다른 페이지에서 링크하지 않고, 검색엔진에도 나오지 않게 한다(주소를 아는 사람만).
//
// 크기는 px 로 고정한다: 이 사이트는 화면 폭에 따라 html 기본 글자 크기가 크게 바뀌어(683px 폭에서 29px)
// rem 을 쓰면 폰마다 글자가 들쭉날쭉해진다.
import { useEffect, useState } from "react";

const IMG = "/purify";

function Photo({ src, alt, eager }: { src: string; alt: string; eager?: boolean }) {
  // 사진 파일이 아직 없으면 자리를 비워 둔다(깨진 그림 표시 방지)
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return <img className="pf-photo" src={`${IMG}/${src}`} alt={alt} loading={eager ? "eager" : "lazy"} onError={() => setOk(false)} />;
}

const STEPS = [
  { t: "과거 이름 적기", d: "작은 종이에 과거의 이름을 10번 천천히 적습니다. 이름과 함께했던 시간을 조용히 떠올려 봅니다.", img: "step-1.webp", alt: "종이에 과거 이름을 천천히 적는 모습" },
  { t: "두 손으로 마음 담기", d: "종이를 가볍게 감싸고, 지나온 시간과 그 이름으로 살아온 나를 있는 그대로 바라봅니다.", img: "step-2.webp", alt: "접은 종이를 두 손으로 감싸는 모습" },
  { t: "안전하게 불 준비하기", d: "불에 강한 도자기나 금속 용기를 사용하고, 환기가 되는 안전한 장소에서 준비합니다.", img: "step-3.webp", alt: "안전한 도자기 그릇에 불을 준비한 모습" },
  {
    t: "감사하며 보내기",
    d: "종이를 태우며 과거의 이름과 그 이름으로 지나온 시간에 마지막 인사를 건넵니다.",
    img: "step-4.webp",
    alt: "과거 이름이 적힌 종이를 불에 보내는 모습",
    q: ["그동안 내 이름으로 함께해줘서 고마워.", "이제 편안하게 보내줄게."],
  },
  {
    t: "새로운 시작 기원하기",
    d: "불이 완전히 꺼진 것을 확인한 뒤 눈을 감고 깊게 호흡합니다. 새로운 이름으로 살아갈 시간을 마음속에 그려봅니다.",
    img: "step-5.webp",
    alt: "눈을 감고 새로운 시작을 마음에 그리는 모습",
    q: ["나는 새로운 이름과 함께", "새로운 시간을 살아갈게."],
  },
];

const WHY = [
  {
    t: "문화 속 정화의 상징",
    d: "고대의 제의부터 동아시아의 소지 풍습까지, 사람들은 종이나 물건을 태우며 지나간 일을 정리하고 새로운 시작을 기원해 왔습니다. 이 페이지는 특정 종교 의식이 아니라 그 오래된 상징을 빌린 개인적인 작별의 시간입니다.",
  },
  { t: "마음의 마침표", d: "생각을 종이에 적고 손으로 놓아주는 행동은 마음속에서 하나의 일을 끝맺는 데 도움을 줄 수 있습니다." },
  { t: "새 이름을 맞이할 자리", d: "억지로 잊는 대신 충분히 감사하고 보내줄 때, 새로운 이름을 받아들일 마음의 자리가 생깁니다." },
];

export default function Purify() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = "과거 이름 정화하기 | 한국이름학교";
    // 검색엔진에 나오지 않게(주소를 아는 사람만 보는 안내 페이지).
    // 사이트 공통 <meta name="robots" content="index, follow"> 가 이미 있어서 새로 붙이면 그게 먼저 읽힌다
    // → 기존 것의 값을 바꾸고, 나갈 때 되돌린다.
    let robots = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    const created = !robots;
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.appendChild(robots);
    }
    const prevRobots = robots.content;
    robots.content = "noindex, nofollow";
    // 제목용 명조 글꼴
    const font = document.createElement("link");
    font.rel = "stylesheet";
    font.href = "https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@500;600;700&display=swap";
    document.head.appendChild(font);
    window.scrollTo(0, 0);
    return () => {
      document.title = prevTitle;
      if (created) robots!.remove();
      else robots!.content = prevRobots;
      font.remove();
    };
  }, []);

  return (
    <div className="pf">
      <style>{CSS}</style>

      {/* 첫 화면 */}
      <header className="pf-wrap pf-hero">
        <p className="pf-eyebrow">KOREA NAME ACADEMY · 작은 작별 의식</p>
        <h1 className="pf-h1">
          과거 이름
          <br />
          <span className="pf-accent">정화하기</span>
        </h1>
        <p className="pf-lead">
          오랫동안 불려온 이름을 부정하는 것이 아니라, 그 이름과 함께했던 시간을 감사히 보내고 새로운 이름으로 살아갈 마음을 다지는 시간입니다.
        </p>
        <div className="pf-chips">
          <span>감사</span>
          <span>정리</span>
          <span>새 출발</span>
        </div>
      </header>
      <Photo src="hero.webp" alt="도자기 그릇에서 이름이 적힌 종이가 불꽃과 함께 타오르는 장면" eager />

      {/* 작별 인사 */}
      <section className="pf-wrap pf-sec pf-center">
        <p className="pf-eyebrow">A GENTLE FAREWELL</p>
        <p className="pf-quote">
          “과거의 이름을 없애는 것이 아니라,
          <br />
          그 이름과 함께했던 시간을
          <br />잘 보내주는 것입니다.”
        </p>
        <p className="pf-body">
          새 이름을 갖게 되었다고 해서 오랫동안 불려온 과거의 이름이 마음속에서 바로 사라지는 것은 아닙니다. 마지막으로 감사하고, 편안하게 보내주는 시간을 가져보세요.
        </p>
      </section>

      {/* 왜 태우는가 */}
      <section className="pf-wrap pf-sec">
        <p className="pf-eyebrow">WHY FIRE?</p>
        <h2 className="pf-h2">왜 ‘태우는 의식’일까요?</h2>
        <p className="pf-body">
          여러 문화권에서 불은 오래전부터 정리와 변화, 새로운 시작을 상징해 왔습니다. 여기서 불은 과거를 부정하는 수단이 아니라 마음속에서 한 시기를 끝맺는 상징입니다.
        </p>
        <div className="pf-cards">
          {WHY.map((w, i) => (
            <div className="pf-card" key={w.t}>
              <span className="pf-num">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="pf-h3">{w.t}</h3>
              <p className="pf-body">{w.d}</p>
            </div>
          ))}
        </div>
      </section>
      <Photo src="flames-v3.webp" alt="장작의 붉은 불씨 위로 황금빛 불꽃이 피어오르는 모습" />

      {/* 다섯 단계 */}
      <section className="pf-wrap pf-sec">
        <p className="pf-eyebrow">FIVE QUIET STEPS</p>
        <h2 className="pf-h2">
          과거 이름을 보내는
          <br />
          다섯 단계
        </h2>
        <p className="pf-body">서두르지 않아도 됩니다. 호흡을 천천히 하며, 각 단계를 자신에게 맞는 속도로 진행하세요.</p>
        <ol className="pf-steps">
          {STEPS.map((s, i) => (
            <li className="pf-step" key={s.t}>
              <div className="pf-step-head">
                <span className="pf-num">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="pf-h3">{s.t}</h3>
              </div>
              <p className="pf-body">{s.d}</p>
              <Photo src={s.img} alt={s.alt} />
              {s.q && (
                <p className="pf-say">
                  “{s.q[0]}
                  <br />
                  {s.q[1]}”
                </p>
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* 인사 */}
      <section className="pf-wrap pf-sec pf-center">
        <p className="pf-farewell">
          잘 가, 나의 옛 이름.
          <br />
          나와 함께했던 시간에 감사합니다.
          <br />
          그리고 반가워, 나의 새로운 이름.
        </p>
      </section>

      {/* 안전 */}
      <section className="pf-wrap">
        <div className="pf-safety">
          <h3 className="pf-h3">🔥 불을 다룰 때 꼭 지켜주세요</h3>
          <p className="pf-body">
            주변에 타기 쉬운 물건이 없는 곳에서 내열 용기를 사용하세요. 물이나 소화 도구를 곁에 두고, 실내라면 충분히 환기하세요. 어린이·반려동물과 떨어진 곳에서 진행하고, 불씨가 완전히 꺼질 때까지 자리를 비우지 마세요. 불 사용이 어렵다면 종이를 잘게 찢어 버리는 방식으로 대신해도 의미는 같습니다.
          </p>
        </div>
      </section>

      {/* 마무리 */}
      <Photo src="new-beginning.webp" alt="아침빛을 향해 호숫가 길을 걷는 사람" />
      <section className="pf-wrap pf-sec pf-center">
        <h2 className="pf-h2">
          오늘부터 이 이름으로
          <br />
          나의 새로운 시간을 살아갑니다.
        </h2>
        <p className="pf-body">
          과거를 지워야 새로워지는 것은 아닙니다. 지나온 나를 인정하고 잘 보내주는 순간, 새 이름은 비로소 나의 삶 속에서 시작됩니다.
        </p>
        <p className="pf-sign">한국이름학교</p>
      </section>
    </div>
  );
}

const CSS = `
.pf { background:#FFFDF8; color:#183237; min-height:100vh; font-family: Pretendard, "Noto Sans KR", system-ui, -apple-system, "Segoe UI", sans-serif; font-size:16px; line-height:1.75; -webkit-text-size-adjust:100%; text-size-adjust:100%; word-break:keep-all; overflow-wrap:anywhere; }
.pf * { box-sizing:border-box; }
.pf-wrap { max-width:640px; margin:0 auto; padding:0 24px; }
.pf-hero { padding-top:56px; padding-bottom:36px; }
.pf-sec { padding-top:56px; padding-bottom:56px; }
.pf-center { text-align:center; }
.pf-eyebrow { font-size:11px; letter-spacing:.22em; font-weight:700; color:#0f7c8c; margin:0 0 14px; text-transform:uppercase; }
.pf-h1 { font-family:"Noto Serif KR", Georgia, serif; font-weight:600; font-size:clamp(40px, 11vw, 56px); line-height:1.15; margin:0 0 22px; letter-spacing:-.01em; }
.pf-accent { color:#0f7c8c; }
.pf-h2 { font-family:"Noto Serif KR", Georgia, serif; font-weight:600; font-size:clamp(26px, 7vw, 34px); line-height:1.35; margin:0 0 18px; }
.pf-h3 { font-size:18px; font-weight:700; margin:0 0 8px; line-height:1.4; }
.pf-lead { font-size:17px; color:#2d4a4f; margin:0 0 24px; }
.pf-body { font-size:16px; color:#3a5559; margin:0 0 12px; }
.pf-chips { display:flex; gap:8px; flex-wrap:wrap; }
.pf-chips span { font-size:14px; font-weight:600; padding:7px 16px; border-radius:999px; background:#fff; border:1px solid #d7e6e3; color:#183237; }
.pf-photo { display:block; width:100%; max-width:960px; height:auto; margin:0 auto; }
.pf-quote { font-family:"Noto Serif KR", Georgia, serif; font-size:clamp(22px, 6.2vw, 30px); line-height:1.55; margin:0 0 22px; color:#183237; }
.pf-cards { display:grid; gap:14px; margin-top:26px; }
.pf-card { background:#fff; border:1px solid #ece6d8; border-radius:18px; padding:22px 20px; }
.pf-num { display:inline-block; font-family:Georgia, serif; font-size:14px; font-weight:700; color:#c9893b; margin-bottom:6px; letter-spacing:.06em; }
.pf-steps { list-style:none; padding:0; margin:30px 0 0; display:grid; gap:40px; }
.pf-step-head { display:flex; align-items:baseline; gap:12px; }
.pf-step .pf-photo { border-radius:16px; margin:14px 0 4px; }
.pf-say { font-family:"Noto Serif KR", Georgia, serif; font-size:18px; line-height:1.65; margin:16px 0 0; padding:16px 18px; border-left:3px solid #c9893b; background:#fbf5ea; border-radius:0 12px 12px 0; color:#183237; }
.pf-farewell { font-family:"Noto Serif KR", Georgia, serif; font-size:clamp(20px, 5.6vw, 26px); line-height:1.8; margin:0; }
.pf-safety { background:#f3f8f7; border:1px solid #d7e6e3; border-radius:18px; padding:22px 20px; margin:8px 0 56px; }
.pf-sign { margin-top:28px; font-family:"Noto Serif KR", Georgia, serif; font-weight:600; letter-spacing:.2em; color:#0f7c8c; font-size:15px; }
`;
