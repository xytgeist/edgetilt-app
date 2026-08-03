# `poker-stable-notify`

Sends **Twilio SMS** and/or **Resend email** to guest backers when a player creates a cash stake, edits stake terms, deletes a stake with guest slices, or **completes a stake session**.

Offer copy (email):

```
Chunky Unc (@chunkyunc) has created a stake on Edgetilt.com with you as the backer.

Name of stake: $10/20 Live Backing
Total stake: $100,000 (you own 100%)
Profit split: Backer 50% | Player 50%
Your exposure: $50,000

Create a free account at EdgeTilt.com to manage your stable and get real-time progress updates.
```

Session complete copy (`kind=session_complete`):

```
Chunky Unc (@chunkyunc) completed a stake session on Edgetilt.com.

Stake: $10/20 Live Backing
Session stakes: $2/5
Cash · Live · Bellagio · Sat, Aug 1, 2026
Table result: -$485
Stake impact: -$242
Your share (50%): -$121

Create a free account at EdgeTilt.com to manage your stable and get real-time progress updates.
```

Blank line after intro only; detail lines are single-spaced (`<br>` in HTML, not separate `<p>` tags).

HTML uses the shared branded shell (`_shared/transactionalEmail.ts`): EDGE logo header, white card, italic signup line (double-spaced after details), cyan **Create free account** button, and footer bar.

Terms edit copy (`kind=terms_edited`):

```
Chunky Unc (@chunkyunc) edited the terms of the stake on Edgetilt.com with you as the backer.

Before:
Name of stake: Testing
Total stake: $1,000 (you owned 50%)
Profit split: Backer 50% | Player 50%

After:
Name of stake: Testing
Total stake: $1,500 (you own 60%)
Profit split: Backer 40% | Player 60%
Your exposure: $900

Create a free account at EdgeTilt.com to manage your stable and get real-time progress updates.
```

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
{
  "deal_id": "<uuid>",
  "session_id": "<uuid>",
  "slice_ids": ["<optional slice uuid>"],
  "kind": "offer",
  "terms_edit": {
    "before": { "deal_label": "...", "baseline_bankroll": 1000, "slices": [] },
    "after": { "deal_label": "...", "baseline_bankroll": 1500, "slices": [] }
  }
}
```

`kind`: `offer` (default), `terms_edited` (requires `terms_edit.before` + `terms_edit.after`), `deleted`, `session_complete` (requires `session_id`; session must be `completed` and linked to `deal_id`), or **`guest_stakee_offer`** (backer created stake for a guest player; notifies `stakee_guest_email` / phone). For **`offer`** on guest backer slices, email/SMS includes a **`/poker-stable-claim?token=`** claim URL (minted in `poker_stable_guest_backer_claim_tokens`). For **deleted**, call **before** the deal row is removed so guest slice contact info is still readable. **Edit terms** uses `terms_edited` only (not `offer`). **Session complete** is invoked from Bankroll after End Session or Log session on a stake deal.

Caller must be the deal **stakee** for guest **backer** notify kinds, or the deal **lead staker** for **`guest_stakee_offer`**. JWT required.
