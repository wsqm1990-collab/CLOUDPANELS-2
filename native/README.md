# CloudPanels for iPad (native app)

The web app in `src/` is packaged as a native iPad app with Capacitor. There is
no Xcode project in the repository: GitHub's Macs create it on every build
(`.github/workflows/ios.yml`), using the published web app from `gh-pages`.

Each build is opened in an iPad simulator; screenshots and logs are pushed to
the `ci-results` branch.

## Sending builds to TestFlight

Add these repository secrets (Settings → Secrets and variables → Actions):

| Secret | Where it comes from |
| --- | --- |
| `APPLE_TEAM_ID` | developer.apple.com → Account → Membership details → Team ID |
| `ASC_ISSUER_ID` | App Store Connect → Users and Access → Integrations → App Store Connect API → Issuer ID |
| `ASC_KEY_ID` | Same page, the key's ID (create the key with the **Admin** role) |
| `ASC_KEY_P8` | The whole text of the downloaded `AuthKey_XXXX.p8` file |

Also create the app in App Store Connect (My Apps → +) with the bundle ID
`com.wsqm1990.cloudpanels`. The next push to `main` uploads a build to TestFlight.
