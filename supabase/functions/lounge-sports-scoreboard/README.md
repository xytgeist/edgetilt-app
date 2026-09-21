# lounge-sports-scoreboard

Logged-in Lounge in-post **game pill** + **live game hub**.

- **Slate** (`POST` with empty body): NFL only. TheRundown day events for this week plus the adjacent week (recaps + upcoming), in parallel with Odds API `/scores` (`daysFrom=3`) and `/odds` spreads so pills can show the line. Completed games keep the last painted spread when Odds drops them. Other leagues are skipped on purpose ... a 6-sport sequential fetch was 502'ing the function and the Lounge painted zero pills. Vague one-team captions use live / most recent until MNF is final, then the next game. Named matchups pin that game.
- **Detail** (`POST` `{ "event_id": "..." }`): fresh event live state, `/plays`, `/players/stats`, and multi-book Odds API h2h/spreads/totals. Hub-open only so the 45s pill poll stays cheap.

**Secrets (project-level, already on odds bots):** `THERUNDOWN_API_KEY`, `THE_ODDS_API_KEY`.

```bash
supabase functions deploy lounge-sports-scoreboard --project-ref kcosfvmreeiosdjdzycb
```

Client: `src/utils/loungeSportsApi.js` → `loungeSportsScoreboard` / `loungeSportsGameDetail`.
