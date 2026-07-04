# lounge-odds-poll

Background odds poller for sports bots.

## Actions

| `action` | Behavior |
| --- | --- |
| `poll_edges` | Fetch each calendar-active sport today; publish **⚡ +EV** alerts when EV clears `min_edge_pct` (devig h2h). |
| `daily_slates` | Post one **slate check-in** per calendar sport (if not already posted today). |

## Cron (test / prod)

Schedule **`poll_edges`** every 30 minutes during active hours, and **`daily_slates`** once each morning (PT).

Example Supabase cron (adjust slug + service role):

```sql
-- Edge scan every 30 min (service role invokes Edge Function)
-- Daily slates at 8am PT — wire via dashboard cron or pg_cron + http extension
```

Manual smoke from bot portal: **Scan all · edge** and **Post all slates**.

Deploy with:

```bash
supabase functions deploy lounge-odds-poll --project-ref YOUR_PROJECT_REF
```

Requires **`THE_ODDS_API_KEY`** and migration **`20260704150000_lounge_bot_odds_slate_edge.sql`**.
