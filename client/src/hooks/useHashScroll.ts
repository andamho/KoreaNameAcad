import { useEffect } from "react";

// 주소의 #앵커(예: #comment-123)나 지정한 id 로 스크롤한다.
//
// 왜 필요한가: 댓글 알림 메일의 링크는 .../experience-zone/alone-fate#comment-123 이다.
// 그런데 댓글은 서버에서 받아온 뒤에 그려지므로, 브라우저가 앵커를 찾는 시점엔
// 그 요소가 아직 없어 페이지 맨 위에 머문다. → 목록이 그려진 뒤 직접 옮겨준다.
//
// 새로고침 시엔 브라우저의 스크롤 복원(history.scrollRestoration)이 우리 스크롤을
// 되돌려 버린다. 그래서 앵커가 있으면 복원을 끄고, 여러 번 나눠 시도한다.
//
// ready: 대상이 화면에 그려졌는지(예: comments.length). 바뀔 때마다 다시 시도한다.
// targetId: 앵커 대신 직접 지정할 때(예: /admin?id=123 → "inquiry-123").
export function useHashScroll(ready: unknown, targetId?: string) {
  useEffect(() => {
    let id = targetId || "";
    if (!id) {
      const raw = window.location.hash;
      if (!raw || raw.length < 2) return;
      try {
        id = decodeURIComponent(raw.slice(1));
      } catch {
        id = raw.slice(1);
      }
    }
    if (!id) return;

    // 브라우저가 이전 스크롤 위치로 되돌리지 않게 한다(새로고침 대응)
    try {
      if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
    } catch {
      /* 무시 */
    }

    const timers: number[] = [];
    let done = false;
    const tryScroll = () => {
      if (done) return;
      const el = document.getElementById(id);
      if (!el) return; // 아직 안 그려짐 — 다음 시도에서
      done = true;
      // 부드러운 이동은 도중에 스크롤 복원에 밀릴 수 있어 즉시 이동시킨다.
      el.scrollIntoView({ behavior: "auto", block: "center" });
      // 어느 것을 보러 왔는지 잠깐 표시(2초 후 원상복구)
      const prev = el.style.boxShadow;
      el.style.transition = "box-shadow .3s";
      el.style.boxShadow = "0 0 0 3px #18a999";
      timers.push(
        window.setTimeout(() => {
          el.style.boxShadow = prev;
        }, 2000),
      );
    };
    // 렌더·이미지 로딩으로 위치가 밀릴 수 있어 몇 번 나눠 시도한다.
    for (const delay of [0, 150, 400, 900, 1600]) timers.push(window.setTimeout(tryScroll, delay));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [ready, targetId]);
}
