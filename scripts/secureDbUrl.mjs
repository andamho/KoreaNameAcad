// 하드코딩 credential 금지 — 접속 URL 은 환경변수/secret store 에서만 얻는다.
// ⚠️ 원문 DSN·password·host 를 절대 로그에 남기지 않는다(host 는 sha256 8자만).
// fail-closed: DATABASE_URL 미설정이면 즉시 종료. EXPECTED_DATABASE_HOST_HASH 가 있으면 host 핀 검증(불일치 종료).
import crypto from "crypto";

/** URL 에서 host 만 뽑아 sha256(소문자). URL/host 자체는 반환하지 않는다. */
export function hostHash(url) {
  let h = "";
  try { h = new URL(url).host.toLowerCase(); } catch { h = ""; }
  return crypto.createHash("sha256").update(h).digest("hex");
}

/**
 * 접속 URL 을 fail-closed 로 반환.
 * @param {object} [opts]
 * @param {string} [opts.envVar="DATABASE_URL"] 접속 URL 환경변수명
 * @param {boolean} [opts.exitOnFail=true] 실패 시 process.exit(1) 여부(테스트는 false 로 throw 받기)
 */
export function requireDbUrl(opts = {}) {
  const envVar = opts.envVar ?? "DATABASE_URL";
  const exitOnFail = opts.exitOnFail ?? true;
  const fail = (msg) => {
    if (exitOnFail) { console.error(`[db] ❌ ${msg}`); process.exit(1); }
    throw new Error(msg);
  };
  const url = (process.env[envVar] ?? "").trim();
  if (!url) return fail(`${envVar} 미설정 — 하드코딩 credential 은 제거됨. secret store/환경변수로만 주입.`);
  const pin = (process.env.EXPECTED_DATABASE_HOST_HASH ?? "").trim().toLowerCase();
  if (pin) {
    const actual = hostHash(url);
    if (actual !== pin) return fail(`host 핀 불일치(expected=${pin.slice(0, 8)}… actual=${actual.slice(0, 8)}…) — 대상 DB 확인 필요.`);
    console.log(`[db] host 핀 검증 통과(host#${actual.slice(0, 8)}…).`);
  } else {
    console.log("[db] ⚠️ EXPECTED_DATABASE_HOST_HASH 미설정 — host 핀 미검증(권장: production 은 핀 설정).");
  }
  return url; // 원문은 호출부가 접속에만 사용. 로그에 남기지 않는다.
}
