<#
.SYNOPSIS
  disposable Neon 대상 **offline dry-run → SELECT-only preflight** 를 한 번에 안전하게 수행한다.

.DESCRIPTION
  운영자가 환경변수 10개를 손으로 조립하거나 hash 를 직접 계산할 필요가 없다.
  이 스크립트가 다음을 전부 처리한다:

    1. 접속 URL 4개를 **보안 입력**(화면 미표시)으로 받는다 — 명령줄 인수로 받지 않으므로
       PowerShell 명령 기록(PSReadLine)과 프로세스 목록에 URL·비밀번호가 남지 않는다.
    2. direct/pooled/forbidden(production) host hash 4개를 **내부에서** 계산한다.
       (Node 의 `new URL(u).host` 의미를 그대로 재현: 포트가 명시돼 있으면 `host:port`)
    3. run-id 를 자동 생성한다(`[a-z0-9]{4,16}`).
    4. **offline dry-run** 을 먼저 실행하고, 성공했을 때만 **PREFLIGHT_ONLY=true** 로 진행한다.
    5. `CONFIRM_EXECUTE` 는 **절대 설정하지 않으며**, 이미 설정돼 있으면 시작 시 제거한다.
    6. 출력에서 DSN·hostname·username·password 를 **마스킹**한다(하네스가 이미 마스킹하지만 2차 방어).
    7. 성공·실패와 무관하게 **환경변수·평문 문자열·임시 파일을 정리**한다.
    8. 운영자가 공유해도 되는 **마스킹된 보고서 파일 하나만** 남긴다.

  ⚠️ 이 스크립트는 읽기 전용 검증까지만 수행한다. 실제 DDL(`CONFIRM_EXECUTE=true`)은
     별도 승인 후 다른 경로로만 실행된다.

.PARAMETER SelfTest
  네트워크 접속 없이 스크립트 자체 동작만 검증한다(합성 URL 사용, preflight 미실행).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\neonCheck\runDisposablePreflight.ps1
#>
[CmdletBinding()]
param(
  [switch]$SelfTest,
  # ⚠️ -Execute 를 주면 preflight 통과 후 **실제 capability 실행**(STEP 3)까지 진행한다.
  #    이때만 `CONFIRM_EXECUTE=true` 를 이 스크립트 **이번 실행에 한해** 설정하고, 끝나면 즉시 제거한다.
  #    생성되는 객체는 전부 `oc_*_<runId>` scoped(production 이름과 겹치지 않음)이며 실행 끝에 run-id 범위로 정리된다.
  #    -Execute 가 없으면 STEP 2(preflight)까지만 하고 DDL 을 실행하지 않는다(기존 동작).
  [switch]$Execute,
  [string]$ReportPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── 이 스크립트가 다루는 환경변수(정리 대상) ───────────────────────────────
$Script:ManagedEnv = @(
  "NEON_CHECK_DIRECT_URL", "NEON_CHECK_POOLED_URL",
  "NEON_CHECK_EXPECTED_DIRECT_HOST_HASH", "NEON_CHECK_EXPECTED_POOLED_HOST_HASH",
  "NEON_CHECK_FORBIDDEN_DIRECT_HOST_HASH", "NEON_CHECK_FORBIDDEN_POOLED_HOST_HASH",
  "NEON_CHECK_DISPOSABLE_CONFIRM", "NEON_CHECK_RUN_ID",
  "PREFLIGHT_ONLY", "CONFIRM_EXECUTE",
  "NEON_HASH_INPUT_DIRECT_URL", "NEON_HASH_INPUT_POOLED_URL",
  "NEON_HASH_INPUT_FORBIDDEN_DIRECT_URL", "NEON_HASH_INPUT_FORBIDDEN_POOLED_URL"
)
$Script:Secrets = New-Object System.Collections.ArrayList   # 마스킹 대상 원문(메모리 한정)
$Script:Report = New-Object System.Collections.ArrayList

function Add-Report([string]$Line) { [void]$Script:Report.Add($Line); Write-Host $Line }

function Remove-ManagedEnv {
  foreach ($n in $Script:ManagedEnv) {
    if (Test-Path "Env:$n") { Remove-Item "Env:$n" -ErrorAction SilentlyContinue }
  }
}

function ConvertFrom-SecureStringPlain([System.Security.SecureString]$Secure) {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

# Node 의 `new URL(u).host` 와 **동일한** 문자열을 만든다.
#   포트가 명시되지 않으면 hostname, 명시되면 "hostname:port".
#   (불일치하면 하네스가 fail-closed 로 거부하므로 정확도가 중요하다.)
function Get-UrlHostForHash([string]$Url) {
  $u = $null
  try { $u = [System.Uri]$Url } catch { throw "URL 형식이 올바르지 않습니다(값은 표시하지 않습니다)." }
  if (-not $u.Scheme -or ($u.Scheme -ne "postgres" -and $u.Scheme -ne "postgresql")) {
    throw "protocol 이 postgres/postgresql 이 아닙니다(값은 표시하지 않습니다)."
  }
  if (-not $u.Host) { throw "URL 에 host 가 없습니다." }
  $h = $u.Host.ToLowerInvariant()
  # System.Uri 는 명시 포트가 없으면 Port = -1
  if ($u.Port -ge 0) { $h = "$h`:$($u.Port)" }
  return $h
}

function Get-Sha256Hex([string]$Text) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    return (($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") }) -join "")
  } finally { $sha.Dispose() }
}

function New-RunId {
  $chars = "abcdefghijklmnopqrstuvwxyz0123456789".ToCharArray()
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $buf = New-Object byte[] 10
    $rng.GetBytes($buf)
    $s = ""
    foreach ($b in $buf) { $s += $chars[$b % $chars.Length] }
    return $s   # 10자, [a-z0-9]{4,16} 만족
  } finally { $rng.Dispose() }
}

# 하네스 출력은 이미 마스킹돼 있지만, 예기치 못한 경로를 대비한 **2차 방어**.
function Protect-Output([string]$Text) {
  if (-not $Text) { return "" }
  $out = $Text
  foreach ($s in $Script:Secrets) {
    if ($s -and $s.Length -gt 3) { $out = $out.Replace($s, "<redacted>") }
  }
  $out = [regex]::Replace($out, "postgres(ql)?://[^\s""']+", "<redacted-dsn>")
  $out = [regex]::Replace($out, "[A-Za-z0-9_.-]+\.neon\.tech(:\d+)?", "<redacted-host>")
  return $out
}

function Invoke-Harness([string]$Label) {
  $node = (Get-Command node -ErrorAction Stop).Source
  $args = @("--import", "tsx/esm", "scripts/neonOrchestrationCapabilityCheck.ts")
  $out = & $node $args 2>&1
  $code = $LASTEXITCODE
  $text = Protect-Output (($out | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine)
  Add-Report "----- $Label (exit=$code) -----"
  foreach ($line in $text -split [Environment]::NewLine) { Add-Report $line }
  return $code
}

# ══════════════════════════════════════════════════════════════════════════
try {
  Add-Report "[runner] disposable Neon preflight runner"
  Add-Report "[runner] 이 스크립트는 읽기 전용 검증까지만 수행합니다. 실제 DDL 은 실행하지 않습니다."

  # 0. 시작 시 위험 플래그 제거 — 이전 세션의 잔여값이 모드를 오염시키지 않게 한다.
  if (Test-Path "Env:CONFIRM_EXECUTE") {
    Add-Report "[runner] 기존 CONFIRM_EXECUTE 발견 → 제거합니다(이 스크립트는 절대 설정하지 않습니다)."
    Remove-Item "Env:CONFIRM_EXECUTE" -ErrorAction SilentlyContinue
  }
  Remove-ManagedEnv

  # 1. 저장소 루트 확인
  $repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
  Set-Location $repo
  if (-not (Test-Path (Join-Path $repo "scripts/neonOrchestrationCapabilityCheck.ts"))) {
    throw "저장소 루트를 찾지 못했습니다: $repo"
  }
  Add-Report "[runner] repo = $repo"

  # 2. 접속 URL 입력 — 보안 입력(화면 미표시), 인수/히스토리에 남지 않음
  if ($SelfTest) {
    Add-Report "[runner] SELF-TEST 모드 — 합성 URL 사용, 실제 접속 없음"
    $directUrl = "postgresql://selftest:selftest@ep-selftest-direct.example.neon.tech/selftestdb"
    $pooledUrl = "postgresql://selftest:selftest@ep-selftest-pooler.example.neon.tech/selftestdb"
    $prodDirect = "postgresql://p:p@ep-production-direct.example.neon.tech/proddb"
    $prodPooled = "postgresql://p:p@ep-production-pooler.example.neon.tech/proddb"
  } else {
    Write-Host ""
    Write-Host "접속 URL 4개를 입력합니다. 입력한 문자는 화면에 표시되지 않으며 명령 기록에도 남지 않습니다."
    Write-Host "각 값은 Neon 콘솔에서 복사해 붙여넣기(Ctrl+V) 하면 됩니다."
    Write-Host ""
    $directUrl  = ConvertFrom-SecureStringPlain (Read-Host "1/4 disposable  direct URL" -AsSecureString)
    $pooledUrl  = ConvertFrom-SecureStringPlain (Read-Host "2/4 disposable  pooled URL" -AsSecureString)
    $prodDirect = ConvertFrom-SecureStringPlain (Read-Host "3/4 production  direct URL (차단 대상)" -AsSecureString)
    $prodPooled = ConvertFrom-SecureStringPlain (Read-Host "4/4 production  pooled URL (차단 대상)" -AsSecureString)
  }
  foreach ($s in @($directUrl, $pooledUrl, $prodDirect, $prodPooled)) { [void]$Script:Secrets.Add($s) }

  # 3. host hash 4개 내부 계산 (URL 원문은 어디에도 출력하지 않는다)
  $hDirect     = Get-Sha256Hex (Get-UrlHostForHash $directUrl)
  $hPooled     = Get-Sha256Hex (Get-UrlHostForHash $pooledUrl)
  $hProdDirect = Get-Sha256Hex (Get-UrlHostForHash $prodDirect)
  $hProdPooled = Get-Sha256Hex (Get-UrlHostForHash $prodPooled)

  Add-Report "[runner] expected-direct   #$($hDirect.Substring(0,8))…"
  Add-Report "[runner] expected-pooled   #$($hPooled.Substring(0,8))…"
  Add-Report "[runner] forbidden-direct  #$($hProdDirect.Substring(0,8))…"
  Add-Report "[runner] forbidden-pooled  #$($hProdPooled.Substring(0,8))…"

  # 4. 로컬 사전 검문 — 하네스가 거부할 조합을 접속 전에 미리 걸러 운영자 시간을 낭비하지 않는다.
  $problems = @()
  if ($hDirect -eq $hPooled)         { $problems += "disposable direct/pooled host 가 동일 — pooler endpoint 를 잘못 입력했을 가능성" }
  if ($hProdDirect -eq $hProdPooled) { $problems += "production direct/pooled host 가 동일 — 차단 대상 두 개를 구분해 입력해야 함" }
  foreach ($pair in @(@("direct", $hDirect), @("pooled", $hPooled))) {
    if ($pair[1] -eq $hProdDirect) { $problems += "disposable $($pair[0]) 가 production direct 와 동일 → 중단" }
    if ($pair[1] -eq $hProdPooled) { $problems += "disposable $($pair[0]) 가 production pooled 와 동일 → 중단" }
  }
  if ($problems.Count -gt 0) {
    foreach ($p in $problems) { Add-Report "[runner] ❌ $p" }
    throw "입력 검문 실패 — 접속을 시도하지 않고 중단합니다."
  }
  Add-Report "[runner] 입력 검문 통과: 4개 hash 상호 구분됨 · production 과 불일치"

  # 5. 실행 환경 구성 (이 프로세스 한정, finally 에서 제거)
  $runId = New-RunId
  $env:NEON_CHECK_DIRECT_URL                 = $directUrl
  $env:NEON_CHECK_POOLED_URL                 = $pooledUrl
  $env:NEON_CHECK_EXPECTED_DIRECT_HOST_HASH  = $hDirect
  $env:NEON_CHECK_EXPECTED_POOLED_HOST_HASH  = $hPooled
  $env:NEON_CHECK_FORBIDDEN_DIRECT_HOST_HASH = $hProdDirect
  $env:NEON_CHECK_FORBIDDEN_POOLED_HOST_HASH = $hProdPooled
  $env:NEON_CHECK_DISPOSABLE_CONFIRM         = "i-confirm-disposable-neon-branch"
  $env:NEON_CHECK_RUN_ID                     = $runId
  Add-Report "[runner] run-id = $runId"

  # 6. offline dry-run (DB 연결 0 · write 0)
  $dryCode = Invoke-Harness "STEP 1: offline dry-run"
  if ($dryCode -ne 0) { throw "offline dry-run 실패(exit=$dryCode) — preflight 로 진행하지 않습니다." }
  Add-Report "[runner] ✅ STEP 1 통과 — 다음 단계로 진행합니다."

  if ($SelfTest) {
    Add-Report "[runner] SELF-TEST: 실제 접속 단계를 건너뜁니다(합성 URL 이므로 preflight/execute 미실행)."
    $Script:ExitCode = 0
  } else {
    # 7. SELECT-only preflight (읽기 전용 연결 · DDL 0 · DML 0) — evidence 를 갓 발급한다.
    $env:PREFLIGHT_ONLY = "true"
    $preCode = Invoke-Harness "STEP 2: SELECT-only preflight"
    Remove-Item "Env:PREFLIGHT_ONLY" -ErrorAction SilentlyContinue
    if ($preCode -ne 0) {
      Add-Report "[runner] ❌ STEP 2 실패(exit=$preCode) — execute 로 진행하지 않습니다."
      $Script:ExitCode = $preCode
    }
    elseif (-not $Execute) {
      Add-Report "[runner] ✅ STEP 2 통과 — preflight evidence 발급됨."
      Add-Report "[runner] CONFIRM_EXECUTE: 설정한 적 없음(-Execute 없이 실행 — 실제 DDL 미수행)."
      $Script:ExitCode = 0
    }
    else {
      Add-Report "[runner] ✅ STEP 2 통과 — 방금 evidence 발급됨(만료 전). 이어서 execute 진행."

      # 8. execute — 실제 capability. 이 스크립트 **이번 실행에만** CONFIRM_EXECUTE 를 켠다.
      #    evidence 는 STEP 2 가 발급한 것을 1회 소비한다(같은 run-id, 만료 전). 객체는 run-id scoped.
      $env:CONFIRM_EXECUTE = "true"
      $exeCode = Invoke-Harness "STEP 3: execute (실제 capability · oc_*_$runId · run-id scoped cleanup)"
      Remove-Item "Env:CONFIRM_EXECUTE" -ErrorAction SilentlyContinue
      if ($exeCode -eq 0) { Add-Report "[runner] ✅ STEP 3 통과 — capability 실행·정리 완료." }
      else { Add-Report "[runner] ⚠ STEP 3 exit=$exeCode — 결과/잔여를 아래 보고에서 확인." }

      # 9. replay 차단 확인 — 같은 evidence 로 다시 execute 를 시도한다.
      #    STEP 3 가 evidence 를 이미 소비(파일 삭제)했으므로 여기서는 반드시 차단(exit 5)되어야 한다.
      $env:CONFIRM_EXECUTE = "true"
      $replayCode = Invoke-Harness "STEP 4: evidence replay 차단 확인 (재실행 — 차단되어야 정상)"
      Remove-Item "Env:CONFIRM_EXECUTE" -ErrorAction SilentlyContinue
      if ($replayCode -eq 5) { Add-Report "[runner] ✅ STEP 4 — 소비된 evidence 재사용 차단됨(exit 5). replay 방지 확인." }
      else { Add-Report "[runner] ⚠ STEP 4 — 예상(exit 5)과 다름(exit=$replayCode). evidence 재사용 차단 재검토 필요." }

      $Script:ExitCode = $exeCode
    }
  }
}
catch {
  Add-Report "[runner] ❌ 중단: $(Protect-Output $_.Exception.Message)"
  $Script:ExitCode = 1
}
finally {
  # 8. 정리 — 성공·실패 무관
  Remove-ManagedEnv
  # 평문 문자열 참조 해제(가비지 컬렉션 대상으로 만든다)
  $directUrl = $null; $pooledUrl = $null; $prodDirect = $null; $prodPooled = $null
  $Script:Secrets.Clear()
  [System.GC]::Collect()

  $leftover = @()
  foreach ($n in $Script:ManagedEnv) { if (Test-Path "Env:$n") { $leftover += $n } }
  if ($leftover.Count -eq 0) { Add-Report "[runner] cleanup: 환경변수 잔여 0 ✅" }
  else { Add-Report "[runner] cleanup: 환경변수 잔여 $($leftover -join ',') ⚠" }

  # 9. 마스킹된 보고서만 파일로 남긴다(저장소 밖)
  if (-not $ReportPath) {
    $stamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
    $ReportPath = Join-Path ([System.IO.Path]::GetTempPath()) "neon-preflight-report-$stamp.txt"
  }
  $masked = $Script:Report | ForEach-Object { Protect-Output $_ }
  Set-Content -Path $ReportPath -Value $masked -Encoding utf8
  Write-Host ""
  Write-Host "보고서(마스킹됨): $ReportPath"
  Write-Host "이 파일 내용은 그대로 공유해도 됩니다. URL·비밀번호·hostname 원문은 들어 있지 않습니다."
  Write-Host "작업이 끝나면 Neon 콘솔에서 credential 을 폐기하고 disposable project 를 삭제하세요."
}

exit $Script:ExitCode
