# Google / Apple sign-in and VIP purchasing: switch-on checklist

Everything is built and off. Each item turns on by adding env vars in Vercel (project portal-juice) and redeploying.

## Google sign-in (web + iOS app)
1. Google Cloud console > APIs & Services > OAuth consent screen: External, app name Portal Juice, support email, domain portaljuice.app, privacy https://portaljuice.app/privacy, terms https://portaljuice.app/terms. Scopes: openid, email, profile. Publish to production.
2. Credentials > Create OAuth client ID > **Web application**.
   - Authorized JavaScript origin: `https://portaljuice.app`
   - Authorized redirect URI: `https://portaljuice.app/api/auth/google/callback`
3. Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
The iOS app uses the same web client: it opens Google in the system browser (SFSafariViewController) and returns via `app.portaljuice://auth`. No iOS client ID needed.

## Sign in with Apple (web + iOS app; required by guideline 4.8 once Google is offered)
1. developer.apple.com > Identifiers > App ID `app.portaljuice` > enable **Sign In with Apple** (Primary App ID). Save. (Then re-download / regenerate the App Store provisioning profile and update the `IOS_PROFILE_B64` secret.)
2. Identifiers > + > **Services IDs**: identifier `app.portaljuice.web`, description Portal Juice Web. Enable Sign In with Apple > Configure: primary App ID app.portaljuice, domain `portaljuice.app`, return URL `https://portaljuice.app/api/auth/apple/callback`.
3. Keys > + > Sign in with Apple key (primary App ID app.portaljuice). Download the .p8 once.
4. Env: `APPLE_SERVICES_ID=app.portaljuice.web`, `APPLE_TEAM_ID=A9V5Q6UVFT`, `APPLE_KEY_ID=<key id>`, `APPLE_PRIVATE_KEY=<.p8 contents>`.

## VIP in the iPhone app (StoreKit 2)
Created via API: subscription group "Portal Juice VIP" (22508764) with `app.portaljuice.vip.monthly` ($9.99, id 6826434915) and `app.portaljuice.vip.yearly` ($59.99, id 6826434824), en-US names, USA price.
1. App Store Connect > Business: accept the **Paid Apps Agreement**, add bank account and tax forms.
2. Each subscription needs a review screenshot of the in-app paywall (added once the paywall build exists), then submit them with the next app version.
3. App Information > App Store Server Notifications: Production and Sandbox URL `https://portaljuice.app/api/vip/apple/notify`, Version 2.
4. Env: `IAP_ENABLED=1` (only after the products are approved). For TestFlight/sandbox testing also `IAP_ALLOW_SANDBOX=1`.
Server verifies every signed transaction and notification against Apple Root CA G3; VIP is stored per account in Upstash, so it works on web and app.

## VIP on the web (Stripe)
Env: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`, `STRIPE_WEBHOOK_SECRET`, `OWNER_EMAILS`.
Stripe webhook endpoint: `https://portaljuice.app/api/vip/webhook`, events: checkout.session.completed, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted.
