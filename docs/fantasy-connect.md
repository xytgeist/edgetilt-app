# Fantasy Connect (Sleeper + Yahoo)

Signed-in users link a fantasy account, sync leagues/rosters/matchups, and auto-highlight **mine** + **enemy** players on NFL game hubs.

## Product

| Item | Spec |
| --- | --- |
| Providers | **Sleeper** (username) · **Yahoo** (OAuth 2.0) |
| Surfaces | Fantasy home (`?tab=fantasy`) + NFL game-hub pins |
| Gate | Free for signed-in users |
| Primary league | Last picked … drives hub pins (one across all providers) |

**Soon (same tables, new Edge modules):** ESPN, CBS. Out of scope for now: waivers/AI, multi-league simultaneous hub highlight, paid gate.

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
| `fantasy-yahoo-oauth-start` | user JWT | returns Yahoo authorize `url` |
| `fantasy-yahoo-oauth-callback` | browser redirect | exchange code, store tokens, sync, redirect `/fantasy-yahoo-return.html?tab=fantasy&yahoo=…` (app scheme handoff) |
| `fantasy-yahoo-sync` | user JWT | refresh token if needed, re-sync Yahoo leagues |

Shared: **`fantasySleeperSync.ts`**, **`fantasyYahooSync.ts`**. `verify_jwt = false` (manual JWT via `userIdFromJwt` except the Yahoo callback).

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
| `src/features/fantasy/FantasyHomeScreen.jsx` | Connect Sleeper / Yahoo, league pick, matchup, standings |
| `src/features/fantasy/fantasyApi.js` | invoke Edges + RLS reads; `setPrimaryFantasyLeague` is client RLS |
| AppShell tab **`fantasy`** | Hamburger + Sports Hub Fantasy tile |
| Light mode | `html.light [data-fantasy-home]` |

## Hub pin roles

`gameHubFantasyPins.js` stores `{ id, role, source }`:

| Role | UI | Source |
| --- | --- | --- |
| `mine` | Blue **Watch** | Manual tap or league auto |
| `enemy` | Rose **Enemy** | League auto (opponent starters in this game) |

On NFL hub open: `hub_pins: true` reads the user’s **primary** league (any provider) and applies mine/enemy sleeper ids present in that game.

## EdgeiOS note

**Connect Yahoo** must not `location.assign` into the WKWebView (Yahoo login has hard-crashed the IPA). Shell uses **`openExternalUrl(url, { system: true })`** (system Safari), same idea as Stripe.

OAuth redirect chains (Yahoo → Supabase callback → https SPA) do **not** Universal-Link back into the IPA, so Safari would stick on a logged-out edgetilt.com login modal. Callback therefore lands on **`/fantasy-yahoo-return.html`**, which opens **`edgetilt://live-session?tab=fantasy&yahoo=…`** (shipped IPA already maps that host into the WKWebView) and falls back to the SPA for web. Fantasy also refreshes on `visibilitychange` / `yahoo=linked`.

## Smoke (test)

1. Set Yahoo Edge secrets (above) on test, redeploy yahoo Edges.
2. lvslotpro / EdgeiOS → Fantasy → **Connect Yahoo** → authorize in Safari → return → leagues load.
3. Pick primary league → lineup + matchup + standings.
4. Open an NFL hub with a starter → Watch / Enemy pins.
5. Sleeper username link still works alongside Yahoo.
6. ESPN / CBS remain **Soon**.
