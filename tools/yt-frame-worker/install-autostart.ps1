# 쇼츠 썸네일 워커 자동 시작 등록/해제 (현재 윈도우 사용자, 관리자 권한 불필요)
#   등록:  node tools/yt-frame-worker/release.mjs install-task   ← 실행 폴더 위치로 등록(개발 작업트리 아님)
#   해제:  powershell -ExecutionPolicy Bypass -File install-autostart.ps1 -Remove
#   즉시 실행(로그인 흉내): Start-ScheduledTask -TaskName "KOP 쇼츠 썸네일 워커"
param(
  [switch]$Remove,
  [string]$Vbs = "C:\Users\iimoo\android-test\yt-frame-worker\start-hidden.vbs"
)
$name = "KOP 쇼츠 썸네일 워커"
if ($Remove) {
  Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
  "해제됨: $name"
  return
}
if (-not (Test-Path $Vbs)) { throw "start-hidden.vbs 없음: $Vbs (release.mjs install-task 로 실행할 것)" }
$user = "$env:USERDOMAIN\$env:USERNAME"
$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$Vbs`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description "자동배포된 쇼츠의 썸네일 장면(첫 장면)을 에뮬레이터에서 골라 저장. 실행 폴더의 고정 버전만 실행." -Force | Out-Null
"등록됨: $name → $Vbs"
