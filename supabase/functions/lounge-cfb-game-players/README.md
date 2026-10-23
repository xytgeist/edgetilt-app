# lounge-cfb-game-players

Logged-in Lounge **CFB game hub Players** tab. Reads **`cfb_players`** for the two team abbrevs (no Fantasy / Sleeper) and returns Kalshi + Polymarket game / half / team-total markets in `props` (neither venue lists college player props). Markets cached 90s under `cfb:<event_id>` in `nfl_game_fantasy_cache`.

```bash
supabase functions deploy lounge-cfb-game-players --project-ref kcosfvmreeiosdjdzycb
```

**Body (user JWT):** `{ "event_id", "away_abbrev", "home_abbrev", "away_name"?, "home_name"?, "commence_time"? }` (names + kickoff drive venue matching when codes differ).

**Populate:** `npm run cfb:players:sync` (migration **`20260925200000_cfb_players`**).

**Season stats (Roster expand):** `cfb_players.season_stats` (migration **`20261023150000`**) holds NFL-style `season_*` keys from CFBD, spread onto each player when `season_stats_year` is the current season. Filled daily by GHA **`cfb-player-stats-sync.yml`** (`node scripts/sync-cfb-player-stats.mjs --target=both`, one CFBD call for every team; CFBD free tier is 1,000 calls / month, so never fetch per request). No games played, distance splits, or career, so the table shows Regular Season only.

Client: `loungeCfbGamePlayers` in `src/utils/loungeSportsApi.js`.
