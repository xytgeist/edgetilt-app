# Stripe billing — test → production handoff (2026-07-01)

**Purpose:** Single checklist for Stripe billing shipped on **`origin/test`**. Run test smoke first; promote to **production** only after Ryan signs off.

| Environment | Supabase project | Domain |
| --- | --- | --- |
| **Test** | `kcosfvmreeiosdjdzycb` | `lvslotpro.com` sandbox |
| **Production** | `jtjgtucumuoswnbauxry` | `edgetilt.com` |

**Canonical setup:** `supabase/functions/stripe-create-checkout-session/README.md`  
**Portal:** `supabase/functions/stripe-create-portal-session/README.md`  
**Product rules:** `docs/access-tiers.md` §5  
**Tier testing / revoke SQL:** `docs/test-user-roles.md`  
**Prod mirror checklist:** `docs/production-rollout-checklist.md` §2 + §4

---

## Git state (`origin/test` as of 2026-07-01)

All billing work below is **committed and pushed** to **`origin/test`**.

| Commit | Summary |
| --- | --- |
| `c9ab249` | Subscribe plan picker + checkout interval/coupon support |
| `02419a7` | Subscribe modal, tier renames, early Starter → Pro billing |
| `abebab2` | In-place annual ↔ monthly switch; `price_interval` migration; interval tab lock UX |
| `3140616` | **BillingManageModal** + subscribe interval tab fixes; App hooks fix |
| `884d2a4` | Fix duplicate `stripe_subscription_id` on Starter → Pro upgrade |
| `daf383d` | Clear conflicting subscription rows before Pro upsert |
| `311829c` | **Starter → Pro via Stripe Checkout**; webhook cancels replaced Starter sub |
| `9b0a8ff` | Portal **subscription_cancel** deep-link + DELETE-based test revoke script |
| `b3c84a8` | Pending cancel date in manage modal; hide portal btn when cancel scheduled |
| `904075e` | **Monthly → annual via Stripe Checkout** (Starter + Pro) |
| `dd780c8` | Lifetime checkout fix (no `payment_method_collection` on `mode: payment`) |
| `a5427cd` | Light mode: Settings account + manage membership contrast |
| `3949da2` | Subscribe modal tagline; smaller in-app toasts (shared layout constants) |
| `6680e25` | Settings legal link spacing (cosmetic) |

**Frontend deploy:** merge or promote **`test` → `main`** (or your Vercel production branch) so **`edgetilt.com`** serves this bundle.

---

## What we built (behavior summary)

### Products (DB slugs)

| Display name | Slug | Stripe |
| --- | --- | --- |
| Slots Edge | `slots-edge-starter` | $19.99/mo, $219.99/yr |
| Slots Edge Pro | `slots-edge` | $59.99/mo, $660/yr |
| Slots Edge Lifetime | `slots-edge-lifetime` | $1,699 one-time |

Entitlements: **`get_my_entitlements()`** → `{ active, status, current_period_end, cancel_at_period_end, price_interval }` per slug.

### Checkout flows (`stripe-create-checkout-session`)

| User action | Stripe path |
| --- | --- |
| New subscriber | Checkout → webhook upsert |
| **Starter → Pro** | Checkout (`payment_method_collection: always`); metadata `replaces_stripe_subscription_id`; webhook cancels Starter |
| **Monthly → annual** (same tier) | Checkout + replace old monthly sub (same as tier upgrade pattern) |
| **Annual → monthly** (same tier) | In-place subscription update → `{ interval_changed: true }` (no Checkout redirect) |
| **→ Lifetime** | Checkout `mode: payment`; webhook grants lifetime + cancels recurring subs |
| Already on Lifetime | 400 |

### Portal (`stripe-create-portal-session`)

- Ensures portal config with **cancel at period end** (or uses **`STRIPE_BILLING_PORTAL_CONFIGURATION_ID`**).
- Opens **Customer Portal** home (subscription summary, cancel, payment method, invoices); return URL polls entitlements on `/?billing=portal`.
- **Manage membership** hides portal button when `cancel_at_period_end` is already set; shows **Access until [date]** block.

### Client surfaces

- **Subscribe modal** — 3-tier carousel, interval tabs, founding pricing, tagline under headline.
- **Settings → Account → Membership** — badge + **Manage membership** (or **View plans** if free).
- **BillingManageModal** — switch interval, upgrade, portal, compare plans; refresh entitlements on open.
- **Return URLs** — `/?billing=success` or `/?billing=portal` → App polls entitlements (portal polls longer than success early-exit).

---

## Bugs fixed during test (do not regress)

| Issue | Fix |
| --- | --- |
| App crash opening manage membership (hooks after early return) | Moved `openBillingManageModal` callback above early returns in **`App.jsx`** |
| Starter → Pro: duplicate key on `stripe_subscription_id` | Upsert by sub id + clear stale/conflicting rows in **`billingDb.ts`** |
| Starter → Pro charged silently without Checkout | Route through Checkout + webhook cancel old sub |
| Portal opened with no cancel option | Portal config + `flow_data.type = subscription_cancel` |
| Cancel not shown in manage modal after portal | Poll entitlements on portal return; refresh on modal open; cancel UI block |
| Monthly → annual changed without Checkout | Route monthly → annual through Checkout (annual → monthly still in-place) |
| Lifetime checkout error: `payment_method_collection` on payment mode | Removed that param for `mode: payment` |
| Light mode: washed-out membership buttons / legal links | Scoped **`html.light [data-settings-account]`** + **`[data-billing-manage-modal]`** |
| Test reset left canceled rows / unique key noise | **`revoke_slots_edge_subscription_by_handle.sql`** now **DELETE** rows |

---

## SQL migrations (apply in order)

After base **`20260526120000_edge_subscriptions.sql`** (if not already on target project):

| Migration | What |
| --- | --- |
| `20260701120000_subscription_products_slots_edge_starter.sql` | `slots-edge-starter` product row |
| `20260701130000_starter_weekly_guide_unlocks.sql` | Starter weekly guide drop RPC/table |
| `20260701140000_subscription_products_slots_edge_lifetime.sql` | `slots-edge-lifetime` product row |
| `20260701150000_subscription_product_tier_display_names.sql` | Display names Slots Edge / Pro / Lifetime |
| **`20260701160000_user_subscriptions_price_interval.sql`** | `price_interval` column; **`get_my_entitlements()`** extended |

**Backfill:** existing subs have `price_interval = null` until webhook or interval change. UI **assumes monthly** when null.

**Test reset (test only):** `supabase/scripts/revoke_slots_edge_subscription_by_handle.sql` — also cancel subs in Stripe if testing webhook cancel.

---

## Edge Functions (deploy all three together)

Shared: **`supabase/functions/_shared/billingDb.ts`**

```bash
# Test
supabase link --project-ref kcosfvmreeiosdjdzycb --yes
supabase functions deploy stripe-create-checkout-session
supabase functions deploy stripe-create-portal-session
supabase functions deploy stripe-webhook

# Production (after test sign-off)
supabase link --project-ref jtjgtucumuoswnbauxry --yes
supabase functions deploy stripe-create-checkout-session
supabase functions deploy stripe-create-portal-session
supabase functions deploy stripe-webhook
```

**`stripe-webhook`** must have **`verify_jwt = false`** in Supabase dashboard (Stripe signature only).

---

## Stripe Dashboard (separate test vs live)

Mirror **test** catalog in **live** mode. Price IDs differ — set **live** values on prod Supabase secrets.

### Coupons (founding 25%)

| Secret | Stripe coupon |
| --- | --- |
| `STRIPE_COUPON_FOUNDING_MONTHLY` | 25% off, repeating 12 months |
| `STRIPE_COUPON_FOUNDING_ONCE` | 25% off once (annual + Lifetime) |
| `STRIPE_COUPON_EARLY_BIRD` | Legacy alias for monthly founding |

### Supabase Edge secrets (names)

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,  
`STRIPE_PRICE_SLOTS_EDGE_STARTER`, `STRIPE_PRICE_SLOTS_EDGE_STARTER_ANNUAL`,  
`STRIPE_PRICE_SLOTS_EDGE`, `STRIPE_PRICE_SLOTS_EDGE_ANNUAL`,  
`STRIPE_PRICE_SLOTS_EDGE_LIFETIME`,  
coupon ids above,  
optional `STRIPE_CHECKOUT_DEFAULT_ORIGIN` (**`https://edgetilt.com`** on prod),  
optional `STRIPE_BILLING_PORTAL_CONFIGURATION_ID` (`bpc_…`).

### Webhook (per project)

`https://<project-ref>.supabase.co/functions/v1/stripe-webhook`

Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.

Enable **Customer Portal** in Stripe (test + live).

---

## Test smoke (complete before prod)

Apply migrations through **`20260701160000`** on test, deploy all three Edge functions, confirm test webhook delivering.

- [ ] Free user → Subscribe → **Starter monthly** Checkout completes; entitlements update
- [ ] **Starter monthly** → switch to **annual** opens **Stripe Checkout** (not silent); lands on annual after webhook
- [ ] **Starter → Pro** opens Checkout; Starter sub canceled in Stripe; only Pro row in DB
- [ ] **Pro monthly → annual** same Checkout replace pattern
- [ ] **Pro annual → monthly** in-place (`interval_changed`); no Checkout redirect
- [ ] **→ Lifetime** Checkout completes (no `payment_method_collection` error); recurring subs canceled
- [ ] **Manage membership** → portal cancel → **Access until [date]** shown; portal button hidden while pending cancel
- [ ] `get_my_entitlements()` returns `price_interval` after checkout / webhook
- [ ] Light mode: subscribe modal, manage membership, settings membership readable
- [ ] Billing return: `/?billing=success` and `/?billing=portal` refresh entitlements

Use **`@smokewagon`** (or test account) + **`revoke_slots_edge_subscription_by_handle.sql`** between runs.

---

## Production promotion — step by step (Ryan walkthrough)

Do these **in order**. Pause after each phase if anything fails on test replay first.

### Phase 0 — Preconditions

1. Confirm **`origin/test`** smoke above is signed off (or repeat on test before touching prod).
2. Confirm Vercel **production** env vars point at **`jtjgtucumuoswnbauxry`** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
3. **Backup:** if any real prod subscribers exist, snapshot `user_subscriptions` / `profiles` before migration (unlikely on day one, but safe).

### Phase 1 — Frontend

4. Merge **`test` → `main`** (or your prod branch) and deploy **`edgetilt.com`**.
5. Hard refresh / PWA reload after deploy.

### Phase 2 — Production database

6. Supabase Dashboard → **`jtjgtucumuoswnbauxry`** → SQL Editor.
7. Apply migrations **`20260701120000`** through **`20260701160000`** in order (skip any already applied).
8. Verify:

```sql
select slug, display_name, active from public.subscription_products order by slug;
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'user_subscriptions' and column_name = 'price_interval';
```

### Phase 3 — Stripe live mode

9. Stripe Dashboard → **live** mode: create Products/Prices matching test catalog.
10. Create live founding coupons; copy coupon IDs.
11. Enable Customer Portal (cancel at period end); optional: copy **`bpc_…`** to **`STRIPE_BILLING_PORTAL_CONFIGURATION_ID`** on prod.

### Phase 4 — Supabase prod secrets + webhook

12. Project **`jtjgtucumuoswnbauxry`** → Edge Functions → Secrets: set all **`STRIPE_*`** names with **live** values.
13. Set **`STRIPE_CHECKOUT_DEFAULT_ORIGIN`** = `https://edgetilt.com`.
14. Add live webhook endpoint → prod `stripe-webhook` URL; copy signing secret → **`STRIPE_WEBHOOK_SECRET`**.

### Phase 5 — Deploy Edge on production

15. Run prod deploy commands (three functions) from repo root.
16. Confirm webhook shows successful test event in Stripe (optional: Stripe CLI or dashboard “Send test webhook”).

### Phase 6 — Production smoke (minimal)

17. Staff/test account on **live** (Ryan explicit approval for real charge):
    - One **Starter monthly** checkout OR use test clock if configured
    - **Manage membership** → portal cancel shows date (do not leave orphan live subs if aborting)
18. Confirm **`get_my_entitlements()`** in SQL editor as that user (via impersonation or client network tab).
19. Update **`docs/test-buildout-backlog.md`** Update log + **`docs/production-rollout-checklist.md`** when signed off.

**Do not** in the same window: guide ingest to prod, batch AP payloads, or `npm run slots:sync:*` against production unless explicitly planned.

---

## Out of scope / not built

- **Downgrade Pro → Starter** (cancel + resubscribe only)
- Automatic **`price_interval` backfill** for all legacy subs (waits on next Stripe event)
- **Pro → Starter** or tier downgrade in Stripe without cancel

---

## Update log

- **2026-07-01:** Handoff doc created (interval switch, manage membership, settings entry).
- **2026-07-01:** Starter → Pro + monthly → annual via Checkout; portal cancel; Lifetime payment mode fix; manage cancel UX; light mode; tagline.
- **2026-07-01:** Full prod walkthrough + bug-fix table; all commits through **`6680e25`** on **`origin/test`**.
- **2026-07-01:** **Production sign-off (Ryan):** prod SQL **`20260701120000`**–**`160000`**, live Stripe catalog + webhook, Edge deploy on **`jtjgtucumuoswnbauxry`**, minimal smoke **PASSED** (Starter monthly Checkout + founding coupon). Live founding monthly coupon **`QnYlzKuK`** (replaces misconfigured **`9kzEJI5c`** one-month duration). Prod auth SMTP fixed separately (**`noreply@auth.edgetilt.com`**).
- **2026-07-02:** Portal session opens **Customer Portal home** (not **`subscription_cancel`** deep-link); redeploy **`stripe-create-portal-session`** on test + prod.
