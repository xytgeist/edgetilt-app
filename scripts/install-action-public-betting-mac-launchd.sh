#!/usr/bin/env bash
# Install LaunchAgent: Mac fallback for Action splits + ESPN trench (daily 12:00 local).
# Windows home PC remains primary at 10:00. Re-run to replace.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
RUNNER="$REPO/scripts/action-public-betting-sync-mac.sh"
LABEL="com.edgetilt.action-public-betting-sync"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
NODE_BIN="$(command -v node)"

chmod +x "$RUNNER"

cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${RUNNER}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${REPO}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_BIN</key>
    <string>${NODE_BIN}</string>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>12</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>${REPO}/scripts/.action-public-betting-sync-mac.launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>${REPO}/scripts/.action-public-betting-sync-mac.launchd.err.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/${LABEL}" 2>/dev/null || true

echo "Installed ${LABEL} daily 12:00 local (Mac fallback after Windows 10:00)."
echo "Plist: $PLIST"
echo "Manual: bash \"$RUNNER\""
echo "Logs: $REPO/scripts/.action-public-betting-sync-mac.log"
