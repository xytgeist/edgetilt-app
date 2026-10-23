# Fantasy suite (Edge Ops)

Product plan for EdgeTilt Fantasy … **tools for edge hunters**, not a league viewer and not a FantasyPros expert-content clone.

**Connect implementation (shipped / in flight):** **`docs/fantasy-connect.md`**.

**Public page:** `https://edgetilt.com/fantasy` is a crawlable intro with a join CTA. It does not load leagues. The hub tile stays Coming soon, and Fantasy stays out of the hamburger. The app route remains `?tab=fantasy`. Yahoo's browser return stays `/fantasy-yahoo-return.html`.  
**Positioning:** Connect is the door. The suite is decision tools + live command center + DFS toolkit + cross-edge hedges, fed by synced leagues/lineups. **Notifications are a first-class retention fabric** across all layers … not an afterthought.

## Test tally (pending checks)

Running list of shipped work that still needs a real-data check. **Add a line whenever something ships without one; tick it (with date + result) when checked.** Agents: read this before building more fantasy features.

**Monday 2026-10-26 (first scoring week for the ESPN / Yahoo NBA leagues)**
- [ ] ESPN NBA live per-player week points sync during games (Dallas Pro H2H Categories).
- [ ] Yahoo H2H-Pts 272329 week 2 matchup + live scores sync.
- [ ] Category board on live data (Dallas Pro): host totals + projections, FG% / FT% estimates, win chance moves sensibly.
- [ ] Yahoo High Score 273072: are Yahoo's per-player week points the best game (assumed) or the sum? Compare with box scores.
- [ ] High Score weekly Start / Sit mid-week (banked best game vs bench games left).
- [ ] NBA win % with the new variance (9 per point; Lock-In / High Score 5) looks sane mid-week and late week.
- [ ] Stream on a live week (this-week nights, same-night adds, open nights match the Schedule card's Starting row).
- [ ] Schedule card "This week" during play: past games dimmed, live chip, starts left counting down.
- [ ] NBA weekly digest arrives Monday 9 AM PT with sensible content.

**After each new league drafts + syncs**
- [ ] Yahoo H2H-Cat 49714 (draft 2026-10-22 3pm): categories saved; then build Yahoo categories matchup totals.
- [ ] Yahoo High Score 271599 (4 teams; settings HTTP 400 pre-draft): syncs as High Score after draft.
- [ ] Yahoo Roto 272771: syncs (no matchups); Roto / season-points standings view not built yet.
- [ ] ESPN NBA H2H Points: first real test of the ESPN points path.
- [ ] ESPN NBA H2H Most Categories (New Orleans): re-sync saves categories (was synced as points: `H2H_MOST_CATEGORIES` missed the CATEGORY check, fixed 1.4.1396); category board win chance = more categories won, which is how Most Categories scores.
- [ ] ESPN NBA trade offer in New Orleans (from team 9, 5 players, expires 2026-10-24 3:14pm PT): Trades > Review lists and grades it after the re-sync (pending trades now read games/fba + ESPN season).
- [ ] ESPN NBA Roto + Season Points: standings view (not built).
- [ ] ESPN NHL leagues (5 types): NHL not supported at all yet (own project).

**After the High Score promote**
- [ ] Re-sync Yahoo: 273072 saves `high_score`, `daily_lineups: false`, `max_weekly_adds: 4`; Stream tab hidden there; Roster shows a weekly plan; projections ~best game, not summed.
- [ ] Stream footer shows "one of your 4 adds a week" on H2H-Pts 272329.

**Earlier ships, not yet confirmed on device**
- [ ] Sleeper 2K Lock-in calls (Lock / Wait) during a live week.
- [ ] Player news: insider notes only under players their headline names (Barkley / D. Smith case); full league names; NFL headshot zoom in news + live plays.
- [ ] League outlook alert (pill + collapsed line + Needs attention box) in dark mode (light checked 2026-10-22).
- [ ] Stream shortlist by better week: next-week streamers show late in a week (check on a Sunday).
- [ ] Jordan Pike keeps posting on prod; portal Run pipeline / Dry run buttons work for sports_news.
- [ ] Jordan Pike roundups post one line per item (worst first) and most game posts carry a game pill (this-week window, ~40% budget, up to 3 pills on mixed roundups).

- [ ] Composer: typing TNF / SNF / MNF (or spelled out) offers that night's game pill (MNF doubleheader offers both).

- [ ] Matchup cards show league name + NBA format chip (dark + light); long ESPN names truncate cleanly.


- [ ] App-open background sync: open the app on Home, wait ~1 min, open Fantasy: no spinner (already fresh); reopening within 5 min does not re-sync; iOS resume triggers it.

- [ ] Player news sport tags (NFL blue / NBA orange) and All / NFL / NBA filter, dark + light.

- [ ] Expanded player panel peek-bounce toward the markets page (1s after expand, once; skipped if touched first) feels right on iPhone.

**Checked**
- [x] 2026-10-22 Real schedules on prod (Edge Lord sync, approved by Ryan): ESPN NBA Dallas / New Orleans / Utah weeks 2-19 (5 games), ESPN NFL 8-14, Sleeper 2K 2-21 (3 games), Yahoo NBA H2H-Pts / H2H-Cat / High Score 3-19, Yahoo NFL 8-14 (6 games); Roto / Season Points / pre-draft leagues save none (expected). First Yahoo sync with 4 schedule reads took 63s; later syncs reuse the schedule for 7 days.
- [x] 2026-10-22 Real schedules: Yahoo `/teams/matchups` parses to 5 games / 10 teams for weeks 2-19 (H2H-Pts 272329 + High Score 273072); Sleeper NFL test league saved weeks 8-13; synthetic sim: equal teams 51% / 51% random vs 9% / 94% with a lopsided schedule; stale schedule falls back to random.
- [x] 2026-10-22 Stream on Dallas Pro (Edge Lord session): next-week plan, open nights, picks match real schedules, pick-one note.
- [x] 2026-10-22 Schedule card on Dallas Pro: next week, 40 vs 37 starts, nightly starts, back-to-backs, fits a phone after the grid fix.
- [x] 2026-10-22 Yahoo H2H-Pts win % 1% -> 10% after the variance fix; Roster rows show next week's games when upcoming.

## Synopsis (Ryan, 2026-10-16)

Fantasy in Edge is a command center for leagues the person already plays. It is not a second ESPN, Yahoo, CBS, or Sleeper, and it is not an expert-rankings site.

The unlock is **their roster**. Once Edge can see this user’s teams, starters, and opponents, the rest of the plan is possible: who to start, who to pick up, what trade to send, a live week view, and bets that insure a bad fantasy outcome. Connecting a host is the door. The product is what we do with the roster after that.

How people get in:

- **Sleeper** is live (username). It only sees leagues already on Sleeper. It does not pull ESPN or CBS.
- **ESPN and CBS** use an in-app login sheet docked to the bottom of the phone. The person signs in on that site, captcha included. We keep the session. We never ask for or store the password. A pasted cookie, a public league id, or a CSV is not the product. The browser cannot do this. Old app builds that lack the sheet stay disabled.
- **Yahoo** is one more door. Its API approval can sit forever without freezing the suite.
- **DraftKings and FanDuel** are the daily mode later (lineup file first). They are not season-long Connect.
- **DataForce** has a read API. Not in the plan until Ryan asks for it.

What we will not copy from FantasyPros: a pile of expert votes. What is worth copying is the idea that advice is about **your** roster, not a generic top-50 list. Our advice is ops (start, waiver, trade), a live week, and optional insurance bets. Expert consensus stays out.

The NFL Hub Fantasy tile stays **Coming soon** until Ryan says Connect is good enough to show. Four fast taps on that tile open Fantasy for testing. Do not put Fantasy back in the hamburger.

Build order after a roster actually syncs: Live week and injury/lineup alerts, then Start/Sit and waivers, then an optional hedge into the bet slip, then the trade finder, then DFS. NFL first.

---

## North star

| We are | We are not |
| --- | --- |
| Fantasy **Ops** for people who already play season-long + DFS | A second host site UI |
| League-aware tools (scoring, roster, FA pool, byes) | Generic “expert consensus” content farm |
| Multi-sport (NFL beachhead, then expand) | NFL-only forever in the IA |
| Cross-edge with bets, hubs, Lounge, Island | A siloed fantasy mini-app |
| Timely **notifications** that pull users back to act | Spammy score spam with no next action |

**Modes (first-class):**

| Mode | Mental model |
| --- | --- |
| **Season-long** | Leagues, weeks, waivers, trades, playoffs |
| **Daily (DFS)** | Slate, salary, ownership, correlation |

Same player identity graph. Different workflows. Fantasy home IA: **Leagues** | **Live** | **Tools** | **DFS**.

---

## Success metrics

- Not “user synced a league.”
- **Weekly:** opens Live HQ or Start/Sit before kickoff.
- **Edge-native:** jumps hub ↔ fantasy ↔ bet on the same game without leaving Edge.
- **Trade Analyzer:** user copies/sends at least one generated or reviewed offer per month in-season.
- **Emotional hedge:** optional; tracked as `hedge_of` in bet tracker when used.
- **Notifications:** tap-through rate from fantasy pushes into Live / Tools / hedge / trade surfaces (retention signal).

---

## Layer map

| Layer | Name | Job |
| --- | --- | --- |
| **A** | Connect | Providers → leagues/lineups/slates into Edge |
| **B** | Season-long tools | Start/Sit, Waiver, Trade Analyzer, research |
| **C** | Live Fantasy HQ | Gameday-shaped week command center (Edge-native) |
| **D** | DFS tools | Slate / optimize / live slate monitor |
| **E** | Cross-edge | Emotional hedges, bet+fantasy same game |
| **F** | Notifications | Outcomes, considerations, injuries, alerts … bring users back to act |

Shared engines (build once, reuse):

- **Player values** … ROS / weekly projections + VORP in *league scoring* (Std / Half / PPR / custom later)
- **Roster need / surplus** … starters + bench depth + byes + injuries
- **Fairness band** … Aggressive ↔ Fair slider for trades
- **Exposure map** … my starters / enemy starters / DFS ownership → hedges + Live HQ filters + notification targeting

---

## Layer A … Connect

### Goal

Ingest season-long leagues and DFS lineups/slates so Layers B–E can analyze **this user’s** teams.

### Season-long connectors

Priority is US hosts with real APIs or stable sync paths. Spec status vs plan:

| Provider | Format | Status | Notes |
| --- | --- | --- | --- |
| **Sleeper** | Username → API | **Shipped** | Best open API; multi-sport on Sleeper over time |
| **Yahoo** | OAuth (`fspt-r`) | **Shipped code; API approval pending** App ID `i4wW6xoc` | Blocker: Yahoo Fantasy API gate |
| **ESPN** | In-app bottom login sheet → `espn_s2` + `SWID` (password never stored) | **Sheet shipped** (web `1.4.1212`, Android APK **1.3.24**). Leagues come from the fan profile. Browser cannot read the session | Server password login is blocked by ESPN captcha. Sheet is a separate WebView, not the app webview. Not yet retested after the fan-profile fix |
| **CBS Sports** | In-app bottom login sheet → member token + My Teams league ids | **Sheet shipped** (web `1.4.1213`, Android APK **1.3.24**). First real account not smoked yet | Password never stored. Token and league-id shape may need a tweak after the first real login |
| **NFL.com** | TBD | Planned | Common host; API quality TBD |
| **Fantrax** | TBD | Later | Power-user / deeper custom leagues |
| **MyFantasyLeague (MFL)** | TBD | Later | High-stakes / dynasty crowds |
| **RT Sports / NFFC** | TBD | Opportunistic | Only if API or import is clean |

**Out of scope for Connect v1–v2:** scraping that violates ToS without a durable partner path. Prefer OAuth / official / user-paste import.

**Per league we must store (min):**

- `provider`, external league id, **sport**, season
- Scoring config (at least Std / Half / PPR; custom multipliers later)
- Roster slots / bench / IR rules (as available)
- Teams (mine + others), records
- Rosters by week (starters/bench), matchups
- FA / waiver pool snapshot when tool needs it (Layer B)
- Pending inbound trades when provider exposes them (Layer B Offer Review)

Player identity: canonicalize to Edge IDs (`nfl_players.sleeper_id` today for NFL; extend per sport).

### DFS connectors

Separate provider enum / tables from season-long (or `kind = season | dfs` on connections).

| Site / product | Ingest path (plan) | Priority |
| --- | --- | --- |
| **DraftKings** | OAuth/partner if available; else **CSV / lineup export** + manual slate pick | P0 for DFS v1 |
| **FanDuel** | Same | P0 |
| **Underdog** | API/export TBD; pick’em + best ball variants later | P1 |
| **Yahoo DFS** | May share Yahoo OAuth family; confirm scopes | P1 |
| **Sleeper DFS** | If exposed beside season-long Sleeper | P1 |
| **PrizePicks / Sleeper pick’em** | Different product (entries not classic salary) … optional later | P2 |

**DFS v1 can ship with CSV / paste lineup** even before full OAuth … unblocks Layer D tools.

### Multi-sport

- `fantasy_leagues.sport` (and DFS slate sport): `nfl` | `nba` | `mlb` | `nhl` | `ncaaf` | `soccer` | …
- NFL beachhead for Live HQ + hub pins (existing game hubs)
- Other sports: Connect + Tools can list earlier than full Live HQ
- Do not hardcode “football” into Fantasy home IA

### Layer A deliverables / specifics

- [ ] Yahoo API approval + reconnect path live (does not block the rest)
- [x] ESPN iOS + Android session-cookie sync (retest on a real account still open)
- [x] CBS iOS + Android token sync (first real account still open)
- [ ] `sport` + `kind` (`season` \| `dfs`) on connection/league model
- [ ] Multi-league switcher (primary still drives hub auto-pins)
- [ ] Scoring + roster-slot snapshot for tool engines
- [ ] DFS connection stub + CSV lineup import
- [ ] Soft-launch Fantasy entry (remove Coming soon when A is “good enough”)

**Depends on:** Yahoo approval (external).

---

## Layer B … Season-long tools

### Goal

Weekly **ops** on synced leagues … without expert vote farms.

### Shared value / need engine

Inputs: league scoring, roster, opponent rosters, bye weeks, injuries/inactives, weekly + ROS projections.  
Outputs: player value, positional need score, surplus score. Used by Start/Sit, Waiver, Trade Analyzer.

Projection source v1: provider projections where available (e.g. Sleeper) + Edge/internal fallbacks. Expert consensus explicitly **out of scope** for v1.

### B1 … Start / Sit

- Optimal lineup for **this** week’s slots
- Explain swaps (bye, injury, projection delta)
- Respect league roster rules
- Multi-league: run per selected league

### B2 … Waiver / FA

- Rank **available in this league** (not global top-50 wire). **Ryan 2026-10-18:** v1 treats every NFL player not rostered in the league as available, labeled "available in your league" (no host FA / waiver-claim sync yet).
- Blend ROS value + upcoming schedule / SOS
- Optional: drop candidates from my bench

### B2b … Waiver Sniper (shipped 2026-10-18)

Waivers → Sniper: **Snipe & flip** (a rival lost a starter to out / IR / doubtful, claim the best free fill-in, then offer him alone or with one of your surplus players for one of theirs that helps your lineup, with a composed pitch), **Boom picks** (Kalshi TD / yardage ladders, next man up, matchup), **Handcuffs** (yours + block a rival). **Waiver order / FAAB + process time shipped 2026-10-18:** snipes show only from Sunday 4 PM ET until the league's next waiver run (continuous leagues always), with claim odds (priority rank vs rivals who need him, or a FAAB bid hint).

### B3 … Trade Analyzer (Finder + Offer Review)

One module, two doors:

| Door | Job |
| --- | --- |
| **Trade Finder** | Generate outbound offers |
| **Offer Review** | Grade inbound offers |

**Finder output (per run):**

1. **Best offer** … target team, package, why it helps me, why they might accept, fairness chip
2. **If declined** … 2 alternate packages to the **same** team
3. **Also consider** … best packages to 2+ other teams (e.g. Team3, Team6)

Example shape: “Your RB bench is weak (two RB1s on bye same week). Offer League_Team2: their Player1 for your PlayerA + PlayerB.”

**Offer Review output:**

1. Verdict … Accept / Counter / Decline (+ confidence)
2. Value delta in league scoring
3. Need impact (fixes bye hole vs worsens WR)
4. Their angle (what they gain)
5. If Counter … 1–2 counters in the consider band
6. If Decline … optional “better ask them for …” (reuses Finder)

**Inbound ingest:**

- Manual / paste package (all providers) … ship first
- Synced pending offers when APIs allow

**Controls:** Aggressive ↔ Fair slider (default slightly aggressive, still “considerable”). Prefer deals that also improve *their* weakest need.

### B4 … Research pack

- SOS / matchup calendar
- Fantasy points allowed by position
- Bye week board
- Depth chart / streamer helpers (QB streamers etc.)

### Layer B deliverables / specifics

- [ ] Value + need engine (NFL first)
- [x] Start/Sit v1 (2026-10-18: client `fantasyStartSit.js` … best legal lineup from your roster in league scoring, injuries / byes / locked games, swap cards; value engine for Waivers / Trades still open). **Open slots (2026-10-18):** a seat no rostered player can fill (no NFL team, bye, out, or locked on the bench) raises an amber "K is empty" alert with the top free agents at that slot whose game has not started (Edge `fantasy-waivers` mode `fill`), and the matchup row shows OPEN SLOT for a host lineup that leaves a dedicated slot empty.
- [x] Waiver v1 (2026-10-18: Edge `fantasy-waivers` … not rostered in the league, shortlisted by next-4-week Sleeper projections with byes; app `fantasyWaivers.js` scores in league rules, ranks by lineup gain vs your roster, safe drop that keeps dedicated slots filled and never cuts an IR stash on a bye-week average)
- [ ] Trade Analyzer v1 (Finder + manual Offer Review). **Finder shipped 2026-10-18** (`fantasyTrades.js`: 1-for-1 / 2-for-1, slightly aggressive band, best + if-declined + also-consider, Compose offer with Copy / Share); **Offer Review shipped 2026-10-18** (Trades → Review: paste the host's trade notice or pick both sides; `reviewOffer` grades Accept / Counter / Decline + confidence from weekly lineup gain, with best-lineup In / Out, player value edge (stash aware), their angle, roster drop, 1-2 counters in the Finder band, and a better ask on Decline). **Host offers auto-graded 2026-10-18:** Edge `fantasy-pending-trades` reads live ESPN proposals (this + last scoring period, PENDING, not expired, two-team, involving you) and the Review toggle shows a count; each offer is graded on its card and taps into the full review. Sleeper's public API has no proposals; Yahoo pending_trade waits on API approval; CBS not wired. Paste stays the fallback. **Counter advice on every graded offer (2026-10-18):** counters start from their ask (keep what they want, re-pick 1-2 of theirs; take their package, send someone else; ask them to add one; keep one of yours), must beat accepting by 0.75+/wk, and allow the other side up to -2/wk and 1.75x value back (2-for-1 consolidation). One per kind first, padded add-ons dropped. Accepts show "Or push for more"; the top counter rides on each pending offer card.
- [ ] Research pack v1
- [ ] Trade Analyzer v2 (pending-trade sync, keeper/picks, playoff SOS)

**Depends on:** Layer A league scoring + full league rosters (not just mine).  
**Trust order:** Start/Sit + Waiver before Trade Finder (lower stakes to calibrate values).

**Trade Finder valuation (2026-10-20):** two gates, both required. *Value:* market trade value from FantasyCalc redraft values for the league's format (team count, 1QB vs superflex, PPR from the rules; `fantasy-waivers` mode `trades`, shared cache 6h, unlisted players ~0), falling back to replacement-adjusted rest-of-season points (blended PPG = up to 40% season production at 5+ games + Sleeper rest-of-season rate, minus the league's 2nd-best free agent at the position, times games left = team games minus expected misses; IR without an ESPN return date assumes 4). You never give more than 15% more value than you get, they get back 90%+, and whoever takes more bodies loses their lowest-value bench player from their side. *Lineup:* best starting lineup gains per week over the rest of the season (1.5/wk when you pay extra value), their lineup loses under 0.75. Pairs are only tried when neither player clears the deal alone. Flips stay on lineup value (their need is the pitch). Code: `src/features/fantasy/fantasyTrades.js` (`valueContext`, `valueGate`), Edge `_shared/fantasyWaivers.ts` (`loadTradeBoard`, `loadMarketValues`). Stance slider (Aggressive to Fair) scales the lineup floor, the share of value they get back, your overpay cap, and the ranking weights (`stanceLimits`). Waivers share the same rest-of-season value (`fantasyValue.js`): ranked by rest-of-season lineup gain, drops never worth more than the pickup or priced 300+ above him by FantasyCalc. Next: usage-supported outperformance weight, playoff-week weighting, bye fit.

---

## Layer C … Live Fantasy HQ

### Goal

Gameday-shaped **week command center**, Edge-native … not a FantasyPros content feed.

### Surfaces

- All my matchups this week + projected win %
- Live scores for my starters / enemy
- Feed filtered to fantasy-relevant plays (optional: starters only)
- Deep link into existing **game hubs** with Watch / Enemy pins applied
- Multi-league week strip

**Shipped 2026-10-18:** the main Fantasy page leads with cross-league Live: one Start/Sit alert per league (tap opens that league on Start/Sit), one games strip and one "Your players" feed across every NFL league (your starters green, this week's opponents rose, a player started in two leagues shows once with both tags, points in the primary league's scoring, plays under a point either way hidden). The league screen keeps its own Live pill for that matchup. **2026-10-19 (1.4.1303):** at Ryan's call the main page no longer shows the games strip or play feed (each league's Live pill has them). The main page keeps one Roster alert per league, then the per-sport VS carousels, then **Player news**: Rotowire notes via ESPN for every NFL player on your teams (starters and bench), newest first, league tags when you have more than one league, Bench label when you start them nowhere. Edge **`fantasy-player-news`** (body `{ sleeper_ids }`, max 80) maps Sleeper to ESPN ids through `nfl_players` and shares each player's feed for 20 min in `edge_shared_cache` (`fantasy:news:<espnId>`), so every user rostering a player shares one ESPN read; failures and ESPN refusals are not cached and go through the shared ESPN backoff. **2026-10-19 (1.4.1304): insider news from X (FantasyPros-style).** `fantasy_insider_sources` started with 50 verified X accounts. **Culled 2026-10-19 by sample:** 2,363 original posts LLM-labeled (news / analysis / team / game / chatter / promo), 95% Wilson interval on each account's fantasy-news share, undecided accounts topped up from an older window; cut when the upper bound is under 20% or the account posted nothing in two weeks (Silver, McFadden, Josina Anderson, Breer, Louis-Jacques, Allbright, Robinson, Glazer, La Canfora, Keim, Teicher, Getzenberg … migration `20261020030000`). Gap teams tested the same way (29 candidates, 716 posts); added Nate Taylor + Matt Derrick (KC), Dave Birkett (DET), Levi Damien (LV) (`20261020040000`). Now 42 active: top signal Caplan 83%, McManus 80%, Rapoport 78%, Underdog / PFT 66%, Schefter 63%, Pelissero 54%, Garafolo 52%. No candidate passed for BUF, DEN, MIA, LAC, PIT (best: Chris Brown BUF 33% with a 19% lower bound, Furones MIA 27% but ~48 posts/day); national insiders cover those teams. **Trimmed again 2026-10-19 (Ryan):** national = core four (Schefter, Rapoport, Pelissero, Garafolo) + Underdog for speed + Caplan (83% news, ~3 posts/day); PFT (mostly echoes of the core), Fowler, Yates, Meirov, Schultz, Graziano, Wolfe, Palmer, Darlington off (`20261020050000`). 33 active (6 national, 27 beat). Model estimate ~$72/mo at $0.005 per post read using Monday-night volumes for the big accounts; expect ~$55-65 in practice. Check real spend in the X console after a week. **Paused 2026-10-19 (`20261020060000`, cron unscheduled):** a 341-post check showed Rotowire covers up to ~77% of the same player news, a median ~20 min later (30% over an hour late), and ~23% never. A feed throws that speed away, so X stays off until it feeds the alert layer (Roster banner, row flag, starter pushes). Re-enable SQL is in the migration header. **Re-enabled 2026-10-20 as Phase 3 (`20261020080000`):** the poller reads X only inside news windows (ET: Sun 10:30-13:30, 15:00-16:30, 18:30-20:30; Mon 18:30-20:30; Thu 12:00-18:00 + 18:30-20:30; Wed / Fri 12:00-18:00; Sat 14:00-18:00) and starts from now when a window opens after a gap, so off-window posts are never read or billed (est. ~$25-35/mo in season). The LLM also returns `next` (the next-game status the post sets: out / doubtful / ir / questionable / cleared / none), `next_player`, and `injury`, stored as `next_status` / `status_sleeper_id` / `status_injury`; activation / return-window posts can never set IR or Out (prompt + `RETURNING` guard). A status is **trusted** only from the core national four, Underdog, Caplan, or that player's own team beat writer; trusted Out / Doubtful / IR above ESPN's current designation goes straight into the shared starter push (`_shared/fantasyStatusPush.ts`, also used by `fantasy-status-watch`), and the shared `fantasy_status_alerts` key means ESPN's later report never repeats it. Validation on the 2-week sample (461 posts via `{ evaluate }`): 52 trusted would-push items reviewed by hand, the only 2 errors were "coming off IR" posts (fixed); after tuning 48 of 52 still push (the drops are those 2, a mixed activation post, and one of six Hurts posts) and 0 false alarms in 120 game / chatter / analysis posts. **Self-grading (2026-10-20, `20261020090000`):** Edge **`fantasy-insider-grade`** (pg_cron daily 13:00 UTC) grades every Out / Doubtful / IR an insider set in the last 21 days against the player's next game after the post (Sleeper schedule + ESPN kickoffs): Out / IR confirmed if he did not play (Sleeper weekly stats), contradicted if he played; Doubtful confirmed if he sat, otherwise left unconfirmed. Contradictions email ops (`FANTASY_ALERT_EMAILS`, falls back to `BILLING_ADMIN_ALERT_EMAILS`) and join **`fantasy_insider_regression`** with expected "none" and a review-label note. A source under 90% over its last 20 graded statuses (10+) gets `push_trusted = false` (news still shows; never re-promoted automatically). The poller logs posts read per handle (**`fantasy_insider_poll_log`**) for cost per source. Tuesdays (ET) the grader runs the regression set (`fantasy-insider-poll` `{ regression: true }`, seeded from the hand-checked set: `supabase/seed/fantasy_insider_regression_seed.sql`, 172 cases) and emails "Fantasy insider weekly scorecard" (regression pass / false alarms / misses, X posts read + cost, per-source kept items, accuracy, minutes ahead of ESPN, contradictions). Judge temperature 0 so weekly runs compare (170-171 / 172, 0 false alarms; the swing case is a borderline "ruled out with a rib injury" post). Test emails carry a "[test]" subject prefix. **In-game guard (2026-10-20):** an Out / Doubtful posted while that player's game is underway (ESPN `scoreboard?dates=` kickoff to +4h) with no future marker (next week, a weekday, weeks, season, IR, surgery, practice) is a rest-of-game ruling and sets no next-game status (`judgeGuarded` in the poller; regression cases carry `posted_at`, migration `20261020100000` + `supabase/seed/fantasy_insider_regression_posted_at.sql`). Found because "ruled out with a rib injury" flipped run to run; it also showed 5 hand-labeled seed cases (McLaurin x2, Evans, Steele x2) were in-game rulings, relabeled in `supabase/seed/fantasy_insider_regression_relabel_2026-10-20.sql`. Regression 171 / 172 after the in-game guard. **Per-player statuses (2026-10-20, `20261020110000`):** the judge returns `statuses: [{ player, next, injury }]` (one per player whose next-game status the post sets, so inactives lists and injury rundowns cover everyone), each run through the own-sentence IR guard and the in-game guard; stored in **`next_statuses`** (`[{ sleeper_id, status, injury, trusted }]`) with the most severe kept in `next_status` / `status_sleeper_id`; every trusted Out / Doubtful / IR entry can push; the grader grades every entry (contradicted if any played). Regression scores the expected player's own status. **172 / 172, 0 false alarms, twice.**

**Runbook … fantasy insider scorecard** (a Cursor Automation, "Fantasy insider weekly review", Tuesdays 7 AM PT, does steps 1, 2, and 4 and commits fixes to `test` with subjects starting `insider-review:`; it cannot deploy, so every session runs the WAKEUP standing check and does step 3. Ryan may also just say he got the email):
1. Read the newest "Fantasy insider weekly scorecard" and any "Fantasy insider check" emails in Gmail (Gmail MCP; they arrive via support@edgetilt.com; ignore "[test]" ones unless Ryan means test).
2. For each regression failure / contradiction decide: wrong label (e.g. an auto-added `contradicted` case whose post really said ruled out) → update that row in `fantasy_insider_regression`; real misread → smallest fix in the `fantasy-insider-poll` judge prompt or `RETURNING` guard. Never loosen the trust rule, the push threshold, or a demoted source's `push_trusted` without Ryan.
3. Deploy `fantasy-insider-poll` to test, run `{ regression: true }`, compare pass / false alarms / misses to the email; zero new false alarms is the bar.
4. Flag sources with high posts read per kept item or low accuracy as cull suggestions.
5. Commit + push `test`, tell Ryan what changed and whether it needs a promote (prod deploy of the poller / grader). Edge **`fantasy-insider-poll`** (pg_cron `fantasy_insider_poll` every 2 min; polls every tick Sun 11:00-24:00 and Mon / Thu 19:00-24:00 ET, every 10 min 7:00-24:00, every 30 min overnight) runs one X recent search per ~20 handles with a shared `since_id`, matches full player names against `nfl_players` (team nickname or beat team breaks same-name ties), then the LLM marks each post show / duplicate (same fact already published in the last 90 min) / skip (not fantasy news) and writes headline, summary, and Fantasy Impact credited to the reporter. `fantasy-player-news` serves show rows from the last 3 days with the Rotowire notes and drops a Rotowire note that echoes an insider item on the same player within the hour. Client: Breaking pill under 2h, expand for summary + Fantasy impact + link to the post.

NFL first (hub + scoreboard + fantasy points already exist). Extend when other sports hubs are real.

### Layer C deliverables / specifics

- [ ] Fantasy home **Live** tab (week HQ). **2026-10-18:** Live is the first pill and the default view (matchup rows + a Start/Sit banner for open slots / swaps that opens Start/Sit); Fliers pill dropped (Sniper Boom picks covers it). Live HQ pieces below still open. **2026-10-19 (1.4.1302):** league pills are Roster (was Start/Sit; first and the default), Live, Waivers, Trades; the Live banner opens Roster. Opponent play cards in Live carry a red outline. The main page shows your matchups as one swipe carousel per sport ("1 of N" by the sport label) so the page has room for news and other sections.
- [x] Multi-matchup cards + win % (2026-10-17/18: every one of your matchups across leagues on the main page grouped by sport, a swipe carousel of the league's other games, team-color win bar + projected finish. **2026-10-19 (1.4.1301):** win % tightens as the week plays out … spread = sqrt(3.4 x projected points both sides still have to play), about 28 pregame, near-certain late Monday, 100/0 once every starter is final; projected finish adds the paced rest of players mid-game, same pacing as the roster rows; score label reads Final when the week is done)
- [x] “My players only” play filter (2026-10-18: Live feed … plays in live games that scored for either lineup's starters, `playFantasyPoints` in league rates, newest first; `useFantasyLive.js`)
- [x] One-tap open hub with pins (2026-10-18: Live game strip + play rows call `requestLoungeSportsGameOpen(id, { direct: true })`; hub pins stay primary-league)
- [ ] Deep links from Layer F notifications into HQ / hub

**Depends on:** Layer A primary/multi league; existing `lounge-sports-scoreboard` / game hub fantasy.

**Ship note:** C can parallel A soft-launch … high leverage on existing NFL hub work.

---

## Layer D … DFS tools

### Goal

Second product mode under Fantasy … salary-cap / classic DFS first; pick’em later.

### Surfaces

- Slate browser (sport + site + slate date)
- Lineup import (CSV / connect)
- Optimizer / builds (salary + basic stack rules)
- Ownership / leverage views (when data exists)
- Live slate monitor (who’s still playing; exposure)

Do **not** mix salary-cap UX into season-long matchup screens.

### Layer D deliverables / specifics

- [ ] DFS mode in Fantasy IA
- [ ] DraftKings + FanDuel CSV import v1
- [ ] Simple optimizer (NFL) v1
- [ ] Live slate monitor v1
- [ ] Site OAuth/API when available
- [ ] Underdog / pick’em later

**Depends on:** Layer A DFS ingest (CSV enough for v1). Shared player IDs with season-long.

---

## Layer E … Cross-edge

### Goal

Things pure fantasy apps and pure sportsbooks don’t combine well.

### E1 … Emotional hedge

Show alongside season-long **and** DFS teams: suggested sports bets / player props that **insure** fantasy outcomes.

| Type | Pays when |
| --- | --- |
| Protect my guys | My starter underperforms (unders, no-TD, etc.) |
| Protect vs their guys | Enemy starter goes off |
| Outcome hedge | I lose the matchup / miss cash (broader game/slate markets) |

**Rules:**

- Optional chips … never nag
- Label **insurance**, not “+EV lock”
- Prefer true offsets (not same-side double-downs)
- Stake framing (e.g. 0.25–1u sleep insurance)
- Honest juice … hide or mark “expensive insurance”
- Compliance tone: suggestion → existing bet composer / sportsbook open
- Tag bets `hedge_of: fantasy_team_id | player_id | dfs_lineup_id` in bet tracker

### E2 … Same-game stack

Fantasy points + odds / public split + bet card on one game (hub already partial).

### Layer E deliverables / specifics

- [ ] Emotional hedge v1 on fantasy team + player rows (NFL props from live odds)
- [ ] Bet tracker `hedge_of` metadata
- [ ] Live HQ exposure + hedge strip
- [ ] DFS-specific hedge templates (chalk / min-cash protect)
- [ ] Hedge refresh hooks when Layer F fires injury / inactive (optional)

**Depends on:** Layer A exposure map; sports odds/props pipeline; bet tracker; Layer F for alert delivery.

---

## Layer F … Notifications (retention fabric)

### Goal

Bring users **back into Edge** at moments that matter … with a clear next action. Every fantasy notification should answer: *what happened, why I care, what to do in-app.*

Reuse existing Edge channels where possible: **APNs / FCM**, Lounge **activity / in-app alerts**, optional **Dynamic Island / Live Activity** for live weeks, email only if we already have a transactional path.

### Categories

| Category | Examples | Deep link target |
| --- | --- | --- |
| **Outcomes** | Matchup won/lost; final score vs projection; DFS cash / bust; playoff clinch/elim | Live HQ matchup / DFS slate result |
| **Lineup urgency** | Empty starter slot; locked player still in; opponent set lineup and you haven’t | Tools → Start/Sit or Leagues roster |
| **Injuries / status** | Questionable → Out on *my* starter; late inactive; IR move | Player / Start/Sit / Live HQ (+ optional hedge) |
| **Considerations** | “Start/Sit flipped for your flex”; waiver target spiked; bye-week RB hole this week | Tools (Start/Sit, Waiver) |
| **Trades** | Inbound offer received; your outbound accepted/declined; “new Finder suggestion ready” | Tools → Trade Analyzer (Offer Review / Finder) |
| **Live week** | Big fantasy play for your starter; enemy boom; win% swing | Live HQ / game hub |
| **Hedges (opt-in)** | “Insurance prop still open for your RB1”; hedge settled | Team card hedges / bet tracker |
| **Connect / sync** | Provider re-auth needed; sync failed; new league detected | Leagues → Connect |

### Product rules

1. **Actionable by default** … tap opens the surface that can act (not a dead score toast).
2. **Exposure-scoped** … only players/leagues on *my* synced teams (and enemy when relevant). No league-wide spam.
3. **Preference matrix** … per category on/off + quiet hours; Live week can be denser on Sundays if user opts in.
4. **Digest vs instant** … injuries / lineup locks = instant; “considerations” may batch (morning of game day, waiver day).
5. **Deduped** … one push per player status transition, not every rumor ping.
6. **Channels** … IPA APNs + Android FCM primary; in-app Lounge/activity bell always; Island for *live watched game* not every fantasy ping.
7. **Copy** … short, Edge voice, no em-dash spam; include league/team name when multi-league.

### Layer F deliverables / specifics

- [x] **In-app alert layer (2026-10-19, 1.4.1305):** one Player news fetch (`usePlayerNews`) feeds the main-page list, roster rows, and Roster banner. `fantasyNewsStatus.js` reads status from notes in the last 36h (ruled out / inactive / IR / doubtful / questionable; cleared phrases stop it; in-game notes like "won't return" or "carted" never set next week's status; rest-of-season counts as Out) and `withNews` raises a rostered row's `injury_status` (never lowers it) so Start/Sit swaps a ruled-out starter before Sleeper or the host updates. Banner names each Out / Doubtful starter still to play with his swap ("M. Evans ruled out: start J. Jennings +11.0") or "no healthy backup", then other swaps / open slots. Rows show a blue news dot for notes under 24h and the note (time, source, Fantasy impact) at the top of the expanded panel. A starter ruled out projects 0 on the matchup card before kickoff, so win % reflects it.
- [x] **Starter status pushes (2026-10-19, 1.4.1306):** Edge **`fantasy-status-watch`** (pg_cron `fantasy_status_watch` every 5 min; runs every tick Sun 8-17, Mon/Thu 16-21, Wed-Sat 11-20 ET, else every 30 min, overnight hourly) reads ESPN's league-wide NFL injury report (one ~8.7 MB call; `details.fantasyStatus` = next-game designation, not the practice `status`) into **`nfl_player_status`**. First run seeds only. A move up to Out / Doubtful / IR for a player whose game is still pregame (falls through to next week's slate once ESPN's current week is all final) pushes each user who starts him on their latest synced lineup, one push per user + player + status + week (**`fantasy_status_alerts`**, delivery log in `sent`). Copy: "Saquon Barkley (hamstring) ruled out" / "He's in your Big Money League lineup for Monday vs DAL. Suggest starting Jahmyr Gibbs." (best healthy bench player who fits that starter's slot, by Sleeper's projection for the week; Out / Doubtful / IR, bye, and started games skipped, Questionable at 85%; multi-league lists each league; no fit → "no one on your bench can fill his spot. Tap to see waiver options." and the link opens Waivers) Channels: APNs + FCM + web push. Tap → `/?tab=fantasy&league=<id>&fantasyTool=start` (native opens the absolute `url` on the current IPA; the fantasy screen consumes the params once and trims them). Pref **`notification_preferences.push_fantasy_status`** (default on) as "Fantasy: starter injuries" in the Lounge notification list. Roster rows now read `nfl_player_status` first (Sleeper's weekly sync was 3 weeks stale on test). Test hooks for admins: `{ force, dryRun, simulate: { espn_id, status }, onlyUser }`.
- [ ] Fantasy notification preference matrix (Settings + first-run soft prompt after Connect)
- [ ] Event bus / Edge jobs: status, lineup lock, matchup final, inbound trade, tool suggestion ready
- [ ] Deep link scheme: `?tab=fantasy&fantasyView=…&league=&player=` (and hub `game=` when live)
- [ ] Phase 1 minimum: injury/inactive on my starters + lineup-lock reminder
- [ ] Phase 2+: Start/Sit flip, waiver digest, matchup outcome
- [ ] Phase 3+: trade offer + Finder ready
- [ ] Phase 2.5/E: optional hedge prompts (strict opt-in)
- [ ] Analytics: send → open → act (retention loop)

**Depends on:** Layer A exposure map; existing push infra (`apns_device_tokens` / FCM / activity_events). Mac for IPA push presentation; Windows for web preference UI + Edge emitters.

---

## Phased implementation

| Phase | Layers | Ship | Exit criteria |
| --- | --- | --- | --- |
| **0** | A | Soft-launch Connect. Yahoo approval is one door, not the gate. ESPN and CBS sheets count once a real account syncs. Fantasy IA shell: Leagues / Live / Tools / DFS. Notification prefs shell (all off until events exist). | Users sync ≥1 league on a phone-usable host; Coming soon lifts only when Ryan says so |
| **1** | C + F | Live Fantasy HQ (NFL) + hub deep links + **injury/inactive + lineup-lock pushes** | Pre-kickoff HQ used; starter Out push opens Start/Sit or HQ |
| **2** | B1–B2 + F | Value engine + Start/Sit + Waiver + **consideration / waiver digest pushes** | League-aware advice + tap-through from digest |
| **2.5** | E1 + F | Emotional hedge v1 + **opt-in hedge prompts** | Hedges open bet composer with `hedge_of` |
| **3** | B3 + F | Trade Analyzer + **inbound offer / Finder-ready pushes** | Generated offers + inbound grade; offer push opens Review |
| **4** | D + F | DFS CSV + optimizer + slate monitor + **slate lock / live exposure pushes** | One full DFS week path |
| **5** | A + B/C + F | Next sport season-long (NBA or MLB) + research pack B4 + sport-scoped notification filters | Second sport in Connect + Tools |
| **Later** | B3v2, D APIs, E2, draft suite, autopilot set-lineup, richer Live week firehose (user-gated) | — | Only with APIs + trust |

### Explicit non-goals (near term)

- Expert consensus rankings / “100 experts”
- Autopilot lineup submit to hosts before trust + API clarity
- Mixing DFS salary into season-long screens
- ToS-hostile scraping as the primary connector strategy
- Full native rewrite of fantasy (stays web feature under IPA shell)
- Pushing every fantasy point / event like a second scoreboard app (opt-in Live firehose only)

---

## Fantasy home IA (target)

```
Fantasy
├── Leagues     … Connect, league picker, roster / matchup / standings (A)
├── Live        … Week HQ (C)
├── Tools       … Start/Sit, Waiver, Trade Analyzer, Research (B)
└── DFS         … Slates, lineups, optimizer, live slate (D)
```

Emotional hedges appear as strips on Leagues + DFS team/lineup cards (E), and on Live exposure.  
Notifications (F) deep-link into the relevant tab; prefs live under Settings (and a post-Connect soft prompt).

---

## Data / eng notes (cross-cutting)

- Keep **`docs/fantasy-connect.md`** as the Connect implementation contract; this file is the suite roadmap.
- New tables likely: DFS connections/lineups/slates; trade offer drafts; projection cache; `hedge_of` on bets; fantasy notification prefs + delivery log … design per phase, don’t boil the ocean in Phase 0.
- Light mode: feature `data-*` roots (`data-fantasy-home`, plus new roots per surface).
- Dual-machine: Fantasy UI/Edge in **Windows `src/**` + Edge lane**; iOS only when bridge/auth/push presentation (Yahoo ASWebAuth already Mac; APNs fantasy payloads reuse existing push pipeline).

---

## League outlook (home synopsis)

Shipped 1.4.1345 (NFL): one expandable card per league under the home matchup card. Summary: playoff / title odds (season simulation on rest-of-season lineup strength, `fantasyLeagueOutlook.js`), standing, injuries, empty slots, lineup gain. Details: Start/Sit moves, waiver adds, sniper picks, trade ideas, each linking into its tab. Weekly digest shipped 1.4.1346: Tuesday ~5 PM Pacific push + email per user with every NFL league's outlook (Edge `fantasy-weekly-digest`, same modules as the app; opt out in Settings, Notifications). NBA outlook + Monday digest shipped 1.4.1365 / 1.4.1367. Planned: real remaining schedules from each host in place of random pairings.

## Open decisions (Ryan)

Record answers here when locked:

1. Aggressive↔Fair default for Trade Analyzer? **Locked 2026-10-18: slightly aggressive, still realistic.**
2. First second-sport after NFL? **Locked 2026-10-21: NBA, Sleeper first, points leagues first (categories later).** Phase 1 shipped 1.4.1337: matchups, per-game projection x games left, win %, slots, injuries, news (`fantasyNbaBoard.ts`, `fantasyNbaWeek.js`). Phase 2 shipped 1.4.1363-1.4.1367 on the NFL engines: Waivers + Sniper (games left), Roster plans today's games (daily locks; cards carry `elig` + `today`), Live tab game chips, home / Live lineup alerts, Trades + offer review + League outlook on our rest-of-season value (Sleeper per-game projection, season totals, team games left from ESPN standings; FantasyCalc has no NBA), game hub Fantasy position battles + Watch pins (`nba:` pin ids), injury pushes, and a Monday 9 AM Pacific NBA weekly digest (`fantasy_weekly_digests.sport`). NBA insiders on X shipped 2026-10-22 (migration `20261022080000_nba_insider_news.sql`): `fantasy-insider-poll` `{ sport: 'nba' }` on its own cron + cursor (`poll_nba`), 7 sources (Shams, Haynes, Underdog NBA, FantasyLabs NBA, Stein, Fischer, Windhorst; push-trusted: Shams, Haynes, Underdog), reads only 11:00-13:00 + 17:00-23:00 ET, capped at 250 posts per rolling 24h (~$1.25/day max, est. ~$8-9/mo), NBA prompt + in-game guard, trusted Out / Doubtful push through the NBA starter path. `sport` on sources / news / poll log; Fantasy news, Jordan Pike, and the grader filter on it (Sleeper NBA ids collide with NFL). NBA statuses are not graded yet. Streaming pickups shipped 2026-10-22 (below). **Lock-In (2026-10-22, 1.4.1368):** every Sleeper NBA league counts ONE game per player per week (Lock-In: lock a finished game before his next tip, else his last game counts; legacy Game Pick also one game; Sleeper has no categories). `fantasyLockIn.js`: a week is the optimal-stopping value of his games left (each game normal, SD 30% of the per-game projection; 1 game = 1x, 2 = 1.12x, 3 = 1.19x, 4 = 1.24x), flag `nbaLockIn(provider)` = Sleeper NBA. Matchup projections / win % (`nbaWeekOf` lock-in branch: max(score in hand, value of games left)), waivers / sniper / trades / outlook / digest (`fantasy-waivers` scales NBA week lines and rest-of-season games by the factor, sends `lock_in`; Sniper drops the games-left reason), and Roster **Lock-in calls** (Lock / Wait per starter with a finished game and games left; home + Live banner names the locks). Lock state is not in Sleeper's public API, so copy says to skip ones already locked. **NBA market blend (2026-10-22, 1.4.1369):** `_shared/fantasyNbaMarketLines.ts` reads Kalshi's open NBA player ladders slate-wide (one call per series: PTS / REB / AST / 3PT / STL / BLK / 2D / 3D, shared 10 min), keeps strikes with spread <= 0.25 and price 3-97%, and turns each ladder into a per-game expected value (points: normal fit across strikes; counts: weighted Poisson; double / triple double: Yes price). NBA lineup cards carry it as `market_line` for the player's next game; `projectionOf` now blends for NBA the same way as NFL (guarded), so Roster, Lock-in calls, matchups and win % use it. Waivers / trades stay on Sleeper lines (same as NFL). **Polymarket added 2026-10-22:** its NBA player ladders (`15+ points` = over 14.5; events list + each game in the next two ET days, 8s budget, own shared cache) give a second mean per stat; where both price a stat the two are averaged (first check: 135 shared stat lines within a few hundredths), else the one that does stands. **Yahoo NBA sync (2026-10-22):** `syncYahooConnection` runs a second `game_keys=nba` pass (an NBA failure never fails NFL): Sleeper NBA ids from the shared map (never `nfl_players`), NBA stat ids (`yahooNbaScoringFromSettings`, `yahooNbaCategories` saved as `settings.categories` for `head` / `roto` leagues, `[]` for `headpoint`), `settings.daily_lineups`, today's lineup (`roster;date=`) with `week_points` and `eligible_positions`; IL / IL+ are not starting slots. Yahoo / ESPN NBA count every game (summed math, not Lock-In). Dry run against Ryan's Yahoo account (fake DB, nothing saved): NFL league unchanged, NBA `Yahoo H2H-Pts 272329` (points 1 / 1.2 / 1.5 / 3 / 3 / -1, 10 slots), 130 / 130 players mapped. **ESPN NBA sync (2026-10-22):** `syncEspnConnection` adds an NBA pass (`games/fba`, fan-profile game id 3; an NBA failure never fails NFL): Sleeper NBA ids, ESPN NBA stat / team / slot maps (team ids cross-checked against Sleeper, 30 / 30), points `scoring` or `settings.categories` for `H2H_CATEGORY` / roto, `lineup_slots` incl. combo slots (SG/SF, G/F, PF/C, F/C, added to the lineup engines), eligible positions, injuries, and per-matchup category totals / results in new `fantasy_matchups.categories` (migration `20261022090000`; category wins as the matchup score). Season saved by start year (ESPN files NBA under the end year). The NFL old-season cleanup now only deletes NFL leagues. Dry run against Ryan's ESPN account (fake DB, nothing saved): `Dallas Pro H2H Categories League` (8 cats), 129 / 130 players mapped (Kevin Porter Jr. has no team), NFL league unchanged. **Categories engine (2026-10-22, 1.4.1372):** `src/features/fantasy/fantasyCategories.js`. (1) Category value: the ESPN / Yahoo sync turns a categories league's list into z-score weights over this week's Sleeper per-game projections (top 150 by points): counting stat x / SD (negative when lower is better), percentages by impact (makes - pool avg x attempts) / SD, so the weights stay linear and are saved as the league's `scoring` (`settings.category_value`, `settings.category_pct`). Roster, Waivers, Sniper, Trades, League outlook and the digest run unchanged on category value. (2) Matchup: `FantasyCategoryBoard.jsx` shows category wins on the matchup card (expected categories won, overall win chance in the win bar) and a category board in the league view (projected final per side per category = host totals + starters' per-game lines x games left; percentages via estimated attempts; normal win chance per category; Poisson-binomial for the matchup). League detail loads `fantasy_matchups.categories`. Not yet: category-specific Start / Sit advice ("punt" / chase the close categories), Yahoo categories matchup totals (no Yahoo categories league to test). **Streaming (2026-10-22, 1.4.1386):** Waivers **Stream** tab for NBA leagues with `settings.daily_lineups` that count every game (ESPN / Yahoo; hidden for Sleeper Lock-In, where an empty night costs nothing). `fantasy-waivers` NBA entries carry `per_game` (Sleeper per-game line) and `nights` / `nights_next` (US Eastern dates of the team's untipped games this week / next). `fantasyStreaming.js` `streamPlan`: each night, best seats among healthy starter / bench players with a game (open = slots unseated); for each available player who plays an open night, try each of the 3 weakest healthy roster players as the drop and keep the swap that adds the most started value over the nights left (min half a game). A matchup week that has not started plans next week's nights. Add limits are not in host settings, so the card says to check them; same-night adds depend on the host. Deferred until real leagues to test (Ryan, 2026-10-22): an "open slots tonight" line in League outlook Needs attention (alert only when Stream has a pickup worth making), and category-aware streaming built on the same close-category weights as category-specific Start / Sit (after the live category board checks out). **Schedule planner (2026-10-22, 1.4.1387):** Roster tab **Schedule** card for every NBA league (`NbaSchedulePanel`, `fantasyNbaSchedule.js` `schedulePlan`). NBA lineup cards carry `schedule` (each game this week `wk: 0` and next `wk: 1`: ET date, opponent, home, state). Grid = my starter / bench rows x nights (opponent chip, `@` away, amber underline on the second night of a back-to-back, past games dimmed, OUT rows zero), Left per player, and a Starting row (slots fillable by healthy players that night, red when short). Header: starts left for me vs the opponent (same nightly cap). This / Next week toggle; an upcoming matchup opens on next week. **Fixes (1.4.1388):** NBA win % variance per point to play raised 2.1 -> 9 (game swing + missed games + projection miss; ~10% for a 961 vs 1,136 upcoming week, was 1%), Lock-In 5; Roster rows show next week's games when the matchup has not started; Stream says "pick one" when every pick cuts the same player. **Yahoo High Score (2026-10-22, 1.4.1391):** Yahoo `is_highscore` leagues are H2H points where each of 6 starters (G / G / FC / FC / FC / UTIL) counts only his single best game of the week, picked automatically; lineups are weekly (`roster_type: week`; benching a starter gives up his best game so far). Sync saves `settings.high_score`, `daily_lineups` from `roster_type` (`date` = daily) when Yahoo sends it, and `max_weekly_adds` (Stream footer shows it). `nbaLockIn(provider, sport, settings)` now returns a mode: `'lock'` (Sleeper), `'best'` (High Score), false; truthy keeps every one-game path. `bestOfValue(mean, games, floor)` = E[max(banked, best of k games)] (factors 1 / 1.17 / 1.25 / 1.31, checked vs Monte Carlo); matchups, waivers / trades (`oneGameFactor`), win % (Lock-In variance) use it. Start / Sit plans the week for High Score (starter = expected best incl. banked game, bench = games left only; locked only mid-game); no Lock-in calls. Slot tables gain `FC` and G / FC player codes. To verify Monday: whether Yahoo's per-player week points in High Score are the best game (assumed) or the sum.
3. DFS v1 sites? (plan: DK + FD via CSV)
4. Emotional hedge: show estimated cost in units by default?
5. Freemium: which tools free vs Slots Edge / future Fantasy add-on? (TBD … see `docs/entitlements-matrix.md`)
6. Notification defaults after Connect? (plan: injuries + lineup lock **on**; Live firehose + hedge prompts **off** until opt-in)
7. Quiet hours default? (plan: 11pm–8am local, except lineup-lock morning of games)
