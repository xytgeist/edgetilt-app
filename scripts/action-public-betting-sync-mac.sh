#!/usr/bin/env bash
# Mac fallback for Windows home-PC syndicate sync (Action public betting + ESPN trench).
# Primary: Windows Task Scheduler (daily 10:00 local). This Mac runs later as backup.
# Logs: scripts/.action-public-betting-sync-mac.log
set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO" || exit 1

LOG="$REPO/scripts/.action-public-betting-sync-mac.log"
NODE="${NODE_BIN:-$(command -v node || true)}"
STAMP="$(date '+%Y-%m-%d %H:%M:%S')"

log() { printf '%s\n' "$*" | tee -a "$LOG"; }

{
  echo ""
  echo "===== $STAMP syndicate Mac fallback (Action splits + ESPN trench) ====="
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

EXIT=0
PAUSED="$REPO/data/syndicate/.action-splits-paused"
if [[ -f "$PAUSED" ]]; then
  log "action-splits paused ($PAUSED exists)"
else
  "$NODE" "$REPO/scripts/sync-action-public-betting-splits.mjs" --target=both >>"$LOG" 2>&1
  CODE=$?
  log "action-splits exit=$CODE"
  if [[ $CODE -ne 0 ]]; then EXIT=$CODE; fi
fi

"$NODE" "$REPO/scripts/sync-espn-nfl-trench-live.mjs" --target=both >>"$LOG" 2>&1
CODE2=$?
log "espn-trench exit=$CODE2"
if [[ $CODE2 -ne 0 ]]; then EXIT=$CODE2; fi

log "exit=$EXIT"
exit "$EXIT"
