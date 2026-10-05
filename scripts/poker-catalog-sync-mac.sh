#!/usr/bin/env bash
# Mac fallback for Windows home-PC poker catalog sync (includes MTTDB scrape).
# Primary: Windows Task Scheduler (daily 2:00 AM local).
# GHA keeps ClubWPT / CoinPoker / Wynn / regional only … never MTTDB (Cloudflare).
# Logs: scripts/.poker-catalog-sync-mac.log
set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO" || exit 1

LOG="$REPO/scripts/.poker-catalog-sync-mac.log"
NODE="${NODE_BIN:-$(command -v node || true)}"
STAMP="$(date '+%Y-%m-%d %H:%M:%S')"

log() { printf '%s\n' "$*" | tee -a "$LOG"; }

{
  echo ""
  echo "===== $STAMP poker catalog Mac fallback (test then prod, one scrape incl MTTDB) ====="
  echo "repo=$REPO"
} >>"$LOG"

if [[ -z "$NODE" || ! -x "$NODE" ]]; then
  log "ERROR: node not found (set NODE_BIN)"
  exit 1
fi

if git status --porcelain --untracked-files=no | grep -q .; then
  log "WARN: tracked files dirty; skipped git pull"
else
  git fetch origin >>"$LOG" 2>&1 || log "WARN: git fetch failed"
  git pull --ff-only origin test >>"$LOG" 2>&1 || log "WARN: git pull skipped"
fi

"$NODE" "$REPO/scripts/sync-poker-tournament-catalog.mjs" --target=test --mirror-production >>"$LOG" 2>&1
EXIT=$?
log "exit=$EXIT"
exit "$EXIT"
