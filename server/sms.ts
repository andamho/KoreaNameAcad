import crypto from "crypto";

export async function sendSMS(to: string, text: string): Promise<void> {
  const apiKey    = process.env.SOLAPI_KEY;
  const apiSecret = process.env.SOLAPI_SECRET;
  const from      = process.env.SOLAPI_SENDER;

  if (!apiKey || !apiSecret || !from) {
    console.warn("[SMS] SOLAPI 환경변수 미설정 — 문자 발송 건너뜀.");
    return;
  }

  const date = new Date().toISOString();
  const salt = crypto.randomBytes(8).toString("hex");
  const signature = crypto
    .createHmac("sha256", apiSecret)
    .update(date + salt)
    .digest("hex");

  // 솔라피 SMS 한도는 90byte(한글 2byte 계산). 글자수가 아니라 바이트로 판별해야 함.
  const smsBytes = Array.from(text).reduce((n, ch) => n + (ch.codePointAt(0)! > 0x7f ? 2 : 1), 0);
  const type = smsBytes > 90 ? "LMS" : "SMS";

  const res = await fetch("https://api.solapi.com/messages/v4/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`,
    },
    body: JSON.stringify({
      message: {
        to: to.replace(/-/g, ""),
        from: from.replace(/-/g, ""),
        text,
        type,
      },
    }),
  });

  const json = (await res.json()) as any;
  if (!res.ok || json.errorCode) {
    throw new Error(`Solapi 오류: ${JSON.stringify(json)}`);
  }
  console.log(`[SMS] 발송 완료 → ${to}`);
}
