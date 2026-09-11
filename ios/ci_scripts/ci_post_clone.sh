#!/bin/sh

# Shared clock for Test Fast, Prod, and local archives. Do not use
# CI_BUILD_NUMBER + offset ... that counter is per-workflow and collides.
STAMP_SCRIPT="$CI_PRIMARY_REPOSITORY_PATH/ios/scripts/next-ios-build-number.sh"
if [ -x "$STAMP_SCRIPT" ]; then
  BUILD_NUMBER="$("$STAMP_SCRIPT")"
else
  BUILD_NUMBER="$(date -u +%Y%m%d%H%M%S)"
fi
echo "Setting CFBundleVersion to $BUILD_NUMBER"

cd "$CI_PRIMARY_REPOSITORY_PATH/ios" || exit 1
xcrun agvtool new-version -all "$BUILD_NUMBER"
