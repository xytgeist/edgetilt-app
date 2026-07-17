# `affiliate-connect`

Stripe Connect Express for creator affiliates.

## Actions (`POST` JSON, user JWT)

| Action | Who | Body | Result |
| --- | --- | --- | --- |
| `onboard` | Active affiliate | `{ "action": "onboard" }` | `{ url }` Account Link |
| `refresh` | Active affiliate | `{ "action": "refresh" }` | Syncs `connect_onboarding_complete` |
| `pay` | Admin | `{ "action": "pay", "commission_ids": ["…"] }` | Transfers for payable rows with completed Connect |

## Secrets

Reuses **`STRIPE_SECRET_KEY`**. Optional **`PUBLIC_APP_URL`** / **`APP_ORIGIN`** for Account Link return URLs (falls back to request `Origin` or `https://edgetilt.com`).

## Ops notes

- Platform must have Connect enabled in the Stripe Dashboard (test + live separately).
- Manual **Mark paid** in the admin UI remains the fallback when Connect is incomplete.
