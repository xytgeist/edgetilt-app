# apple-iap-verify

StoreKit purchase confirm + short-lived intent for EdgeiOS.

## Actions

- `action: begin` … bind `product_id` to the signed-in user (and `creator_user_id` + `fan_tier_key` for fan SKUs).
- `action: confirm` (default) … upsert `user_subscriptions` or `creator_subscriptions` with `billing_provider = apple`. Prefers JWS payload fields (`productId`, `originalTransactionId`, `expiresDate`).

Fan SKUs are one App Store product per tier (`com.edgetilt.app.fan_tier_499.monthly` …). The creator is **not** in the receipt. The begin intent is what stops a cheap tier attaching to an expensive room.

## Deploy (test)

```bash
supabase functions deploy apple-iap-verify --project-ref kcosfvmreeiosdjdzycb
```

Prod only when Ryan asks. SQL **`20260905120000`** must be applied first.

## Still owed

Full x5c chain to Apple Root CA G3 on purchase confirm (device StoreKit already checks; server currently decodes claims). Refund / renew / revoke notifications are **`apple-iap-notify`**.
