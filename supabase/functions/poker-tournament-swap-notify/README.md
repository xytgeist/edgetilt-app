# `poker-tournament-swap-notify`

Creates a guest claim token and sends **Twilio SMS** and/or **Resend email** for a tournament swap. Edge counterparties get a Poker Bankroll deep link (email/SMS when contact is available).

## Secrets

| Name | Required | Notes |
| --- | --- | --- |
| `RESEND_API_KEY` | for email | Same account as affiliate tax email |
| `RESEND_FROM` / `POKER_SWAP_EMAIL_FROM` | optional | From address |
| `TWILIO_ACCOUNT_SID` | for SMS | Account SID (still used in the Messages API URL) |
| `TWILIO_API_KEY_SID` | for SMS | Preferred … Console → Account → API keys & tokens |
| `TWILIO_API_KEY_SECRET` | for SMS | Shown once when the key is created |
| `TWILIO_FROM_NUMBER` | for SMS | E.164 Twilio number |
| `TWILIO_AUTH_TOKEN` | optional | Legacy fallback if API key not set |
| `PUBLIC_APP_URL` / `APP_ORIGIN` | optional | Claim link host (default `https://edgetilt.com`) |

On **test**, set `PUBLIC_APP_URL` to the test frontend origin so claim links hit the right host.

Create a **Standard** API key in Twilio (not the Auth Token). Basic auth is `API_KEY_SID:API_KEY_SECRET`; Account SID stays in the request path.

## Deploy (test)

```bash
supabase functions deploy poker-tournament-swap-notify --project-ref kcosfvmreeiosdjdzycb
```

## Body

```json
{ "swap_id": "<uuid>" }
```

Caller must be the swap creator (JWT).
