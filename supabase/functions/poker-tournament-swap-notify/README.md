# `poker-tournament-swap-notify`

Creates a guest claim token (when email is present) and sends **Resend email** for a tournament swap. Guest email is optional on create ... notify is skipped when unset. **Guest SMS is disabled** (carrier TFV). The offer email greets the guest, lists the tournament, both swap percentages, and optional terms, then links to the public review/result page. Edge counterparties get in-app/push to Poker Bankroll.

Guest **HTML email** uses the same invitation structure as Poker Stable: EDGE logo header, white card, greeting + offer details, italic free-account prompt, cyan review CTA, and `EdgeTilt · edgetilt.com` footer. Logo defaults to `https://edgetilt.com/edge-email-header-dark.jpg` (override with `TRANSACTIONAL_EMAIL_LOGO_ORIGIN`).

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
