<#
.SYNOPSIS
  큐 런타임 smoke 실행기 — worker(writer) 자격으로 큐 경로를 1회 검증. PowerShell 전용 fail-closed.
.DESCRIPTION
  dist/queueSmoke.js(프로덕션 빌드, tsx 런타임 불필요)를 구동한다. worker/admin URL 은 SecureString 으로만 받고
  DSN/password/host 원문은 화면·명령기록·보고서 어디에도 남기지 않는다(host 는 sha256 8자). 종료 시 임시 env 제거.

  Mode 별 위험도(정확 분류):
    Preview    : internal-report **preview 계산** adapter. 고객 데이터·파일·업무행 변경 0(순수 계산). PII 없음. production 안전.
    NameReport : ⚠️ **실제 업무** adapter(processFile). report_matches/crm_files 에 **합성 업무 행을 기록**한다.
                 → production 절대 금지. 비-prod(staging/로컬) DB 임을 'NONPROD SMOKE' 문구로 단언해야 실행.
.PARAMETER Mode
  Preview | NameReport
.PARAMETER SelfTest
  합성 URL 로 래퍼 로직·마스킹·보고서만 점검(실제 접속·node 없음).
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\runQueueSmoke.ps1 -Mode Preview
#>
param(
  [ValidateSet('Preview','NameReport')]
  [string]$Mode = 'Preview',
  [switch]$SelfTest
)
$ErrorActionPreference = 'Stop'
$Script:Report  = [System.Collections.Generic.List[string]]::new()
$Script:Secrets = [System.Collections.Generic.List[string]]::new()
$Script:ManagedEnv = @(
  'CONFIRM_QUEUE_SMOKE','ORCHESTRATION_WORKER_URL','ORCHESTRATION_ADMIN_URL','SMOKE_MODE',
  'SMOKE_WORKER_INLINE','SMOKE_ALLOW_BUSINESS_WRITE','SMOKE_NONPROD_ACK','SMOKE_TIMEOUT_MS'
)

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
# 연결 문자열에 실제 비밀번호(user:pass@)가 들어있는지 검사 — 값은 절대 출력하지 않는다.
#   Neon Connect 위젯이 비번을 placeholder/마스킹으로 보여준 걸 그대로 붙여넣으면 password 가 비어 pg 가 SCRAM 에러를 낸다.
function Test-UrlHasPassword([string]$Url) {
  $u = $null; try { $u = [System.Uri]$Url } catch { return $false }
  $ui = $u.UserInfo; if (-not $ui) { return $false }
  $i = $ui.IndexOf(':'); if ($i -lt 0) { return $false }
  $pw = $ui.Substring($i + 1)
  if ($pw.Length -eq 0) { return $false }
  # 마스킹 문자(•/*)만 있는 placeholder 도 거부
  if ($pw -match '^[•\*•\s]+$') { return $false }
  return $true
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
  Add-Report "[queue-smoke] 큐 smoke 실행기 — Mode=$Mode$(if($SelfTest){' (SELF-TEST)'})"
  if ($Mode -eq 'Preview') {
    Add-Report "[queue-smoke] Preview = PII 없는 순수 계산 smoke(고객 데이터·업무행 변경 0). production 안전."
  } else {
    Add-Report "[queue-smoke] ⚠️ NameReport = 실제 업무 smoke — report_matches/crm_files 에 합성 행 기록. **비-prod 전용**."
  }

  $repo = Split-Path -Parent $PSScriptRoot
  if (-not (Test-Path (Join-Path $repo "scripts/createQueueSmokeJob.ts"))) { throw "저장소 루트를 찾지 못했습니다: $repo" }
  $smokeJs = Join-Path $repo "dist/queueSmoke.js"
  Remove-ManagedEnv

  # ── URL 입력(SecureString) ────────────────────────────────────────────────
  if ($SelfTest) {
    $workerUrl = "postgresql://writer:p@ep-selftest-pooler.example.neon.tech/db"
    $adminUrl  = ""
    Add-Report "[queue-smoke] SELF-TEST — 합성 URL(실제 접속·node 없음)."
  } else {
    Write-Host ""
    Write-Host "worker(writer=orchestration_writer) URL 을 입력하세요. 소유자(neondb_owner) 자격 사용 금지. 화면·기록에 남지 않습니다."
    $workerUrl = ConvertFrom-SecureStringPlain (Read-Host "ORCHESTRATION_WORKER_URL" -AsSecureString)
    Write-Host "admin(orchestration_queue_admin) URL — 조회 확인용(선택). 없으면 빈 값(Enter)."
    $adminUrl = ConvertFrom-SecureStringPlain (Read-Host "ORCHESTRATION_ADMIN_URL(선택)" -AsSecureString)
  }
  [void]$Script:Secrets.Add($workerUrl)
  if ($workerUrl -match "neondb_owner") { throw "worker URL 이 소유자(neondb_owner) 로 보입니다 — writer 자격만 허용(fail-closed)." }
  if (-not $SelfTest -and -not (Test-UrlHasPassword $workerUrl)) {
    throw "worker URL 에 비밀번호가 없습니다(user:PASSWORD@ 형태 아님). Neon 에서 해당 역할 'Reset password' 후 비밀번호가 포함된 완전한 연결 문자열을 복사해 붙여넣으세요. (값 미표시)"
  }

  $workerHost = Get-UrlHostForHash $workerUrl
  [void]$Script:Secrets.Add($workerHost)
  $workerHash = Get-Sha256Hex $workerHost
  Add-Report "[queue-smoke] worker host#$($workerHash.Substring(0,8))… (원문 미표시)"

  if ($adminUrl) {
    [void]$Script:Secrets.Add($adminUrl)
    if (-not (Test-UrlHasPassword $adminUrl)) {
      throw "admin URL 에 비밀번호가 없습니다 — Neon 에서 'Reset password' 후 완전한 연결 문자열을 복사하세요. (값 미표시)"
    }
    $adminHost = Get-UrlHostForHash $adminUrl
    [void]$Script:Secrets.Add($adminHost)
    $adminHash = Get-Sha256Hex $adminHost
    if ($adminHash -ne $workerHash) { throw "admin/worker host 불일치 — 같은 DB 여야 합니다(fail-closed)." }
    Add-Report "[queue-smoke] admin host 일치 확인(host#$($adminHash.Substring(0,8))…)."
  }

  # ── NameReport 안전 게이트(비-prod 단언) ───────────────────────────────────
  if ($Mode -eq 'NameReport' -and -not $SelfTest) {
    Write-Host ""
    Write-Host "⚠️ NameReport smoke 는 report_matches/crm_files 에 합성 업무 행을 기록합니다(processFile 실행)."
    Write-Host "   대상 host#$($workerHash.Substring(0,8))… 가 **production 이 아님**을 확인했다면 정확히 'NONPROD SMOKE' 를 입력하세요."
    if ((Read-Host "비-prod 확인") -ne 'NONPROD SMOKE') { throw "비-prod 확인 실패 — 중단(production 보호)." }
  }

  # ── 빌드 산출물 확인(tsx 런타임 미사용) ────────────────────────────────────
  if (-not $SelfTest -and -not (Test-Path $smokeJs)) {
    throw "dist/queueSmoke.js 없음 — 먼저 'npm run build' 로 smoke CLI 를 빌드하세요(tsx 런타임 불필요)."
  }

  # ── env 설정 ──────────────────────────────────────────────────────────────
  $env:CONFIRM_QUEUE_SMOKE       = 'true'
  $env:ORCHESTRATION_WORKER_URL  = $workerUrl
  if ($adminUrl) { $env:ORCHESTRATION_ADMIN_URL = $adminUrl }
  if ($Mode -eq 'Preview') {
    $env:SMOKE_MODE          = 'preview'
    $env:SMOKE_WORKER_INLINE = 'true'   # 자체 완결(별도 worker 창 불필요): create→inline 처리→succeeded 를 한 명령으로 검증
  } else {
    $env:SMOKE_MODE                 = 'name-report'
    $env:SMOKE_WORKER_INLINE        = 'true'
    $env:SMOKE_ALLOW_BUSINESS_WRITE = 'true'
    $env:SMOKE_NONPROD_ACK          = 'true'
  }

  if ($SelfTest) {
    Add-Report ("[queue-smoke] SELF-TEST 마스킹 확인: " + (Protect-Output "worker=$workerUrl host=$workerHost"))
    Add-Report "[queue-smoke] SELF-TEST 완료(node CLI 미호출)."
  } else {
    $node = (Get-Command node -ErrorAction Stop).Source
    Push-Location $repo
    try { $out = & $node "dist/queueSmoke.js" 2>&1; $code = $LASTEXITCODE } finally { Pop-Location }
    $text = Protect-Output (($out | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine)
    Add-Report "----- queueSmoke ($Mode · exit=$code) -----"
    foreach ($line in $text -split [Environment]::NewLine) { Add-Report $line }
    Add-Report "[queue-smoke] exit=$code"
  }
}
catch { Add-Report "[queue-smoke] ❌ 중단: $(Protect-Output $_.Exception.Message)" }
finally {
  Remove-ManagedEnv
  $leftover = @(); foreach ($n in $Script:ManagedEnv) { if (Test-Path "Env:$n") { $leftover += $n } }
  Add-Report "[queue-smoke] cleanup: 환경변수 잔여 $(if($leftover.Count -eq 0){'0 ✅'}else{($leftover -join ',')})"
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $reportPath = Join-Path ([System.IO.Path]::GetTempPath()) "queue-smoke-report-$stamp.txt"
  $masked = ($Script:Report | ForEach-Object { Protect-Output $_ }) -join [Environment]::NewLine
  Set-Content -Path $reportPath -Value $masked -Encoding utf8
  Write-Host ""; Write-Host "[queue-smoke] 마스킹 보고서: $reportPath"
}
