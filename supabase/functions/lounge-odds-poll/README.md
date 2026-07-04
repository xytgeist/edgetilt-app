# lounge-odds-poll

Background odds poller for sports bots.

## Actions

| `action` | Behavior |
| --- | --- |
| `poll_edges` | Fetch each calendar-active sport today; publish **⚡ +EV** alerts when EV clears `min_edge_pct` (devig h2h). |
| `daily_slates` | Post **one Coffee & Covers thread** per bot/day (covers in root, best lines in thread parts per sport). Legacy slate check-ins when `coffee_covers_enabled = false`. |

### Coffee & Covers (morning cron)

`daily_slates` only publishes between **7:00am and 10:00am PT**. Each bot gets a **stable random minute** in that window per day (derived from `bot_user_id` + PT date) so posts do not land at the same time every morning.

Each post opens with **☕ Coffee & Covers 💵**. If no spread clears **+4%** EV, Scott opens with *"No strong covers today - sitting on hands until we see better value."* Then **BEST ML SPOTS RIGHT NOW** (+3% bar), **BIGGEST DOGS**, **🍺 ON TAP TOMORROW**, and **`Best lines 👇`**. Today's lines live in **thread parts** (one per calendar sport with games).

**Cron:** invoke every **15 minutes** from **7:00-9:59am PT** with service role:

```json
{ "slug": "sharpesignal", "action": "daily_slates" }
```

First tick after the bot's scheduled minute posts **one** combined thread (deduped via `coffee:daily:{ptDay}`).

**Portal:** **Post Coffee & Covers** sends `force: true` to bypass the time gate for manual smoke.

## Deploy

```bash
supabase functions deploy lounge-odds-poll --project-ref YOUR_PROJECT_REF
```

Requires **`THE_ODDS_API_KEY`** and migrations through **`20260704200000`**.
