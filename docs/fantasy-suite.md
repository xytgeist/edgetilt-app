# Fantasy suite (Edge Ops)

Product plan for EdgeTilt Fantasy … **tools for edge hunters**, not a league viewer and not a FantasyPros expert-content clone.

**Connect implementation (shipped / in flight):** **`docs/fantasy-connect.md`**.  
**Positioning:** Connect is the door. The suite is decision tools + live command center + DFS toolkit + cross-edge hedges, fed by synced leagues/lineups. **Notifications are a first-class retention fabric** across all layers … not an afterthought.

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

**Shipped 2026-10-18:** the main Fantasy page leads with cross-league Live: one Start/Sit alert per league (tap opens that league on Start/Sit), one games strip and one "Your players" feed across every NFL league (your starters green, this week's opponents rose, a player started in two leagues shows once with both tags, points in the primary league's scoring, plays under a point either way hidden). The league screen keeps its own Live pill for that matchup. **2026-10-19 (1.4.1303):** at Ryan's call the main page no longer shows the games strip or play feed (each league's Live pill has them). The main page keeps one Roster alert per league, then the per-sport VS carousels, then **Player news**: Rotowire notes via ESPN for every NFL player on your teams (starters and bench), newest first, league tags when you have more than one league, Bench label when you start them nowhere. Edge **`fantasy-player-news`** (body `{ sleeper_ids }`, max 80) maps Sleeper to ESPN ids through `nfl_players` and shares each player's feed for 20 min in `edge_shared_cache` (`fantasy:news:<espnId>`), so every user rostering a player shares one ESPN read; failures and ESPN refusals are not cached and go through the shared ESPN backoff. **2026-10-19 (1.4.1304): insider news from X (FantasyPros-style).** `fantasy_insider_sources` started with 50 verified X accounts. **Culled 2026-10-19 by sample:** 2,363 original posts LLM-labeled (news / analysis / team / game / chatter / promo), 95% Wilson interval on each account's fantasy-news share, undecided accounts topped up from an older window; cut when the upper bound is under 20% or the account posted nothing in two weeks (Silver, McFadden, Josina Anderson, Breer, Louis-Jacques, Allbright, Robinson, Glazer, La Canfora, Keim, Teicher, Getzenberg … migration `20261020030000`). Gap teams tested the same way (29 candidates, 716 posts); added Nate Taylor + Matt Derrick (KC), Dave Birkett (DET), Levi Damien (LV) (`20261020040000`). Now 42 active: top signal Caplan 83%, McManus 80%, Rapoport 78%, Underdog / PFT 66%, Schefter 63%, Pelissero 54%, Garafolo 52%. No candidate passed for BUF, DEN, MIA, LAC, PIT (best: Chris Brown BUF 33% with a 19% lower bound, Furones MIA 27% but ~48 posts/day); national insiders cover those teams. **Trimmed again 2026-10-19 (Ryan):** national = core four (Schefter, Rapoport, Pelissero, Garafolo) + Underdog for speed + Caplan (83% news, ~3 posts/day); PFT (mostly echoes of the core), Fowler, Yates, Meirov, Schultz, Graziano, Wolfe, Palmer, Darlington off (`20261020050000`). 33 active (6 national, 27 beat). Model estimate ~$72/mo at $0.005 per post read using Monday-night volumes for the big accounts; expect ~$55-65 in practice. Check real spend in the X console after a week. **Paused 2026-10-19 (`20261020060000`, cron unscheduled):** a 341-post check showed Rotowire covers up to ~77% of the same player news, a median ~20 min later (30% over an hour late), and ~23% never. A feed throws that speed away, so X stays off until it feeds the alert layer (Roster banner, row flag, starter pushes). Re-enable SQL is in the migration header. **Re-enabled 2026-10-20 as Phase 3 (`20261020080000`):** the poller reads X only inside news windows (ET: Sun 10:30-13:30, 15:00-16:30, 18:30-20:30; Mon 18:30-20:30; Thu 12:00-18:00 + 18:30-20:30; Wed / Fri 12:00-18:00; Sat 14:00-18:00) and starts from now when a window opens after a gap, so off-window posts are never read or billed (est. ~$25-35/mo in season). The LLM also returns `next` (the next-game status the post sets: out / doubtful / ir / questionable / cleared / none), `next_player`, and `injury`, stored as `next_status` / `status_sleeper_id` / `status_injury`; activation / return-window posts can never set IR or Out (prompt + `RETURNING` guard). A status is **trusted** only from the core national four, Underdog, Caplan, or that player's own team beat writer; trusted Out / Doubtful / IR above ESPN's current designation goes straight into the shared starter push (`_shared/fantasyStatusPush.ts`, also used by `fantasy-status-watch`), and the shared `fantasy_status_alerts` key means ESPN's later report never repeats it. Validation on the 2-week sample (461 posts via `{ evaluate }`): 52 trusted would-push items reviewed by hand, the only 2 errors were "coming off IR" posts (fixed); after tuning 48 of 52 still push (the drops are those 2, a mixed activation post, and one of six Hurts posts) and 0 false alarms in 120 game / chatter / analysis posts. **Self-grading (2026-10-20, `20261020090000`):** Edge **`fantasy-insider-grade`** (pg_cron daily 13:00 UTC) grades every Out / Doubtful / IR an insider set in the last 21 days against the player's next game after the post (Sleeper schedule + ESPN kickoffs): Out / IR confirmed if he did not play (Sleeper weekly stats), contradicted if he played; Doubtful confirmed if he sat, otherwise left unconfirmed. Contradictions email ops (`FANTASY_ALERT_EMAILS`, falls back to `BILLING_ADMIN_ALERT_EMAILS`) and join **`fantasy_insider_regression`** with expected "none" and a review-label note. A source under 90% over its last 20 graded statuses (10+) gets `push_trusted = false` (news still shows; never re-promoted automatically). The poller logs posts read per handle (**`fantasy_insider_poll_log`**) for cost per source. Tuesdays (ET) the grader runs the regression set (`fantasy-insider-poll` `{ regression: true }`, seeded from the hand-checked set: `supabase/seed/fantasy_insider_regression_seed.sql`, 172 cases) and emails "Fantasy insider weekly scorecard" (regression pass / false alarms / misses, X posts read + cost, per-source kept items, accuracy, minutes ahead of ESPN, contradictions). Judge temperature 0 so weekly runs compare (170-171 / 172, 0 false alarms; the swing case is a borderline "ruled out with a rib injury" post). Test emails carry a "[test]" subject prefix. Edge **`fantasy-insider-poll`** (pg_cron `fantasy_insider_poll` every 2 min; polls every tick Sun 11:00-24:00 and Mon / Thu 19:00-24:00 ET, every 10 min 7:00-24:00, every 30 min overnight) runs one X recent search per ~20 handles with a shared `since_id`, matches full player names against `nfl_players` (team nickname or beat team breaks same-name ties), then the LLM marks each post show / duplicate (same fact already published in the last 90 min) / skip (not fantasy news) and writes headline, summary, and Fantasy Impact credited to the reporter. `fantasy-player-news` serves show rows from the last 3 days with the Rotowire notes and drops a Rotowire note that echoes an insider item on the same player within the hour. Client: Breaking pill under 2h, expand for summary + Fantasy impact + link to the post.

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

## Open decisions (Ryan)

Record answers here when locked:

1. Aggressive↔Fair default for Trade Analyzer? **Locked 2026-10-18: slightly aggressive, still realistic.**
2. First second-sport after NFL? (plan lean: NBA or MLB)
3. DFS v1 sites? (plan: DK + FD via CSV)
4. Emotional hedge: show estimated cost in units by default?
5. Freemium: which tools free vs Slots Edge / future Fantasy add-on? (TBD … see `docs/entitlements-matrix.md`)
6. Notification defaults after Connect? (plan: injuries + lineup lock **on**; Live firehose + hedge prompts **off** until opt-in)
7. Quiet hours default? (plan: 11pm–8am local, except lineup-lock morning of games)
