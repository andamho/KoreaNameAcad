import crypto from "crypto";

// 발송 결과가 "확정 실패"인지 "불확실(보냈는지 모름)"인지 구분한다.
// 불확실(네트워크 타임아웃·중단)은 재발송하면 중복이 될 수 있으므로 호출부에서 별도 처리한다.
export class SmsUncertainError extends Error {
  readonly uncertain = true;
  constructor(message: string) {
    super(message);
    this.name = "SmsUncertainError";
  }
}

export async function sendSMS(to: string, text: string): Promise<{ messageId?: string; statusCode?: string }> {
  const apiKey    = process.env.SOLAPI_KEY;
  const apiSecret = process.env.SOLAPI_SECRET;
  const from      = process.env.SOLAPI_SENDER;

  if (!apiKey || !apiSecret || !from) {
    console.warn("[SMS] SOLAPI 환경변수 미설정 — 문자 발송 건너뜀.");
    return {};
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

  // 응답을 못 받은 경우(타임아웃·네트워크 중단)는 "보냈는지 모름" → 재발송 금지 대상
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 20_000);
  let res: Response;
  try {
    res = await fetch("https://api.solapi.com/messages/v4/send", {
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
      signal: ctrl.signal,
    });
  } catch (e: any) {
    throw new SmsUncertainError(`Solapi 응답 없음(${e?.name === "AbortError" ? "타임아웃" : e?.message})`);
  } finally {
    clearTimeout(timeout);
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    // HTTP 는 왔는데 본문 파싱 실패 → 발송 여부 불확실
    throw new SmsUncertainError(`Solapi 응답 해석 실패(status=${res.status})`);
  }
  if (!res.ok || json.errorCode) {
    // 서버가 명시적으로 거부(4xx) = 확정 실패. 5xx 는 처리됐을 수도 있어 불확실로 본다.
    if (res.status >= 500) throw new SmsUncertainError(`Solapi ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
    throw new Error(`Solapi 오류: ${JSON.stringify(json)}`);
  }
  console.log(`[SMS] 발송 완료 → ${to}`);
  return { messageId: json.messageId, statusCode: json.statusCode };
}
