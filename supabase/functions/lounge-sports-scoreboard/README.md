# lounge-sports-scoreboard

Logged-in Lounge in-post **game pill** + **live game hub**.

- **Slate** (`POST` with empty body): **NFL + CFB + NHL + NBA + MLB + MLS** in parallel (each pack soft-fails), plus **PGA** tournament cards from ESPN. TheRundown day events stay **scores-only** (`affiliate_ids=0`). A second Rundown fetch on the **line cache** pulls main-line shop books Odds does not have: Circa, Heritage, Bet105, BookMaker, Sportsbetting.ag, Betcris, YouWager, Matchbook, Everygame. Windows: NFL this week + adjacent; CFB current Thu–Mon only; NHL/NBA/MLB/MLS yesterday + today + tomorrow PT. Odds API `/scores` only when Rundown returned no events for that league. Odds `/odds` (`us`+`us2`) + Pinnacle own the retail/sharp US shop. Completed games read **`lounge_market_files`** close, then backfill from Odds **historical** Pinnacle at kickoff. ESPN fills football **`record`** / **`broadcast`** and patches NHL/NBA/MLB/MLS live score/clock (5s while a slate game is in). **PGA** is ESPN tournaments (Odds golf is outrights).
- **Detail** (`POST` `{ "event_id": "..." }`): scores-only Rundown event for live state, `/players/stats`, Odds API books + Pinnacle + Rundown shop rows (top **20**), plus pasted **`syndicate_betting_splits`**. OddsPapi Circa snapshot is only a fallback when Rundown Circa is missing (football pregame). **PBP:** football Plays / clock / box from ESPN; Rundown `/plays` skipped. **Caching:** slate **8s** (scores/clock) and detail **4s**. **Lines:** Odds + Rundown shop + Pinnacle cache **90s** on the slate, **40s** when a live hub is open. ESPN clock cache 5s.

**Live depth vs X Gametime:** Hub uses Rundown for scores/live state only; NFL/CFB hub detail takes PBP/clock from ESPN. Richer official/realtime still a **tier / vendor** decision (Rundown Ultra, Sportradar-class, Genius). See backlog.

**Secrets (project-level, already on odds bots):** `THERUNDOWN_API_KEY`, `THE_ODDS_API_KEY`.

**Circa:** Rundown affiliate **32** is the shop row (same 90s/40s cache as the other Rundown books). **OddsPapi** (`ODDSPAPI_API_KEY`) is fallback only when that row is missing (football pregame snapshot, 250 req/mo; prod budget `210`; test is keyless). See `_shared/oddspapiCirca.ts`.

```bash
supabase functions deploy lounge-sports-scoreboard --project-ref kcosfvmreeiosdjdzycb
```

Client: `src/utils/loungeSportsApi.js` → `loungeSportsScoreboard` / `loungeSportsGameDetail`.

**Players / Fantasy companion:** [`lounge-nfl-game-fantasy`](../lounge-nfl-game-fantasy/README.md) (Sleeper + Kalshi + optional FantasyPros). NFL hub only … CFB hub omits the Fantasy tab.
