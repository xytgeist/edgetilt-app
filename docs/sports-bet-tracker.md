# Sports bet tracker (Sports Edge)

**Status:** v1 scaffold on **`test`** (`1.4.1057+`). Product slug **`sports-edge`** (Stripe price later).

## Why this, not a Pikkit clone

Sync-only apps (Pikkit, Juice Reel) win on hands-off US book pull and miss anything outside their API list. Manual / slip tools (Bet Journal, SlipSync) cover offshore but feel bolted on. EdgeTilt’s unfair angle is already in-house:

- Sports Hub odds + book deep links (line shop intake)
- **`lounge_market_files`** locked Pinnacle-style closes (real CLV)
- Same Lounge / units culture as syndicate desks

**v1 does not** ask for sportsbook passwords or scrape books.

## v1 cut

| Ship | Skip (later) |
| --- | --- |
| Manual log + **Log a bet** from game hub (game prefill) | Book credential sync |
| Units stake, American odds, market (spread / ML / total / other) | Screenshot OCR slip ingest |
| Open → won / lost / push / void settle | Parlay legs model |
| P&L units + ROI + record | Verified public record / marketplace |
| CLV vs locked **`lounge_market_files`** close (RPC) | Live CLV tick before lock |
| Free for verified users while Sports Edge SKU is dark | Hard `sports-edge` paywall |

## Data

- Table **`sports_bets`** (RLS: own rows only) … migration **`20261006010000_sports_bet_tracker.sql`**
- CLV: **`sports_bets_refresh_clv()`** security definer reads locked closes for the caller’s event ids (does not widen market-file RLS to the client)

## Client

- Feature: **`src/features/sports-bet-tracker/`**
- Tab: **`?tab=sports-bets`**
- Prefill: hub **… → Log a bet** / `requestSportsBetLog(prefill)`

## Access

Documented under **`docs/access-tiers.md`** § Sports Edge. Hub entry is unlocked for verified users in v1; subscribe gate lands when **`STRIPE_PRICE_SPORTS_EDGE`** ships.
