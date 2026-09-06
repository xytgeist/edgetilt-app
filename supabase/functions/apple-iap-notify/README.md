# apple-iap-notify

App Store Server Notifications V2. Apple POSTs `{ signedPayload }` when a purchase refunds, revokes, expires, or renews. We verify the JWS `x5c` leaf, then update `user_subscriptions` / `creator_subscriptions` by `apple_original_transaction_id`.

`verify_jwt = false` in `supabase/config.toml`. Auth is Apple's signature, not a Supabase JWT.

## Deploy

```bash
supabase functions deploy apple-iap-notify --project-ref kcosfvmreeiosdjdzycb
supabase functions deploy apple-iap-notify --project-ref jtjgtucumuoswnbauxry
```

Deployed **test + prod** 2026-09-05.

## App Store Connect

App → General → App Information → App Store Server Notifications.

Sandbox URL:

`https://kcosfvmreeiosdjdzycb.supabase.co/functions/v1/apple-iap-notify`

Production URL (paste this):

`https://jtjgtucumuoswnbauxry.supabase.co/functions/v1/apple-iap-notify`

Version 2. Send Test Notification after the URL is saved.

## Still owed

Full x5c chain to Apple Root CA G3 (leaf signature + bundle id is live). Ryan still pastes the Production URL in ASC.
