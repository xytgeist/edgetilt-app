# Invoked by Task Scheduler on the laptop. Appends to repo-root session-chat-export-laptop.md
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$env:CHAT_EXPORT_HANDOFF = Join-Path $repoRoot 'session-chat-export-laptop.md'
$env:CHAT_EXPORT_STATE_ID = 'laptop'
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) { Write-Error 'node is not on PATH.' }
& $nodeCmd.Source (Join-Path $repoRoot 'scripts\cursor-chat-export.mjs')
