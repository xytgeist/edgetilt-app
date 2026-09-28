# lounge-sports-scoreboard

Logged-in Lounge in-post **game pill** + **live game hub**.

- **Slate** (`POST` with empty body): **NFL + CFB** in parallel. TheRundown day events (NFL: this week + adjacent; CFB: current Thu–Mon only … higher volume) with Odds API `/scores` (`daysFrom=3`), live `/odds` (hub books), and **Pinnacle** h2h/spreads/totals. Completed games read **`lounge_market_files`** close, then backfill from Odds **historical** Pinnacle at kickoff and upsert that close so it stays tabled. ESPN public scoreboard fills each side’s season **`record`** (`"3-1"`) and national **`broadcast` / `broadcast_url`** (watch pill), cached 10m per league (`nfl` / `college-football`). Other leagues are skipped on purpose … a 6-sport sequential fetch was 502'ing the function and the Lounge painted zero pills. Vague one-team captions use live / most recent until MNF is final, then the next game. Named matchups pin that game.
- **Detail** (`POST` `{ "event_id": "..." }`): fresh event live state, `/plays`, `/players/stats`, multi-book Odds API h2h/spreads/totals (top **8**, **Pinnacle** merged from the dedicated pin pack using the **freshest `last_update`**, never blindly overwriting a newer us/us2 Pinnacle; markets ≥3.5pt / 6pt / 12% off other-book consensus are dropped as stale), plus pasted **`syndicate_betting_splits`** (`splits`: ticket % / handle % per side) when Action PRO / VSiN paste matches the game. Hub-open only so the 45s pill poll stays cheap. Live state includes **`possession`**, **`home_timeouts` / `away_timeouts`** (0–3 remaining) when the feed sends them (TheRundown live_game_state; ESPN scoreboard `situation` on football fallback). **PBP merge (2026-09-27):** live / final football always reads the ESPN public summary (NFL + CFB, **test + prod**). TheRundown and ESPN plays merge into one feed: the same snap (period + clock + play kind) collapses into the ESPN row with the TheRundown id in **`source_ids`**; plays only one source has stay in game order. Live state leads with whichever source is further into the game (period + clock). **Caching:** slate 8s and detail 4s per isolate with in-flight sharing, so the hub poll (6s live) and the pill poll share builds across viewers; ESPN scoreboard clock cache 5s. **Odds:** Odds API live + Pinnacle packs cached **20s** per isolate (was 90s); each compact book row carries **`last_update`** so the client can shop only fresh live books. Match by abbrev, `team_id`, or soft team name.

**Live depth vs X Gametime:** Hub asks Rundown first; NFL/CFB hub detail merges the ESPN public summary for PBP/clock. Richer official/realtime still a **tier / vendor** decision (Rundown Ultra, Sportradar-class, Genius). See backlog.

**Secrets (project-level, already on odds bots):** `THERUNDOWN_API_KEY`, `THE_ODDS_API_KEY`.

**Circa (optional):** `ODDSPAPI_API_KEY` (OddsPapi free tier, 250 req/mo; account `theo+ops@edgetilt.com`, creds in Mac `.env.local`). Pregame football detail appends a `Circa Sports` odds row (`snapshot: true`) from `_shared/oddspapiCirca.ts`: one `odds-by-tournaments` call (NFL 31 + NCAA 27653) at most every 3h, stored in `market_quote_cache` key `oddspapi:circa:football` so cold starts don't spend quota. Main line = active rung with the most balanced prices (Circa leaves lopsided alt rungs active). Market ids / team names are bundled in `_shared/oddspapiFootballCatalog.ts` … regenerate with `node scripts/oddspapi-football-catalog.mjs` (2 requests). Without the secret the row is simply absent.

```bash
supabase functions deploy lounge-sports-scoreboard --project-ref kcosfvmreeiosdjdzycb
```

Client: `src/utils/loungeSportsApi.js` → `loungeSportsScoreboard` / `loungeSportsGameDetail`.

**Players / Fantasy companion:** [`lounge-nfl-game-fantasy`](../lounge-nfl-game-fantasy/README.md) (Sleeper + Kalshi + optional FantasyPros). NFL hub only … CFB hub omits the Fantasy tab.
