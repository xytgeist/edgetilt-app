# Laptop only: registers LVSlotPro_CursorChatExport_Laptop (every 30 min) -> session-chat-export-laptop.md
# Remove: Unregister-ScheduledTask -TaskName 'LVSlotPro_CursorChatExport_Laptop' -Confirm:$false

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$runner = Join-Path $PSScriptRoot 'Run-CursorChatExport-Laptop.ps1'

$taskName = 'LVSlotPro_CursorChatExport_Laptop'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$runner`"" -WorkingDirectory $repoRoot
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 30) -RepetitionDuration (New-TimeSpan -Days 9999)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'LVSlotPro: append Cursor chat transcript to session-chat-export-laptop.md every 30 minutes.'
Write-Host "Registered '$taskName'. Log: $(Join-Path $repoRoot 'session-chat-export-laptop.md')"
