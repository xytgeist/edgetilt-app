# Creator fan subscriptions (Connect + Checkout)

**Spec:** `docs/entitlements-matrix.md` §5.

## Edge functions

| Function | Auth | Body |
| --- | --- | --- |
| **`creator-fan-connect`** | User JWT | `{ "action": "onboard" \| "refresh" }` → onboarding `{ url }` or refresh `{ connect_onboarding_complete }` |
| **`creator-fan-checkout`** | User JWT | `{ "creator_user_id": "uuid" }` → `{ url }` Connect destination subscription checkout |

**Webhook:** `stripe-webhook` writes `creator_subscriptions` when subscription metadata includes `billing_kind: creator_fan_sub` (set by checkout).

## Stripe (test mode first)

Create **five monthly Prices** on the **platform** account (USD), one per tier. Map to Edge secrets:

| Tier key | MSRP | Edge secret |
| --- | --- | --- |
| `fan-tier-499` | $4.99/mo | `STRIPE_PRICE_FAN_TIER_499` |
| `fan-tier-999` | $9.99/mo | `STRIPE_PRICE_FAN_TIER_999` |
| `fan-tier-1999` | $19.99/mo | `STRIPE_PRICE_FAN_TIER_1999` |
| `fan-tier-4999` | $49.99/mo | `STRIPE_PRICE_FAN_TIER_4999` |
| `fan-tier-9999` | $99.99/mo | `STRIPE_PRICE_FAN_TIER_9999` |

Prices must be compatible with **Connect destination charges** (see Stripe Connect subs docs).

Also requires existing **`STRIPE_SECRET_KEY`** and **`STRIPE_WEBHOOK_SECRET`**.

## Database

Apply migration **`20260720180000_creator_fan_subs_foundation.sql`** on test before smoke.

## Client

Settings → **Fan subscriptions** (`CreatorFanMonetizationPanel`). Subscriber checkout API: `startCreatorFanCheckout` in `src/features/creatorFanSubs/creatorFanSubsApi.js` (profile **Support @handle** UI still TBD).
