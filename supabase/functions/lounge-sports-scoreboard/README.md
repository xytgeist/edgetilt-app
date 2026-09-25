# lounge-sports-scoreboard

Logged-in Lounge in-post **game pill** + **live game hub**.

- **Slate** (`POST` with empty body): NFL only. TheRundown day events for this week plus the adjacent week (recaps + upcoming), in parallel with Odds API `/scores` (`daysFrom=3`), live `/odds` (hub books), and **Pinnacle** h2h/spreads/totals. Completed games read **`lounge_market_files`** close, then backfill from Odds **historical** Pinnacle at kickoff and upsert that close so it stays tabled. ESPN public scoreboard fills each side’s season **`record`** (`"3-1"`, cached 10m). Other leagues are skipped on purpose ... a 6-sport sequential fetch was 502'ing the function and the Lounge painted zero pills. Vague one-team captions use live / most recent until MNF is final, then the next game. Named matchups pin that game.
- **Detail** (`POST` `{ "event_id": "..." }`): fresh event live state, `/plays`, `/players/stats`, multi-book Odds API h2h/spreads/totals (top **8**, **Pinnacle** merged from eu-region pack and pinned first), plus pasted **`syndicate_betting_splits`** (`splits`: ticket % / handle % per side) when Action PRO / VSiN paste matches the game. Hub-open only so the 45s pill poll stays cheap. Live state includes **`possession`**, **`home_timeouts` / `away_timeouts`** (0–3 remaining) when the feed sends them (TheRundown live_game_state; ESPN scoreboard `situation` on prod NFL fallback). **NFL PBP fallback (prod only):** when TheRundown `/plays` (or live last-play/clock) is empty on **`jtjgtucumuoswnbauxry`**, detail fills from ESPN public scoreboard/summary (unofficial). Test sandbox skips ESPN.

**Live depth vs X Gametime:** Hub asks Rundown first; prod NFL hub detail can fall back to ESPN public summary for PBP/clock. Richer official/realtime still a **tier / vendor** decision (Rundown Ultra, Sportradar-class, Genius). See backlog.

**Secrets (project-level, already on odds bots):** `THERUNDOWN_API_KEY`, `THE_ODDS_API_KEY`.

```bash
supabase functions deploy lounge-sports-scoreboard --project-ref kcosfvmreeiosdjdzycb
```

Client: `src/utils/loungeSportsApi.js` → `loungeSportsScoreboard` / `loungeSportsGameDetail`.

**Players / Fantasy companion:** [`lounge-nfl-game-fantasy`](../lounge-nfl-game-fantasy/README.md) (Sleeper + Kalshi + optional FantasyPros). Does not run on the pill poll.
