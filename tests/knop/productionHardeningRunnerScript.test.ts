// scripts/runProductionHardening.ps1 (운영 hardening PowerShell 래퍼) 계약 검증.
//   - UTF-8 BOM 유지(PS 5.1 한글) · 마스킹 함수 존재·적용 · SecureString 입력 · Mode 분리 · direct 강제 ·
//     NEON_DATABASE_URL 단일 · Mode 별 승인 문구 · env cleanup · 하드코딩 secret 0.
//   - Windows 에서는 SelfTest 를 실제 실행해 **마스킹 보고서에 URL/host/password 원문이 없음**을 검증.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = path.join(root, "scripts", "runProductionHardening.ps1");
const raw = readFileSync(SCRIPT);
const src = raw.toString("utf-8");

describe("runProductionHardening.ps1 — 계약", () => {
  test("UTF-8 BOM 유지 (PS 5.1 한글 파서 보호)", () => {
    assert.deepEqual([raw[0], raw[1], raw[2]], [0xef, 0xbb, 0xbf], "BOM 없음");
  });
  test("보안 입력(SecureString) · URL 을 script 매개변수/평문으로 받지 않음", () => {
    assert.match(src, /Read-Host .*-AsSecureString/, "SecureString 입력 필요");
    assert.match(src, /ConvertFrom-SecureStringPlain/, "SecureString 변환 필요");
    // script param(...) 블록에는 Url/DSN 류 평문 매개변수가 없어야 한다(입력은 SecureString Read-Host 로만).
    const paramBlock = src.slice(src.indexOf("param("), src.indexOf(")", src.indexOf("param(")) + 1);
    assert.ok(!/\$(Url|ConnectionString|DatabaseUrl|Dsn|Password)/i.test(paramBlock), "URL/credential 을 평문 script 매개변수로 받으면 안 됨");
  });
  test("마스킹 함수 존재 + 보고서에 적용", () => {
    assert.match(src, /function Protect-Output/, "마스킹 함수 필요");
    assert.match(src, /Protect-Output \$_/, "보고서 기록 시 마스킹 적용");
    assert.match(src, /redacted-dsn/, "DSN 마스킹 규칙 필요");
  });
  test("Mode 4종 분리(Preflight/DryRun/Apply/Rollback) + ValidateSet", () => {
    assert.match(src, /ValidateSet\('Preflight','DryRun','Apply','Rollback'\)/);
  });
  test("direct 강제(pooler 거부)", () => {
    assert.match(src, /pooler.*direct|direct.*pooler|-match "pooler"/, "pooled 엔드포인트 거부 로직 필요");
  });
  test("NEON_DATABASE_URL 단일 변수(DATABASE_URL 미사용)", () => {
    assert.match(src, /\$env:NEON_DATABASE_URL\s*=/, "NEON_DATABASE_URL 설정 필요");
    assert.ok(!/\$env:DATABASE_URL\s*=/.test(src), "DATABASE_URL 을 설정하면 안 됨(단일 변수 계약)");
  });
  test("DryRun/Apply/Rollback 각각 승인 문구 요구", () => {
    for (const p of ["RUN DRYRUN", "APPLY TO PRODUCTION", "ROLLBACK PRODUCTION"]) assert.ok(src.includes(p), `승인 문구 누락: ${p}`);
  });
  test("종료 시 env cleanup(Remove-ManagedEnv, finally)", () => {
    assert.match(src, /function Remove-ManagedEnv/);
    assert.match(src, /finally\s*\{[\s\S]*Remove-ManagedEnv/, "finally 에서 env 제거 필요");
  });
  test("하드코딩 secret 0(npg_·credential DSN 없음)", () => {
    assert.ok(!/npg_[A-Za-z0-9]{6,}/.test(src), "npg_ password 잔존");
    assert.ok(!/postgres(ql)?:\/\/[a-z0-9_]+:[^@\s"']*npg_/.test(src), "credential DSN 잔존");
  });
  test("pin 파일이 gitignore 됨", () => {
    const gi = readFileSync(path.join(root, ".gitignore"), "utf-8");
    assert.match(gi, /production-hardening-host\.pin/, "pin 파일 gitignore 누락");
  });
});

// Windows 에서만: SelfTest 실행 → 보고서에 합성 URL/host/password 원문이 없음을 실측.
describe("runProductionHardening.ps1 — SelfTest 마스킹(Windows)", () => {
  test(os.platform() === "win32" ? "SelfTest 보고서에 원문 secret 0" : "비-Windows: skip", (t) => {
    if (os.platform() !== "win32") return; // 다른 OS 는 skip(정적 계약으로 충분)
    const before = new Set(readdirSync(os.tmpdir()).filter((f) => f.startsWith("prod-hardening-report-")));
    try { execFileSync("powershell", ["-ExecutionPolicy", "Bypass", "-File", SCRIPT, "-Mode", "Preflight", "-SelfTest"], { cwd: root, encoding: "utf-8" }); }
    catch { /* SelfTest 는 exit 0 이지만 환경에 따라 무시 */ }
    const after = readdirSync(os.tmpdir()).filter((f) => f.startsWith("prod-hardening-report-") && !before.has(f));
    assert.ok(after.length >= 1, "SelfTest 보고서 미생성");
    const report = readFileSync(path.join(os.tmpdir(), after.sort().pop()!), "utf-8");
    for (const leak of ["ep-selftest", "postgresql://", "example.neon.tech", "u:p@"]) {
      assert.ok(!report.includes(leak), `보고서에 원문 유출: ${leak}`);
    }
    assert.match(report, /host#[0-9a-f]{8}/, "host 해시 마스킹 표기 필요");
  });
});
