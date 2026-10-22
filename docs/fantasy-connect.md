# Fantasy Connect (Sleeper + Yahoo + ESPN + CBS)

Signed-in users link a fantasy account, sync leagues/rosters/matchups, and auto-highlight **mine** + **enemy** players on NFL game hubs.

**Suite roadmap (Layers A–E, Trade Analyzer, DFS, emotional hedges, phases):** **`docs/fantasy-suite.md`**. This file is the Connect implementation contract only.

## Product

| Item | Spec |
| --- | --- |
| Providers | **Sleeper** (username) · **Yahoo** (OAuth 2.0) · **ESPN** (in-app bottom sheet → session cookie) · **CBS** (in-app bottom sheet → member token) |
| Surfaces | Fantasy home (`?tab=fantasy`) + NFL game-hub pins, Fantasy tab, and play pills |
| Gate | Free for signed-in users |
| Primary league | Last picked … drives the opponent (Enemy) pins. Owned players on the Fantasy list come from every NFL league |

**Product intent:** **`docs/fantasy-suite.md`** → Synopsis. Out of scope for now: waivers/AI, multi-league simultaneous hub highlight, paid gate. Password paste is not a connector.

## Tables (provider-agnostic)

| Migration | Role |
| --- | --- |
| **`20261011180000_fantasy_connect.sql`** | connections / leagues / teams / rosters / matchups + RLS |
| **`20261011190000_fantasy_yahoo_oauth.sql`** | `fantasy_oauth_states`, `fantasy_provider_tokens` (service-role only), `fantasy_rosters.yahoo_player_key` |

| Table | Role |
| --- | --- |
| `fantasy_connections` | `user_id`, `provider` (`sleeper` / `yahoo` / `espn` / `cbs`), external username/id, status, `primary_league_id`, last sync |
| `fantasy_provider_tokens` | OAuth access/refresh for Yahoo (etc.) … **never** readable by authenticated clients |
| `fantasy_oauth_states` | Short-lived CSRF state for OAuth starts |
| `fantasy_leagues` | connection, external league id, name, season, `is_primary` |
| `fantasy_teams` | league, external roster/team id, owner label, `is_mine`, W-L, PF, `avatar_url` (ESPN team logo, Sleeper user avatar, Yahoo team logo when the scoreboard has one) |
| `fantasy_rosters` | team + week + slot, **`sleeper_id`** (canonical), optional `yahoo_player_key`, name/pos/team |
| `fantasy_matchups` | one row per game that week (home team in `mine_team_id`). The connected user's game is whichever row includes their team. |

Player identity for hub pins: **`nfl_players.sleeper_id`**. Yahoo sync resolves players by name + team (+ position).

## Edge Functions

| Function | Auth | Behavior |
| --- | --- | --- |
| `fantasy-sleeper-link` | user JWT | `{ username }` → upsert Sleeper connection + sync current NFL and NBA seasons. NBA does not replace an existing NFL primary (game-hub pins stay football). |
| `fantasy-sleeper-sync` | user JWT | sync / `{ primary_league_id }` / `{ hub_pins: true }` (provider-agnostic pins) |
| `fantasy-yahoo-oauth-start` | user JWT | returns Yahoo authorize `url`. Body `{ returnMode?: 'native'\|'web' }` encodes return channel in OAuth `state` (`n.*` / `w.*`) |
| `fantasy-yahoo-oauth-callback` | browser redirect | exchange code, store tokens, sync; **native** → `edgetilt://yahoo-oauth?tab=fantasy&yahoo=…`; **web** → `/fantasy-yahoo-return.html?…` |
| `fantasy-yahoo-sync` | user JWT | refresh token if needed, re-sync Yahoo leagues |
| `fantasy-yahoo-link` | user JWT | **Stopgap (2026-10-19)** while Yahoo's Fantasy API approval for App ID `i4wW6xoc` is pending (OAuth works, league calls 403). Body `{ cookie }` from the native Yahoo sheet (`startYahooFantasyLogin`). Verifies `users;use_login=1` on Yahoo's own web host `pub-api-ro.fantasysports.yahoo.com/fantasy/v2` (same v2 JSON), stores the cookie as `fantasy_provider_tokens.token_type = 'yahoo_session'`, syncs. `fantasy-yahoo-sync` then uses the web host whenever the token is a session. The client opens the sheet only when OAuth returns the approval 403; plain web shows an "use the app" banner. Unofficial and more fragile (same trade-off as ESPN). Once Yahoo approves, a normal OAuth connect overwrites the session with bearer tokens. Pending trades are not read on either path. |
| `fantasy-espn-link` | user JWT | `{ espn_s2, swid }` → store cookie, sync NFL leagues. League ids come from `fan.api.espn.com` (the season URL is empty). A league still drafting is included. Rejects `password`. |
| `fantasy-pending-trades` | user JWT | `{ league_id }` → `{ provider, supported, offers: [{ id, proposer_team_id, proposed_at, expires_at, accepted_by, items: [{ from_team_id, to_team_id, external_player_id, sleeper_id, player_name, position, nfl_team }] }] }`. ESPN only: `view=mTransactions2` for the current and previous scoring period, `TRADE_PROPOSAL` + `PENDING` + unexpired + two teams incl. yours; players map through roster `slot_label` (`slot:espnPlayerId`). Other hosts return `supported: false`. |
| `fantasy-cbs-link` | user JWT | `{ access_token, league_ids }` → store token, sync NFL leagues. Rejects `password`. |
| `fantasy-cbs-sync` | user JWT | Re-read stored CBS token. |
| `fantasy-espn-sync` | user JWT | re-sync using the stored ESPN cookie |
| `fantasy-lineup-cards` | user JWT | `{ sport?, players: [{ sleeper_id, name, position, team }] }` → kickoff, season total / average, this-week projection, position rank, points-allowed matchup grade, open Kalshi lines (`stat`, yes ask, no ask), and a raw `line` from the ESPN box (NFL, NBA, NHL, MLB). The client multiplies `line` by `fantasy_leagues.scoring`. The NFL game hub uses that same map for the Fantasy tab, the per-play pills, and the landscape fantasy rail. With no league (or an empty map) those stay on the device Std / Half / PPR toggle. Each card also carries `market_line` (NFL, not K / DEF): sportsbook-implied counting stats from TheRundown DraftKings + FanDuel props (`_shared/fantasyMarketProjections.ts`, shared cache 30m on Thu/Sun/Mon PT, 2h otherwise, ~3.5k datapoints per full-slate pull; empty on test where TheRundown is off). The app blends it per stat over Sleeper's `proj_line` and falls back to the Sleeper baseline when the blend is more than 3 pts and 35% away (`src/features/fantasy/fantasyProjection.js`). Sleeper and ESPN save that map on sync. Yahoo reads `/league/{key}/settings` and CBS reads `league/rules`, then stores the same flat keys (`pass_yd`, `rec`, …). A rules miss leaves `scoring` empty and the host total stays the fallback. No new SQL. |

**Auto-sync on open (2026-10-20):** `FantasyHomeScreen` re-syncs every active connection whose `last_sync_at` is over 5 minutes old when the screen opens and when the page becomes visible again, in the background (Sync button shows `…`), then reloads league detail. Throttled on the last attempt so a failing host does not retry in a loop. There is no server cron for roster sync. **App-level background sync (2026-10-22, 1.4.1399, Ryan):** `useFantasyBackgroundSync` in `AppShell` (signed-in members) runs the same stale check on app open and every return to the foreground, so leagues are fresh before Fantasy opens and slow host reads (Yahoo's ~4 MB weekly schedule) happen out of sight. One shared in-flight sync (`autoSyncStaleFantasy` / `fantasyAutoSyncInFlight` in `fantasyApi.js`, 5-minute attempt throttle): `FantasyHomeScreen` joins a running sync (icon spins, reloads after) instead of starting another. No links = one cheap `fantasy_connections` read, nothing else.

Shared: **`fantasySleeperSync.ts`**, **`fantasyYahooSync.ts`**, **`fantasyEspnSync.ts`**. `verify_jwt = false` (manual JWT via `userIdFromJwt` except the Yahoo callback).

### Yahoo secrets (test + prod)

| Secret | Notes |
| --- | --- |
| `YAHOO_FANTASY_CLIENT_ID` | Yahoo Developer Consumer Key |
| `YAHOO_FANTASY_CLIENT_SECRET` | Consumer Secret |
| `YAHOO_FANTASY_REDIRECT_URI` | Optional; default `{SUPABASE_URL}/functions/v1/fantasy-yahoo-oauth-callback` |
| `PUBLIC_APP_URL` | SPA host after OAuth (`lvslotpro.com` / `edgetilt.com`) |

Yahoo app redirect URIs (exact):

- Test: `https://kcosfvmreeiosdjdzycb.supabase.co/functions/v1/fantasy-yahoo-oauth-callback`
- Prod: `https://jtjgtucumuoswnbauxry.supabase.co/functions/v1/fantasy-yahoo-oauth-callback`

Setup notes: **`supabase/functions/fantasy-yahoo-oauth-start/README.md`**.

## Client

| Path | Role |
| --- | --- |
| `src/features/fantasy/FantasyHomeScreen.jsx` | Command center once a host is linked. Home is your matchup card in each league, grouped by sport. A tap opens that league: the same card stays on top and the lineup is listed under it. Fantasy in the header returns home. Other games in the league are a swipe. Connect cards sit in Manage. While a game is on, lineup cards refresh every 30s. |
| `src/features/fantasy/fantasyApi.js` | invoke Edges + RLS reads; `setPrimaryFantasyLeague` is client RLS |
| AppShell tab **`fantasy`** | `?tab=fantasy` + Yahoo OAuth handoff still wired (no hamburger entry). Entry tile lives on **NFL Hub** as Coming soon until Yahoo API approval + soft launch |
| NFL Hub Fantasy tile | `data-sports-hub-fantasy="nfl-soon"` … Coming soon veil (not on Sports Hub home). Four taps within 600ms of each other set `?tab=fantasy` and close the slate portal |
| Light mode | `html.light [data-fantasy-home]` |

## Hub pin roles

`gameHubFantasyPins.js` stores `{ id, role, source }`:

| Role | UI | Source |
| --- | --- | --- |
| `mine` | Blue **Watch**, unless the player is on your roster | Manual tap. Rostered players show the league name instead |
| `enemy` | Rose **Enemy** | Primary-league opponent starters in this game |

On NFL hub open, the Fantasy list reads every NFL league the user owns. Those players are highlighted and sorted to the top. The pill is that league's name, with a trailing **+** when the same player is owned in more than one. The opponent roster for the league named on that bar is red and sits directly under them. `hub_pins: true` still marks primary-league starter enemies for the Players tab. The league bar hides the pregame "Projected · pts" caption. The fantasy home shows card-shaped skeletons until that first load is in, then paints once. A game screen paints its scoreboard immediately and shows skeleton rows in the tab area until the first load is in. Live refreshes update in place.

## EdgeiOS note

**Connect Yahoo** must not `location.assign` into the WKWebView (Yahoo login has hard-crashed the IPA).

**Current IPA (Gameday-style):** `EdgeNative.startWebAuthSession` → `ASWebAuthenticationSession` under Edge chrome. Start with `returnMode: 'native'`. After Yahoo authorizes, Edge callback **302**s to **`edgetilt://yahoo-oauth?tab=fantasy&yahoo=…`**; the auth sheet intercepts that scheme, dismisses, and Fantasy refreshes in place (no handoff tap). Bridge: **`docs/ios-native-bridge.md`** → `startWebAuthSession`.

**Old IPA / web fallback:** system Safari (or same-tab web) with `returnMode: 'web'`. Callback lands on **`/fantasy-yahoo-return.html`**, which opens **`edgetilt://yahoo-oauth?…`** (then `live-session` for older binaries). Tap **Open EdgeTilt** if Safari does not auto-jump. AppShell persists the handoff in `sessionStorage` so Fantasy opens even if session hydrate briefly left the user on home / Sports Hub.

## Yahoo Fantasy API access (required)

Yahoo moved Fantasy Sports API behind an **approval gate** (mid-2026). Creating a Developer app + checking Fantasy Sports Read is not enough … OAuth can succeed while every `fantasysports.yahooapis.com` call returns **403 not authorized**.

1. Keep the existing app (**App ID `i4wW6xoc`**, EdgeTilt Fantasy). Do **not** delete/recreate it.
2. Apply at **[sports.yahoo.com/developer](https://sports.yahoo.com/developer/)** (Access / Apply) with org + use case.
3. After approval (often days–weeks), reconnect Yahoo in the app. Until then the Fantasy banner explains the gate.

Authorize URL requests `scope=fspt-r`.

## Smoke (test)

1. Set Yahoo Edge secrets (above) on test, redeploy yahoo Edges.
2. lvslotpro / EdgeiOS → Fantasy → **Connect Yahoo** → in-app auth sheet (or Safari on old IPA) → return → leagues load.
3. Pick primary league → lineup + matchup + standings.
4. Open an NFL hub with a starter → Watch / Enemy pins.
5. Sleeper username link still works alongside Yahoo.
6. ESPN and CBS connect are in-app login sheets (`startEspnFantasyLogin` / `startCbsFantasyLogin`) on iPhone and Android (APK **1.3.24**). A normal browser and older shells explain that an app update is required. Edge functions are on test and prod. Password is never stored.


**Lineup slots (2026-10-18):** `fantasy_leagues.settings.lineup_slots` holds the starting slots (e.g. `['QB','RB','RB','WR','WR','TE','FLEX','DEF','K']`). ESPN sync builds it from `settings.rosterSettings.lineupSlotCounts` (mSettings); Sleeper already stores `roster_positions`. Yahoo / CBS fall back to inferring slots from the current starters in the app. Start/Sit reads it.

**Waiver rules (2026-10-18):** `fantasy_leagues.settings.waiver` = `{ type: 'faab' | 'rolling' | 'reverse' | 'continuous', budget, days: [ET weekday 0=Sun], hour_et, waiver_hours }` and `fantasy_teams.metadata.waiver` = `{ rank, faab_left }`. ESPN from `settings.acquisitionSettings` + team `waiverRank` / `transactionCounter.acquisitionBudgetSpent`; Sleeper from league `waiver_type` / `waiver_budget` / `waiver_day_of_week` (counts from Monday) / `daily_waivers` + roster `waiver_position` / `waiver_budget_used`; Yahoo from settings `uses_faab` / `waiver_type` / `waiver_time` + team `waiver_priority` / `faab_balance`. Hour defaults to 3 AM ET when the host does not send it. CBS not wired. Sync once to fill.
