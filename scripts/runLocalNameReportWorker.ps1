<#
.SYNOPSIS
  이름분석표 **로컬** worker 실행기 — 서호님 Windows 컴퓨터에서 실행(Railway 아님). PowerShell 전용 fail-closed.
.DESCRIPTION
  node dist/queueWorker.js 를 로컬 파일·Python·R2 접근이 되는 이 컴퓨터에서 구동한다.
    WORKER_ENABLE_NAME_REPORT=true → name-report(실제 업무) adapter 등록(로컬 report 폴더 있을 때만).
    ORCHESTRATION_WORKER_URL(writer) 은 SecureString 입력 또는 로컬 DPAPI 비밀저장(-SaveSecret)에서 읽는다.
  URL/password/host 원문은 화면·기록·로그에 남기지 않는다(worker 는 host#8자만 출력). 종료 시 임시 env 제거.
  중복 worker 실행은 전역 Mutex 로 차단(같은 job 이중 처리 방지 — DB claim 도 SKIP LOCKED 로 안전하지만 이중 방어).
  ⚠️ FEATURE_NAME_REPORT_QUEUE=true(직접 처리 대신 enqueue)는 **파일 감시(웹서버/syncReports) 프로세스** 쪽 설정이다.
     이 스크립트는 그 프로세스와 동일 컴퓨터에서 돌리되, worker 는 큐에서 job 을 claim·처리만 한다.
.PARAMETER SaveSecret
  writer URL 을 DPAPI(사용자+컴퓨터 범위)로 로컬 저장만 하고 종료(이후 실행은 프롬프트 없이 사용).
.PARAMETER Build
  실행 전 npm run build 강제(기본: dist/queueWorker.js 없을 때만 빌드).
.PARAMETER ShowAutostartHelp
  Windows 재부팅 후 자동실행 등록 방법을 **안내만** 출력(실제 작업 스케줄러 등록은 하지 않음).
.PARAMETER SelfTest
  합성 URL 로 래퍼 로직·마스킹·Mutex 만 점검(실제 접속·node·빌드·pin 저장 없음).
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\runLocalNameReportWorker.ps1
#>
param(
  [switch]$SaveSecret,
  [switch]$Build,
  [switch]$ShowAutostartHelp,
  [switch]$SelfTest
)
$ErrorActionPreference = 'Stop'
$Script:Report  = [System.Collections.Generic.List[string]]::new()
$Script:Secrets = [System.Collections.Generic.List[string]]::new()
$Script:ManagedEnv = @('ORCHESTRATION_WORKER_URL','WORKER_ENABLE_NAME_REPORT','FEATURE_NAME_REPORT_QUEUE','WORKER_HEARTBEAT')
$Script:Mutex = $null

function Add-Report([string]$Line) { [void]$Script:Report.Add($Line); Write-Host $Line }
function Remove-ManagedEnv { foreach ($n in $Script:ManagedEnv) { if (Test-Path "Env:$n") { Remove-Item "Env:$n" -ErrorAction SilentlyContinue } } }
function ConvertFrom-SecureStringPlain([System.Security.SecureString]$Secure) {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
function Get-UrlHostForHash([string]$Url) {
  $u = $null; try { $u = [System.Uri]$Url } catch { throw "URL 형식 오류(값 미표시)." }
  if (-not $u.Scheme -or ($u.Scheme -ne "postgres" -and $u.Scheme -ne "postgresql")) { throw "protocol 이 postgres/postgresql 아님." }
  if (-not $u.Host) { throw "host 없음." }
  $h = $u.Host.ToLowerInvariant(); if ($u.Port -ge 0) { $h = "$h`:$($u.Port)" }; return $h
}
function Get-Sha256Hex([string]$Text) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { return (($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Text)) | ForEach-Object { $_.ToString("x2") }) -join "") } finally { $sha.Dispose() }
}
function Protect-Output([string]$Text) {
  if (-not $Text) { return "" }
  $out = $Text
  foreach ($s in $Script:Secrets) { if ($s -and $s.Length -gt 3) { $out = $out.Replace($s, "<redacted>") } }
  $out = [regex]::Replace($out, "postgres(ql)?://[^\s""']+", "<redacted-dsn>")
  $out = [regex]::Replace($out, "[A-Za-z0-9_.-]+\.neon\.tech(:\d+)?", "<redacted-host>")
  return $out
}

# ══════════════════════════════════════════════════════════════════════════
try {
  Add-Report "[nr-worker] 이름분석표 로컬 worker 실행기$(if($SelfTest){' (SELF-TEST)'})"
  $repo = Split-Path -Parent $PSScriptRoot
  if (-not (Test-Path (Join-Path $repo "scripts/queueWorker.ts"))) { throw "저장소 루트를 찾지 못했습니다: $repo" }
  $secretFile = Join-Path $repo "scripts/.name-report-writer.secret"   # DPAPI 암호문(gitignored)
  $workerJs   = Join-Path $repo "dist/queueWorker.js"
  Remove-ManagedEnv

  if ($ShowAutostartHelp) {
    Add-Report ""
    Add-Report "[nr-worker] 재부팅 후 자동실행(안내만 — 실제 등록은 운영자가 직접):"
    Add-Report "  1) 먼저 -SaveSecret 로 writer URL 을 DPAPI 저장(프롬프트 없이 시작 가능)."
    Add-Report "  2) 작업 스케줄러 등록 예시(직접 실행하세요, 이 스크립트는 등록하지 않음):"
    Add-Report '     schtasks /Create /TN "KNA-NameReportWorker" /SC ONLOGON /RL LIMITED ^'
    Add-Report '       /TR "powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File \"<repo>\scripts\runLocalNameReportWorker.ps1\""'
    Add-Report "  3) 파일 감시(enqueue) 프로세스에는 FEATURE_NAME_REPORT_QUEUE=true + ORCHESTRATION_WORKER_URL 필요."
    return
  }

  # 중복 실행 방지(전역 Mutex).
  if (-not $SelfTest) {
    $created = $false
    $Script:Mutex = New-Object System.Threading.Mutex($true, "Global\KnaNameReportWorker", [ref]$created)
    if (-not $created) { throw "이미 이름분석표 worker 가 실행 중입니다(중복 실행 차단)." }
    Add-Report "[nr-worker] 단일 실행 잠금 획득(Global\KnaNameReportWorker)."
  } else {
    $t = $false; $m = New-Object System.Threading.Mutex($true, "Global\KnaNameReportWorkerSelfTest", [ref]$t)
    Add-Report "[nr-worker] SELF-TEST Mutex 획득=$t"; if ($m) { [void]$m.ReleaseMutex(); $m.Dispose() }
  }

  # writer URL 확보(DPAPI 저장분 우선, 없으면 SecureString 프롬프트).
  if ($SelfTest) {
    $url = "postgresql://orchestration_writer:p@ep-selftest.example.neon.tech/db"
    Add-Report "[nr-worker] SELF-TEST — 합성 URL."
  } elseif ($SaveSecret) {
    Write-Host "저장할 writer(ORCHESTRATION_WORKER_URL) 를 입력하세요(DPAPI 로 로컬 암호화). 화면에 남지 않습니다."
    $sec = Read-Host "ORCHESTRATION_WORKER_URL" -AsSecureString
    ($sec | ConvertFrom-SecureString) | Set-Content -Path $secretFile -Encoding ascii
    Add-Report "[nr-worker] writer URL DPAPI 저장 완료(gitignored). 이후 실행은 프롬프트 없이 사용."
    return
  } elseif (Test-Path $secretFile) {
    $sec = (Get-Content $secretFile -Raw).Trim() | ConvertTo-SecureString
    $url = ConvertFrom-SecureStringPlain $sec
    Add-Report "[nr-worker] 저장된 writer URL 사용(DPAPI)."
  } else {
    Write-Host "writer(orchestration_writer) URL 을 입력하세요. 소유자(neondb_owner) 자격 금지. 화면에 남지 않습니다."
    $url = ConvertFrom-SecureStringPlain (Read-Host "ORCHESTRATION_WORKER_URL" -AsSecureString)
  }
  [void]$Script:Secrets.Add($url)
  if ($url -match "neondb_owner") { throw "worker URL 이 소유자(neondb_owner) 로 보입니다 — writer 자격만 허용(fail-closed)." }
  $h = Get-Sha256Hex (Get-UrlHostForHash $url)
  [void]$Script:Secrets.Add((Get-UrlHostForHash $url))
  Add-Report "[nr-worker] writer host#$($h.Substring(0,8))… (원문 미표시)"

  if ($SelfTest) {
    Add-Report ("[nr-worker] SELF-TEST 마스킹 확인: " + (Protect-Output "url=$url"))
    Add-Report "[nr-worker] SELF-TEST 완료(node/빌드 미실행)."
    return
  }

  # 빌드 산출물(dist/queueWorker.js) 확인 — 없거나 -Build 면 npm run build.
  $node = (Get-Command node -ErrorAction Stop).Source
  $npm  = (Get-Command npm  -ErrorAction Stop).Source
  if ($Build -or -not (Test-Path $workerJs)) {
    Add-Report "[nr-worker] npm run build 실행(dist 산출물 생성)…"
    Push-Location $repo
    try { & $npm "run" "build" | Out-Null; if ($LASTEXITCODE -ne 0) { throw "npm run build 실패(exit=$LASTEXITCODE)." } } finally { Pop-Location }
  }
  if (-not (Test-Path $workerJs)) { throw "dist/queueWorker.js 없음 — 빌드 실패." }

  # env 설정 후 worker 기동(포그라운드; Ctrl+C 로 graceful shutdown).
  $env:ORCHESTRATION_WORKER_URL   = $url
  $env:WORKER_ENABLE_NAME_REPORT  = 'true'
  $env:FEATURE_NAME_REPORT_QUEUE  = 'true'   # 참고용(enqueue 는 파일감시 프로세스 소관). worker 동작엔 무해.
  $env:WORKER_HEARTBEAT           = 'true'
  Add-Report "[nr-worker] worker 기동(node dist/queueWorker.js) — 종료: Ctrl+C. URL/password/host 원문 미출력."
  Push-Location $repo
  try { & $node "dist/queueWorker.js"; $code = $LASTEXITCODE } finally { Pop-Location }
  Add-Report "[nr-worker] worker 종료(exit=$code)."
}
catch { Add-Report "[nr-worker] ❌ 중단: $(Protect-Output $_.Exception.Message)" }
finally {
  Remove-ManagedEnv
  if ($Script:Mutex) { try { [void]$Script:Mutex.ReleaseMutex() } catch {}; $Script:Mutex.Dispose() }
  $leftover = @(); foreach ($n in $Script:ManagedEnv) { if (Test-Path "Env:$n") { $leftover += $n } }
  Add-Report "[nr-worker] cleanup: 환경변수 잔여 $(if($leftover.Count -eq 0){'0 ✅'}else{($leftover -join ',')}) · Mutex 해제"
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $reportPath = Join-Path ([System.IO.Path]::GetTempPath()) "nr-worker-report-$stamp.txt"
  $masked = ($Script:Report | ForEach-Object { Protect-Output $_ }) -join [Environment]::NewLine
  Set-Content -Path $reportPath -Value $masked -Encoding utf8
  Write-Host ""; Write-Host "[nr-worker] 마스킹 보고서: $reportPath"
}
