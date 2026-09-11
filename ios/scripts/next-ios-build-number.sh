#!/bin/sh
# Always-increasing CFBundleVersion for App Store Connect.
#
# CI_BUILD_NUMBER is per Xcode Cloud *workflow*. Test Fast (`test`) and Prod
# (`main`) each start their own counter, and local archives are not on that
# clock. ASC still requires the next upload to be higher than every prior
# build on this version. A UTC timestamp is one sequence for all of them.
#
# Usage: ios/scripts/next-ios-build-number.sh
# Prints one integer, e.g. 20260911154432

set -e
date -u +%Y%m%d%H%M%S
