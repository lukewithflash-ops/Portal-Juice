# Portal Juice iOS shell

Capacitor loads the live site. It does not rebuild the board.

- App name: Portal Juice
- Bundle ID: app.portaljuice
- Team ID: A9V5Q6UVFT
- URL: https://portaljuice.app

## Native features in the app (1.0.1+)

- Haptics (@capacitor/haptics): tab taps, logging a pick, a pick grading as a win, tailing, sharing a position, joining a squad.
  The site calls `haptic()` in `src/lib/native.ts`; browsers keep their old `navigator.vibrate` behavior.
- Native share sheet (@capacitor/share, @capacitor/filesystem): squad invites, Wrapped, night recap and final-score images
  (written to the app cache, then shared, so Save Image works).
- Offline: `server.errorPath` shows the bundled `ios-shell/offline.html` when portaljuice.app can't load; it reconnects on its
  own via @capacitor/network. Inside the app a thin offline bar shows when the connection drops.
- User agent ends with `PortalJuiceApp`; with `window.Capacitor` this flags `<html class="pj-native">`.
- Info.plist: camera, photo library and add-to-photos usage strings (slip photos, Save Image).
- Next: native push (needs an APNs .p8 key from the Apple developer account, then @capacitor/push-notifications).

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
