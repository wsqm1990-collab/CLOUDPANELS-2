#!/bin/bash
# Signs the app and sends it to TestFlight. Runs only after the App Store
# Connect key and team are saved as GitHub secrets (see native/README.md).
set -euo pipefail
KEY_PATH="$RUNNER_TEMP/AuthKey_${ASC_KEY_ID}.p8"
printf '%s\n' "$ASC_KEY_P8" > "$KEY_PATH"
BUILD_NUMBER=$((GITHUB_RUN_NUMBER + 1000))
AUTH=(-allowProvisioningUpdates -authenticationKeyPath "$KEY_PATH" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")
xcodebuild -project native/ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$RUNNER_TEMP/App.xcarchive" \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" CODE_SIGN_STYLE=Automatic CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  "${AUTH[@]}" archive | tail -40
cat > "$RUNNER_TEMP/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>${APPLE_TEAM_ID}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
PLIST
xcodebuild -exportArchive -archivePath "$RUNNER_TEMP/App.xcarchive" -exportOptionsPlist "$RUNNER_TEMP/ExportOptions.plist" -exportPath "$RUNNER_TEMP/export" "${AUTH[@]}" | tail -40
rm -f "$KEY_PATH"
echo "Uploaded build $BUILD_NUMBER to App Store Connect (TestFlight)."
