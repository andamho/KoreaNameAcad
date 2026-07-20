// secret 생성(CSPRNG, 메모리 전용) + sanitizer.
// 하이브리드 B: 운영자는 bootstrap URL 한 쌍만 제공, synthetic LOGIN role password 는 하네스가 내부 생성한다.
// 절대 금지: 로그 출력 · 파일 저장 · argv 전달 · exception 포함 · SQL debug 출력.
import crypto from "node:crypto";

/** 프로세스 메모리에만 존재하는 비밀. toString/JSON 으로 새어나가지 않도록 감싼다. */
export class MemorySecret {
  readonly #value: string;
  constructor(value: string) { this.#value = value; }
  /** SQL 파라미터/연결 문자열 조립 시점에만 호출. 호출 결과를 로그에 넘기지 말 것. */
  reveal(): string { return this.#value; }
  toString(): string { return "[redacted]"; }
  toJSON(): string { return "[redacted]"; }
  get [Symbol.toStringTag]() { return "MemorySecret"; }
}

/** CSPRNG 비밀번호(URL/SQL 안전 문자만). 기본 32바이트 → base64url. */
export function generateSecret(bytes = 32): MemorySecret {
  return new MemorySecret(crypto.randomBytes(bytes).toString("base64url"));
}

export const hostHashOf = (url: string): string => {
  let h = ""; try { h = new URL(url).host.toLowerCase(); } catch { h = ""; }
  return crypto.createHash("sha256").update(h).digest("hex");
};
/** 로그에 쓰는 유일한 URL 표현. */
export const maskUrl = (url: string): string => (url ? `url#${hostHashOf(url).slice(0, 8)}…` : "url#none");

// ── sanitizer: 메시지/스택에서 URL·비밀번호·연결정보 제거 ────────────────────
const URL_RE = /\b[a-z][a-z0-9+.-]*:\/\/[^\s'"]+/gi;          // 모든 scheme://... (postgres, https 등)
const KV_SECRET_RE = /\b(password|passwd|pwd|secret|token|api[_-]?key)\s*[=:]\s*("[^"]*"|'[^']*'|[^\s,;)]+)/gi;
const PG_PARAM_RE = /\b(password|user|host|dbname)\s*=\s*[^\s]+/gi; // libpq keyword=value
const B64URL_LONG_RE = /\b[A-Za-z0-9_-]{40,}\b/g;                   // 생성 비밀(base64url 43자 등)

/** 어떤 문자열이든 외부로 내보내기 전에 통과시킨다. */
export function sanitizeText(input: unknown): string {
  let s = typeof input === "string" ? input : String(input ?? "");
  s = s.replace(URL_RE, "[redacted-url]");
  s = s.replace(KV_SECRET_RE, (_m, k) => `${k}=[redacted]`);
  s = s.replace(PG_PARAM_RE, (_m, k) => `${k}=[redacted]`);
  s = s.replace(B64URL_LONG_RE, "[redacted-secret]");
  return s;
}

/** exception 을 안전한 형태로 변환(메시지·스택 모두 sanitize, connection string 미포함). */
export function sanitizeError(e: unknown): { name: string; message: string; code?: string } {
  const any = e as any;
  return {
    name: sanitizeText(any?.name ?? "Error").slice(0, 80),
    message: sanitizeText(any?.message ?? e).slice(0, 400),
    ...(any?.code ? { code: sanitizeText(any.code).slice(0, 20) } : {}),
  };
}

/** bootstrap URL 에 synthetic role credential 을 끼워 연결 문자열을 만든다(반환값은 로그 금지). */
export function buildRoleUrl(bootstrapUrl: string, role: string, secret: MemorySecret): string {
  const u = new URL(bootstrapUrl);
  u.username = encodeURIComponent(role);
  u.password = encodeURIComponent(secret.reveal());
  return u.toString();
}
