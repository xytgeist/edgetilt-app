# lounge-bot-ingest

External **farm** worker door. The worker watches YouTube / X / whatever, calls Grok, then POSTs a finished caption. EdgeTilt publishes as that lounge persona.

Does **not** poll sources. Does **not** call Grok.

## Auth

Edge secret **`LOUNGE_BOT_FARM_INGEST_SECRET`**.

```http
Authorization: Bearer <secret>
```

or header **`x-lounge-bot-farm-secret: <secret>`**.

Set on **test** (`kcosfvmreeiosdjdzycb`) before smoke. Prod only when Ryan asks.

## Body

```json
{
  "slug": "farm-persona",
  "caption": "Finished lounge copy.",
  "source_url": "https://www.youtube.com/watch?v=…",
  "category_pills": ["investing", "trading"],
  "dedupe_key": "youtube:VIDEO_ID",
  "dry_run": false
}
```

Optional **`image_urls`** (max 6). **`dedupe_key`** skips a second publish of the same item (`200` + `skipped: already_published`).

Persona must be **`pipeline=farm`** and **`run_state=running`**. Hourly/daily caps on `lounge_bot_accounts` apply (null = no limit).

## Portal

Create via **`/?tab=bots`** → **Farm ingest (external worker)**. Enable + Running. No Poll now. Manual **Post as** still works for staff.

## Curl (test)

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/lounge-bot-ingest" \
  -H "Authorization: Bearer $LOUNGE_BOT_FARM_INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"slug":"farm-persona","caption":"Door smoke.","dry_run":true}'
```
