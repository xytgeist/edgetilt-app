# Creator affiliates (decision record + implementation)

**Status:** In-house thin v1 **implemented on test** (migration `20260711120000_creator_affiliates.sql`). No third-party affiliate SaaS.  
**Related:** `docs/access-tiers.md`, `docs/stripe-billing-test-to-prod-handoff.md`, `supabase/functions/stripe-create-checkout-session/`, `supabase/functions/stripe-webhook/`, `supabase/functions/affiliate-connect/`, `src/features/affiliates/`.

Goal: curated X/creator affiliates with tiered commissions, unique links + discount codes, admin ledger, creator portal (stats + tax), optional Stripe Connect autopay … without paying ~$1k+/yr for tracking tools we can own.

---

## 1. Locked product rules

### Packages (creator tiers)

| Package | Typical creator | Monthly subscription | Annual / lifetime |
| --- | --- | --- | --- |
| **Creator** | lower-end | **20%** of each paid invoice (recurring) | **20%** of that one payment |
| **Mid** | mid-level | **25%** recurring | **25%** one-time on that payment |
| **Elite** | high-end | **30%** recurring | **30%** one-time on that payment |

- Commission on **net collected after buyer discount** (Stripe amount paid), not sticker.
- Monthly: every successful paid renewal invoice while sub active (`invoice.paid` with `billing_reason` other than `subscription_create`).
- First payment: `checkout.session.completed` (session-id dedupe). Annual / lifetime: one commission on that payment.

### Buyer discount (creator promo)

- Real Stripe coupon / promotion code per creator.
- **10% off the first payment only** (configure coupon as once / first invoice in Stripe Dashboard).
- Founding / sitewide promos: **mutually exclusive** with creator codes (Checkout skips founding when `affiliate_code` is present).

### Attribution

- Link: `edgetilt.com/?ref=CODE` **and** promo e.g. `SCOTT20` (1:1 map on `affiliates`).
- `?ref=` stamps affiliate in localStorage (`edge_affiliate_ref_v1`) for **30 days** and Checkout sends `affiliate_code`.
- **No stacking** creator promos / refs with founding.
- First-party localStorage. **No CMP banner for v1.**

### Holds, refunds, abuse

- Status: `pending` → `payable` → `paid` / `void`.
- Hold **45 days** (`affiliate_hold_days()`); promote via `affiliate_promote_payable_commissions()` (admin snapshot + webhook).
- Refund / dispute → void `pending`/`payable`; flag `clawback_flag` if already `paid`.
- **Self-referral banned** (same `user_id` or matching `contact_email`).

### Payouts + tax

- **v1 payouts:** admin **Mark paid** (+ optional payout ref) from `/?tab=affiliates`.
- **Connect (phase 2, shipped in same epic):** creator onboards Express via `affiliate-connect`; admin **Pay via Connect** transfers payable rows.
- **Tax:** Creator portal collects profile fields + typed signature / perjury cert → generates a **substitute W-9/W-8 PDF** (`affiliateTaxPdf.js`) into private Storage `affiliate-tax-docs`. Full TIN is written to the PDF only; DB stores **TIN last 4** + optional **FTIN Not Legally Required**. Optional manual upload still overrides generate. Year-end CSV / accountant or Tax1099 … **no IRS e-file in-app**.

---

## 2. Architecture (what shipped)

1. Tables + RLS + RPCs (`20260711120000_creator_affiliates.sql`)
2. Client `?ref=` stamp → Checkout `affiliate_code`
3. Checkout applies Stripe `promotion_code`, writes metadata, skips founding
4. Webhook ledger (`checkout.session.completed`, `invoice.paid` renewals, refund/dispute void)
5. Admin UI `/?tab=affiliates` (admin)
6. Creator portal `/?tab=creator` (active linked affiliate)
7. Connect Express Edge function `affiliate-connect`

**Do not build yet**
- Fancy marketing / public apply funnel
- Multi-touch attribution
- Full 1099 e-file transmitter

**Vendor graveyard**  
Rewardful / Tolt / FirstPromoter / Tapfiliate … wrong economics for a few creators.

---

## 3. Data model

### `affiliate_packages`
Seeded: `creator` 20%, `mid` 25%, `elite` 30%.

### `affiliates`
`code`, `promo_code`, `stripe_coupon_id`, `stripe_promotion_code_id`, `package_id`, `display_name`, `contact_email`, `user_id`, `status`, `payout_notes`, `stripe_connect_account_id`, `connect_onboarding_complete`.

### `affiliate_attributions`
Per checkout stamp when Checkout runs with affiliate.

### `affiliate_commissions`
Dedupe on invoice / session / payment_intent unique indexes.

### `affiliate_tax_profiles`
W-9/W-8 fields + `tin_last4` + `ftin_not_legally_required` + `signature_name` + `document_path` (generated or uploaded) under Storage. Migration **`20260711150000_affiliate_tax_generate_pdf.sql`**.

---

## 4. App + Stripe flow

### Client
- [`affiliateRefApi.js`](../src/features/affiliates/affiliateRefApi.js) + boot in `App.jsx`
- Email signup / Google OAuth redirects include `?ref=` from the stamp so confirm links opened outside the signup browser (e.g. incognito → normal tab) still restamp. Signup also stores `affiliate_code` on user metadata as a backup.
- [`stripeBillingApi.js`](../src/features/billing/stripeBillingApi.js) passes `affiliate_code`
- Subscribe / Billing manage modals include stamp

### Checkout (`stripe-create-checkout-session`)
- Resolve active affiliate; reject self-ref; require `stripe_promotion_code_id`
- `discounts: [{ promotion_code }]` **or** founding coupon (not both) when the creator promo applies
- If the Stripe customer has **prior transactions** (or promo redeem fails as ineligible), **skip the creator promo** and still open Checkout (founding may apply). Affiliate metadata stays for attribution. Never hard-block signup on promo eligibility.
- Metadata: `affiliate_id`, `affiliate_code` on session + subscription

### Webhook (`stripe-webhook`)
| Event | Action |
| --- | --- |
| `checkout.session.completed` | Insert `pending` commission from session amounts |
| `invoice.paid` | Renewals only (skip `subscription_create`) |
| `charge.refunded` / `charge.dispute.created` | Void or clawback flag |

### Admin
- `/?tab=affiliates` … CRUD-lite, Mark paid, CSV, Pay via Connect
- Link creators by **profile handle** (resolved to `user_id` in `admin_affiliate_upsert`); UUID optional/legacy

### Creator
- `/?tab=creator` … link, promo, totals, tax form, Connect onboarding

### Stripe Dashboard (test) ops
1. Create coupon: **10% once** (duration once / first payment).
2. Create promotion code per creator; copy `promo_…` id into affiliate row.
3. Enable **Connect** on the Stripe account before using Express onboarding.

---

## 5. RPCs

| RPC | Who |
| --- | --- |
| `resolve_affiliate_ref(code)` | anon + authenticated |
| `admin_affiliate_portal_snapshot` | admin |
| `admin_affiliate_upsert` | admin |
| `admin_affiliate_mark_commissions_paid` | admin |
| `get_my_affiliate_portal` | linked affiliate |
| `upsert_my_affiliate_tax_profile` | linked affiliate |
| `i_am_active_affiliate` | authenticated |
| `affiliate_promote_payable_commissions` | authenticated + service_role |

---

## 6. Test smoke

1. Apply migration on **test**; redeploy `stripe-create-checkout-session`, `stripe-webhook`, `affiliate-connect`.
2. Admin creates affiliate `scott`, package, paste `stripe_promotion_code_id`, status `active`, link `user_id`.
3. Incognito `/?ref=scott` → Subscribe → Checkout shows creator 10% (not founding stack).
4. Complete payment → commission `pending` with correct net %.
5. Refund → `void`.
6. Admin Mark paid or Pay via Connect; creator portal shows totals; complete tax form (Generate PDF & save with typed signature).
7. Self-ref as affiliate user → blocked.

**Production:** do not apply SQL / deploy Edge / create live promos until Ryan explicitly promotes.

---

## Update log

- **2026-07-16:** Product rules locked; reject Rewardful/Tolt for small creator set.
- **2026-07-17:** Tax form UI: FTIN Not Legally Required sits next to Full TIN; last 4 derived from full TIN (no separate field).
- **2026-07-16:** Tax generate PDF: substitute W-9/W-8 from portal fields + typed signature; TIN last 4 label; FTIN Not Legally Required; migration `20260711150000`.
- **2026-07-16:** Implementation: schema/RLS, `?ref=` + Checkout, webhook ledger, admin + creator portals, Connect Express Edge, tax collect (no e-file).
