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

Before the first upload:

1. Register the bundle ID `com.wsqm1990.cloudpanels` (developer.apple.com →
   Certificates, Identifiers & Profiles → Identifiers → + → App IDs → App).
2. Create the app in App Store Connect (Apps → + → New App) with that bundle ID.
3. In App Store Connect → Users and Access → Integrations, the Account Holder
   requests access to the App Store Connect API once, then generates a team key
   with the **Admin** role (it is needed to sign with Apple's cloud-managed
   distribution certificate).

The next push to `main` (or **Actions → iPad app → Run workflow**) uploads a
build to TestFlight. The archive is built unsigned and only the export is
signed by the key, so no development certificates pile up and no registered
device is needed. Build logs are published to the public `ci-results` branch
with the Apple identifiers replaced by `[hidden]`; the key is never printed.
