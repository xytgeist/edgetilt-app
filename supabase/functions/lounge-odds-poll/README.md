# lounge-odds-poll

Background odds poller for sports bots.

## Actions

| `action` | Behavior |
| --- | --- |
| `poll_edges` | Fetch each **active tier 1–4** sport on Odds API (calendar boosts priority/captions); publish up to **2 ⚡ +EV** alerts per tick (best EV across sports; sport-aware thresholds in **`loungeBotEdgeAlertThresholds.ts`**). Also **line movement**, **Arb Watch** (only when a **≥ 2%** cross-book arb exists), **Sharp Report Card** (meaningful sharp/steam/RLM move), and context alerts. |
| `poll_live` | Lightweight **5 min** live tick: **in-game edge** + **period/halftime reports** using **TheRundown** game state (`game_period`, `STATUS_HALFTIME`, etc.) with elapsed-time fallback. Pre-checks scores; only fetches odds for sports with live games. |
| `daily_slates` | Post **one Coffee & Covers thread** per bot/day (covers in root, best lines in thread parts per sport). Legacy slate check-ins when `coffee_covers_enabled = false`. |
| `best_bet_hour` | Post **one Best Bet of the Hour** per bot per PT hour — strongest +EV across ML, spreads, and totals (min **6%** default, **≥ 5 books**). Tie-break NFL > NBA > MLB. |
| `value_bet_radar` | Post **2–3 strongest +EV plays** per PT half-hour during **8am–10pm PT** (min **5%** default, **≥ 4 books**). Sport variety when possible. Silent if fewer than 2 qualify. |
| `grade_picks` | Settle pending `lounge_bot_picks` vs Odds API scores (`completed` + kickoff ≥90m). One invoke grades **all** running odds bots. Cron **`lounge_odds_grade_picks_poll`** at **:22** (not :15) 10am–11pm PT, 150s pg_net budget. |

### Coffee & Covers (morning cron)

`daily_slates` only publishes between **6:00am and 8:00am PT** (random minute per bot/day). Each bot gets a **stable random minute** in that window per day (derived from `bot_user_id` + PT date) so posts do not land at the same time every morning.

Each post opens with **☕ Coffee & Covers 💵**. Parent post leads with one **featured lean** (🎯), up to **3 radar spots** (👀), **Dog of the Day** (🐕), then **`Full board breakdown by sport below 👇`**. Today's lines live in **thread parts** (one per calendar sport with games).

**Cron (pg_cron):** migrations **`20260704230000`** + **`20260704240000`**

| Job | Schedule (PDT / UTC-7) | `action` |
| --- | --- | --- |
| `lounge_odds_poll_daily_slates` | Every **5 min**, **6:00-7:59am PT** (`*/5 13-14 * * *`) | `daily_slates` |
| `lounge_odds_poll_edges` | Every **15 min**, **24/7** (`*/15 * * * *`) | `poll_edges` |
| `lounge_odds_poll_live` | Every **5 min**, **10am-2am PT** (`*/5 17-23,0-8 * * *` PDT) | `poll_live` |
| `lounge_odds_poll_best_bet_hour` | **Minute 5** of every hour (`5 * * * *`) | `best_bet_hour` |
| `lounge_odds_poll_value_bet_radar` | **Minutes 5 and 35** every hour (`5,35 * * * *`) | `value_bet_radar` (Edge gates **8am–10pm PT**) |

**+EV posts:** no time-of-day gate ... only **active** tier-scoped sports with **unplayed** games today (PT). Calendar rows optional boost. **Live posts** (`poll_live`) use in-progress games with **TheRundown** period/halftime detection when **`THERUNDOWN_API_KEY`** is set; **+4%** default on ML/spreads/totals. **Best Bet of the Hour** includes unplayed + live games. Cron runs 24/7 for `poll_edges`; `poll_live` gates **10am-2am PT**.

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

**Portal:** **Post Coffee & Covers** sends `force: true` to bypass the time gate for manual smoke. **Best bet · hour** invokes `best_bet_hour` (respects PT-hour dedupe unless testing with a new hour bucket). **Value radar** invokes `value_bet_radar` with `force: true` to bypass the peak-hours gate for manual smoke.

**Freemium:** migration **`20260704260000`** — per-alert **All | Subs** in portal; **`subscriber_only`** on feed posts (RLS hides Subs posts from non-subscribers). **`value_bet_radar`** defaults to **All** in **`20260704300000`**.

## Deploy

```bash
supabase functions deploy lounge-odds-poll --project-ref YOUR_PROJECT_REF
supabase functions deploy lounge-odds-ingest --project-ref YOUR_PROJECT_REF
```

Requires **`THE_ODDS_API_KEY`**, **`THERUNDOWN_API_KEY`** recommended for live period/halftime milestones, migrations through **`20260706190000`**, and Vault secrets above.

**Scheduled odds posts:** pg_cron **`lounge_bot_publish_scheduled_odds`** every minute drains **`lounge_bot_scheduled_posts`** via **`lounge-bot-publish-due`** (`publishScheduledOdds: true`).
