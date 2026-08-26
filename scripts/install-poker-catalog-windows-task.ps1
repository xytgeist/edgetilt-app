# Install or replace the Windows scheduled task for production poker catalog sync.
# powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-poker-catalog-windows-task.ps1
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runner = Join-Path $PSScriptRoot 'poker-catalog-sync-windows.ps1'
$taskName = 'EdgeTilt Poker Catalog Sync'

if (-not (Test-Path $runner)) {
  throw "Missing runner script: $runner"
}

$arg = "-NoProfile -ExecutionPolicy Bypass -File `"$runner`""
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Daily -At 2:00AM
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -WakeToRun `
  -ExecutionTimeLimit (New-TimeSpan -Hours 1)

$principal = New-ScheduledTaskPrincipal `
  -UserId $env:USERNAME `
  -LogonType Interactive `
  -RunLevel Limited

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description 'Daily EdgeTilt production poker catalog sync (MTTDB + regional + ClubWPT). PC should be on or wake at 2:00 AM.' `
  -Force | Out-Null

Get-ScheduledTask -TaskName $taskName | Get-ScheduledTaskInfo | Format-List TaskName, LastRunTime, NextRunTime, LastTaskResult
Write-Host "Installed '$taskName' daily 2:00 AM as $env:USERNAME (interactive logon)."
Write-Host "Logs: $repo\scripts\.poker-catalog-sync.log"
Write-Host "Manual run: powershell -NoProfile -ExecutionPolicy Bypass -File `"$runner`""
