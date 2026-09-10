#!/bin/bash
# Stamp Simulator status bar for App Store screenshots: 9:41, full Wi-Fi, full battery.
# EdgeTilt Prod Run post-action calls this. Also safe from Terminal after the sim is up.
set -u

# Physical iPhone: nothing to stamp.
if [ "${PLATFORM_NAME:-}" = "iphoneos" ]; then
  exit 0
fi

DEVICE="${TARGET_DEVICE_IDENTIFIER:-booted}"

# iOS 27 rejects --time "9:41". Needs ISO + milliseconds + colon timezone.
# Pacific so the clock reads 9:41 (UTC Z shows 2:41 PDT).
offset=$(TZ=America/Los_Angeles date +%z)
offset_colon="${offset:0:3}:${offset:3}"
day=$(TZ=America/Los_Angeles date +%Y-%m-%d)
stamp="${day}T09:41:00.000${offset_colon}"

if [ "$DEVICE" != "booted" ]; then
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
    if xcrun simctl list devices | grep -F "$DEVICE" | grep -q Booted; then
      break
    fi
    sleep 0.5
  done
fi

if ! xcrun simctl status_bar "$DEVICE" override \
  --time "$stamp" \
  --dataNetwork wifi --wifiMode active --wifiBars 3 \
  --cellularMode notSupported \
  --operatorName "" \
  --batteryState charged --batteryLevel 100; then
  echo "stamp-app-store-status-bar: simctl override failed (device=${DEVICE}). Run this script again after the sim is up." >&2
  exit 0
fi
