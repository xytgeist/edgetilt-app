# stripe-create-portal-session

Opens **Stripe Customer Portal** for the signed-in user (cancel at period end, update payment method, invoices).

## Auth

User JWT (`Authorization: Bearer …`).

## Behavior

- Loads **`profiles.stripe_customer_id`**
- **Body (optional):** `{ "creator_user_id": "uuid" }` … opens **subscription cancel** flow for that **creator fan** row in **`creator_subscriptions`** (real Stripe `sub_…` id). Used by the profile fan subscribe sheet **Cancel Subscription**.
- **Body omitted:** opens **Customer Portal home** (platform Slots Edge manage/cancel … no deep-link to test-only `user_subscriptions` ids).
- Return URL: `/?billing=portal`

**Lifetime** (`slots-edge-lifetime`) is a one-time payment ... no subscription to cancel in portal. Use SQL revoke for test resets.

## Deploy (test)

```bash
supabase link --project-ref kcosfvmreeiosdjdzycb --yes
supabase functions deploy stripe-create-portal-session
```

## Stripe Dashboard (optional)

You can still customize branding under **Settings → Billing → Customer portal**. If cancel is disabled on the default dashboard config, this function creates or uses a configuration with cancel **at period end** enabled.

Optional Edge secret: **`STRIPE_BILLING_PORTAL_CONFIGURATION_ID`** (`bpc_…`) to pin a specific portal configuration.

## Test reset by handle

See **`supabase/scripts/revoke_slots_edge_subscription_by_handle.sql`** and **`docs/test-user-roles.md`** § revoke. SQL clears app entitlements; cancel subs in Stripe Dashboard if you need webhook cancel smoke.
