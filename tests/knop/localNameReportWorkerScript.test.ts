// scripts/runLocalNameReportWorker.ps1 계약 검증 — BOM·마스킹·SecureString/DPAPI·중복실행 Mutex·env cleanup·
//   dist/queueWorker.js 실행(tsx 미의존)·자동실행은 안내만(schtasks 실제 등록 금지)·하드코딩 secret 0.
//   Windows 에서는 SelfTest 실행해 보고서 원문 유출 0 실측.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = path.join(root, "scripts", "runLocalNameReportWorker.ps1");
const raw = readFileSync(SCRIPT);
const src = raw.toString("utf-8");

describe("runLocalNameReportWorker.ps1 — 계약", () => {
  test("UTF-8 BOM 유지", () => { assert.deepEqual([raw[0], raw[1], raw[2]], [0xef, 0xbb, 0xbf], "BOM 없음"); });
  test("SecureString/DPAPI 입력 · URL 평문 매개변수 없음", () => {
    assert.match(src, /Read-Host .*-AsSecureString/);
    assert.match(src, /ConvertFrom-SecureString/); assert.match(src, /ConvertTo-SecureString/); // DPAPI 저장/복원
    const paramBlock = src.slice(src.indexOf("param("), src.indexOf(")", src.indexOf("param(")) + 1);
    assert.ok(!/\$(Url|WorkerUrl|ConnectionString|Password)/i.test(paramBlock), "평문 URL/credential 매개변수 금지");
  });
  test("마스킹 함수 + 보고서 적용", () => { assert.match(src, /function Protect-Output/); assert.match(src, /redacted-dsn/); });
  test("중복 실행 방지(전역 Mutex)", () => { assert.match(src, /System\.Threading\.Mutex/); assert.match(src, /Global\\KnaNameReportWorker/); assert.match(src, /이미 이름분석표 worker/); });
  test("dist/queueWorker.js 실행 + name-report 플래그(tsx 미의존)", () => {
    assert.match(src, /dist\/queueWorker\.js/);
    assert.match(src, /WORKER_ENABLE_NAME_REPORT\s*=\s*'true'/);
    assert.ok(!/tsx\/esm/.test(src), "tsx 런타임 사용 금지(프로덕션 빌드 경로)");
  });
  test("owner 자격 거부", () => { assert.match(src, /neondb_owner/); });
  test("자동실행은 안내만(schtasks 실제 등록 금지)", () => {
    assert.match(src, /ShowAutostartHelp/); assert.match(src, /schtasks \/Create/);
    // schtasks 를 실제 호출(&/Invoke)하지 않고 문자열로 안내만 하는지: Add-Report 라인 안에만 등장.
    assert.ok(!/&\s*["']?schtasks/.test(src) && !/Start-Process\s+schtasks/i.test(src), "schtasks 실제 실행 금지");
  });
  test("종료 시 env cleanup + Mutex 해제(finally)", () => {
    assert.match(src, /function Remove-ManagedEnv/); assert.match(src, /finally\s*\{[\s\S]*Remove-ManagedEnv/); assert.match(src, /ReleaseMutex/);
  });
  test("DPAPI 비밀파일 gitignore + 하드코딩 secret 0", () => {
    const gi = readFileSync(path.join(root, ".gitignore"), "utf-8");
    assert.match(gi, /name-report-writer\.secret/);
    assert.ok(!/npg_[A-Za-z0-9]{6,}/.test(src));
  });
});

describe("runLocalNameReportWorker.ps1 — SelfTest 마스킹(Windows)", () => {
  test(os.platform() === "win32" ? "SelfTest 보고서 원문 secret 0" : "비-Windows: skip", () => {
    if (os.platform() !== "win32") return;
    const before = new Set(readdirSync(os.tmpdir()).filter((f) => f.startsWith("nr-worker-report-")));
    try { execFileSync("powershell", ["-ExecutionPolicy", "Bypass", "-File", SCRIPT, "-SelfTest"], { cwd: root, encoding: "utf-8" }); } catch { /* */ }
    const after = readdirSync(os.tmpdir()).filter((f) => f.startsWith("nr-worker-report-") && !before.has(f));
    assert.ok(after.length >= 1, "보고서 미생성");
    const report = readFileSync(path.join(os.tmpdir(), after.sort().pop()!), "utf-8");
    for (const leak of ["ep-selftest", "postgresql://", "example.neon.tech", "writer:p@"]) assert.ok(!report.includes(leak), `원문 유출: ${leak}`);
    assert.match(report, /host#[0-9a-f]{8}/);
  });
});
