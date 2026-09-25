# Action Network public-betting → syndicate_betting_splits (Windows Task Scheduler).
# Residential egress. Writes test then production (source=action_pro only).
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/action-public-betting-sync-windows.ps1
$ErrorActionPreference = 'Continue'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repo

$node = 'C:\Program Files\nodejs\node.exe'
$log = Join-Path $PSScriptRoot '.action-public-betting-sync.log'
$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'

function Write-Log([string]$line) {
  Add-Content -Path $log -Value $line -Encoding utf8
}

Write-Log ''
Write-Log "===== $stamp action public betting sync (test + prod) ====="
Write-Log "repo=$repo"

if (-not (Test-Path $node)) {
  Write-Log "ERROR: node.exe not found at $node"
  exit 1
}

try {
  $dirty = git status --porcelain --untracked-files=no
  if ($dirty) {
    Write-Log 'WARN: tracked files dirty; skipped git pull'
  } else {
    git fetch origin 2>&1 | ForEach-Object { Write-Log $_ }
    git pull --ff-only origin test 2>&1 | ForEach-Object { Write-Log $_ }
  }
} catch {
  Write-Log "WARN: git pull skipped: $($_.Exception.Message)"
}

$env:Path = 'C:\Program Files\nodejs;' + $env:Path
$script = Join-Path $repo 'scripts\sync-action-public-betting-splits.mjs'

$out = & $node $script --target=both 2>&1
$exit = $LASTEXITCODE
foreach ($line in $out) {
  Write-Log ([string]$line)
}
Write-Log "exit=$exit"
exit $exit
