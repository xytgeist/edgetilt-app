# creator-fan-resume-subscription

User JWT. Clears **`cancel_at_period_end`** on the signed-in user's active **`creator_subscriptions`** row for one creator (Stripe **`subscriptions.update`**, then DB sync).

**Body:** `{ "creator_user_id": "uuid" }`

**Response:** `{ "ok": true }` or `{ "error": "..." }`

Deploy to test before **Resume subscription** works in the fan subscribe modal.
