# stripe-create-portal-session

Opens **Stripe Customer Portal** for the signed-in user (cancel at period end, update payment method, invoices).

## Auth

User JWT (`Authorization: Bearer …`).

## Behavior

- Loads **`profiles.stripe_customer_id`**
- Ensures a portal **configuration** with **subscription cancel** enabled (uses **`STRIPE_BILLING_PORTAL_CONFIGURATION_ID`** if set, else reuses an existing config or creates one)
- If the user has an active **Starter** or **Pro** recurring sub, opens the portal **directly on the cancel flow** for that subscription (`flow_data.type = subscription_cancel`)
- Otherwise opens the generic portal (payment method / invoices)
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
