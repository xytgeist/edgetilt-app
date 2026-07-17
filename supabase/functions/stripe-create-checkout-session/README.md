# Edge billing — Stripe Checkout + Customer Portal + webhooks



Multi-product Edge subscriptions. **Slots Edge pricing (MSRP + founding 25%):** see **`docs/access-tiers.md` §5.1**.



| Plan | Slug | MSRP | Founding (25% off) |

| --- | --- | --- | --- |

| Slots Edge | `slots-edge-starter` | $19.99/mo | $14.99/mo × 12 mo |

| Slots Edge (annual) | `slots-edge-starter` + annual Price | $219.99/yr | $164.99/yr once |

| Slots Edge Pro (monthly) | `slots-edge` | $59.99/mo | $44.99/mo × 12 mo |

| Slots Edge Pro (annual) | `slots-edge` + annual Price | $660/yr | $495/yr once |

| Slots Edge Lifetime | `slots-edge-lifetime` | $1,699 | $1,274.25 once |



**Founding coupons:** monthly subs use **`STRIPE_COUPON_FOUNDING_MONTHLY`** (or legacy **`STRIPE_COUPON_EARLY_BIRD`**) — 25% × 12 months. Annual + Lifetime use **`STRIPE_COUPON_FOUNDING_ONCE`** — 25% once.



Future vertical slugs: **`sports-edge`**, **`crypto-edge`**.



## Functions



| Function | Auth | Purpose |

| --- | --- | --- |

| **`stripe-create-checkout-session`** | User JWT | `POST { "product_slug": "…", "price_interval": "monthly"|"annual", "apply_early_bird": true, "affiliate_code"?: "…" }` → `{ url }`. Optional **`affiliate_code`** applies that creator’s Stripe promotion code and sets **`affiliate_id` / `affiliate_code`** metadata (mutually exclusive with founding coupons). **`slots-edge-lifetime`** uses one-time **`mode: payment`** checkout. If the user has active Starter or Pro, metadata lists subs to cancel on success. **Starter → Pro** / **monthly → annual** open Checkout; **annual → monthly** in-place update returns **`interval_changed: true`**. Affiliates: **`docs/affiliates.md`**. |

| **`stripe-create-portal-session`** | User JWT | Manage/cancel billing in Stripe Customer Portal |

| **`stripe-webhook`** | Stripe signature | Updates **`user_subscriptions`** + syncs **`profiles.has_active_subscription`** for **Full `slots-edge`** or **`slots-edge-lifetime`**. Clears **`slots-edge-starter`** row when Full is upserted on the same subscription id. |



## Prerequisites



1. Apply migrations through **`20260701140000_subscription_products_slots_edge_lifetime.sql`** on test (then prod). Includes starter (**`20260701120000`**), weekly drops (**`20260701130000`**).

2. Stripe Dashboard → Products + Prices (test mode first):

   - **Slots Edge Starter** — **$19.99/mo** and **$219.99/yr** recurring

   - **Slots Edge Full** — **$59.99/mo** and **$660/yr** recurring

   - **Slots Edge Lifetime** — **$1,699.00 one-time** Price on slug **`slots-edge-lifetime`**

3. Stripe **Coupons** (founding 25%):

   - **Monthly:** `percent_off: 25`, `duration: repeating`, `duration_in_months: 12` → **`STRIPE_COUPON_FOUNDING_MONTHLY`**

   - **Once (annual + lifetime):** `percent_off: 25`, `duration: once` → **`STRIPE_COUPON_FOUNDING_ONCE`** (annual Starter, annual Full, Lifetime)

4. Enable **Customer Portal** in Stripe; customize branding in Dashboard (Checkout + Portal).

5. Webhook endpoint: `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`  

   Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.



## Supabase Edge secrets (names only)



| Secret | Example use |

| --- | --- |

| **`STRIPE_SECRET_KEY`** | `sk_test_…` |

| **`STRIPE_WEBHOOK_SECRET`** | `whsec_…` from webhook endpoint |

| **`STRIPE_PRICE_SLOTS_EDGE_STARTER`** | `price_…` for **$19.99/mo** starter |
| **`STRIPE_PRICE_SLOTS_EDGE_STARTER_ANNUAL`** | `price_…` for **$219.99/yr** starter |

| **`STRIPE_PRICE_SLOTS_EDGE`** | `price_…` for **$59.99/mo** full |

| **`STRIPE_PRICE_SLOTS_EDGE_ANNUAL`** | `price_…` for **$660/yr** full |

| **`STRIPE_PRICE_SLOTS_EDGE_LIFETIME`** | `price_…` for **$1,699 one-time** Lifetime |

| **`STRIPE_COUPON_FOUNDING_MONTHLY`** | 25% × 12 months on monthly Starter / Full |

| **`STRIPE_COUPON_FOUNDING_ONCE`** | 25% once on annual Starter, annual Full + Lifetime checkout |

| **`STRIPE_COUPON_EARLY_BIRD`** | Legacy alias for founding monthly coupon id |

| **`STRIPE_PRICE_SPORTS_EDGE`** | When sports-edge goes live |

| **`STRIPE_PRICE_CRYPTO_EDGE`** | When crypto-edge goes live |

| **`STRIPE_CHECKOUT_DEFAULT_ORIGIN`** | Optional fallback if `Origin` header missing (e.g. `https://edgetilt.com`) |

**Migrations through `20260701160000_user_subscriptions_price_interval.sql`** (display names **`20260701150000`**, starter/lifetime **`20260701120000`**–**`140000`**) before interval UX works end-to-end. Full test → prod checklist: **`docs/stripe-billing-test-to-prod-handoff.md`**.



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



- **`get_my_entitlements()`** RPC → `{ "slots-edge-starter": { … }, "slots-edge": { … }, "slots-edge-lifetime": { … } }`

- **`SubscribeModal`** → Starter vs Full vs **Lifetime Founding Pass**; MSRP + founding prices; monthly/annual Full toggle

- Legacy **`profiles.has_active_subscription`** still updated for **active Full `slots-edge`** or **`slots-edge-lifetime`** (hamburger locks, chat subscriber rooms)



## Manual tier testing (without Stripe)



Still works via SQL on **`user_subscriptions`** or legacy flag — see **`docs/test-user-roles.md`**.


