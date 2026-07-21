// 운영자용 host hash 계산기.
//
// ⚠️ 입력은 **hash-helper 전용 계약**(`NEON_HASH_INPUT_*`)이며 실행 하네스 env 계약과 **분리**돼 있다.
//    하네스는 이 이름들을 읽지 않는다(테스트로 강제).
//
// 설계 원칙(secret 노출 최소화):
//  - **URL 을 argument/argv 로 받지 않는다.** 오직 프로세스 환경변수에서만 읽는다.
//    → PowerShell 명령줄에 URL 리터럴이 남지 않고, PSReadLine history·프로세스 목록에도 노출되지 않는다.
//  - 출력은 `direct#<hash>` / `pooled#<hash>` / `forbidden#<hash>` **뿐**이다.
//    URL·hostname·username·database·password 는 어떤 경로로도 출력하지 않는다.
//  - malformed URL 이어도 원문을 출력하지 않고 사유 코드만 낸다.
//  - 예외는 전부 sanitizer 를 통과시킨다.
import { hostHashOf, sanitizeError } from "./secrets";
import { parseUrlShape } from "./guards";

/** 계산 대상: 표시이름 → 환경변수명 */
export const HASH_TARGETS = [
  { label: "expected-direct", env: "NEON_HASH_INPUT_DIRECT_URL" },
  { label: "expected-pooled", env: "NEON_HASH_INPUT_POOLED_URL" },
  { label: "forbidden-direct", env: "NEON_HASH_INPUT_FORBIDDEN_DIRECT_URL" },
  { label: "forbidden-pooled", env: "NEON_HASH_INPUT_FORBIDDEN_POOLED_URL" },
] as const;

export interface HashLine { label: string; ok: boolean; text: string }

/** 환경변수에서만 읽어 hash 를 만든다. 값 원문은 반환값 어디에도 포함되지 않는다. */
export function computeHashLines(env: Record<string, string | undefined>): HashLine[] {
  const out: HashLine[] = [];
  for (const t of HASH_TARGETS) {
    const raw = (env[t.env] ?? "").trim();
    if (!raw) {
      // forbidden 은 선택 — 없으면 조용히 안내만
      out.push({ label: t.label, ok: false, text: `${t.label}#<미설정> (${t.env} 없음)` });
      continue;
    }
    const shape = parseUrlShape(raw);
    if (!shape.ok) { out.push({ label: t.label, ok: false, text: `${t.label}#<오류> (${shape.reason})` }); continue; }
    try { out.push({ label: t.label, ok: true, text: `${t.label}#${hostHashOf(raw)}` }); }
    catch (e) { out.push({ label: t.label, ok: false, text: `${t.label}#<오류> (${sanitizeError(e)})` }); }
  }
  return out;
}

export function hashToolUsage(): string[] {
  return [
    "host hash 계산기 — URL 은 **환경변수로만** 전달한다(argv 금지).",
    "  PowerShell:",
    "    $env:NEON_HASH_INPUT_DIRECT_URL = (Read-Host 'disposable direct URL')   # 명령줄 리터럴 금지",
    "    $env:NEON_HASH_INPUT_POOLED_URL = (Read-Host 'disposable pooled URL')",
    "    $env:NEON_HASH_INPUT_FORBIDDEN_DIRECT_URL = (Read-Host 'production direct URL')",
    "    $env:NEON_HASH_INPUT_FORBIDDEN_POOLED_URL = (Read-Host 'production pooled URL')",
    "    node --import tsx/esm scripts/neonCheck/hashTool.ts",
    "  출력은 `<label>#<64hex>` 형식이며 URL·host 원문은 출력하지 않는다.",
    "  ⚠️ 이 변수들은 **helper 전용**이다. 하네스는 읽지 않는다. 계산 직후 Remove-Item 으로 제거할 것.",
  ];
}

const isDirect = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("hashTool.ts");
if (isDirect) {
  if (process.argv.length > 2) {
    console.error("[neon-hash] ❌ 이 도구는 인자를 받지 않습니다. URL 을 명령줄에 두면 shell history/프로세스 목록에 남습니다.");
    for (const l of hashToolUsage()) console.error("  " + l);
    process.exit(2);
  }
  for (const l of hashToolUsage()) console.log("[neon-hash] " + l);
  console.log("");
  for (const l of computeHashLines(process.env)) console.log("[neon-hash] " + l.text);
}
