# Install Windows scheduled tasks for syndicate home-PC sync
# (Action Network public betting + ESPN NFL trench win rates).
# Covers Chedda/Tank seed + movers + lock windows (local time; set PC to PT).
# powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-action-public-betting-windows-task.ps1
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runner = Join-Path $PSScriptRoot 'action-public-betting-sync-windows.ps1'
$taskName = 'EdgeTilt Action Public Betting Sync'

if (-not (Test-Path $runner)) {
  throw "Missing runner script: $runner"
}

$arg = "-NoProfile -ExecutionPolicy Bypass -File `"$runner`""
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg -WorkingDirectory $repo

# Daily twice: morning seed / lock window, evening movers. Script is cheap; over-fetch OK.
$triggerMorning = New-ScheduledTaskTrigger -Daily -At 10:00AM
$triggerEvening = New-ScheduledTaskTrigger -Daily -At 6:00PM

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -WakeToRun `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

$principal = New-ScheduledTaskPrincipal `
  -UserId $env:USERNAME `
  -LogonType Interactive `
  -RunLevel Limited

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger @($triggerMorning, $triggerEvening) `
  -Settings $settings `
  -Principal $principal `
  -Description 'Home-PC: Action Network NFL+NCAAF public betting → syndicate_betting_splits (action_pro) and ESPN trench PBWR/PRWR/RBWR/RSWR → nfl_team_metrics on test+prod. Ops paste/vision stays as backup.' `
  -Force | Out-Null

Get-ScheduledTask -TaskName $taskName | Get-ScheduledTaskInfo | Format-List TaskName, LastRunTime, NextRunTime, LastTaskResult
Write-Host "Installed '$taskName' daily 10:00 AM + 6:00 PM as $env:USERNAME (interactive logon)."
Write-Host "Logs: $repo\scripts\.action-public-betting-sync.log"
Write-Host "Manual run: powershell -NoProfile -ExecutionPolicy Bypass -File `"$runner`""
Write-Host "Dry run splits: npm run syndicate:sync-action-splits:test:dry"
Write-Host "Dry run trench: npm run syndicate:sync-espn-trench:test:dry"
