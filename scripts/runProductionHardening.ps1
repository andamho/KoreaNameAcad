<#
.SYNOPSIS
  운영 hardening(0001) 실행기 — PowerShell 전용 fail-closed 래퍼.
.DESCRIPTION
  scripts/applyHardening.ts(CLI) 를 안전하게 구동한다. 운영 DB **direct** URL 은 보안 입력(SecureString)으로만 받고,
  DSN/password/host 원문은 화면·명령기록·보고서 어디에도 남기지 않는다(host 는 sha256 8자만).
  입력값은 이 프로세스의 임시 환경변수(NEON_DATABASE_URL)로만 전달하고, 종료 시 제거한다.
  host hash 는 입력 URL 내부에서 자동 계산하며, pinned production hash(gitignored 파일)와 불일치하면 fail-closed.

  Mode 별 위험도(정확 분류):
    Preflight : production **read-only**(DDL/DML 0). 승인 없이 실행 가능. (pin 없으면 최초 확인 후 pin 저장)
    DryRun    : ⚠️ **read-only 아님**. 트랜잭션 안에서 실제 DDL/role/ownership/권한 변경을 시도 후 ROLLBACK(잠금·일시 영향 가능). 승인 문구 필요.
    Apply     : production **COMMIT**. 승인 문구 필요.
    Rollback  : post-commit 환원(COMMIT). 승인 문구 필요.
.PARAMETER Mode
  Preflight | DryRun | Apply | Rollback
.PARAMETER SelfTest
  합성 URL 로 래퍼 로직·마스킹·보고서만 점검(실제 접속·node 호출·pin 저장 없음).
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\runProductionHardening.ps1 -Mode Preflight
#>
param(
  [ValidateSet('Preflight','DryRun','Apply','Rollback')]
  [string]$Mode = 'Preflight',
  [switch]$SelfTest
)
$ErrorActionPreference = 'Stop'
$Script:Report  = [System.Collections.Generic.List[string]]::new()
$Script:Secrets = [System.Collections.Generic.List[string]]::new()
$Script:ManagedEnv = @('NEON_DATABASE_URL','EXPECTED_DATABASE_HOST_HASH','HARDENING_MODE','CONFIRM_HARDENING_DRYRUN','CONFIRM_HARDENING_APPLY','CONFIRM_HARDENING_ROLLBACK')

function Add-Report([string]$Line) { [void]$Script:Report.Add($Line); Write-Host $Line }
function Remove-ManagedEnv { foreach ($n in $Script:ManagedEnv) { if (Test-Path "Env:$n") { Remove-Item "Env:$n" -ErrorAction SilentlyContinue } } }

function ConvertFrom-SecureStringPlain([System.Security.SecureString]$Secure) {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
function Get-UrlHostForHash([string]$Url) {
  $u = $null
  try { $u = [System.Uri]$Url } catch { throw "URL 형식이 올바르지 않습니다(값은 표시하지 않습니다)." }
  if (-not $u.Scheme -or ($u.Scheme -ne "postgres" -and $u.Scheme -ne "postgresql")) { throw "protocol 이 postgres/postgresql 이 아닙니다." }
  if (-not $u.Host) { throw "URL 에 host 가 없습니다." }
  $h = $u.Host.ToLowerInvariant()
  if ($u.Port -ge 0) { $h = "$h`:$($u.Port)" }
  return $h
}
function Get-Sha256Hex([string]$Text) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text); return (($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") }) -join "") }
  finally { $sha.Dispose() }
}
# 보고서/화면 2차 방어: 혹시라도 원문이 새면 마스킹.
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
  Add-Report "[prod-harden] production hardening 실행기 — Mode=$Mode$(if($SelfTest){' (SELF-TEST)'})"
  Add-Report "[prod-harden] ⚠️ DryRun/Apply/Rollback 는 production 영향 작업입니다. Preflight 만 read-only 입니다."

  $repo = Split-Path -Parent $PSScriptRoot
  if (-not (Test-Path (Join-Path $repo "scripts/applyHardening.ts"))) { throw "저장소 루트를 찾지 못했습니다: $repo" }
  $pinFile = Join-Path $repo "scripts/.production-hardening-host.pin"
  Remove-ManagedEnv

  # 1) 운영 DB direct URL — 보안 입력(화면·기록 미표시)
  if ($SelfTest) {
    $url = "postgresql://u:p@ep-selftest-direct.example.neon.tech/db"
    Add-Report "[prod-harden] SELF-TEST — 합성 URL 사용(실제 접속·node·pin 저장 없음)."
  } else {
    Write-Host ""
    Write-Host "운영 DB **direct** connection URL 을 입력하세요(pooled/pooler 금지). 입력값은 화면·기록에 남지 않습니다."
    $url = ConvertFrom-SecureStringPlain (Read-Host "NEON direct URL" -AsSecureString)
  }
  [void]$Script:Secrets.Add($url)

  # 2) host 계산 + direct 강제 + hash
  $hostForHash = Get-UrlHostForHash $url
  [void]$Script:Secrets.Add($hostForHash)
  if ($hostForHash -match "pooler") { throw "pooled(pooler) 엔드포인트입니다 — hardening 은 direct 연결만 허용합니다(fail-closed)." }
  $hash = Get-Sha256Hex $hostForHash
  Add-Report "[prod-harden] 대상 host#$($hash.Substring(0,8))… (direct · 원문 미표시)"

  # 3) pinned production hash(gitignored) — TOFU: 최초 Preflight 에서 확인 후 저장, 이후 전부 대조(fail-closed)
  if ($SelfTest) {
    Add-Report "[prod-harden] SELF-TEST — pin 저장/대조 생략."
  } elseif (Test-Path $pinFile) {
    $pinned = (Get-Content $pinFile -Raw).Trim()
    if ($pinned -ne $hash) { throw "host 핀 불일치 — 저장된 운영 host 와 다릅니다(fail-closed). 대상 DB 를 확인하세요." }
    Add-Report "[prod-harden] host 핀 대조 통과(host#$($hash.Substring(0,8))…)."
  } else {
    if ($Mode -ne 'Preflight') { throw "host 핀 미설정 — 먼저 -Mode Preflight 로 대상 host 를 확인·고정하세요(DryRun/Apply/Rollback 거부)." }
    Write-Host ""
    Write-Host "이 host#$($hash.Substring(0,8))… 가 **운영 production DB** 가 맞습니까? 맞으면 정확히 'PIN CONFIRM' 을 입력하세요."
    $ans = Read-Host "확인"
    if ($ans -ne 'PIN CONFIRM') { throw "pin 확인 실패 — 중단합니다." }
    Set-Content -Path $pinFile -Value $hash -Encoding ascii -NoNewline
    Add-Report "[prod-harden] host 핀 저장됨(gitignored). 이후 실행은 이 host 로 고정됩니다."
  }

  # 4) Mode 별 추가 승인 문구(DryRun/Apply/Rollback)
  $confirmPhrase = @{ 'DryRun' = 'RUN DRYRUN'; 'Apply' = 'APPLY TO PRODUCTION'; 'Rollback' = 'ROLLBACK PRODUCTION' }
  if ($Mode -ne 'Preflight' -and -not $SelfTest) {
    $need = $confirmPhrase[$Mode]
    $risk = if ($Mode -eq 'DryRun') { "실제 DDL/role/ownership 변경을 시도 후 ROLLBACK(잠금·일시 영향 가능, read-only 아님)" } elseif ($Mode -eq 'Apply') { "production COMMIT(영구 반영)" } else { "post-commit 환원 COMMIT" }
    Write-Host ""
    Write-Host "⚠️ $Mode 는 $risk. 진행하려면 정확히 '$need' 을 입력하세요."
    $c = Read-Host "승인 문구"
    if ($c -ne $need) { throw "$Mode 승인 문구 불일치 — 중단합니다." }
  }

  # 5) CLI 환경 구성(이 프로세스 한정) — CLI 는 NEON_DATABASE_URL 단일 변수만 읽는다.
  $modeMap = @{ 'Preflight' = 'preflight'; 'DryRun' = 'dry-run'; 'Apply' = 'apply'; 'Rollback' = 'rollback' }
  $env:NEON_DATABASE_URL           = $url
  $env:EXPECTED_DATABASE_HOST_HASH = $hash
  $env:HARDENING_MODE              = $modeMap[$Mode]
  if ($Mode -eq 'DryRun')   { $env:CONFIRM_HARDENING_DRYRUN   = 'true' }
  if ($Mode -eq 'Apply')    { $env:CONFIRM_HARDENING_APPLY    = 'true' }
  if ($Mode -eq 'Rollback') { $env:CONFIRM_HARDENING_ROLLBACK = 'true' }

  if ($SelfTest) {
    # 실제 접속 없이 마스킹만 점검: 합성 secret 이 든 라인을 넣어 Protect-Output 이 지우는지 확인.
    Add-Report ("[prod-harden] SELF-TEST 마스킹 확인: " + (Protect-Output "url=$url host=$hostForHash"))
    Add-Report "[prod-harden] SELF-TEST 완료(node CLI 미호출)."
  } else {
    $node = (Get-Command node -ErrorAction Stop).Source
    $args = @("--import","tsx/esm","scripts/applyHardening.ts","0001_orchestration_immutability_roles")
    Push-Location $repo
    try { $out = & $node $args 2>&1; $code = $LASTEXITCODE } finally { Pop-Location }
    $text = Protect-Output (($out | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine)
    Add-Report "----- applyHardening ($Mode · exit=$code) -----"
    foreach ($line in $text -split [Environment]::NewLine) { Add-Report $line }
    Add-Report "[prod-harden] exit=$code"
  }
}
catch {
  Add-Report "[prod-harden] ❌ 중단: $(Protect-Output $_.Exception.Message)"
}
finally {
  Remove-ManagedEnv
  $leftover = @(); foreach ($n in $Script:ManagedEnv) { if (Test-Path "Env:$n") { $leftover += $n } }
  Add-Report "[prod-harden] cleanup: 환경변수 잔여 $(if($leftover.Count -eq 0){'0 ✅'}else{($leftover -join ',')})"
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $reportPath = Join-Path ([System.IO.Path]::GetTempPath()) "prod-hardening-report-$stamp.txt"
  $masked = ($Script:Report | ForEach-Object { Protect-Output $_ }) -join [Environment]::NewLine
  Set-Content -Path $reportPath -Value $masked -Encoding utf8
  Write-Host ""
  Write-Host "[prod-harden] 마스킹 보고서: $reportPath"
}
