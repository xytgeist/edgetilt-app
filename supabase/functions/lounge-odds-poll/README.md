# lounge-odds-poll

Background odds poller for sports bots.

## Actions

| `action` | Behavior |
| --- | --- |
| `poll_edges` | Fetch each calendar-active sport today; publish **⚡ +EV** alerts when EV clears `min_edge_pct` (devig h2h). Also **line movement**, **live in-game edge**, and **period/halftime reports** when enabled. |
| `daily_slates` | Post **one Coffee & Covers thread** per bot/day (covers in root, best lines in thread parts per sport). Legacy slate check-ins when `coffee_covers_enabled = false`. |

### Coffee & Covers (morning cron)

`daily_slates` only publishes between **6:00am and 8:00am PT** (random minute per bot/day). Each bot gets a **stable random minute** in that window per day (derived from `bot_user_id` + PT date) so posts do not land at the same time every morning.

Each post opens with **☕ Coffee & Covers 💵**. If no spread clears **+4%** EV, Scott opens with *"No strong covers today - sitting on hands until we see better value."* Then **- Best ML Spots Right Now -**, **- Dog of the Day -**, **- 🍺 On Tap Tomorrow -**, and **`Best lines 👇`**. Today's lines live in **thread parts** (one per calendar sport with games).

**Cron (pg_cron):** migrations **`20260704230000`** + **`20260704240000`**

| Job | Schedule (PDT / UTC-7) | `action` |
| --- | --- | --- |
| `lounge_odds_poll_daily_slates` | Every **5 min**, **6:00-7:59am PT** (`*/5 13-14 * * *`) | `daily_slates` |
| `lounge_odds_poll_edges` | Every **15 min**, **24/7** (`*/15 * * * *`) | `poll_edges` |

**+EV posts:** no time-of-day gate ... only games **on today's PT calendar** that **have not started**. **Live posts** use in-progress games (scores API) with **+4%** default on ML/spreads/totals. Cron runs 24/7; Edge filters events.

Invokes **each** `odds_api` bot with `run_state = running` via **`invoke_lounge_odds_poll(action)`**.

**Vault (once per project):**

```sql
select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'lounge_odds_poll_project_url');
select vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'lounge_odds_poll_service_role_key');
```

**Verify:**

```sql
select * from cron.job where jobname like 'lounge_odds_poll_%';
select public.invoke_lounge_odds_poll('daily_slates');  -- manual smoke
```

First morning tick after the bot's scheduled random minute posts **one** combined thread (deduped via `coffee:daily:{ptDay}`).

**Portal:** **Post Coffee & Covers** sends `force: true` to bypass the time gate for manual smoke.

**Freemium:** migration **`20260704260000`** — per-alert **All | Subs** in portal; **`subscriber_only`** on feed posts (RLS hides Subs posts from non-subscribers).

## Deploy

```bash
supabase functions deploy lounge-odds-poll --project-ref YOUR_PROJECT_REF
supabase functions deploy lounge-odds-ingest --project-ref YOUR_PROJECT_REF
```

Requires **`THE_ODDS_API_KEY`**, migrations through **`20260704260000`**, and Vault secrets above.
