# Stripe billing — test → production handoff (2026-07-01 session)

**Purpose:** Single checklist for everything shipped or in progress on **test** Stripe billing today. Run test smoke first; promote to **production** only after Ryan signs off.

| Environment | Supabase project | Domain |
| --- | --- | --- |
| **Test** | `kcosfvmreeiosdjdzycb` | `lvslotpro.com` sandbox |
| **Production** | `jtjgtucumuoswnbauxry` | `edgetilt.com` |

**Canonical setup:** `supabase/functions/stripe-create-checkout-session/README.md`  
**Product rules:** `docs/access-tiers.md` §5  
**Tier testing SQL:** `docs/test-user-roles.md`

---

## Git state (as of 2026-07-01)

### Already on `origin/test`

| Commit | Summary |
| --- | --- |
| `abebab2` | In-place monthly ↔ annual billing switch (Edge + Subscribe modal); `price_interval` migration; webhook upsert; light-mode subscribe modal contrast |
| `38d1d53` | Light-mode guide lock + subscribe modal blues |
| `b8c4668` | Remove duplicate Upgrade pill on locked guides |
| `02419a7` | Slots Edge subscribe modal, tier renames, Starter → Pro upgrade billing |
| `c9ab249` | Subscribe plan picker + checkout interval/coupon support |

### Still uncommitted in working tree (commit before prod)

- **`BillingManageModal.jsx`** (new) — Settings → **Manage membership** (upgrade / interval switch / Stripe portal / compare plans)
- **`SubscribeModal.jsx`** — interval tab fixes: land on current tier card, assume monthly when `price_interval` null, allow Starter card interaction, Pro **Current** badge, `hasSlotsEdgePro` prop (not legacy access flag)
- **`edgeProducts.js`** — `hasSlotsEdgePro`, `resolvedEntitlementBillingInterval()`
- **`useEdgeEntitlements.js`** — exposes `hasSlotsEdgePro`, interval fields
- **`App.jsx`** — wires both modals; billing manage opens subscribe for free users
- **`AppShell.jsx`**, **`SocialFeed.jsx`**, **`LoungeDockSlidePanels.jsx`** — settings membership label + **Manage membership** button

---

## SQL migrations (apply in order on test, then prod)

After base **`20260526120000_edge_subscriptions.sql`**:

| Migration | What |
| --- | --- |
| `20260701120000_subscription_products_slots_edge_starter.sql` | `slots-edge-starter` product row |
| `20260701130000_starter_weekly_guide_unlocks.sql` | Starter weekly guide drop RPC/table |
| `20260701140000_subscription_products_slots_edge_lifetime.sql` | `slots-edge-lifetime` product row |
| `20260701150000_subscription_product_tier_display_names.sql` | Display names: **Slots Edge**, **Slots Edge Pro**, **Slots Edge Lifetime** |
| **`20260701160000_user_subscriptions_price_interval.sql`** | Column `user_subscriptions.price_interval`; **`get_my_entitlements()`** returns `price_interval` |

**Backfill note:** Existing rows have `price_interval = null` until the next Stripe webhook or an in-app interval change. UI **assumes monthly** when null so interval tabs lock correctly for typical monthly subs.

---

## Edge Functions (deploy on test, then prod)

Shared code: **`supabase/functions/_shared/billingDb.ts`** (stores `price_interval` from subscription metadata on upsert).

| Function | Auth | Role |
| --- | --- | --- |
| **`stripe-create-checkout-session`** | User JWT | New checkout; **Starter → Pro** upgrade (`upgraded: true`); **same plan, new interval** (`interval_changed: true`, no Checkout redirect) |
| **`stripe-create-portal-session`** | User JWT | Cancel at period end + payment method; deep-links **`subscription_cancel`** when user has Starter/Pro recurring sub |
| **`stripe-webhook`** | Stripe signature (`verify_jwt = false`) | Upserts **`user_subscriptions`**, syncs **`profiles.has_active_subscription`** for Full **`slots-edge`** |

### Deploy commands

**Test:**

```bash
supabase link --project-ref kcosfvmreeiosdjdzycb --yes
supabase functions deploy stripe-create-checkout-session
supabase functions deploy stripe-create-portal-session
supabase functions deploy stripe-webhook
```

**Production (only after test sign-off):**

```bash
supabase link --project-ref jtjgtucumuoswnbauxry --yes
supabase functions deploy stripe-create-checkout-session
supabase functions deploy stripe-create-portal-session
supabase functions deploy stripe-webhook
```

---

## Stripe Dashboard (separate test vs live)

Create **live** Products/Prices/Coupons mirroring test. Price IDs differ per mode — set **live** secrets on prod Supabase.

### Products / prices

| Plan | Slug | Billing |
| --- | --- | --- |
| Slots Edge | `slots-edge-starter` | $19.99/mo, $219.99/yr |
| Slots Edge Pro | `slots-edge` | $59.99/mo, $660/yr |
| Slots Edge Lifetime | `slots-edge-lifetime` | $1,699 one-time |

### Coupons (founding 25%)

| Secret | Stripe coupon |
| --- | --- |
| `STRIPE_COUPON_FOUNDING_MONTHLY` | 25% off, repeating 12 months (monthly Starter + Pro) |
| `STRIPE_COUPON_FOUNDING_ONCE` | 25% off once (annual Starter, annual Pro, Lifetime) |
| `STRIPE_COUPON_EARLY_BIRD` | Legacy alias for monthly founding coupon |

### Supabase Edge secrets (names)

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,  
`STRIPE_PRICE_SLOTS_EDGE_STARTER`, `STRIPE_PRICE_SLOTS_EDGE_STARTER_ANNUAL`,  
`STRIPE_PRICE_SLOTS_EDGE`, `STRIPE_PRICE_SLOTS_EDGE_ANNUAL`,  
`STRIPE_PRICE_SLOTS_EDGE_LIFETIME`,  
coupon ids above, optional `STRIPE_CHECKOUT_DEFAULT_ORIGIN` (`https://edgetilt.com` on prod).

### Webhook endpoint (per project)

`https://<project-ref>.supabase.co/functions/v1/stripe-webhook`

Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.

Enable **Customer Portal** in Stripe (test + live).

---

## Edge API behavior (today)

### `POST stripe-create-checkout-session`

Body: `{ "product_slug", "price_interval": "monthly"|"annual", "apply_early_bird": true }`

| Case | Response |
| --- | --- |
| New subscriber | `{ url }` → Stripe Checkout |
| Active **Starter** + checkout **Pro** | Stripe Checkout (`payment_method_collection: always`); webhook upserts Pro sub and **cancels** the Starter subscription |
| Active **Starter or Pro** + checkout **Lifetime** | Stripe Checkout one-time payment; webhook grants Lifetime and **cancels** active recurring subscription(s) |
| Active **Starter** or **Pro** + **different** interval | Updates sub in place → `{ interval_changed: true, url: success_url }` |
| Already on **Lifetime** | 400 |
| Same interval as current | 400 from interval change path |

Subscription metadata written on update: `supabase_user_id`, `product_slug`, `price_interval`, optional `upgraded_from`.

### `POST stripe-create-portal-session`

- Ensures a Customer Portal configuration with **subscription cancel** enabled (uses **`STRIPE_BILLING_PORTAL_CONFIGURATION_ID`** if set, else finds or creates one).
- If the user has an active **Starter** or **Pro** recurring subscription, opens portal **`flow_data`** directly on **cancel subscription** (at period end).
- **Lifetime** has no recurring sub ... use SQL revoke for test reset; portal button is hidden in **`BillingManageModal`** for lifetime holders.

### Client checkout

**`src/features/billing/stripeBillingApi.js`** — `startEdgeCheckout()`, `openBillingPortal()`, `fetchMyEntitlements()` via **`get_my_entitlements()`**.

Success / portal return: `/?billing=success` or `/?billing=portal` → App polls entitlements.

---

## Client UX (shipped + in progress)

### Subscribe modal (`SubscribeModal.jsx`)

- 3D carousel: **Slots Edge**, **Slots Edge Pro**, **Slots Edge Lifetime**
- Monthly / annual tabs per subscription tier
- **Existing monthly sub:** current tier card, **Annual selected**, **Monthly disabled** (and reverse for annual)
- **Starter monthly user:** opens **Slots Edge** card (not Pro)
- Checkout label: **Switch to annual/monthly billing** when changing cadence on current plan
- Staff bypass: modals use **RPC entitlements only** (not `isStaff` gate flags)

### Manage membership (`BillingManageModal.jsx`) — uncommitted

- **Settings → Membership → Manage membership** (paid) or **View Edge AP Slots plans** (free)
- Shows plan name, interval, renewal / cancel-at-period-end
- Actions: switch interval, upgrade Starter → Pro, **Cancel or update payment in Stripe**, compare all plans

### Settings membership badge

- **Slots Edge** / **Slots Edge Pro** / **Lifetime** / **Free** (not generic “Subscriber” only)

---

## Test smoke (before prod)

- [ ] Migrations through **`20260701160000`** applied on test
- [ ] All three Stripe Edge functions deployed on test
- [ ] Stripe **test** webhook delivering to test project
- [ ] Free user: Subscribe modal → Starter monthly checkout completes
- [ ] Starter monthly: modal shows **Annual** selected, Monthly disabled; **Switch to annual** works (`interval_changed`)
- [ ] Starter → Pro upgrade from Pro card
- [ ] Pro monthly: same interval tab behavior on Pro card
- [ ] Settings → **Manage membership** opens; portal link works
- [ ] Lifetime one-time checkout (if enabled on test)
- [ ] `get_my_entitlements()` returns `price_interval` after webhook or interval change
- [ ] Light mode: subscribe modal + guide lock blues readable

---

## Production promotion order

1. Merge / deploy **frontend** to prod hosting (`edgetilt.com`).
2. Apply SQL migrations **`20260701120000`** through **`20260701160000`** on **`jtjgtucumuoswnbauxry`** (SQL editor or `supabase db push` — match your usual prod process).
3. Create **live** Stripe products, prices, coupons; set **live** Edge secrets on prod Supabase.
4. Register **live** webhook → prod `stripe-webhook` URL; copy **`STRIPE_WEBHOOK_SECRET`** to prod secrets.
5. Deploy Edge functions on **`jtjgtucumuoswnbauxry`** (commands above).
6. Run prod smoke subset (one real checkout in live mode if Ryan approves, or staff test account).
7. Update **`docs/test-buildout-backlog.md`** Update log + **`docs/production-rollout-checklist.md`** checkboxes when done.

**Do not** run guide ingest or other prod DB scripts in the same window unless explicitly planned.

---

## Out of scope / not built yet

- **Downgrade Pro → Starter** (no Stripe path; cancel + resubscribe only)
- Automatic **backfill** of `price_interval` for all existing subs (webhook on next Stripe event, or one-off script if needed)
- **`stripe-create-portal-session`** redeploy after portal cancel / configuration changes (see **`supabase/functions/stripe-create-portal-session/README.md`**)

---

## Update log

- **2026-07-01:** Handoff doc created from Cursor session (interval switch, `price_interval`, Subscribe modal tab UX, Billing manage screen, settings entry).
- **2026-07-01:** Starter → Pro goes through **Stripe Checkout** (not silent in-place upgrade); webhook cancels replaced Starter sub after checkout completes.
