#!/usr/bin/env bash
# Install LaunchAgent: Mac fallback for poker catalog sync incl MTTDB (daily 06:00 local).
# Windows home PC remains primary at 02:00. GHA never scrapes MTTDB.
# Re-run to replace.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
RUNNER="$REPO/scripts/poker-catalog-sync-mac.sh"
LABEL="com.edgetilt.poker-catalog-sync"
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
    <integer>6</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>${REPO}/scripts/.poker-catalog-sync-mac.launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>${REPO}/scripts/.poker-catalog-sync-mac.launchd.err.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/${LABEL}" 2>/dev/null || true

echo "Installed ${LABEL} daily 06:00 local (Mac fallback after Windows 02:00; includes MTTDB)."
echo "Plist: $PLIST"
echo "Manual: bash \"$RUNNER\""
echo "Logs: $REPO/scripts/.poker-catalog-sync-mac.log"
