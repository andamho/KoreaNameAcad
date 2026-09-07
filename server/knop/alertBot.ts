// 운영 알림 전용 봇(@KNA_Alert_bot).
//
// 기존 @Kna_media_bot 은 로그인 OTP·후기 자동화·문자수집 이상까지 한 방에
// 섞여 들어와 읽기 어려웠다. 알림만 따로 받도록 봇을 분리한다.
//
// 설정이 없으면 조용히 넘어간다 — 알림 때문에 본래 일이 막히면 안 된다.
const TOKEN = (process.env.KOP_ALERT_BOT_TOKEN || "").trim();
const CHAT = (process.env.KOP_ALERT_CHAT_ID || "").trim();

// 설정이 들어왔는지 부팅 때 한 줄 남긴다. 값은 찍지 않는다.
console.log(`[알림봇] ${TOKEN && CHAT ? "설정됨" : "미설정 — 알림 안 나감"}`);

// 사람이 쓴 값(이름·파일명·사유)을 알림에 넣기 전에 감싼다.
// 텔레그램 HTML 모드는 < 를 태그 시작으로 읽는다 — 사유에 "점수차 3 < 30" 같은
// 문장이 들어가면 통째로 거부된다(400 can't parse entities).
export function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function alertAvailable(): boolean {
  return Boolean(TOKEN && CHAT);
}

// 알림 한 줄 보내기. 실패해도 예외를 밖으로 던지지 않는다.
export async function sendAlert(text: string): Promise<void> {
  if (!alertAvailable()) {
    console.log(`[알림봇] 미설정 — 보내지 않음: ${text.replace(/<[^>]+>/g, "").slice(0, 80)}`);
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[알림봇] 발송 실패 ${res.status}: ${body.slice(0, 200)}`);
    }
  } catch (e: any) {
    console.error(`[알림봇] 발송 실패: ${e?.message}`);
  }
}
