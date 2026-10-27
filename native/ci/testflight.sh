#!/bin/bash
# Signs the app and sends it to TestFlight. Runs only after the App Store
# Connect key and team are saved as GitHub secrets (see native/README.md).
#
# The archive is built unsigned and only the export is signed, with Apple's
# cloud-managed distribution certificate. An App Store Connect key can sign an
# export but not a build; signing the build on a fresh Mac would also create
# a new development certificate on every run and would need a registered
# device. The key itself is never printed and is deleted at the end.
set -euo pipefail
KEY_DIR="$RUNNER_TEMP/asc-key"; mkdir -p "$KEY_DIR"; chmod 700 "$KEY_DIR"
KEY_PATH="$KEY_DIR/AuthKey_${ASC_KEY_ID}.p8"
trap 'rm -rf "$KEY_DIR"' EXIT
printf '%s\n' "$ASC_KEY_P8" | tr -d '\r' > "$KEY_PATH"; chmod 600 "$KEY_PATH"
if ! grep -q -- "-----BEGIN PRIVATE KEY-----" "$KEY_PATH" || ! grep -q -- "-----END PRIVATE KEY-----" "$KEY_PATH"; then
  echo "PROBLEM: the ASC_KEY_P8 secret is not the complete text of the AuthKey .p8 file."
  echo "It must start with -----BEGIN PRIVATE KEY----- and end with -----END PRIVATE KEY-----."
  exit 1
fi
BUILD_NUMBER=$((GITHUB_RUN_NUMBER + 1000))
ARCHIVE="$RUNNER_TEMP/App.xcarchive"
LOGS="$GITHUB_WORKSPACE/results"

echo "Archiving build $BUILD_NUMBER (unsigned)…"
if ! xcodebuild -project native/ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" \
  archive > "$LOGS/archive.log" 2>&1; then
  echo "PROBLEM: the archive failed."; grep -E "error:|ARCHIVE FAILED" "$LOGS/archive.log" | head -40; exit 1
fi
grep -E "ARCHIVE SUCCEEDED" "$LOGS/archive.log"

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
export_and_upload() {
  xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportOptionsPlist "$RUNNER_TEMP/ExportOptions.plist" \
    -exportPath "$RUNNER_TEMP/export" -allowProvisioningUpdates \
    -authenticationKeyPath "$KEY_PATH" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID" \
    > "$LOGS/$1" 2>&1
}
echo "Signing for the App Store and uploading…"
if ! export_and_upload export.log; then
  echo "The first export attempt failed:"; grep -iE "error|failed|no suitable|agreement" "$LOGS/export.log" | head -30
  # In case the export does not accept an unsigned archive: give the archive
  # a placeholder signature and try once more.
  APP="$ARCHIVE/Products/Applications/App.app"
  if [ -d "$APP/Frameworks" ]; then find "$APP/Frameworks" -maxdepth 1 \( -name "*.framework" -o -name "*.dylib" \) -exec codesign --force --sign - --timestamp=none {} \; ; fi
  codesign --force --sign - --timestamp=none "$APP"
  echo "Trying again…"
  if ! export_and_upload export-retry.log; then
    echo "PROBLEM: signing or uploading failed."; grep -iE "error|failed|no suitable|agreement" "$LOGS/export-retry.log" | head -40; exit 1
  fi
  tail -12 "$LOGS/export-retry.log"
else
  tail -12 "$LOGS/export.log"
fi
echo "Uploaded build $BUILD_NUMBER to App Store Connect (TestFlight)."
