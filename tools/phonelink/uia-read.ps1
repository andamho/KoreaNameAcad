# '휴대폰과 연결' 화면에 떠 있는 문자를 글자 그대로 읽는다(윈도우 화면 읽기 기능 = UI Automation).
# 2026-11-06 휴대폰과 연결 업데이트로 문자 DB 가 암호화(AesGcm) → DB 를 못 읽게 되어 대신 쓰는 방법(2026-11-17).
#
#  · 마우스·키보드를 쓰지 않는다. 대화방을 '선택'만 해서 내용을 읽고, 끝나면 원래 보던 대화방으로 되돌린다.
#  · 읽지 않은 대화방은 열지 않는다(열면 폰에서도 읽음 처리돼 원장님이 새 문자를 놓칠 수 있음).
#  · 대화 목록은 최근 순이다. 마지막 문자가 -SinceMs 보다 오래된 대화방이 3개 연속 나오면 멈춘다.
#  · 결과(JSON)는 -Out 파일에. 해석(날짜·방향)은 sync.mjs 가 한다.
#
# 사용: powershell -NoProfile -STA -ExecutionPolicy Bypass -File uia-read.ps1 -SinceMs <ms> -Out <json>
#
# 등본 사진(2026-11-17): -ImagePhones 의 번호(등본 대기 고객) 대화방에서는 고객이 보낸 사진을
#  사진의 메뉴(Shift+F10) → '복사' 로 받아 -ImageDir\<번호>\<시각ms>_<순번>.jpg 로 저장한다.
#  이때만 휴대폰과 연결 창이 잠깐 앞으로 나온다(끝나면 원래 창·클립보드 글자를 되돌린다).
param([double]$SinceMs = 0, [string]$Out, [int]$MaxConvs = 80, [string]$ImagePhones = '', [string]$ImageDir = '', [double]$ImageSinceMs = 0, [string]$OnlyTitle = '')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class PLW {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, IntPtr e);
}
"@
$imagePhoneSet = @{}
foreach ($p in ($ImagePhones -split ',')) { if ($p.Trim()) { $imagePhoneSet[$p.Trim()] = 1 } }
$captured = 0
$captureErrors = New-Object System.Collections.Generic.List[string]
$prevFg = [IntPtr]::Zero
$prevClip = $null
$clipSaved = $false
function Digits([string]$p) {
  $d = ($p -replace '\D', '')
  if ($d.StartsWith('82') -and ($d.Length -eq 11 -or $d.Length -eq 12)) { $d = '0' + $d.Substring(2) }
  return $d
}
$AE = [System.Windows.Automation.AutomationElement]
$TS = [System.Windows.Automation.TreeScope]
$CT = [System.Windows.Automation.ControlType]
function Cond($prop, $val) { New-Object System.Windows.Automation.PropertyCondition($prop, $val) }
function Done($obj) {
  $json = $obj | ConvertTo-Json -Depth 8 -Compress
  [System.IO.File]::WriteAllText($Out, $json, (New-Object System.Text.UTF8Encoding($false)))
  exit 0
}

# 화면 시각 → ms (예: "10 24, 2026 3:14 오후"). 못 읽으면 0
function ItemMs([string]$name) {
  $s = $name -replace "[‎‏]", ''
  $ms = [regex]::Matches($s, '(\d{1,2}) (\d{1,2}), (\d{4}) (\d{1,2}):(\d{2}) (오전|오후)')
  if ($ms.Count -eq 0) { return 0 }
  $m = $ms[$ms.Count - 1]
  $h = [int]$m.Groups[4].Value % 12
  if ($m.Groups[6].Value -eq '오후') { $h += 12 }
  $dt = New-Object DateTime ([int]$m.Groups[3].Value), ([int]$m.Groups[1].Value), ([int]$m.Groups[2].Value), $h, ([int]$m.Groups[5].Value), 0, ([DateTimeKind]::Local)
  return [double]([DateTimeOffset]$dt).ToUnixTimeMilliseconds()
}

$proc = Get-Process -Name PhoneExperienceHost -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $proc) {
  # 창이 닫혀 있으면 연다(작업 표시줄 아이콘만 있을 때)
  Start-Process explorer.exe 'shell:AppsFolder\Microsoft.YourPhone_8wekyb3d8bbwe!App'
  for ($i = 0; $i -lt 30 -and -not $proc; $i++) {
    Start-Sleep -Seconds 1
    $proc = Get-Process -Name PhoneExperienceHost -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  }
  if (-not $proc) { Done @{ ok = $false; error = '휴대폰과 연결 창을 찾지 못함' } }
  Start-Sleep -Seconds 3
}
$win = $AE::FromHandle($proc.MainWindowHandle)

# 사진 하나를 '복사' 메뉴로 받아 임시 파일 경로를 돌려준다(휴대폰과 연결이 TempState 에 원본을 써 준다)
function CopyImage($im) {
  if (-not $script:clipSaved) {
    $script:prevFg = [PLW]::GetForegroundWindow()
    try { if ([System.Windows.Forms.Clipboard]::ContainsText()) { $script:prevClip = [System.Windows.Forms.Clipboard]::GetText() } } catch {}
    $script:clipSaved = $true
  }
  try { $im.GetCurrentPattern([System.Windows.Automation.ScrollItemPattern]::Pattern).ScrollIntoView() } catch {}
  Start-Sleep -Milliseconds 500
  [PLW]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
  Start-Sleep -Milliseconds 200
  try { $im.SetFocus() } catch { return $null }
  Start-Sleep -Milliseconds 200
  try { [System.Windows.Forms.Clipboard]::Clear() } catch {}
  [PLW]::keybd_event(0x10, 0, 0, [IntPtr]::Zero); [PLW]::keybd_event(0x79, 0, 0, [IntPtr]::Zero)
  [PLW]::keybd_event(0x79, 0, 2, [IntPtr]::Zero); [PLW]::keybd_event(0x10, 0, 2, [IntPtr]::Zero)
  $copy = $null
  for ($i = 0; $i -lt 25 -and -not $copy; $i++) {
    Start-Sleep -Milliseconds 200
    foreach ($mi in @($AE::RootElement.FindAll($TS::Descendants, (Cond $AE::ControlTypeProperty $CT::MenuItem)))) {
      if ($mi.Current.ProcessId -eq $proc.Id -and $mi.Current.Name -eq '복사') { $copy = $mi; break }
    }
  }
  if (-not $copy) { [PLW]::keybd_event(0x1B, 0, 0, [IntPtr]::Zero); [PLW]::keybd_event(0x1B, 0, 2, [IntPtr]::Zero); return $null }
  $copy.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 300
    try {
      $files = [System.Windows.Forms.Clipboard]::GetFileDropList()
      if ($files -and $files.Count -gt 0 -and (Test-Path $files[0])) { return $files[0] }
    } catch {}
  }
  return $null
}

# 고객이 보낸(수신) 사진만, -ImageSinceMs 이후 것만 저장. 이미 저장한 것(같은 시각·순번)은 건너뜀.
function CaptureImages($ml, [string]$digits) {
  $dir = Join-Path $ImageDir $digits
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $perMs = @{}
  foreach ($mi in @($ml.FindAll($TS::Children, (Cond $AE::ControlTypeProperty $CT::ListItem)))) {
    $nm = $mi.Current.Name
    if ($nm -notmatch '%4의 메시지') { continue }
    $ms = ItemMs $nm
    if ($ms -le 0 -or $ms -lt $ImageSinceMs) { continue }
    foreach ($im in @($mi.FindAll($TS::Descendants, (Cond $AE::AutomationIdProperty 'ImagePresenter')))) {
      $key = [string][int64]$ms
      $perMs[$key] = 1 + [int]$perMs[$key]
      $base = '{0}_{1}' -f $key, $perMs[$key]
      if (@(Get-ChildItem -Path $dir -Filter "$base.*" -ErrorAction SilentlyContinue).Count -gt 0) { continue }
      $f = CopyImage $im
      if ($f) {
        $ext = [System.IO.Path]::GetExtension($f); if (-not $ext) { $ext = '.jpg' }
        Copy-Item -LiteralPath $f -Destination (Join-Path $dir ($base + $ext))
        $script:captured++
      } else { $script:captureErrors.Add("$digits $base") }
    }
  }
}

# 메시지 탭으로
$tab = $win.FindFirst($TS::Descendants, (Cond $AE::AutomationIdProperty 'MessagingNodeAutomationId'))
if ($tab) { try { $tab.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select(); Start-Sleep -Milliseconds 1200 } catch {} }

$list = $null
for ($i = 0; $i -lt 10 -and -not $list; $i++) {
  $list = $win.FindFirst($TS::Descendants, (Cond $AE::AutomationIdProperty 'CVSListView'))
  if (-not $list) { Start-Sleep -Milliseconds 800 }
}
if (-not $list) { Done @{ ok = $false; error = '대화 목록을 찾지 못함(폰 연결 끊김?)' } }

$items = @($list.FindAll($TS::Descendants, (Cond $AE::ControlTypeProperty $CT::ListItem)))
$prevSel = $null
foreach ($it in $items) {
  try { if ($it.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Current.IsSelected) { $prevSel = $it.Current.Name } } catch {}
}

$convs = New-Object System.Collections.Generic.List[object]
$skipped = New-Object System.Collections.Generic.List[string]
$oldStreak = 0
$n = 0
foreach ($it in $items) {
  if ($n -ge $MaxConvs -or $oldStreak -ge 3) { break }
  $name = $it.Current.Name
  $title = ($name -split '와의 대화')[0]
  # -OnlyTitle: 원장님이 지정한 대화방 하나만(읽지 않았어도 연다 — 원장님 요청일 때만 씀)
  if ($OnlyTitle) { if ($title -notlike "*$OnlyTitle*") { continue } }
  elseif ($name -match '읽지 않') { $skipped.Add($title); continue }
  $n++
  try { $it.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select() } catch { continue }

  # 오른쪽 대화 화면이 이 대화방으로 바뀔 때까지(최대 5초)
  $pane = $null; $texts = $null
  for ($i = 0; $i -lt 25; $i++) {
    Start-Sleep -Milliseconds 200
    $pane = $win.FindFirst($TS::Descendants, (Cond $AE::AutomationIdProperty 'ConversationPane'))
    if (-not $pane) { continue }
    $texts = @($pane.FindAll($TS::Children, (Cond $AE::ControlTypeProperty $CT::Text)))
    if ($texts.Count -ge 1 -and $texts[0].Current.Name -eq $title) { break }
    $texts = $null
  }
  if (-not $texts) { $skipped.Add("$title(화면 안 바뀜)"); continue }
  # 전화번호 줄: 숫자·+·-·공백·괄호만(이름에 '2608' 같은 숫자가 섞인 저장 이름은 제외)
  $phone = ''
  foreach ($t in $texts) {
    $tn = ($t.Current.Name -replace "[‎‏‪-‮]", '').Trim()
    if ($tn -match '^\+?\d[\d\s\-()]{2,}$') { $phone = $tn; break }
  }

  $mlist = $null
  for ($i = 0; $i -lt 15 -and -not $mlist; $i++) {
    $mlist = $pane.FindFirst($TS::Descendants, (Cond $AE::ControlTypeProperty $CT::List))
    if (-not $mlist) { Start-Sleep -Milliseconds 200 }
  }
  # 화면에 그려진 문자들을 모은다(같은 문자는 한 번만). 목록은 화면 근처만 그려지므로
  # 가장 오래된 문자가 -SinceMs 보다 새것이면 위로 넘기며 더 모은다.
  $seen = @{}
  $msgs = New-Object System.Collections.Generic.List[object]
  $lastMs = 0
  function Collect {
    $added = 0; $minMs = [double]::MaxValue
    $cnt = -1
    for ($k = 0; $k -lt 15; $k++) { # 그려지는 개수가 멈출 때까지
      $c = @($mlist.FindAll($TS::Children, (Cond $AE::ControlTypeProperty $CT::ListItem))).Count
      if ($c -eq $cnt) { break }
      $cnt = $c; Start-Sleep -Milliseconds 250
    }
    foreach ($mi in @($mlist.FindAll($TS::Children, (Cond $AE::ControlTypeProperty $CT::ListItem)))) {
      $mname = $mi.Current.Name
      if ($mname -match '^대화 구분 기호') { continue }
      $ms = ItemMs $mname
      if ($ms -gt 0 -and $ms -lt $minMs) { $minMs = $ms }
      if ($seen.ContainsKey($mname)) { continue }
      $seen[$mname] = 1
      $bodies = @($mi.FindAll($TS::Descendants, (Cond $AE::AutomationIdProperty 'MessageBody')) | ForEach-Object { $_.Current.Name })
      $script:msgs.Add(@{ name = $mname; body = ($bodies -join "`n"); ms = $ms })
      if ($ms -gt $script:lastMs) { $script:lastMs = $ms }
      $added++
    }
    return $minMs
  }
  if ($mlist) {
    $minMs = Collect
    # 등본 대기 고객이면 고객이 보낸 사진을 저장(목록이 맨 아래=최근을 보여 줄 때, 위로 넘기기 전에)
    $digits = Digits $phone
    if ($ImageDir -and $digits -and $imagePhoneSet.ContainsKey($digits)) { CaptureImages $mlist $digits }
    $sp = $null
    try { $sp = $mlist.GetCurrentPattern([System.Windows.Automation.ScrollPattern]::Pattern) } catch {}
    for ($up = 0; $up -lt 40 -and $sp -and $minMs -ge $SinceMs; $up++) {
      if ($sp.Current.VerticalScrollPercent -le 0) { break }
      $sp.Scroll([System.Windows.Automation.ScrollAmount]::NoAmount, [System.Windows.Automation.ScrollAmount]::LargeDecrement)
      Start-Sleep -Milliseconds 400
      $m2 = Collect
      if ($m2 -lt $minMs) { $minMs = $m2 }
    }
  }
  $convs.Add(@{ title = $title; phone = $phone; messages = $msgs })
  if ($lastMs -gt 0 -and $lastMs -lt $SinceMs) { $oldStreak++ } else { $oldStreak = 0 }
}

# 원래 보던 대화방으로 되돌린다
if ($prevSel) {
  foreach ($it in @($list.FindAll($TS::Descendants, (Cond $AE::ControlTypeProperty $CT::ListItem)))) {
    if ($it.Current.Name -eq $prevSel) { try { $it.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select() } catch {}; break }
  }
}
# 사진을 받느라 바꾼 클립보드 글자·앞 창을 되돌린다
if ($clipSaved) {
  try { if ($prevClip) { [System.Windows.Forms.Clipboard]::SetText($prevClip) } else { [System.Windows.Forms.Clipboard]::Clear() } } catch {}
  if ($prevFg -ne [IntPtr]::Zero) { [PLW]::SetForegroundWindow($prevFg) | Out-Null }
}
Done @{ ok = $true; conversations = $convs; skipped = $skipped; listed = $items.Count; imagesCaptured = $captured; imageErrors = $captureErrors }
