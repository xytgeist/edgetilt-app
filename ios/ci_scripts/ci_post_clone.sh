#!/bin/sh

# Set build number based on Xcode Cloud CI_BUILD_NUMBER + offset so it always exceeds existing App Store Connect builds.
BUILD_NUMBER=$((CI_BUILD_NUMBER + 100))
echo "Setting CFBundleVersion to $BUILD_NUMBER"

cd "$CI_PRIMARY_REPOSITORY_PATH/ios" || exit 1
xcrun agvtool new-version -all "$BUILD_NUMBER"
