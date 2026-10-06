# Sports bet tracker (Sports Edge)

**Status:** v1 scaffold on **`test`** (`1.4.1057`). Product slug **`sports-edge`** (Stripe price later).

**Ryan lock (2026-10-06, computer change):** be **strong where Pikkit is strong and strong where they are weak**. Manual + our CLV is not enough. Hands-off complete records are required. **Do not DIY sportsbook password scrape.**

Canonical for the next machine. Also in **`WAKEUP`** ACTIVE TRACK.

---

## Thesis

EdgeTilt Bet Tracker = **board-native intake + real CLV + coverage that does not depend on which books sync** … plus a capture pipeline good enough that daily grinders do not need a second app for the books that *do* sync elsewhere.

| Where | What “strong” means |
| --- | --- |
| **Where they are weak** | Hub one-click log, offshore / Circa / exchanges, units + tags, CLV vs **our** locked closes (`lounge_market_files`), line shop lives in Sports Hub |
| **Where they are strong** | Hands-off capture at volume from real books. Without this, serious bettors stay on Pikkit / Juice Reel |

v1 scaffold (manual log + hub **Log a bet**) is table stakes, not the product.

---

## How Pikkit actually works (BookSync)

Pikkit is a **credential-sync tracker**, not a logger.

1. User gives username / password (and 2FA) per book.
2. Pikkit **logs into the book as them** and pulls **full bet history**. First sync can take minutes. Keep the app open … backgrounding pauses it.
3. User keeps betting in DK / FD / etc.
4. **Open Pikkit** (or pull-to-refresh) re-reads the account. New bets land in seconds: sport, market, odds, stake, parlay legs, status.
5. Settlements (win / loss / push / void / partial SGP) update from the book.

They sell it as **read-only** (see bets + balance; cannot place / deposit / withdraw). It is **not a live webhook**. It is **session scrape / partner pull on app open**. Password change or “unusual login” often kills the session.

**Coverage (their site, late 2026):** regulated US books (DK, FD, MGM, Caesars, bet365, Circa, Fanatics, …), sweepstakes books, DFS pick’em (PrizePicks, Underdog, Sleeper…), prediction markets (Kalshi, Novig, ProphetX, Sporttrade). **Pikkit Pro** adds some offshore (Bovada, BetOnline, bet105, BookMaker, BetUS). **No manual entry.** If the book is not integrated, you cannot track it.

**On top of sync:** unified P&L / ROI (free). **CLV is Pro** … odds vs close (best available / no-vig / custom book / respective book), not SGPs. **Autofill** is the reverse pipe (build in Pikkit → fill the book’s betslip). Social verified record because bets came from the book.

**Why it wins US grind:** zero discipline, complete history, immutable on supported books.

**Why sharps bounce:** book passwords at a third party; anything off the login list is invisible; sessions rot; CLV is whatever *their* odds tape is.

---

## What we copy vs what we refuse

**Copy the job:** complete, hands-off records. Same outcome as BookSync.

**Refuse the method:** store DK/FD passwords and log in as the user.

Why not DIY BookSync:

- Books’ ToS usually ban sharing credentials. One legal letter or a session-block and the feature is dead.
- We would be a **password vault for gambling accounts**. Breach = every user's bankroll login.
- 2FA, geo, bot walls, password-change kills … a sync ops desk forever.
- Apple already hates gambling + credential stuffing. Worse in a WKWebView shell.

**Clean path to “sync strength” (later):** official book partner APIs, or **white-label an aggregator** that already has the 30-book sessions. Product can still say “Connect DraftKings.” We never store book passwords.

---

## Build order (next sessions)

1. **Odds-cell Log** … tap the number on the hub board → stake → save. Betstamp’s “from the board” strength. Hub **… → Log a bet** already exists as game-level prefill.
2. **Slip capture that feels like sync** … photo / share-sheet / paste → Vision (W-2G pipe already exists) → confirm → log. Covers US + offshore. SlipSync’s strength without logins.
3. **CSV / statement import** … DK/FD exports as a bridge while real connect is dark.
4. **Real book connect** … only via licensed aggregator or official partner APIs, behind Sports Edge. **Never scrape logins.**

Also improve where they are mediocre: CLV vs locked Pinnacle-style closes; Autofill **out** through sportsbook deep links we already have on odds rows.

---

## v1 cut (shipped scaffold)

| Ship | Skip (later … see build order) |
| --- | --- |
| Manual log + **Log a bet** from game hub (game prefill) | DIY book credential sync (**never**) |
| Units stake, American odds, market (spread / ML / total / other) | Screenshot OCR slip ingest (**next**) |
| Open → won / lost / push / void settle | Odds-cell one-tap log (**next**) |
| P&L units + ROI + record | CSV / statement import |
| CLV vs locked **`lounge_market_files`** close (RPC) | White-label / official book connect |
| Free for verified users while Sports Edge SKU is dark | Hard `sports-edge` paywall; parlay legs; verified public record |

**v1 does not** ask for sportsbook passwords or scrape books. That stays true even after “sync feel” ships.

---

## Data

- Table **`sports_bets`** (RLS: own rows only) … migration **`20261006010000_sports_bet_tracker.sql`**
- CLV: **`sports_bets_refresh_clv()`** security definer reads locked closes for the caller’s event ids (does not widen market-file RLS to the client)

Applied **test + prod** 2026-10-05 (`schema_migrations` **`20261006010000`**).

## Client

- Feature: **`src/features/sports-bet-tracker/`**
- Tab: **`?tab=sports-bets`** (hamburger **Bet Tracker**)
- Prefill: hub **… → Log a bet** / `requestSportsBetLog(prefill)`
- Git: scaffold **`0ef9edbd`** (`1.4.1057`) on **`origin/test`**. Notes commit is the tip after computer-change writeup. Draft PR: `cursor/sports-bet-tracker-9369`.

## Access

Documented under **`docs/access-tiers.md`** §5.5. Hub entry is unlocked for verified users in v1; subscribe gate lands when **`STRIPE_PRICE_SPORTS_EDGE`** ships.
