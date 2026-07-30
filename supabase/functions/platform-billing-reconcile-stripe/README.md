# platform-billing-reconcile-stripe

Service-role / cron: sync **Slots Edge Starter / Pro** Stripe subscriptions → **`user_subscriptions`**.

Fixes **paid but no access** when a row is stuck **`incomplete`** or webhooks race.

## Auth

- **`SUPABASE_SERVICE_ROLE_KEY`** as `Authorization: Bearer …`, or
- **`PLATFORM_BILLING_RECONCILE_CRON_SECRET`** as bearer / header **`x-platform-billing-reconcile-secret`**

## Deploy

```bash
supabase functions deploy platform-billing-reconcile-stripe --project-ref YOUR_PROJECT_REF
supabase functions deploy stripe-webhook --project-ref YOUR_PROJECT_REF
supabase functions deploy stripe-create-checkout-session --project-ref YOUR_PROJECT_REF
```

Apply migration **`20260730180000_platform_billing_reconcile_cron.sql`** on test + prod.

Optional Edge secret (only if not using service role from pg_cron):

- **`PLATFORM_BILLING_RECONCILE_CRON_SECRET`**

## Manual smoke

```sql
select public.invoke_platform_billing_reconcile_stripe();
```

```bash
curl -X POST "$SUPABASE_URL/functions/v1/platform-billing-reconcile-stripe?dryRun=1" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

## What it does

1. Scans **`user_subscriptions`** with **`status = incomplete`** and re-syncs from Stripe when sub is active/trialing.
2. Lists Stripe subs in **`active` / `trialing` / `past_due`** with **`product_slug`** **`slots-edge`** or **`slots-edge-starter`** and upserts rows.

Pg_cron: **hourly at :15** (`platform_billing_reconcile_hourly`).
