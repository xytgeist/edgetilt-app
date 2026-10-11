# Fantasy Connect (Sleeper first)

Signed-in users link a fantasy account, sync leagues/rosters/matchups, and auto-highlight **mine** + **enemy** players on NFL game hubs.

## Product (MVP)

| Item | Spec |
| --- | --- |
| Provider 1 | **Sleeper** username link (public API … no OAuth) |
| Surfaces | Fantasy home (`?tab=fantasy`) + NFL game-hub pins |
| Gate | Free for signed-in users |
| Primary league | Last picked / only league … drives hub pins |

**Soon (same tables, new Edge modules):** Yahoo OAuth, ESPN, CBS. Out of MVP: waivers/AI, multi-league simultaneous hub highlight, paid gate.

## Tables (provider-agnostic)

Migration **`20261011180000_fantasy_connect.sql`**. RLS: owner-only via `auth.uid()`.

| Table | Role |
| --- | --- |
| `fantasy_connections` | `user_id`, `provider` (`sleeper` / `yahoo` / `espn` / `cbs`), external username/id, status, `primary_league_id`, last sync |
| `fantasy_leagues` | connection, external league id, name, season, scoring snapshot, `is_primary` |
| `fantasy_teams` | league, external roster/team id, owner label, `is_mine`, W-L, PF |
| `fantasy_rosters` | team + week + slot (`starter` / `bench`), **`sleeper_id`** (canonical), name/pos/team |
| `fantasy_matchups` | league + week, mine/opp team ids + scores |

Player identity joins **`nfl_players.sleeper_id`** (same as game-hub Fantasy board).

## Edge Functions (test first)

| Function | Body | Behavior |
| --- | --- | --- |
| `fantasy-sleeper-link` | `{ username }` | Resolve Sleeper user, upsert connection, sync |
| `fantasy-sleeper-sync` | `{}` / `{ connection_id }` / `{ primary_league_id }` / `{ hub_pins: true }` | Sync leagues/rosters/matchups for current NFL week (`/v1/state/nfl`), or return `{ mine, enemy }` starter sleeper ids for the primary league |

Shared logic: **`supabase/functions/_shared/fantasySleeperSync.ts`**. `config.toml`: `verify_jwt = false` (manual JWT via `userIdFromJwt`, same pattern as other user Edges).

MVP sync triggers: link, Fantasy home Sync, optional open home. Cron later.

## Client

| Path | Role |
| --- | --- |
| `src/features/fantasy/FantasyHomeScreen.jsx` | Connect Sleeper, league pick, my team + this-week matchup, standings |
| `src/features/fantasy/fantasyApi.js` | invoke link/sync + RLS reads |
| AppShell tab **`fantasy`** | Hamburger + Sports Hub Fantasy tile + `?tab=fantasy` |
| Light mode | `html.light [data-fantasy-home]` in `src/index.css` |

## Hub pin roles

`src/features/lounge/gameHub/gameHubFantasyPins.js` stores `{ id, role, source }`:

| Role | UI | Source |
| --- | --- | --- |
| `mine` | Blue **Watch** (Fantasy board, Players badge, play toasts) | Manual tap or league auto |
| `enemy` | Rose **Enemy** | League auto (opponent starters in this game) |

Legacy localStorage string ids migrate to `{ id, role: 'mine', source: 'manual' }`.

On NFL hub open (after fantasy.players load): client calls `hub_pins: true`, then **`applyFantasyPinsFromLeague`** intersects mine/enemy with players in that game. Replaces prior `source: 'league'` pins; keeps manual Watch pins. Tap still toggles mine / clears a pin.

## Smoke (test)

1. Sign in on lvslotpro → hamburger **Fantasy** (or Sports Hub tile) → link Sleeper username → Sync.
2. Pick a league → see lineup + week matchup + standings.
3. Open an NFL game hub that includes a starter from your matchup → Fantasy / Players show Watch (blue) / Enemy (rose); play toast matches.
4. Manual Watch tap still works; Yahoo/ESPN/CBS show **Soon**.
