<#
.SYNOPSIS
  큐 런타임 migration(0005 cancel 컬럼 + 0005b writer/queue_admin/reader grants) 실행기 — PowerShell 전용 fail-closed.
.DESCRIPTION
  scripts/applyQueueRuntime.ts(CLI)를 안전하게 구동한다. 운영 DB **direct** URL(소유자=neondb_owner)은 SecureString 으로만 받고,
  DSN/password/host 원문은 화면·명령기록·보고서 어디에도 남기지 않는다(host 는 sha256 8자). 종료 시 임시 env 제거.
  host hash 는 입력 URL 내부에서 자동 계산하며, hardening 과 **동일 pin 파일**(같은 운영 DB)로 대조 fail-closed.

  Mode 별 위험도(정확 분류):
    Inspect  : production **read-only**(DDL/DML 0). 승인 없이 실행 가능.
    DryRun   : ⚠️ **read-only 아님**. tx 안에서 실제 ALTER/CREATE ROLE/GRANT 를 수행 후 ROLLBACK(잠금·일시 영향 가능). 승인 문구 필요.
    Apply    : production **COMMIT**. 승인 문구 필요.
    Rollback : 컬럼 DROP·grant REVOKE·queue_admin DROP(COMMIT). 승인 문구 필요.
.PARAMETER Mode
  Inspect | DryRun | Apply | Rollback
.PARAMETER SelfTest
  합성 URL 로 래퍼 로직·마스킹·보고서만 점검(실제 접속·node·pin 저장 없음).
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\runProductionQueueMigration.ps1 -Mode Inspect
#>
param(
  [ValidateSet('Inspect','DryRun','Apply','Rollback')]
  [string]$Mode = 'Inspect',
  [switch]$SelfTest
)
$ErrorActionPreference = 'Stop'
$Script:Report  = [System.Collections.Generic.List[string]]::new()
$Script:Secrets = [System.Collections.Generic.List[string]]::new()
$Script:ManagedEnv = @('NEON_DATABASE_URL','EXPECTED_DATABASE_HOST_HASH','QUEUE_MIGRATION_MODE','CONFIRM_QUEUE_DRYRUN','CONFIRM_QUEUE_APPLY','CONFIRM_QUEUE_ROLLBACK')

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
  Add-Report "[queue-mig] 큐 런타임 migration 실행기 — Mode=$Mode$(if($SelfTest){' (SELF-TEST)'})"
  Add-Report "[queue-mig] ⚠️ DryRun/Apply/Rollback 는 production 영향 작업입니다. Inspect 만 read-only 입니다."

  $repo = Split-Path -Parent $PSScriptRoot
  if (-not (Test-Path (Join-Path $repo "scripts/applyQueueRuntime.ts"))) { throw "저장소 루트를 찾지 못했습니다: $repo" }
  $pinFile = Join-Path $repo "scripts/.production-hardening-host.pin"   # hardening 과 동일 운영 DB → 동일 pin
  Remove-ManagedEnv

  if ($SelfTest) {
    $url = "postgresql://u:p@ep-selftest-direct.example.neon.tech/db"
    Add-Report "[queue-mig] SELF-TEST — 합성 URL(실제 접속·node·pin 저장 없음)."
  } else {
    Write-Host ""
    Write-Host "운영 DB **direct** URL(소유자=neondb_owner)을 입력하세요(pooled/pooler 금지). 화면·기록에 남지 않습니다."
    $url = ConvertFrom-SecureStringPlain (Read-Host "NEON direct URL" -AsSecureString)
  }
  [void]$Script:Secrets.Add($url)

  $hostForHash = Get-UrlHostForHash $url
  [void]$Script:Secrets.Add($hostForHash)
  if ($hostForHash -match "pooler") { throw "pooled(pooler) 엔드포인트 — migration 은 direct 연결만(fail-closed)." }
  $hash = Get-Sha256Hex $hostForHash
  Add-Report "[queue-mig] 대상 host#$($hash.Substring(0,8))… (direct · 원문 미표시)"

  if ($SelfTest) {
    Add-Report "[queue-mig] SELF-TEST — pin 저장/대조 생략."
  } elseif (Test-Path $pinFile) {
    $pinned = (Get-Content $pinFile -Raw).Trim()
    if ($pinned -ne $hash) { throw "host 핀 불일치 — 저장된 운영 host 와 다릅니다(fail-closed)." }
    Add-Report "[queue-mig] host 핀 대조 통과(host#$($hash.Substring(0,8))…)."
  } else {
    if ($Mode -ne 'Inspect') { throw "host 핀 미설정 — 먼저 hardening 또는 -Mode Inspect 로 대상 host 를 고정하세요." }
    Write-Host ""; Write-Host "이 host#$($hash.Substring(0,8))… 가 **운영 production DB** 가 맞습니까? 맞으면 정확히 'PIN CONFIRM' 을 입력하세요."
    if ((Read-Host "확인") -ne 'PIN CONFIRM') { throw "pin 확인 실패 — 중단." }
    Set-Content -Path $pinFile -Value $hash -Encoding ascii -NoNewline
    Add-Report "[queue-mig] host 핀 저장됨(gitignored)."
  }

  $confirmPhrase = @{ 'DryRun' = 'RUN QUEUE DRYRUN'; 'Apply' = 'APPLY QUEUE MIGRATION'; 'Rollback' = 'ROLLBACK QUEUE MIGRATION' }
  if ($Mode -ne 'Inspect' -and -not $SelfTest) {
    $need = $confirmPhrase[$Mode]
    $risk = if ($Mode -eq 'DryRun') { "실제 ALTER/CREATE ROLE/GRANT 를 tx 안에서 수행 후 ROLLBACK(잠금 가능, read-only 아님)" } elseif ($Mode -eq 'Apply') { "production COMMIT(영구 반영)" } else { "컬럼 DROP·grant REVOKE·queue_admin DROP COMMIT" }
    Write-Host ""; Write-Host "⚠️ $Mode 는 $risk. 진행하려면 정확히 '$need' 를 입력하세요."
    if ((Read-Host "승인 문구") -ne $need) { throw "$Mode 승인 문구 불일치 — 중단." }
  }

  $modeMap = @{ 'Inspect' = 'inspect'; 'DryRun' = 'dry-run'; 'Apply' = 'apply'; 'Rollback' = 'rollback' }
  $env:NEON_DATABASE_URL           = $url
  $env:EXPECTED_DATABASE_HOST_HASH = $hash
  $env:QUEUE_MIGRATION_MODE        = $modeMap[$Mode]
  if ($Mode -eq 'DryRun')   { $env:CONFIRM_QUEUE_DRYRUN   = 'true' }
  if ($Mode -eq 'Apply')    { $env:CONFIRM_QUEUE_APPLY    = 'true' }
  if ($Mode -eq 'Rollback') { $env:CONFIRM_QUEUE_ROLLBACK = 'true' }

  if ($SelfTest) {
    Add-Report ("[queue-mig] SELF-TEST 마스킹 확인: " + (Protect-Output "url=$url host=$hostForHash"))
    Add-Report "[queue-mig] SELF-TEST 완료(node CLI 미호출)."
  } else {
    $node = (Get-Command node -ErrorAction Stop).Source
    Push-Location $repo
    try { $out = & $node "--import" "tsx/esm" "scripts/applyQueueRuntime.ts" 2>&1; $code = $LASTEXITCODE } finally { Pop-Location }
    $text = Protect-Output (($out | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine)
    Add-Report "----- applyQueueRuntime ($Mode · exit=$code) -----"
    foreach ($line in $text -split [Environment]::NewLine) { Add-Report $line }
    Add-Report "[queue-mig] exit=$code"
  }
}
catch { Add-Report "[queue-mig] ❌ 중단: $(Protect-Output $_.Exception.Message)" }
finally {
  Remove-ManagedEnv
  $leftover = @(); foreach ($n in $Script:ManagedEnv) { if (Test-Path "Env:$n") { $leftover += $n } }
  Add-Report "[queue-mig] cleanup: 환경변수 잔여 $(if($leftover.Count -eq 0){'0 ✅'}else{($leftover -join ',')})"
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $reportPath = Join-Path ([System.IO.Path]::GetTempPath()) "queue-migration-report-$stamp.txt"
  $masked = ($Script:Report | ForEach-Object { Protect-Output $_ }) -join [Environment]::NewLine
  Set-Content -Path $reportPath -Value $masked -Encoding utf8
  Write-Host ""; Write-Host "[queue-mig] 마스킹 보고서: $reportPath"
}
