// scripts/runProductionQueueMigration.ps1 계약 검증 — BOM·마스킹·SecureString·Mode 분리·pooler 거부·단일 변수·승인 문구·
//   env cleanup·하드코딩 secret 0. Windows 에서는 SelfTest 실행해 보고서 원문 유출 0 실측.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = path.join(root, "scripts", "runProductionQueueMigration.ps1");
const raw = readFileSync(SCRIPT);
const src = raw.toString("utf-8");

describe("runProductionQueueMigration.ps1 — 계약", () => {
  test("UTF-8 BOM 유지", () => { assert.deepEqual([raw[0], raw[1], raw[2]], [0xef, 0xbb, 0xbf], "BOM 없음"); });
  test("SecureString 입력 · URL 평문 매개변수 없음", () => {
    assert.match(src, /Read-Host .*-AsSecureString/); assert.match(src, /ConvertFrom-SecureStringPlain/);
    const paramBlock = src.slice(src.indexOf("param("), src.indexOf(")", src.indexOf("param(")) + 1);
    assert.ok(!/\$(Url|ConnectionString|DatabaseUrl|Dsn|Password)/i.test(paramBlock), "평문 URL/credential 매개변수 금지");
  });
  test("마스킹 함수 존재 + 보고서 적용", () => {
    assert.match(src, /function Protect-Output/); assert.match(src, /Protect-Output \$_/); assert.match(src, /redacted-dsn/);
  });
  test("Mode 4종(Inspect/DryRun/Apply/Rollback) + ValidateSet", () => {
    assert.match(src, /ValidateSet\('Inspect','DryRun','Apply','Rollback'\)/);
  });
  test("pooler 거부(direct 강제)", () => { assert.match(src, /-match "pooler"/); });
  test("소유자 단일 변수(NEON_DATABASE_URL) 설정 · 런타임 URL 미설정", () => {
    assert.match(src, /\$env:NEON_DATABASE_URL\s*=/);
    assert.ok(!/\$env:ORCHESTRATION_(WORKER|ADMIN|QUEUE)_URL\s*=/.test(src), "migration 은 소유자 연결만");
  });
  test("DryRun/Apply/Rollback 각각 승인 문구", () => {
    for (const p of ["RUN QUEUE DRYRUN", "APPLY QUEUE MIGRATION", "ROLLBACK QUEUE MIGRATION"]) assert.ok(src.includes(p), `승인 문구 누락: ${p}`);
  });
  test("종료 시 env cleanup(Remove-ManagedEnv, finally)", () => {
    assert.match(src, /function Remove-ManagedEnv/); assert.match(src, /finally\s*\{[\s\S]*Remove-ManagedEnv/);
  });
  test("하드코딩 secret 0", () => {
    assert.ok(!/npg_[A-Za-z0-9]{6,}/.test(src));
    assert.ok(!/postgres(ql)?:\/\/[a-z0-9_]+:[^@\s"']*npg_/.test(src));
  });
});

describe("runProductionQueueMigration.ps1 — SelfTest 마스킹(Windows)", () => {
  test(os.platform() === "win32" ? "SelfTest 보고서 원문 secret 0" : "비-Windows: skip", () => {
    if (os.platform() !== "win32") return;
    const before = new Set(readdirSync(os.tmpdir()).filter((f) => f.startsWith("queue-migration-report-")));
    try { execFileSync("powershell", ["-ExecutionPolicy", "Bypass", "-File", SCRIPT, "-Mode", "Inspect", "-SelfTest"], { cwd: root, encoding: "utf-8" }); } catch { /* */ }
    const after = readdirSync(os.tmpdir()).filter((f) => f.startsWith("queue-migration-report-") && !before.has(f));
    assert.ok(after.length >= 1, "보고서 미생성");
    const report = readFileSync(path.join(os.tmpdir(), after.sort().pop()!), "utf-8");
    for (const leak of ["ep-selftest", "postgresql://", "example.neon.tech", "u:p@"]) assert.ok(!report.includes(leak), `원문 유출: ${leak}`);
    assert.match(report, /host#[0-9a-f]{8}/);
  });
});
