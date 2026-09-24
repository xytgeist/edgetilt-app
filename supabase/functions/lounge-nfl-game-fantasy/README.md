# lounge-nfl-game-fantasy

Logged-in Lounge **per-game** Players + Fantasy payload for `LoungeGameHubModal`.

- **Request** `POST` `{ "event_id", "away_abbrev", "home_abbrev" }` with user JWT
- **Response** `{ ok, players[], props[], season, week, sources[], fetched_at }`
- **Sources:** `nfl_players` table (preferred) or live Sleeper roster filter; Sleeper weekly PPR projections; Kalshi open NFL prop markets (public, no key); FantasyPros ECR/projections when `FANTASYPROS_API_KEY` is set
- **Cache:** `nfl_game_fantasy_cache` (~90s TTL)

## Secrets

| Name | Required | Notes |
| --- | --- | --- |
| `FANTASYPROS_API_KEY` | optional | `x-api-key` for FP public API |
| `KALSHI_API_KEY_ID` / `KALSHI_PRIVATE_KEY` | optional | Public market data works without; reserved for auth trading |

Mirror the same names in repo-root `.env.supabase.test` (gitignored) for local scripts.

```bash
supabase functions deploy lounge-nfl-game-fantasy --project-ref kcosfvmreeiosdjdzycb
```

Client: `loungeNflGameFantasy` in `src/utils/loungeSportsApi.js`.

Player sync: `npm run nfl:players:sync`.
Headshot R2 mirror: `npm run nfl:players:headshots:r2` (service role → Edge `mirror_headshots` → `sports/nfl/players/{espn_id}.png`).

Fantasy board uses **Sleeper** weekly projections + season stats under **Players → Fantasy**. Kalshi **player** props live under **Players → Props** (grouped by player). Kalshi **game / period** markets sit on **Stats** under the sportsbook odds (ML/spread/total + halves/quarters). Fetch uses exact event tickers + 429 retries (concurrency 2). FantasyPros optional via `FANTASYPROS_API_KEY`.
