# `poker-stable-notify`

Sends **Twilio SMS** and/or **Resend email** to guest backers when a player creates or updates a cash stake with guest slices.

Offer copy looks like: `{Display Name} has you on a 10% cash stake ($100,000 baseline) from EdgeTilt.com` plus pricing terms.

## Secrets

Same as **`poker-tournament-swap-notify`** (shared Resend + Twilio transactional line):

| Name | Required | Notes |
| --- | --- | --- |
| `RESEND_API_KEY` | for email | |
| `RESEND_FROM` / `POKER_SWAP_EMAIL_FROM` | optional | From address |
| `TWILIO_*` | for SMS | Account SID, API key or auth token, From number |
| `PUBLIC_APP_URL` / `APP_ORIGIN` | optional | Link in body (default `https://edgetilt.com`) |

On **test**, set `PUBLIC_APP_URL` to the test frontend origin.

## Deploy (test)

```bash
supabase functions deploy poker-stable-notify --project-ref kcosfvmreeiosdjdzycb
```

## Body

```json
{ "deal_id": "<uuid>", "slice_ids": ["<optional slice uuid>"] }
```

Caller must be the deal **stakee** (player who created the stake). JWT required.
