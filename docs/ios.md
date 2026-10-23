# Portal Juice iOS shell

Capacitor loads the live site. It does not rebuild the board.

- App name: Portal Juice
- Bundle ID: app.portaljuice
- Team ID: A9V5Q6UVFT
- URL: https://portaljuice.app

## TestFlight from GitHub Actions (no Mac needed)

Run the "iOS TestFlight" workflow (Actions tab, or `gh workflow run ios-testflight.yml`),
or push a tag like `ios-v1.0.1`. It archives on a macOS runner, signs with the
"Portal Juice App Store" profile, and uploads to TestFlight. Build number = run number.

Secrets used: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8, APPLE_TEAM_ID,
IOS_DIST_P12_B64, IOS_DIST_P12_PASSWORD, IOS_PROFILE_B64.
The distribution certificate and profile expire 2027-10-23.

## On the Mac

```bash
git clone https://github.com/lukewithflash-ops/Portal-Juice.git
cd Portal-Juice
npm install
npx cap add ios
npx cap open ios
```

In Xcode:

1. Select the App target.
2. Signing & Capabilities: Team A9V5Q6UVFT, Bundle Identifier app.portaljuice.
3. Product > Archive.
4. Distribute App > App Store Connect > Upload.

Do not submit for App Review from this step. Confirm it opens in TestFlight first.

No bet button, no coins, no balance, no payout. Portal Juice is not a book.
