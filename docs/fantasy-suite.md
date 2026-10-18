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
- [x] Start/Sit v1 (2026-10-18: client `fantasyStartSit.js` … best legal lineup from your roster in league scoring, injuries / byes / locked games, swap cards; value engine for Waivers / Trades still open)
- [x] Waiver v1 (2026-10-18: Edge `fantasy-waivers` … not rostered in the league, shortlisted by next-4-week Sleeper projections with byes; app `fantasyWaivers.js` scores in league rules, ranks by lineup gain vs your roster, safe drop that keeps dedicated slots filled and never cuts an IR stash on a bye-week average)
- [ ] Trade Analyzer v1 (Finder + manual Offer Review). **Finder shipped 2026-10-18** (`fantasyTrades.js`: 1-for-1 / 2-for-1, slightly aggressive band, best + if-declined + also-consider, Compose offer with Copy / Share); Offer Review still open.
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

NFL first (hub + scoreboard + fantasy points already exist). Extend when other sports hubs are real.

### Layer C deliverables / specifics

- [ ] Fantasy home **Live** tab (week HQ)
- [ ] Multi-matchup cards + win % 
- [ ] “My players only” play filter (reuse hub PBP where possible)
- [ ] One-tap open hub with pins
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
