# Lounge bot farm ingest (external worker door)

**Status:** **Code on `test` (Sep 2026)** … personas + Edge door. **No YouTube/X worker yet.** Ryan smoke: create a farm bot, set Edge secret, curl `dry_run`.

**Decision:** Keep **brains off the app**. EdgeTilt only owns nametags + publish. A separate worker will watch sources and call Grok later.

---

## Split

| Inside EdgeTilt (door) | Off the app (brain, later) |
| --- | --- |
| `lounge_bot_accounts` row, `pipeline=farm` | YouTube RSS / X API poll |
| Kill switch, caps, `is_bot` profile | Grok / voice prompts |
| Edge **`lounge-bot-ingest`** | Job list, retries, cursors |
| Portal **`/?tab=bots`** roster + Post as | |

Do **not** run 100 Grok agents inside Edge Functions. One worker POSTs finished copy.

---

## Pipeline

- **`farm`** … `review_mode=automatic`
- Create: Bot Portal wizard **Farm ingest (external worker)**
- Set **Running** before the door will accept posts
- No Poll now / Dry run in the portal (worker-owned)

## Door

`POST /functions/v1/lounge-bot-ingest`

Secret **`LOUNGE_BOT_FARM_INGEST_SECRET`**. README: **`supabase/functions/lounge-bot-ingest/README.md`**.

Uses existing **`publishLoungeBotPost`** (YouTube links unfurl like other bots). Optional **`dedupe_key`**. Caps from the persona row.

## Next (not this slice)

1. Set the secret on **test** Edge.
2. Create one farm persona, set **Running**.
3. Curl `dry_run` then a real caption.
4. Then a tiny worker (Brian YouTube recap **or** X filler), still off `src/`.

---

_Last updated: 2026-09-07._
