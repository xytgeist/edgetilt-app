# `poker-tournament-swap-notify`

Creates a guest claim token and sends **Twilio SMS** and/or **Resend email** for a tournament swap. Edge counterparties get a Poker Bankroll deep link (email/SMS when contact is available).

## Secrets

| Name | Required | Notes |
| --- | --- | --- |
| `RESEND_API_KEY` | for email | Same account as affiliate tax email |
| `RESEND_FROM` / `POKER_SWAP_EMAIL_FROM` | optional | From address |
| `TWILIO_ACCOUNT_SID` | for SMS | |
| `TWILIO_AUTH_TOKEN` | for SMS | |
| `TWILIO_FROM_NUMBER` | for SMS | E.164 |
| `PUBLIC_APP_URL` / `APP_ORIGIN` | optional | Claim link host (default `https://edgetilt.com`) |

On **test**, set `PUBLIC_APP_URL` to the test frontend origin so claim links hit the right host.

## Deploy (test)

```bash
supabase functions deploy poker-tournament-swap-notify --project-ref kcosfvmreeiosdjdzycb
```

## Body

```json
{ "swap_id": "<uuid>" }
```

Caller must be the swap creator (JWT).
