// scripts/runQueueSmoke.ps1 계약 검증 — BOM·마스킹·SecureString·Mode 분리·업무쓰기 게이트·env cleanup·하드코딩 secret 0.
//   또 dist/queueSmoke.js 빌드 엔트리 존재 + createQueueSmokeJob 의 프로덕션 실행 경로(tsx 미의존) 확인.
//   Windows 에서는 SelfTest 실행해 보고서 원문 유출 0 실측.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = path.join(root, "scripts", "runQueueSmoke.ps1");
const raw = readFileSync(SCRIPT);
const src = raw.toString("utf-8");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf-8"));
const cliSrc = readFileSync(path.join(root, "scripts", "createQueueSmokeJob.ts"), "utf-8");

describe("runQueueSmoke.ps1 — 계약", () => {
  test("UTF-8 BOM 유지", () => { assert.deepEqual([raw[0], raw[1], raw[2]], [0xef, 0xbb, 0xbf], "BOM 없음"); });
  test("SecureString 입력 · URL 평문 매개변수 없음", () => {
    assert.match(src, /Read-Host .*-AsSecureString/); assert.match(src, /ConvertFrom-SecureStringPlain/);
    const paramBlock = src.slice(src.indexOf("param("), src.indexOf(")", src.indexOf("param(")) + 1);
    assert.ok(!/\$(Url|WorkerUrl|AdminUrl|ConnectionString|Password)/i.test(paramBlock), "평문 URL/credential 매개변수 금지");
  });
  test("마스킹 함수 + 보고서 적용", () => {
    assert.match(src, /function Protect-Output/); assert.match(src, /redacted-dsn/); assert.match(src, /redacted-host/);
  });
  test("Mode 2종(Preview/NameReport) ValidateSet", () => {
    assert.match(src, /ValidateSet\('Preview','NameReport'\)/);
  });
  test("worker/admin host 일치 검증 + owner 자격 거부", () => {
    assert.match(src, /admin\/worker host 불일치/); assert.match(src, /neondb_owner/);
  });
  test("NameReport = 비-prod 게이트(업무쓰기 승인 문구) · Preview 는 PII 없음 표기", () => {
    assert.ok(src.includes("NONPROD SMOKE"), "비-prod 확인 문구 누락");
    assert.match(src, /SMOKE_ALLOW_BUSINESS_WRITE\s*=\s*'true'/); assert.match(src, /SMOKE_NONPROD_ACK\s*=\s*'true'/);
    assert.match(src, /production 안전/);
  });
  test("dist/queueSmoke.js 실행(tsx 런타임 미사용)", () => {
    assert.match(src, /dist\/queueSmoke\.js/);
    assert.ok(!/tsx\/esm/.test(src), "smoke 실행에 tsx 런타임 사용 금지(프로덕션 빌드 경로)");
    assert.match(src, /dist\/queueSmoke\.js 없음/); // 미빌드 fail-closed
  });
  test("종료 시 env cleanup(Remove-ManagedEnv, finally)", () => {
    assert.match(src, /function Remove-ManagedEnv/); assert.match(src, /finally\s*\{[\s\S]*Remove-ManagedEnv/);
  });
  test("하드코딩 secret 0", () => {
    assert.ok(!/npg_[A-Za-z0-9]{6,}/.test(src));
    assert.ok(!/postgres(ql)?:\/\/[a-z0-9_]+:[^@\s"']*npg_/.test(src));
  });
});

describe("smoke CLI — 프로덕션 빌드 · 모드 계약", () => {
  test("package.json build 에 dist/queueSmoke.js esbuild 엔트리 존재", () => {
    assert.match(pkg.scripts.build, /esbuild scripts\/createQueueSmokeJob\.ts[^&]*--outfile=dist\/queueSmoke\.js/);
  });
  test("createQueueSmokeJob: Preview(순수) vs name-report(업무쓰기 게이트) 구분", () => {
    assert.match(cliSrc, /SMOKE_ALLOW_BUSINESS_WRITE/); assert.match(cliSrc, /SMOKE_NONPROD_ACK/);
    assert.match(cliSrc, /CONFIRM_QUEUE_SMOKE/);
    assert.match(cliSrc, /queueSmoke\)\\\.\(ts\|js\)/); // isDirect 가 빌드 파일명(queueSmoke.js) 매칭
  });
});

describe("runQueueSmoke.ps1 — SelfTest 마스킹(Windows)", () => {
  test(os.platform() === "win32" ? "SelfTest 보고서 원문 secret 0" : "비-Windows: skip", () => {
    if (os.platform() !== "win32") return;
    const before = new Set(readdirSync(os.tmpdir()).filter((f) => f.startsWith("queue-smoke-report-")));
    try { execFileSync("powershell", ["-ExecutionPolicy", "Bypass", "-File", SCRIPT, "-Mode", "Preview", "-SelfTest"], { cwd: root, encoding: "utf-8" }); } catch { /* */ }
    const after = readdirSync(os.tmpdir()).filter((f) => f.startsWith("queue-smoke-report-") && !before.has(f));
    assert.ok(after.length >= 1, "보고서 미생성");
    const report = readFileSync(path.join(os.tmpdir(), after.sort().pop()!), "utf-8");
    for (const leak of ["ep-selftest", "postgresql://", "example.neon.tech", "writer:p@"]) assert.ok(!report.includes(leak), `원문 유출: ${leak}`);
    assert.match(report, /host#[0-9a-f]{8}/);
  });
});
