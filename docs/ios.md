# Portal Juice iOS shell

Capacitor loads the live site. It does not rebuild the board.

- App name: Portal Juice
- Bundle ID: app.portaljuice
- Team ID: A9V5Q6UVFT
- URL: https://portal-juice.vercel.app

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
