# Fantasy Connect (Sleeper + Yahoo + ESPN)

Signed-in users link a fantasy account, sync leagues/rosters/matchups, and auto-highlight **mine** + **enemy** players on NFL game hubs.

**Suite roadmap (Layers A–E, Trade Analyzer, DFS, emotional hedges, phases):** **`docs/fantasy-suite.md`**. This file is the Connect implementation contract only.

## Product

| Item | Spec |
| --- | --- |
| Providers | **Sleeper** (username) · **Yahoo** (OAuth 2.0) · **ESPN** (in-app login sheet → session cookie) |
| Surfaces | Fantasy home (`?tab=fantasy`) + NFL game-hub pins |
| Gate | Free for signed-in users |
| Primary league | Last picked … drives hub pins (one across all providers) |

**Soon (same tables, new Edge modules):** CBS. Out of scope for now: waivers/AI, multi-league simultaneous hub highlight, paid gate.

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
| `fantasy_teams` | league, external roster/team id, owner label, `is_mine`, W-L, PF |
| `fantasy_rosters` | team + week + slot, **`sleeper_id`** (canonical), optional `yahoo_player_key`, name/pos/team |
| `fantasy_matchups` | league + week, mine/opp team ids + scores |

Player identity for hub pins: **`nfl_players.sleeper_id`**. Yahoo sync resolves players by name + team (+ position).

## Edge Functions

| Function | Auth | Behavior |
| --- | --- | --- |
| `fantasy-sleeper-link` | user JWT | `{ username }` → upsert Sleeper connection + sync |
| `fantasy-sleeper-sync` | user JWT | sync / `{ primary_league_id }` / `{ hub_pins: true }` (provider-agnostic pins) |
| `fantasy-yahoo-oauth-start` | user JWT | returns Yahoo authorize `url`. Body `{ returnMode?: 'native'\|'web' }` encodes return channel in OAuth `state` (`n.*` / `w.*`) |
| `fantasy-yahoo-oauth-callback` | browser redirect | exchange code, store tokens, sync; **native** → `edgetilt://yahoo-oauth?tab=fantasy&yahoo=…`; **web** → `/fantasy-yahoo-return.html?…` |
| `fantasy-yahoo-sync` | user JWT | refresh token if needed, re-sync Yahoo leagues |
| `fantasy-espn-link` | user JWT | `{ espn_s2, swid }` → store cookie, sync NFL leagues. Rejects `password`. |
| `fantasy-espn-sync` | user JWT | re-sync using the stored ESPN cookie |

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
| `src/features/fantasy/FantasyHomeScreen.jsx` | Connect Sleeper / Yahoo / ESPN, league pick, matchup, standings |
| `src/features/fantasy/fantasyApi.js` | invoke Edges + RLS reads; `setPrimaryFantasyLeague` is client RLS |
| AppShell tab **`fantasy`** | `?tab=fantasy` + Yahoo OAuth handoff still wired (no hamburger entry). Entry tile lives on **NFL Hub** as Coming soon until Yahoo API approval + soft launch |
| NFL Hub Fantasy tile | `data-sports-hub-fantasy="nfl-soon"` … Coming soon veil (not on Sports Hub home) |
| Light mode | `html.light [data-fantasy-home]` |

## Hub pin roles

`gameHubFantasyPins.js` stores `{ id, role, source }`:

| Role | UI | Source |
| --- | --- | --- |
| `mine` | Blue **Watch** | Manual tap or league auto |
| `enemy` | Rose **Enemy** | League auto (opponent starters in this game) |

On NFL hub open: `hub_pins: true` reads the user’s **primary** league (any provider) and applies mine/enemy sleeper ids present in that game.

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
6. ESPN connect is the in-app login sheet (`startEspnFantasyLogin`) on iPhone and Android (APK **1.3.22+**). A normal browser and older shells explain that an app update is required. CBS remains **Soon**.
