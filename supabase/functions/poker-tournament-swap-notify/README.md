# `poker-tournament-swap-notify`

Creates a guest claim token (only when phone/email is present) and sends **Twilio SMS** and/or **Resend email** for a tournament swap. Guest phone/email are optional on create ... notify is skipped when neither is set. Offer copy looks like: `{Display Name} swapping 5% - 5% with you in event: {Tournament} from EdgeTilt.com`. Edge counterparties get in-app/push to Poker Bankroll.

Guest **HTML email** uses the shared branded shell (`_shared/transactionalEmail.ts`): EDGE logo header, white card, cyan CTA (claim link), fallback URL block, and `EdgeTilt · edgetilt.com` footer. Logo defaults to `https://edgetilt.com/edge-email-header-dark.jpg` (override with `TRANSACTIONAL_EMAIL_LOGO_ORIGIN`).

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
| `PUBLIC_APP_URL` / `APP_ORIGIN` | optional | Claim link host. Default **`https://edgetilt.com`** on prod; on **test** (`kcosfvmreeiosdjdzycb`) defaults to **`https://lvslotpro.com`** when unset. Set explicitly to override. |

On **test**, claim links must land on **`lvslotpro.com`** so the SPA talks to the same Supabase project that stored the token hash.

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
