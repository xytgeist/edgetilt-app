# Fantasy suite (Edge Ops)

Product plan for EdgeTilt Fantasy … **tools for edge hunters**, not a league viewer and not a FantasyPros expert-content clone.

**Connect implementation (shipped / in flight):** **`docs/fantasy-connect.md`**.  
**Positioning:** Connect is the door. The suite is decision tools + live command center + DFS toolkit + cross-edge hedges, fed by synced leagues/lineups.

---

## North star

| We are | We are not |
| --- | --- |
| Fantasy **Ops** for people who already play season-long + DFS | A second host site UI |
| League-aware tools (scoring, roster, FA pool, byes) | Generic “expert consensus” content farm |
| Multi-sport (NFL beachhead, then expand) | NFL-only forever in the IA |
| Cross-edge with bets, hubs, Lounge, Island | A siloed fantasy mini-app |

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

---

## Layer map

| Layer | Name | Job |
| --- | --- | --- |
| **A** | Connect | Providers → leagues/lineups/slates into Edge |
| **B** | Season-long tools | Start/Sit, Waiver, Trade Analyzer, research |
| **C** | Live Fantasy HQ | Gameday-shaped week command center (Edge-native) |
| **D** | DFS tools | Slate / optimize / live slate monitor |
| **E** | Cross-edge | Emotional hedges, bet+fantasy same game, Lounge alerts |

Shared engines (build once, reuse):

- **Player values** … ROS / weekly projections + VORP in *league scoring* (Std / Half / PPR / custom later)
- **Roster need / surplus** … starters + bench depth + byes + injuries
- **Fairness band** … Aggressive ↔ Fair slider for trades
- **Exposure map** … my starters / enemy starters / DFS ownership → hedges + Live HQ filters

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
| **ESPN** | Cookie / private API or official path TBD | Stub **Soon** | High demand; sync often brittle … research before build |
| **CBS Sports** | TBD | Stub **Soon** | Lower priority than ESPN |
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

- [ ] Yahoo API approval + reconnect path live
- [ ] ESPN + CBS real sync (after spike)
- [ ] `sport` + `kind` (`season` \| `dfs`) on connection/league model
- [ ] Multi-league switcher (primary still drives hub auto-pins)
- [ ] Scoring + roster-slot snapshot for tool engines
- [ ] DFS connection stub + CSV lineup import
- [ ] Soft-launch Fantasy entry (remove Coming soon when A is “good enough”)

**Depends on:** Yahoo approval (external). ESPN spike.

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

- Rank **available in this league** (not global top-50 wire)
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
- [ ] Start/Sit v1
- [ ] Waiver v1
- [ ] Trade Analyzer v1 (Finder + manual Offer Review)
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
- [ ] Push / Island hooks for injury-to-starter (shared with E)

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

### E3 … Alerts

Injury / inactive / late scratch on **my** starters → Lounge push / Island; optional hedge refresh.

### Layer E deliverables / specifics

- [ ] Emotional hedge v1 on fantasy team + player rows (NFL props from live odds)
- [ ] Bet tracker `hedge_of` metadata
- [ ] Live HQ exposure + hedge strip
- [ ] Starter injury alerts
- [ ] DFS-specific hedge templates (chalk / min-cash protect)

**Depends on:** Layer A exposure map; sports odds/props pipeline; bet tracker.

---

## Phased implementation

| Phase | Layers | Ship | Exit criteria |
| --- | --- | --- | --- |
| **0** | A | Soft-launch Connect (Yahoo approval, multi-league UX, sport/kind fields). Fantasy IA shell: Leagues / Live / Tools / DFS. | Users sync ≥1 league; Coming soon can lift on NFL Hub |
| **1** | C (+ A) | Live Fantasy HQ (NFL) + hub deep links | Pre-kickoff HQ used on a real slate |
| **2** | B1–B2 | Value engine + Start/Sit + Waiver | League-aware lineup/waiver advice trusted in smoke |
| **2.5** | E1 | Emotional hedge v1 on season-long NFL teams | Hedges open bet composer with `hedge_of` |
| **3** | B3 | Trade Analyzer (Finder + manual Offer Review) | Generated offers + inbound grade in smoke |
| **4** | D | DFS CSV + simple optimizer + slate monitor | One full DFS week path |
| **5** | A + B/C | Next sport season-long (NBA or MLB) + research pack B4 | Second sport in Connect + Tools |
| **Later** | B3v2, D APIs, E2–E3, draft suite, autopilot set-lineup | — | Only with APIs + trust |

### Explicit non-goals (near term)

- Expert consensus rankings / “100 experts”
- Autopilot lineup submit to hosts before trust + API clarity
- Mixing DFS salary into season-long screens
- ToS-hostile scraping as the primary connector strategy
- Full native rewrite of fantasy (stays web feature under IPA shell)

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

---

## Data / eng notes (cross-cutting)

- Keep **`docs/fantasy-connect.md`** as the Connect implementation contract; this file is the suite roadmap.
- New tables likely: DFS connections/lineups/slates; trade offer drafts; projection cache; `hedge_of` on bets … design per phase, don’t boil the ocean in Phase 0.
- Light mode: feature `data-*` roots (`data-fantasy-home`, plus new roots per surface).
- Dual-machine: Fantasy UI/Edge in **Windows `src/**` + Edge lane**; iOS only when bridge/auth (Yahoo ASWebAuth already Mac).

---

## Open decisions (Ryan)

Record answers here when locked:

1. Aggressive↔Fair default for Trade Analyzer? (plan: slightly aggressive)
2. First second-sport after NFL? (plan lean: NBA or MLB)
3. DFS v1 sites? (plan: DK + FD via CSV)
4. Emotional hedge: show estimated cost in units by default?
5. Freemium: which tools free vs Slots Edge / future Fantasy add-on? (TBD … see `docs/entitlements-matrix.md`)
