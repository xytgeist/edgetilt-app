# lounge-odds-poll

Background odds poller for sports bots.

## Actions

| `action` | Behavior |
| --- | --- |
| `poll_edges` | Fetch each calendar-active sport today; publish **⚡ +EV** alerts when EV clears `min_edge_pct` (devig h2h). Also **line movement**, **Arb Watch** (only when a **≥ 3%** cross-book arb exists), **Sharp Report Card** (meaningful sharp/steam/RLM move), **live in-game edge**, and **period/halftime reports** when enabled. |
| `daily_slates` | Post **one Coffee & Covers thread** per bot/day (covers in root, best lines in thread parts per sport). Legacy slate check-ins when `coffee_covers_enabled = false`. |
| `best_bet_hour` | Post **one Best Bet of the Hour** per bot per PT hour — strongest +EV across ML, spreads, and totals (min **4%** default). Tie-break NFL > NBA > MLB. |
| `value_bet_radar` | Post **2–3 strongest +EV plays** per PT half-hour during **8am–10pm PT** (min **3.5%** default). Sport variety when possible. Silent if fewer than 2 qualify. |

### Coffee & Covers (morning cron)

`daily_slates` only publishes between **6:00am and 8:00am PT** (random minute per bot/day). Each bot gets a **stable random minute** in that window per day (derived from `bot_user_id` + PT date) so posts do not land at the same time every morning.

Each post opens with **☕ Coffee & Covers 💵**. If no spread clears **+4%** EV, Scott opens with *"No strong covers today - sitting on hands until we see better value."* Then **- Best ML Spots Right Now -**, **- Dog of the Day -**, **- 🍺 On Tap Tomorrow -**, and **`Best lines 👇`**. Today's lines live in **thread parts** (one per calendar sport with games).

**Cron (pg_cron):** migrations **`20260704230000`** + **`20260704240000`**

| Job | Schedule (PDT / UTC-7) | `action` |
| --- | --- | --- |
| `lounge_odds_poll_daily_slates` | Every **5 min**, **6:00-7:59am PT** (`*/5 13-14 * * *`) | `daily_slates` |
| `lounge_odds_poll_edges` | Every **15 min**, **24/7** (`*/15 * * * *`) | `poll_edges` |
| `lounge_odds_poll_best_bet_hour` | **Minute 5** of every hour (`5 * * * *`) | `best_bet_hour` |
| `lounge_odds_poll_value_bet_radar` | **Minutes 5 and 35** every hour (`5,35 * * * *`) | `value_bet_radar` (Edge gates **8am–10pm PT**) |

**+EV posts:** no time-of-day gate ... only games **on today's PT calendar** that **have not started**. **Live posts** use in-progress games (scores API) with **+4%** default on ML/spreads/totals. **Best Bet of the Hour** includes unplayed + live games. Cron runs 24/7; Edge filters events.

Invokes **each** `odds_api` bot with `run_state = running` via **`invoke_lounge_odds_poll(action)`**.

**Vault (once per project):**

```sql
select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'lounge_odds_poll_project_url');
-- Random string (same value on Edge as LOUNGE_ODDS_POLL_CRON_SECRET) — migration 20260705090000
select vault.create_secret('YOUR_LONG_RANDOM_SECRET', 'lounge_odds_poll_cron_secret');
-- Project anon/publishable for pg_net gateway (eyJ anon OR sb_publishable_) — migration 20260705100000
-- Or reuse stream purge anon if already set:
select vault.create_secret('YOUR_ANON_OR_SB_PUBLISHABLE_KEY', 'lounge_odds_poll_supabase_anon_key');
```

Set Edge secret **`LOUNGE_ODDS_POLL_CRON_SECRET`** on **`lounge-odds-poll`** and **`lounge-bot-publish-due`** to the same random string. pg_net sends **`apikey`** (anon/publishable, **not** service role) plus header **`x-lounge-odds-poll-cron-secret`**. Service role in `Authorization: Bearer` caused **`Invalid or expired session`** on Edge.

**Smoke headers from SQL:**

```sql
select public.lounge_bot_odds_poll_pg_net_headers();
-- Expect apikey (anon/publishable) + x-lounge-odds-poll-cron-secret; no service_role Bearer.
```

**Portal manual runs** use your **admin session JWT** (sync Edge invoke), not pg_net.

**Verify:**

```sql
select * from cron.job where jobname like 'lounge_odds_poll_%';
select public.invoke_lounge_odds_poll('daily_slates');  -- manual smoke
```

First morning tick after the bot's scheduled random minute posts **one** combined thread (deduped via `coffee:daily:{ptDay}`).

**Portal:** **Post Coffee & Covers** sends `force: true` to bypass the time gate for manual smoke. **Best bet · hour** invokes `best_bet_hour` (respects PT-hour dedupe unless testing with a new hour bucket). **Value radar** invokes `value_bet_radar` with `force: true` to bypass the peak-hours gate for manual smoke.

**Freemium:** migration **`20260704260000`** — per-alert **All | Subs** in portal; **`subscriber_only`** on feed posts (RLS hides Subs posts from non-subscribers). **`value_bet_radar`** defaults to **All** in **`20260704300000`**.

## Deploy

```bash
supabase functions deploy lounge-odds-poll --project-ref YOUR_PROJECT_REF
supabase functions deploy lounge-odds-ingest --project-ref YOUR_PROJECT_REF
```

Requires **`THE_ODDS_API_KEY`**, optional **`THERUNDOWN_API_KEY`** for contextual captions, migrations through **`20260704310000`**, and Vault secrets above.

**Scheduled odds posts:** pg_cron **`lounge_bot_publish_scheduled_odds`** every minute drains **`lounge_bot_scheduled_posts`** via **`lounge-bot-publish-due`** (`publishScheduledOdds: true`).
