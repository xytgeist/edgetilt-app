# Syndicate home-PC sync (Windows Task Scheduler): Action public betting + ESPN trench.
# Residential egress. Writes test then production.
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
Write-Log "===== $stamp syndicate home-PC sync (Action splits + ESPN trench) ====="
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
$exit = 0

$splits = Join-Path $repo 'scripts\sync-action-public-betting-splits.mjs'
$out = & $node $splits --target=both 2>&1
$code = $LASTEXITCODE
foreach ($line in $out) { Write-Log ([string]$line) }
Write-Log "action-splits exit=$code"
if ($code -ne 0) { $exit = $code }

$trench = Join-Path $repo 'scripts\sync-espn-nfl-trench-live.mjs'
$out2 = & $node $trench --target=both 2>&1
$code2 = $LASTEXITCODE
foreach ($line in $out2) { Write-Log ([string]$line) }
Write-Log "espn-trench exit=$code2"
if ($code2 -ne 0) { $exit = $code2 }

Write-Log "exit=$exit"
exit $exit
