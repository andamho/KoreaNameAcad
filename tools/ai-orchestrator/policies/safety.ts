// 안전 정책 — 명령 allow/deny + 쓰기 경로 안전. 자동 실행은 allowlist(모르는 명령=차단).
//   금지 작업(production DB write·main 병합·push·배포·secret·대량삭제·고객원본수정)은 자동 실행하지 않고 blocked.
import path from "path";

// 자동 차단 패턴(허용 head 여도 이게 있으면 무조건 blocked).
const DENY: { re: RegExp; reason: string }[] = [
  { re: /\bgit\s+push\b/i, reason: "git push(원격 반영) 금지 — 사람 승인" },
  { re: /\bgit\s+(merge|rebase)\b.*\bmain\b/i, reason: "main 병합/리베이스 금지 — 사람 승인" },
  { re: /\bgit\s+checkout\s+main\b/i, reason: "main 체크아웃 금지" },
  { re: /\brm\s+-rf?\b|\bRemove-Item\b.*-Recurse|\bdel\s+\/s\b/i, reason: "대량/재귀 삭제 금지" },
  { re: /\b(drop|delete|truncate|update|insert|alter)\b\s+(table|from|into|role|database)/i, reason: "DB 파괴/쓰기 SQL 금지" },
  { re: /drizzle-kit\s+push|db:push/i, reason: "drizzle db:push(운영 스키마 자동반영) 금지" },
  { re: /railway\b|neon\b.*(password|reset)/i, reason: "Railway/Neon 운영 변경 금지" },
  { re: /\bnpm\s+publish\b|\bdeploy\b/i, reason: "배포 금지 — 사람 승인" },
  { re: /\b(curl|wget|Invoke-WebRequest|iwr)\b/i, reason: "외부 네트워크 전송 금지(고객 데이터 유출 방지)" },
  { re: /(^|\s)>\s*\/(etc|usr|bin)|\bchmod\b|\bchown\b|\bsudo\b/i, reason: "시스템 변경 금지" },
  { re: /\.env\b|secret|token|password|NEON_DATABASE_URL|ORCHESTRATION_\w+_URL/i, reason: "secret/.env 접근 금지" },
];

// 허용 명령 head(읽기·테스트·로컬처리·git 안전 서브커맨드). 그 외는 차단.
const ALLOW_HEADS: RegExp[] = [
  /^git\s+(diff|status|log|show|rev-parse|branch|stash\s+list)\b/i,
  /^(node|npx)\b/i,                        // node --test / npx tsx --test 등(내용은 DENY 로 2차 검문)
  /^npm\s+(run\s+)?(test|check)\b/i,
  /^(py|python|python3)\b|python\.exe\b/i,  // 영상 파이프라인·pytest(로컬 처리)
  /^pytest\b/i,
  /^tsc\b/i,
  /^(ls|dir|cat|type|head|tail|wc|find|grep|Get-Content|Get-ChildItem)\b/i, // 읽기 조사
  /\.\/venv\/Scripts\/python\.exe/i,        // video-caption-bot venv
];

export type SafetyCategory = "allowed" | "blocked";
export interface SafetyVerdict { category: SafetyCategory; reason: string; }

export function classifyCommand(cmd: string): SafetyVerdict {
  const c = (cmd || "").trim();
  if (!c) return { category: "blocked", reason: "빈 명령" };
  for (const d of DENY) { if (d.re.test(c)) return { category: "blocked", reason: d.reason }; }
  for (const h of ALLOW_HEADS) { if (h.test(c)) return { category: "allowed", reason: "allowlist" }; }
  return { category: "blocked", reason: "allowlist 미포함(모르는 명령=자동 차단)" };
}

// 사람 승인 필요 작업(보고용 목록).
export const HUMAN_APPROVAL_REQUIRED = [
  "main 병합", "production 배포", "secret 변경", "production DB 변경", "고객 원본 데이터 수정", "대량 삭제", "git push",
];

// 워크스페이스 밖·민감 경로 쓰기 차단.
export function assertSafeWritePath(root: string, target: string): void {
  const r = path.resolve(root), t = path.resolve(root, target);
  if (t !== r && !t.startsWith(r + path.sep)) throw new Error(`워크스페이스 밖 쓰기 금지: ${target}`);
  const rel = path.relative(r, t).replace(/\\/g, "/");
  if (/(^|\/)\.git\//.test(rel) || rel === ".git") throw new Error(".git 쓰기 금지");
  if (/(^|\/)node_modules\//.test(rel)) throw new Error("node_modules 쓰기 금지");
  if (/(^|\/)\.env(\.|$)/.test(rel)) throw new Error(".env 쓰기 금지(secret)");
}
