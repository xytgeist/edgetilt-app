# lounge-sports-scoreboard

Logged-in Lounge in-post **game pill** + **live game hub**.

- **Slate** (`POST` with empty body): TheRundown day events (scores, period lines, `live_game_state` when the key has it) with Odds API `/scores` fallback when NFL is empty. NFL dates are **Thursday through Monday** of the current week and hold until **Tuesday 00:00 PT** (after MNF). Next week's games are filtered out.
- **Detail** (`POST` `{ "event_id": "..." }`): fresh event live state, `/plays`, `/players/stats`, and multi-book Odds API h2h/spreads/totals. Hub-open only so the 45s pill poll stays cheap.

**Secrets (project-level, already on odds bots):** `THERUNDOWN_API_KEY`, `THE_ODDS_API_KEY`.

```bash
supabase functions deploy lounge-sports-scoreboard --project-ref kcosfvmreeiosdjdzycb
```

Client: `src/utils/loungeSportsApi.js` → `loungeSportsScoreboard` / `loungeSportsGameDetail`.
