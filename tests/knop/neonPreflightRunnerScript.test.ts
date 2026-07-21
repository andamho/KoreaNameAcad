// 운영자용 단일 실행 스크립트(`runDisposablePreflight.ps1`)의 **안전 계약**을 코드로 고정한다.
//
// 이 스크립트는 운영자가 환경변수 10개를 손으로 조립하지 않게 하려고 만든 것이므로,
// 편의성만큼 **안전 속성이 회귀하지 않는 것**이 중요하다. 여기서 고정하는 속성:
//   - 비밀값을 명령줄 인수로 받지 않는다(히스토리·프로세스 목록 노출 방지)
//   - `CONFIRM_EXECUTE` 를 어떤 경로로도 `true` 로 설정하지 않는다
//   - dry-run 이 성공했을 때만 preflight 로 진행한다
//   - 성공·실패 무관하게 환경변수를 정리한다(`finally`)
//   - 출력 마스킹 경로가 존재한다
//   - 관리 대상 환경변수 목록이 실제 env 계약과 어긋나지 않는다(drift 방지)
//   - Windows PowerShell 5.1 이 한글 스크립트를 깨뜨리지 않도록 **UTF-8 BOM** 을 유지한다
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ENV_CONTRACT, HASH_HELPER_CONTRACT, DEPRECATED_ENV } from "../../scripts/neonCheck/envContract";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT_PATH = path.join(REPO, "scripts", "neonCheck", "runDisposablePreflight.ps1");
const raw = readFileSync(SCRIPT_PATH);
const src = raw.toString("utf-8");

describe("runDisposablePreflight.ps1 — 안전 계약", () => {
  test("UTF-8 BOM 유지 (PowerShell 5.1 이 한글을 ANSI 로 오독하면 파서가 깨진다)", () => {
    assert.deepEqual([raw[0], raw[1], raw[2]], [0xef, 0xbb, 0xbf], "BOM 없음 — PS 5.1 에서 구문 오류 발생");
  });

  test("비밀값을 명령줄 인수로 받지 않는다(보안 입력만)", () => {
    assert.match(src, /-AsSecureString/, "Read-Host -AsSecureString 필요");
    // URL/비밀번호를 param() 으로 받으면 히스토리·프로세스 목록에 남는다
    const paramBlock = src.slice(src.indexOf("param("), src.indexOf(")", src.indexOf("param(")) + 1);
    for (const bad of ["Url", "URL", "Password", "Dsn", "ConnectionString", "Secret"]) {
      assert.ok(!paramBlock.includes(bad), `param() 에 비밀값 파라미터(${bad}) 금지`);
    }
  });

  test("CONFIRM_EXECUTE 를 true 로 설정하는 경로가 없다", () => {
    assert.ok(!/\$env:CONFIRM_EXECUTE\s*=\s*["']?true/i.test(src), "CONFIRM_EXECUTE 설정 금지");
    // 시작 시 기존 값을 제거하는 경로는 있어야 한다
    assert.match(src, /Remove-Item\s+"Env:CONFIRM_EXECUTE"/, "기존 CONFIRM_EXECUTE 제거 경로 필요");
  });

  test("dry-run 성공 시에만 preflight 로 진행한다", () => {
    const dryIdx = src.indexOf("STEP 1: offline dry-run");
    const guardIdx = src.search(/if \(\$dryCode -ne 0\)/);
    const preIdx = src.indexOf('$env:PREFLIGHT_ONLY = "true"');
    assert.ok(dryIdx > 0 && guardIdx > dryIdx, "dry-run 뒤에 실패 가드가 있어야 한다");
    assert.ok(preIdx > guardIdx, "PREFLIGHT_ONLY 설정은 가드 통과 후여야 한다");
    assert.match(src, /throw "offline dry-run 실패/, "dry-run 실패 시 중단해야 한다");
  });

  test("성공·실패 무관하게 정리한다(finally + 잔여 확인)", () => {
    assert.match(src, /finally \{/, "finally 블록 필요");
    const finallyBlock = src.slice(src.lastIndexOf("finally {"));
    assert.match(finallyBlock, /Remove-ManagedEnv/, "finally 에서 환경변수 정리");
    assert.match(finallyBlock, /환경변수 잔여/, "잔여 확인 출력 필요");
    assert.match(finallyBlock, /Secrets\.Clear\(\)/, "메모리 평문 참조 해제");
  });

  test("출력 마스킹 경로가 존재하고 DSN/host 패턴을 덮는다", () => {
    assert.match(src, /function Protect-Output/, "마스킹 함수 필요");
    assert.match(src, /postgres\(ql\)\?:\/\//, "DSN 패턴 마스킹 필요");
    assert.match(src, /neon\\\.tech/, "hostname 패턴 마스킹 필요");
    assert.match(src, /Protect-Output \$_/, "보고서 기록 시 마스킹 적용");
  });

  test("관리 환경변수 목록이 실제 계약과 일치한다(drift 방지)", () => {
    const block = src.slice(src.indexOf("$Script:ManagedEnv"), src.indexOf("$Script:Secrets"));
    const required = [
      ...ENV_CONTRACT.map((v) => v.name),
      ...HASH_HELPER_CONTRACT.map((v) => v.name),
    ];
    for (const name of required) {
      assert.ok(block.includes(name), `정리 목록에 ${name} 누락 — 실행 후 잔존 위험`);
    }
    // 폐기 변수는 스크립트가 설정하지 않아야 한다
    for (const d of DEPRECATED_ENV) {
      assert.ok(!new RegExp(`\\$env:${d.name}\\s*=`).test(src), `폐기 변수 ${d.name} 설정 금지`);
    }
  });

  test("hash 계산이 Node 의 host 의미(포트 포함)를 재현한다", () => {
    // Node: new URL(u).host → 포트가 명시되면 "host:port". PS 의 [Uri].Host 는 포트를 제외하므로 보정이 필요하다.
    assert.match(src, /if \(\$u\.Port -ge 0\)/, "포트 명시 시 host:port 보정 필요");
    assert.match(src, /ToLowerInvariant/, "host 소문자화 필요");
    assert.match(src, /SHA256/, "sha256 필요");
  });

  test("접속 전 로컬 검문으로 명백한 오입력을 걸러낸다", () => {
    assert.match(src, /disposable direct\/pooled host 가 동일/, "direct=pooled 검문");
    assert.match(src, /production direct\/pooled host 가 동일/, "forbidden 두 값 동일 검문");
    assert.match(src, /production direct 와 동일/, "forbidden set 대조");
    assert.match(src, /접속을 시도하지 않고 중단/, "검문 실패 시 접속 전 중단");
  });

  test("보고서는 저장소 밖 임시 경로에 쓴다", () => {
    assert.match(src, /GetTempPath\(\)/, "임시 경로 사용");
    assert.ok(!/\$repo.*neon-preflight-report/.test(src), "저장소 안에 보고서를 쓰면 안 된다");
  });

  test("실제 DDL 을 실행하지 않음을 스스로 명시한다", () => {
    assert.match(src, /읽기 전용 검증까지만/, "범위 명시 필요");
    assert.match(src, /CONFIRM_EXECUTE: 설정한 적 없음/, "보고에 미설정 명시");
  });
});
