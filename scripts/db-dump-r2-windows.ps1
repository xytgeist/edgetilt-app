# Daily runner for scripts/db-dump-to-r2.mjs (production to private R2 only).
# Test sandbox stays on Supabase included daily backups.
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$log = Join-Path $PSScriptRoot '.db-dump-r2-sync.log'
$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'

function Write-Log([string]$msg) {
  Add-Content -Path $log -Value "[$stamp] $msg"
}

Set-Location $repo
Write-Log "start db-dump-to-r2 --target=production"

try {
  $node = Get-Command node -ErrorAction Stop
  & $node.Source 'scripts/db-dump-to-r2.mjs' '--target=production' *>> $log
  if ($LASTEXITCODE -ne 0) {
    Write-Log "FAILED exit=$LASTEXITCODE"
    exit $LASTEXITCODE
  }
  Write-Log 'ok'
} catch {
  Write-Log "ERROR $($_.Exception.Message)"
  throw
}
