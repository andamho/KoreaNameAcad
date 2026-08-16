/**
 * 인앱 브라우저(인스타그램·틱톡) 표시의 단 하나뿐인 소유자.
 *
 * ua-instagram / ua-tiktok 은 페이지 상태가 아니라 **브라우저 환경 상태**다.
 * 인앱 WebView 가 닫힐 때까지 유지되어야 하며, 페이지를 옮겼다고 사라지면 안 된다.
 *
 * 예전에는 13개 페이지가 각자 붙였다 뗐다 했다. 그래서 전환 순서가 엇갈리거나
 * 표시를 붙이는 코드가 없는 화면으로 넘어가면 표시가 꺼진 채로 남았고,
 * 그 뒤 모든 페이지에서 인앱 보정이 통째로 빠져 글자가 크게 보였다.
 *
 * 표시를 다루는 곳은 이제 두 곳뿐이다.
 *   1) index.html — 첫 paint 전에 UA 로 판별해 붙인다
 *   2) 이 파일 — React 가 시작한 뒤 유지·복구를 맡는다
 *
 * 판별 우선순위: 지금 UA 에서 직접 감지 → sessionStorage 기록 → 같은 세션 유지
 */
const 저장키 = "kna-inapp";

export type 인앱종류 = "instagram" | "tiktok" | null;

/** 지금 UA 로 판별한다. 저장값은 보지 않는다. */
function UA판별(): 인앱종류 {
  const ua = navigator.userAgent || "";
  if (ua.indexOf("Instagram") !== -1) return "instagram";
  if (ua.indexOf("TikTok") !== -1 || ua.indexOf("musical_ly") !== -1) return "tiktok";
  return null;
}

/** 이번 세션에 기억해 둔 값. */
function 저장값(): 인앱종류 {
  try {
    const v = sessionStorage.getItem(저장키);
    return v === "instagram" || v === "tiktok" ? v : null;
  } catch {
    return null;
  }
}

/**
 * 지금 어떤 인앱인지 확정한다.
 * UA 로 잡히면 그 값을 세션에 기억해 두고, 다음부터는 기억한 값으로 유지한다.
 * 인앱 WebView 가 이따금 UA 를 다르게 주더라도 한 번 잡힌 판정이 흔들리지 않는다.
 */
export function 인앱확정(): 인앱종류 {
  const 지금 = UA판별();
  if (지금) {
    try {
      sessionStorage.setItem(저장키, 지금);
    } catch {
      /* 저장이 막혀 있어도 판별 자체는 계속된다 */
    }
    return 지금;
  }
  return 저장값();
}

/**
 * 표시가 반드시 있도록 보장한다. 이미 있으면 아무 일도 하지 않는다.
 * 표시를 떼는 일은 하지 않는다 — 뗄 이유가 없는 값이다.
 */
export function 인앱표시보장(): 인앱종류 {
  const 종류 = 인앱확정();
  if (!종류) return null;
  const de = document.documentElement;
  const 이름 = 종류 === "instagram" ? "ua-instagram" : "ua-tiktok";
  if (!de.classList.contains(이름)) de.classList.add(이름);
  return 종류;
}

/**
 * 유지 장치를 건다. App 에서 한 번만 부른다.
 * 어떤 코드가 실수로 표시를 지워도 아래 시점마다 곧바로 되붙는다.
 *   - 뒤로/앞으로 가기(popstate), 캐시 복귀(pageshow)
 *   - 앱을 배경에 두었다 돌아왔을 때(visibilitychange)
 *   - html 의 class 가 바뀌는 순간(MutationObserver)
 * 되돌리는 함수를 준다.
 */
export function 인앱표시유지(): () => void {
  const 종류 = 인앱표시보장();
  if (!종류) return () => {};

  const 다시 = () => 인앱표시보장();

  window.addEventListener("popstate", 다시);
  window.addEventListener("pageshow", 다시);
  document.addEventListener("visibilitychange", 다시);

  // html 의 class 가 바뀌는 순간을 지켜본다. 지워지면 즉시 되붙인다.
  const 감시 = new MutationObserver(다시);
  감시.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });

  return () => {
    window.removeEventListener("popstate", 다시);
    window.removeEventListener("pageshow", 다시);
    document.removeEventListener("visibilitychange", 다시);
    감시.disconnect();
  };
}
