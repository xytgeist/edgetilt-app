# Edge billing — Stripe Checkout + Customer Portal + webhooks

Multi-product Edge subscriptions. **Slots Edge pricing (locked):** see **`docs/access-tiers.md` §5.1**.

| Plan | Slug | List price |
| --- | --- | --- |
| Starter | `slots-edge-starter` | $14/mo |
| Full (monthly) | `slots-edge` | $42/mo |
| Full (annual) | `slots-edge` + annual Price | $420/yr |

**Early subscribers:** 10% off the **first 12 billing months** (Starter or Full) via Stripe Coupon — e.g. $37.80/mo Full, $378/yr annual, $12.60/mo Starter.

Future vertical slugs: **`sports-edge`**, **`crypto-edge`**.

## Functions

| Function | Auth | Purpose |
| --- | --- | --- |
| **`stripe-create-checkout-session`** | User JWT | `POST { "product_slug": "…", "price_interval": "monthly"|"annual" }` → `{ url }` (**interval + starter slug wiring TBD**) |
| **`stripe-create-portal-session`** | User JWT | Manage/cancel billing in Stripe Customer Portal |
| **`stripe-webhook`** | Stripe signature | Updates **`user_subscriptions`** + syncs **`profiles.has_active_subscription`** for **Full `slots-edge`** |

## Prerequisites

1. Apply migration **`supabase/migrations/20260526120000_edge_subscriptions.sql`** on test (then prod). **Starter plan + guide unlock tables:** additional migration **TBD**.
2. Stripe Dashboard → Products + recurring Prices (test mode first):
   - **Slots Edge Starter** — $14/mo
   - **Slots Edge Full** — $42/mo and $420/yr (two Prices on one Product, or separate Products — team choice at implement time)
3. Stripe **Coupon** for early bird: 10% off, repeating 12 months (optional Promotion Code for launch).
4. Enable **Customer Portal** in Stripe; customize branding in Dashboard (Checkout + Portal).
5. Webhook endpoint: `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`  
   Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.

## Supabase Edge secrets (names only)

| Secret | Example use |
| --- | --- |
| **`STRIPE_SECRET_KEY`** | `sk_test_…` |
| **`STRIPE_WEBHOOK_SECRET`** | `whsec_…` from webhook endpoint |
| **`STRIPE_PRICE_SLOTS_EDGE_STARTER`** | `price_…` for **$14/mo** starter |
| **`STRIPE_PRICE_SLOTS_EDGE`** | `price_…` for **$42/mo** full |
| **`STRIPE_PRICE_SLOTS_EDGE_ANNUAL`** | `price_…` for **$420/yr** full |
| **`STRIPE_COUPON_EARLY_BIRD`** | Optional `coupon_…` id for 10% × 12 months |
| **`STRIPE_PRICE_SPORTS_EDGE`** | When sports-edge goes live |
| **`STRIPE_PRICE_CRYPTO_EDGE`** | When crypto-edge goes live |
| **`STRIPE_CHECKOUT_DEFAULT_ORIGIN`** | Optional fallback if `Origin` header missing (e.g. `https://edgetilt.com`) |

Price IDs are **per Stripe account** (test vs live). Map slug → secret via **`STRIPE_PRICE_<SLUG>`** with hyphens → underscores.

## Deploy (test project)

```bash
supabase link --project-ref <test-ref> --yes
supabase functions deploy stripe-create-checkout-session
supabase functions deploy stripe-create-portal-session
supabase functions deploy stripe-webhook
```

`stripe-webhook` uses **`verify_jwt = false`** in **`supabase/config.toml`** (Stripe signs requests, not Supabase JWT).

## Client

- **`get_my_entitlements()`** RPC → `{ "slots-edge": { active, status, … } }` (**starter entitlements TBD**)
- Subscribe modal → plan picker + checkout; success redirect `?billing=success&product=…`
- Legacy **`profiles.has_active_subscription`** still updated for **active Full `slots-edge`** (hamburger locks, chat subscriber rooms)

## Manual tier testing (without Stripe)

Still works via SQL on **`user_subscriptions`** or legacy flag — see **`docs/test-user-roles.md`**.
