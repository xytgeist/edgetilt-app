# Install Windows scheduled task: daily private R2 DB dump (production only).
# Test uses Supabase included daily backups ... not this cron.
# powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-db-dump-r2-windows-task.ps1
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runner = Join-Path $PSScriptRoot 'db-dump-r2-windows.ps1'
$taskName = 'EdgeTilt DB Dump to R2'

if (-not (Test-Path $runner)) {
  throw "Missing runner script: $runner"
}

$arg = "-NoProfile -ExecutionPolicy Bypass -File `"$runner`""
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Daily -At 3:15AM

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -WakeToRun `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2)

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
  -Description 'Home-PC: pg_dump Supabase production to private R2 (DB_BACKUP_R2_*). 14-day prune. Test stays on Supabase daily backups. See docs/db-r2-backups.md.' `
  -Force | Out-Null

Get-ScheduledTask -TaskName $taskName | Get-ScheduledTaskInfo | Format-List TaskName, LastRunTime, NextRunTime, LastTaskResult
Write-Host "Installed '$taskName' daily 3:15 AM as $env:USERNAME (interactive logon)."
Write-Host "Requires: pg_dump on PATH, .env.master DB_BACKUP_R2_* + prod SUPABASE_DB_PASSWORD."
Write-Host "Logs: $repo\scripts\.db-dump-r2-sync.log"
Write-Host "Manual: npm run db:dump:r2:production"
