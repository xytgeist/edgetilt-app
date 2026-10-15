# Sports bet tracker (Sports Edge)

**Status:** intake bones on **`test`** (`1.4.1058`). Product slug **`sports-edge`** (Stripe price later).

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

1. **Odds-cell Log (bones shipped `1.4.1058`, fill complete `1.4.1061`)** … **hold** (or right-click) the number on the hub board / odds table. Tap still opens the book. Composer fills book / market / side / line / odds / selection. Stake defaults to **1u**.
2. **Slip capture (heuristic v2 `1.4.1182`)** … paste text, or photo on IPA/APK (`recognizeText`, purpose `sports-bet-slip`) → heuristic parse → confirm. Multi-photo (up to 8) → **review queue** (Verify / Skip / Save all). OCR/parse failures stay in the queue with a **Failed** pill + **Fill** (manual form + photo). Weak junk parses retry once via Edge **`sports-bet-slip-parse`** (OpenAI text/vision; parlays should return `legs[]`). If AI only dumps `Parlay legs: …` into notes, client **hydrates** structured legs before blank placeholders. Vision OCR often bunches juices after picks … parser **zips** them. **Declared leg count** + **junk selection** detection (dates / `TO WIN` footers / FanDuel **Finished** + period scores) mark weak drafts; hydrate prefers the cleanest source at that count. **Collapsed N-pick slips** with money + a few expanded legs: fill stake/paid/odds/sport + visible legs; put the comma **name list in Notes** (`Parlay picks (N): …`) … do **not** invent missing legs from names. FanDuel settled alt lines use the bold **Team +line** above ALTERNATE *, not opponent scoreboard rows. FanDuel My Bets open: `Team -120`+MONEYLINE → clean ML + juice; dual `$stake $payout` over TOTAL WAGER / TOTAL PAYOUT. FanDuel settled SGP props: player + **TO HIT A HOME RUN** / **TO RECORD A STOLEN BASE** / **TO RECORD N+ RBIS** / **TO SCORE N+ TOUCHDOWNS** (+ team MONEYLINE); **Same Game Parlay +odds** is ticket total; dual `$` above **TOTAL WAGER WON ON FANDUEL**. **Stacked My Bets cards** in one crop: `slicePrimarySlipCard` keeps the first ticket through BET ID/PLACED (≥2 BET IDs, or a 2nd header after the first footer) … does not cut a single dual-SGP with one BET ID. DK **Anytime TD Scorer** + golf **Top N Live Betting**; **Dead Heat** Paid may be **under** stake (to_win negative) and must not map sport to NBA Heat. Open betslip **"N Leg/Pick(s) Parlay +odds"** is combined odds chrome (not a leg); hydrate **backfills** Combined odds from that print when Edge leaves odds blank. **Combined odds** only when the ticket prints an American/decimal total; otherwise blank. **Stake** from TOTAL WAGER / Ticket Cost / DK **Wager:** (not unit-size default) … also glued `$70 TOTAL WAGER` and $ above/below the label. **Won ($)** / collect from WON ON / YOU WON / DK **Paid:** (glued or above/below; never steal TOTAL WAGER $). Open tickets: **To win** / **To collect**. Settled **won** / **lost** status + money fields as before (standalone **WON** / **LOST** badges; WON glued on pick-parlay line); open PLACE BET never inferred lost. Settled ML parlays may omit per-leg juice … keep team+MONEYLINE legs. **Sport** filled whenever inferable (league keywords, MLB/NBA club clusters before NFL nickname collisions, golf Top-N / golfers, person-vs-person ML parlays → Table Tennis; Tennis/ATP/WTA when printed) … list chips show the sport on parlays for filter. SQL **`20261015010000`**. Also: Caesars Horseshoe / casino brackets, Golden Nugget AC `Money Line FT`, DK `N+` props, FanDuel SGP, alt lines, decimal parlays (→ American). Save all skips failed rows. Stake lands as **dollars**. **Parlays:** parent + `sports_bet_legs`. Fixtures: `node scripts/sports-bet-slip-parse-fixtures.mjs` (**78/78**).
3. **CSV / statement import (bones shipped)** … file with Odds / Selection columns; bulk insert when more than one row parses (no review queue).
4. **Real book connect** … only via licensed aggregator or official partner APIs, behind Sports Edge. **Never scrape logins.**

Also improve where they are mediocre: CLV vs locked Pinnacle-style closes; Autofill **out** through sportsbook deep links we already have on odds rows.

---

## v1 cut (shipped scaffold)

| Ship | Skip (later … see build order) |
| --- | --- |
| Manual log + **Log a bet** from game hub (game prefill) | DIY book credential sync (**never**) |
| **Hold odds cell** to log that book/line | Tap-replaces-open-book (tap still opens the sportsbook) |
| Paste slip + IPA photo OCR + CSV import (heuristic, confirm first) | Trained slip Vision model / share-sheet auto-ingest |
| Units stake, American odds, market (spread / ML / total / **player prop** / other), **Sport** (NFL, CFB, …) | White-label / official book connect |
| Open → **auto-grade** spread / ML / total (ESPN, incl. dated boards from commence); grade runs after slip verify/save; **parlay legs** roll up parent; props stay manual | Verified public record; SGP push-odds reduction |
| P&L units + ROI + record | Hard `sports-edge` paywall |
| CLV vs locked **`lounge_market_files`** close (RPC) |  |
| Free for verified users while Sports Edge SKU is dark |  |

**v1 does not** ask for sportsbook passwords or scrape books. That stays true even after “sync feel” ships.

---

## Data

- Table **`sports_bets`** (RLS: own rows only) … migration **`20261006010000_sports_bet_tracker.sql`**
- Intake sources `odds_cell` / `slip` / `csv` … **`20261006020000_sports_bets_intake_sources.sql`**
- Settings **`sports_bet_settings`** (unit size + starting bankroll) … **`20261006030000_sports_bet_settings.sql`**; default bankroll **$10k** … **`20261011050000_sports_bet_settings_default_bankroll.sql`**
- Tap-through confirm flag **`sports_bets.confirmed`** + source `odds_tap` … **`20261006040000_sports_bets_tap_confirm.sql`**
- Player prop market + `player_name` / `prop_stat` … **`20261006050000_sports_bets_prop_market.sql`**
- Parlay legs … **`20261014160000_sports_bet_parlay_legs.sql`** (`market=parlay` + **`sports_bet_legs`**). Applied on **test + prod** with **`1.4.1140`**. Slip parse: BetMGM selection+odds; FanDuel ALT props; Circa/the D `[rot] TEAM (±line odds)`; retail Parlay Card `rot Team ±line Spread`. Ticket TO COLLECT / Max Payout preferred for combined odds.
- CLV: **`sports_bets_refresh_clv()`** security definer reads locked closes for the caller’s event ids (does not widen market-file RLS to the client)

Applied **`20261006010000`** test + prod 2026-10-05. Applied **`20261006020000`** test + prod 2026-10-05 (intake sources). Applied **`20261006030000`** + **`20261006040000`** + **`20261006050000`** on **test + prod** 2026-10-06.

## Client

- Feature: **`src/features/sports-bet-tracker/`**
- Tab: **`?tab=sports-bets`** (Sports Hub **Bet Tracker** row; league hubs have a clipboard chip. Not in the hamburger.) Title bar **×** / header back returns to the Sports Hub / game hub that opened it.
- Prefill: hub **… → Log a bet** / hold odds / `requestSportsBetLog(prefill)` … closes the sports surface and sets `tab=sports-bets`. Does **not** keep `?game=` (that reopened the league hub). Hollow `?logBet=1` URLs **must not** open the composer (that wiped book / line / odds after a hold). Prefill lives in memory + sessionStorage + the open event.
- **Tap-through:** opening the book from a hub odds cell inserts an **unconfirmed** 1u bet (`odds_tap`). Confirm / Edit / Delete on the tracker row. Hold still opens the composer first. Same for Kalshi/Poly Yes/No and landscape player-prop rails (Yes = Over, No = Under; implied ¢ → American).
- Composer **Event**, **Event date** (`commence_time`), **Sport** (NFL / CFB / NBA / MLB / NHL / PGA / MLS / Other), **Book**, **Label**. Sport maps to Odds API `sport_key`. **Player prop** market adds Player + Stat.
- Money: **1u** default stake, **$** field, default **$100** unit size, default bankroll start **$10,000**. **Bankroll** and **unit size** are set from the tracker chips / **Set bankroll & unit size** (and Unit size on Log a bet). Bankroll = start + settled $ P&L.
- **Auto-grade:** open spread / h2h / total bets settle from ESPN finals via Edge **`sports-bets-grade`** (tracker load/refresh) and the existing **`lounge-odds-poll` `grade_picks`** cron. **Boxing** never promises auto-grade (no ESPN board). UFC/MMA: moneyline only. Props / other stay manual. Past commence still open → chip **No final matched yet** (not “when final”). Manual override on auto-gradeable rows.
- **Progress:** overlay while photo OCR / AI parse, Save / Save all / CSV import, and post-save grade. Delete uses a card-local spinner (“Deleting…”) only.
- **Label summary:** pick + odds share a space (`49ers ML +120`); middots only before stake/date.
- **Tools sheet** (`SportsBetToolsSheet.jsx`, `?tab=sports-bets&betTools=`): Sports Hub **Tools** chip + tracker **Tools**. Featured **Parlay / Hedge / Kelly** prefill from open bets and bankroll. Utilities: payout, converter, implied, EV, no-vig, arb. Open-bet **Hedge**; settled cards skip the Payout shortcut (use Tools). Not nine hub tiles. Math: `sportsBetCalcMath.js`.
- Git: scaffold **`0ef9edbd`** (`1.4.1057`) on **`origin/test`**. Notes commit is the tip after computer-change writeup. Draft PR: `cursor/sports-bet-tracker-9369`.

## Access

Documented under **`docs/access-tiers.md`** §5.5. Hub entry is unlocked for verified users in v1; subscribe gate lands when **`STRIPE_PRICE_SPORTS_EDGE`** ships.
