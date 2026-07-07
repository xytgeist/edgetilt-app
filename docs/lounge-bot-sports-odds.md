# Lounge bot — sports odds / +EV plays

**Status:** **Shipped on test (code, Jul 2026)** — migrations through **`20260704230000`**, Edge fns **`lounge-odds-ingest`** + **`lounge-odds-poll`**, admin portal **`/?tab=bots`**. **Ryan smoke pending** on **`kcosfvmreeiosdjdzycb`** (apply cron migration + Vault). **Prod:** **`20260704220000`** RPC verified on **`jtjgtucumuoswnbauxry`** (**2026-07-04**, manual SQL editor apply).

**Live bot (test):** **Scott Share** — `@sharpesignal`, pipeline **`odds_api`**, category pill **`sports`**.

**Self-contained** — no morning editorial inbox. Roster context: **`docs/lounge-bot-editorial-queue.md`**.

---

## Workflow (v1 shipped)

```text
Calendar sport pick (portal)  →  lounge-odds-ingest (manual) or lounge-odds-poll (cron)
  →  +EV engine (h2h / spreads / totals devig)  →  ⚡ edge alert (Fetch odds) OR Coffee & Covers (morning cron / portal button)  →  feed
```

| **Post kind** | When | Example tone |
| --- | --- | --- |
| **Edge** | Best +EV line (ML / spread / total) clears **`min_edge_pct`** | See example below |
| **Coffee & Covers** | No edge on manual fetch, or **`daily_slates`** morning poll | See example below |
| **Best Bet of the Hour** | Hourly cron **`best_bet_hour`** (or portal button) | See example below |
| **Arb Watch** | **`poll_edges`** finds **≥ 3%** guaranteed cross-book arb | See example below |
| **Sharp Report Card** | **`poll_edges`** when meaningful sharp/steam/RLM move (10–60 min snapshot) | See example below |
| **Value Bet Radar** | **`value_bet_radar`** cron every ~30 min during peak hours (or portal button) | See example below |
| **Slate** (legacy) | When **`coffee_covers_enabled = false`** | See legacy example below |

**Caption style:** factual labels only (no opinion phrases). Line breaks between sections. Plain keyboard punctuation only (colons, commas, hyphens in odds ... no middle dots or em/en dashes). Sportsbook names use brand labels (FanDuel, MyBookie) ... not bare domains (avoids auto-linkify in feed).

**+EV example:**
```text
⚡ World Cup: France vs Paraguay (Sat 2PM PT)

France ML +718 at MyBookie
Fair +652 (9 books)
+8.8% edge on ML
```

**Coffee & Covers example:**
```text
☕ Coffee & Covers 💵
No strong covers today - sitting on hands until we see better value.
- Best ML Spots Right Now -
• World Cup - France vs Paraguay (Sat 2PM PT)
Draw ML +718 @ MyBookie (+9.6% EV)
• World Cup - Morocco vs Canada (Sat 10AM PT)
Canada ML +490 @ BetUS (+3.1% EV)
- Dog of the Day -
• World Cup - France vs Paraguay (Sat 2PM PT)
Paraguay ML +718 @ MyBookie
- 🍺 On Tap Tomorrow -
• Wimbledon - Mochizuki vs Sinner: Mochizuki ML +1600 @ DraftKings (+8.1% EV)
• World Cup - Norway vs Brazil: Norway ML +367 @ FanDuel (+2.8% EV)
Best lines 👇
```

**Thread part (one per calendar sport today), e.g. MLB:**
```text
⚾ MLB

Yankees vs Red Sox (Sat 1PM PT)
Yankees -110 (FanDuel), Red Sox +105 (DraftKings)
```

When no spread clears **+4%** EV, the root post still lists the **best +EV spread lines** on the board (below bar, not called a cover pick). Same for ML (**+3%** bar). **Never negative EV.** **Dog of the Day** is the biggest plus-money underdog per sport (not +EV gated).

**Best Bet of the Hour example:**
```text
🔥 Best Bet of the Hour
Padres ML +219 @ lowvig
Padres vs Dodgers (Sat 7:11 PM PT)
+7.8% EV
Market consensus implies ~42% chance Padres win, but they're available at +219. This is currently the sharpest edge on the board.
```

**Legacy slate example:**
```text
World Cup slate

France vs Paraguay (Sat 2PM PT)
France +145 (DraftKings), Draw +652 (FanDuel), Paraguay +718 (MyBookie)

Germany vs Portugal (Sat 5PM PT)
Germany -110 (FanDuel), Portugal +105 (DraftKings)
```

Long posts may still truncate with `+N more games today.` at the **2000-char** caption cap (subscriber/bot tier). **+EV alerts and morning posts** only consider games **kicking off today (PT)** that have not started yet.

**Morning automation:** pg_cron **`daily_slates`** every **5 min**, **6-8am PT** (random post minute per bot). **`poll_edges`** every **15 min**, **24/7** ... posts ⚡ when a line clears **`min_edge_pct`** on **today's unplayed** games (no time-of-day gate). Migrations **`20260704230000`** + **`20260704240000`** + Vault — see **`lounge-odds-poll/README.md`**.

**`review_mode`:** `automatic`. Target volume: **~2 posts/day** + optional edge alerts when lines misprice (caps below).

---

## Admin portal (`/?tab=bots`)

| Control | Behavior |
| --- | --- |
| **Today's major sporting events** | Dropdown from **`lounge_sports_betting_calendar`** (PT day — date window, not “has games today”) |
| **Fetch odds** | One sport: ⚡ +EV only (`postMode: edge_only`) — use **Post Coffee & Covers** or morning cron for Coffee |
| **Scan all · edge** | All calendar sports today → edge alerts only |
| **Post Coffee & Covers** | One morning post/day (dedupe) with thread parts per sport |
| **Best bet · hour** | Manual smoke for hourly strongest +EV post (same logic as cron) |
| **Post all examples** | One feed post per alert type (**17** total, incl. Coffee & Covers thread part); captions match live format |
| **Min +EV %** | Settings field **0.5–15** → **`lounge_bot_odds_config.min_edge_pct`** |
| **Alert audience** | Per alert type: **All** (public feed) or **Subs** (subscriber-only post). Matrix in Settings → **`lounge_bot_odds_config.alert_audience`**. Code defaults: Coffee & Covers + Value Radar **All**; most other kinds **Subs**. **Ryan prod (Jul 2026):** all types set **All** in portal. |

---

## Freemium feed gating

Migration **`20260704260000`**: **`community_feed_posts.subscriber_only`**. RLS + **`lounge_viewer_is_subscriber_or_staff()`** hides subscriber-only posts from anon and signed-in free users; active **`has_active_subscription`** or staff see them.

Each publish path sets **`subscriber_only`** from **`alert_audience`** (see portal matrix above).

---

## +EV engine

Shared logic: **`supabase/functions/_shared/loungeBotOddsCaption.ts`**, **`loungeBotSportAnalysis.ts`** (sport-weighted ranking), and **`loungeBotCoffeeAndCovers.ts`** (morning covers + ML spots).

### Edge alerts (multi-market)

1. Filter events: **today (PT)** kickoffs not yet started (after optional **48h** API pre-filter), **3+ books**, in-season sport keys from The Odds API **`active`**
2. Scan **`h2h`**, **`spreads`**, and **`totals`** (sport-weighted tie-break when EV is close; see **Sport-specific analysis** below)
3. Per book: devig outcomes → fair implied prob per side
4. **Consensus:** average fair probs across books
5. **EV on $1** at best available American price vs consensus
6. Publish if **`evPct >= min_edge_pct`** (WNBA **+0.5%** bump) and **`evPct <= 15`** (stale-data filter)

### Coffee & Covers (morning)

**`generateCoffeeAndCovers()`** in **`loungeBotCoffeeAndCovers.ts`**:

| Section | Threshold | Max per sport |
| --- | --- | --- |
| **Covers** (spread/handicap) | **+4%** EV on $1 (else best **+EV** on board, not a cover pick) | **3** per sport (merged in root) |
| **ML spots** | **+3%** EV on $1 (else best **+EV** ML on board) | **3** per sport (merged in root) |
| **Dog of the Day** | Biggest **plus-money ML underdog** per sport on today's slate | **One per sport** (longest ML on board; not +EV gated) |
| **On Tap (tomorrow)** | Tomorrow spread/ML at or within **1%** of bar | **Max 3** across all sports |
| **Best Lines 👇** | Best ML + book per outcome | One **thread part** per calendar sport (header: sport emoji + label, e.g. `🎾 Wimbledon`) |

**NCAAB / March Madness slate cap:** On `basketball_ncaab`, Coffee & Covers filters today's board to **~20-40 high-interest games** (max **40**) before covers, ML spots, Dog of the Day, On Tap, and the best-lines thread. Priority waterfall:

1. Any game with an **AP Top 25** team (`ncaab-ap-top25-keys.json` ... update weekly in season)
2. **Power-conference** matchups (ACC, Big Ten, Big 12, SEC, Big East)
3. **Spread line movement ≥ 0.5 pt** vs prior `lounge_odds_event_lines` snapshot (15-min poll)
4. **Rivalry** games or **high totals** (consensus O/U **≥ 155**)

Thread footer shows `+N more games today` against the full unfiltered slate count.

Spread devig mirrors h2h: per-book no-vig fair probs on each spread side, consensus average, EV at best juice. Dedupe key: **`coffee:daily:{ptDay}`** (one live post per bot per PT day; deleting the feed post clears dedupe via **`lounge_bot_publish_log.post_id`** `ON DELETE SET NULL`). Log **`post_kind: coffee_covers`**. Root post ends with **`Best Lines 👇`**; lines board lives in author thread parts (`feed_comments.is_thread_part`).

Set **`coffee_covers_enabled = false`** on **`lounge_bot_odds_config`** to fall back to legacy slate check-ins.

**`min_edge_pct`:** minimum **+EV percent on $1 stake** (default **2**). Column default + new bots use **2**; existing rows may still be **4** until saved in portal.

### Line movement alerts (poll_edges)

**`loungeBotLineMovement.ts`** — runs on every **`poll_edges`** tick (15 min, 24/7):

1. Load prior lines from **`lounge_odds_event_lines`** (saved on the **last poll**, ~**15 min** ago when cron is on schedule)
2. Fetch current odds (**`h2h`**, **`spreads`**, **`totals`** when line movement enabled)
3. **Only compare** if prior snapshot age is **8–22 minutes** (15-min poll jitter). Too fresh → skip; too stale → re-baseline without alert.
4. Compare consensus vs that snapshot; flag when **in that interval**:
   - Spread moves **≥ 0.5** pts (config **`min_spread_move_pts`**)
   - Total moves **≥ 0.5** pts (**`min_total_move_pts`**)
   - ML moves **≥ 20** American pts in the interval (e.g. +150 → +130, -140 → -160; config **`min_ml_move_pts`**, default **20**)
4. Classify: **`sharp_move`** (≥ 1 pt or large ML), **`steam`** (fast multi-book sync), **`rlm`** (spread vs ML diverge), **`line_movement`** (minor — internal only, no feed post)
5. Post feed alert for **`sharp_move`**, **`steam`**, and **`rlm`** only (minor **`line_movement`** feeds **Sharp Report Card** but not standalone alerts)
6. Upsert new snapshot (first poll = baseline only, no alerts)

Dedupe: one alert per movement direction per game/market/outcome per PT day. Cap: **`max_line_alerts_per_day`** (default **12**). Disable via **`line_movement_enabled = false`**.

### Live in-game edge + period reports (`poll_live`)

**`loungeBotPollLive.ts`** + **`loungeBotRundownLiveState.ts`** — dedicated **5 min** cron (`poll_live`), separate from **`poll_edges`**:

| Post kind | Trigger | Threshold |
| --- | --- | --- |
| **`in_game_edge`** | Live game (commenced, not completed per scores API) | **+EV ≥ `min_live_edge_pct`** (default **4%**) on **ML, spreads, or totals** |
| **`period_report`** | **TheRundown** `event_status` / `game_period` when key set; else elapsed-time fallback | Best **+EV** lines for remainder of game |

**Rundown milestones (preferred):** `STATUS_HALFTIME` (basketball/football), `STATUS_END_PERIOD` + `game_period` (NHL), `game_period >= 5` (MLB). In-game headers use `event_status_detail` when present.

**Credits:** `poll_live` pre-checks Odds API **scores** (skip sport if no live games), then fetches **odds** only for sports in play ... much cheaper than 5 min full `poll_edges`.

**Guards:** **`loungeBotLiveGuards.ts`** + publish-due re-validation (cancel if game final). State in **`lounge_odds_game_period_state`**. Caps: **`max_live_alerts_per_day`** (default **8**), **`max_period_reports_per_day`** (default **6**).

### Arb Watch (poll_edges)

**`loungeBotArbWatch.ts`** — runs on every **`poll_edges`** tick (reuses the same odds fetch; **no extra API credits**). **Posts only when** a clean cross-book arb clears **`min_arb_profit_pct`** (default **3%**). Silent otherwise.

1. For each today's unplayed game, find the **best price per outcome** across all books (ML, spreads at matched lines, totals at matched numbers)
2. Arb when sum of implied probs **&lt; 100%** (combined &lt; 1.0)
3. Require legs from **≥ 2 different books**; reject arbs **&gt; 12%** (stale data filter)
4. Caption includes both sides, books, guaranteed **%**, and balanced stake split on **$100** total
5. Dedupe **`arb_watch:{ptDay}:{eventId}:{market}`** per day; cap **`max_arb_alerts_per_day`** (default **6**)

```text
🔒 Arb Watch
Risk-Free Opportunity

France vs Paraguay (Sat 2PM PT)

France ML +102 @ FanDuel
Draw ML +210 @ DraftKings

Guaranteed +3.4% profit no matter the result.
Stake $51 on France and $49 on Draw ($100 total) for $3.40 profit.
```

**Sharp Report Card example:**
```text
📊 Sharp Report Card

Chiefs -4 moved from -3 to -4 at multiple sharp books.

Sharp money appears to be coming in on Kansas City as the number shortens across books. Line has steamed over the last ~15 minutes.
NFL: Chiefs vs Raiders (Sun 1:25 PM PT). This is one to watch closely.
```

### Best Bet of the Hour (hourly)

**`loungeBotBestBetHour.ts`** — dedicated **`best_bet_hour`** poll action (pg_cron **minute 5 every hour**):

1. Scan every calendar sport today via fresh Odds API fetch (**`h2h`**, **`spreads`**, **`totals`**)
2. Include **today's unplayed** kickoffs plus **live** in-progress games
3. **`findPlusEvOpportunities`** across all three markets; keep highest **+EV** play slate-wide
4. Minimum **`min_best_bet_hour_ev_pct`** (default **4%**); stale cap **15%**
5. Tie-break: higher **+EV** → sport popularity (**NFL > NBA > MLB**, etc.) → calendar **`priority`** → more books
6. Dedupe **`best_bet_hour:{PT hour bucket}`** — one post per bot per PT hour

Disable via **`best_bet_hour_enabled = false`**. Audience key **`best_bet_hour`** in portal matrix.

### Sharpe's Sharp Report (poll_edges)

**`loungeBotSharpReport.ts`** — one narrative **Sharp Report Card** per poll when meaningful movement is found:

1. Compare current lines to stored snapshot (**10–60 min** age; wider than tick-level line alerts)
2. Reuse **`detectLineMovements`**; keep **steam**, **sharp_move**, **RLM**, or spread **≥ 0.5** / ML **≥ 20** pt moves
3. Pick **one** best game slate-wide (movement score → NFL/NBA/MLB popularity)
4. Short analytical caption with cautious language (`appears to be`, `leaning`, etc.) ... **no fabricated injury/news context**
5. Dedupe **`sharp_report:{ptDay}:{eventId}:...`**; cap **`max_sharp_reports_per_day`** (default **4**)

Runs **before** line-movement snapshot upsert so both read the same prior lines. Disable via **`sharp_report_enabled = false`**.

### Human-paced publishing (scheduled queue)

Odds alerts no longer burst-post when several qualify in one **`poll_edges`** tick. **`loungeBotPublishSchedule.ts`** queues captions with randomized delay:

| Priority | Alert kinds | Typical delay after spacing gate |
| --- | --- | --- |
| **Urgent** | Arb Watch | ~15s–2min after min gap |
| **Normal** | +EV edge, Best Bet, Value Radar, in-game edge, Starter Spotlight, Injury Impact | ~2–10min after min gap |
| **Low** | Line movement, Sharp Report, period reports, Confirmed Starters, Rest + Travel | ~6–20min after min gap |

**`min_post_gap_minutes`** (default **8**) enforces minimum spacing between any Scott posts. **`lounge_bot_scheduled_posts`** is drained every minute by pg_cron **`lounge_bot_publish_scheduled_odds`** → **`lounge-bot-publish-due`** (`publishScheduledOdds: true`). Stale pending rows (**> 3h**) cancel automatically. **Coffee & Covers** still posts immediately (threaded morning post).

### Value Bet Radar (peak hours, ~30 min)

**`loungeBotValueBetRadar.ts`** — dedicated **`value_bet_radar`** poll action (pg_cron **minutes 5 and 35 every hour**; Edge gates **8am–10pm PT**):

1. Scan every calendar sport today via fresh Odds API fetch (**`h2h`**, **`spreads`**, **`totals`**)
2. Include **today's unplayed** kickoffs plus **live** in-progress games (same window as Best Bet)
3. **`findPlusEvOpportunities`** slate-wide; keep **2–3** highest **+EV** plays (min **3.5%** default)
4. **Variety:** prefer one pick per sport first, then fill remaining slots; one play per game
5. Dedupe **`value_bet_radar:{PT half-hour bucket}`** — one post per bot per 30-min window; cap **`max_value_bet_radar_posts_per_day`** (default **20**)

Disable via **`value_bet_radar_enabled = false`**. Default audience **`all`** (snackable feed content).

### Context alerts (factual Rundown + odds, `poll_edges`)

**`loungeBotContextAlerts.ts`** — up to **one** context post per sport per **`poll_edges`** tick when data qualifies. Captions are **data-only** (no interpretive commentary). Requires **`THERUNDOWN_API_KEY`** for starters, injuries, and rest/B2B; each kind also needs a qualifying **+EV** pick on the same game (**`min_edge_pct`**).

| `post_kind` | Header | Data source |
| --- | --- | --- |
| **`starter_spotlight`** | 🔦 Starter Spotlight | Confirmed starters (pitchers, QBs, etc. when Rundown has data) + best +EV pick |
| **`confirmed_starters`** | ✅ Confirmed Starters | Compact starter list + pick (skipped if Starter Spotlight already posted/scheduled that day for same game) |
| **`injury_impact`** | ⚠️ Injury Impact | Hard injury status (OUT, IR, etc.) + pick |
| **`rest_travel_edge`** | 🛫 Rest + Travel Advantage | 7-day Rundown schedule + venue table: rest gap ≥ 1 day, +EV on **rested** team; optional travel line (≥800 mi or cross-TZ) |
| **`fade_the_public`** | 🚫 Fade the Public | **Off by default** — needs public betting % feed (not in Rundown OpenAPI) |

Priority when multiple qualify: injury → starter spotlight → rest → confirmed starters. Daily cap **`max_context_alerts_per_day`** (default **8**). Toggle per kind via **`starter_spotlight_enabled`**, **`confirmed_starters_enabled`**, **`injury_impact_enabled`**, **`rest_travel_edge_enabled`**, **`fade_the_public_enabled`**. Default audience **Subs**.

**Rest + Travel logic (`loungeBotRestTravel.ts` + `loungeSportsVenues.ts`):**

1. Load Rundown events for **today + prior 7 PT days** (cached 45m per sport/date).
2. Per team: days since last game, B2B (`days === 1`), NFL short week (`days < 6`), bye (no game in window).
3. Qualify when fatigued side is B2B or NFL short week and rested side has **≥1 day** more rest (or bye vs short week).
4. **+EV pick must be on the rested team** (h2h/spreads only).
5. Travel line only when Haversine **≥800 mi** or home-market TZ bucket changes (`loungeSportsVenues.ts` seed). Resolve order: Rundown **`venue_location`** when present → home-team arena → opponent home arena. Unknown team → rest-only caption (no travel line).
6. Copy stays **team schedule** only (never pitcher workload).

**Venue seed (Phase 2):** `loungeSportsVenues.ts` — NBA (30), MLB (30), NFL (32), WNBA (13), NHL (32), NCAAF FBS (80), NCAAB (153 rows: full Pac-12/WCC/MWC/American/A-10/MVC + power conferences). Seed: **`scripts/lib/ncaab-venues-seed.mjs`**, **`scripts/lib/college-sports-venues-seed.mjs`**. Re-sync: **`scripts/sync-college-venues-to-ts.mjs`**; coord refresh: **`scripts/geocode-sports-venues.mjs`** (no runtime Maps calls).

Example:
```text
🛫 Rest + Travel Advantage

Lakers vs Warriors (Sat 7:30 PM PT)

Lakers on back-to-back + cross-time-zone travel (East to West)
Warriors had 2 days of rest at home

→ Warriors -4.5 @ DraftKings (+3.9% EV)
```

Example Starter Spotlight:
```text
🔦 Starter Spotlight

Padres vs Dodgers (Sat 7:11 PM PT)

Confirmed Starters:
• Padres: Dylan Cease
• Dodgers: TBD

Padres ML +219 @ lowvig (+7.8% EV)
```

Example Injury Impact:
```text
⚠️ Injury Impact

Chiefs vs Raiders (Sun 1:25 PM PT)

Rashee Rice listed as OUT.

→ Chiefs -4 @ DraftKings (+4.1% EV)
```

Example:
```text
📡 Value Bet Radar

• Padres ML +219 @ lowvig (+7.8% EV) · MLB · Sat 7:11 PM PT
• Canada ML +490 @ BetUS (+3.1% EV) · World Cup · Sat 10AM PT
• Giron ML +900 @ DraftKings (+4.2% EV)
```

Example period report:
```text
📊 Halftime Report - Chiefs 14-10 Bills

Best bets for 2nd half:
• Chiefs -2.5 (-108) @ DraftKings (+4.5% EV vs consensus)
```

Example live edge:
```text
🔴 LIVE In-Game Edge • 3rd Quarter

NBA
Lakers 88-82 Warriors

Lakers -4.5 (+105) @ DraftKings
+5.2% EV vs market consensus on the spread · 9 books
```

Example line movement (sharp money):
```text
🔥 Sharp Money Move

World Cup
France vs Paraguay · Sat 2PM PT

France spread -3 (-110) → -4 (-108)
Books: FanDuel, DraftKings

Significant move (1 pt) ... sharp action shifting the France spread.
```

Example steam:
```text
💨 Steam Coming In

NFL
Chiefs vs Raiders · Sun 1:25 PM PT

Chiefs spread -3 (-110) → -4 (-108)
Books: FanDuel, DraftKings

Fast multi-book steam ... number syncing toward Chiefs right now.
```

---

## Edge Functions

| Function | Role |
| --- | --- |
| **`lounge-odds-ingest`** | Manual single-sport fetch (`sportKey`, `calendarSlug`, `postMode`) |
| **`lounge-odds-poll`** | Background: **`poll_edges`** \| **`daily_slates`** \| **`best_bet_hour`** \| **`value_bet_radar`** |
| **`lounge-bot-admin`** | Create bot + seed **`lounge_bot_odds_config`** |

Shared run/publish: **`supabase/functions/_shared/loungeBotOddsRun.ts`**, **`loungeBotCoffeeAndCovers.ts`**, **`loungeBotLineMovement.ts`**, **`loungeBotBestBetHour.ts`**, **`loungeBotValueBetRadar.ts`**, **`loungeBotContextAlerts.ts`**, **`loungeBotRestTravel.ts`**, **`loungeSportsVenues.ts`**, **`loungeBotRundownContext.ts`**

Deploy:

```bash
supabase functions deploy lounge-odds-ingest --project-ref kcosfvmreeiosdjdzycb
supabase functions deploy lounge-odds-poll --project-ref kcosfvmreeiosdjdzycb
```

**Secret:** **`THE_ODDS_API_KEY`** on Edge only.

**Optional context:** **`THERUNDOWN_API_KEY`** on Edge ... enriches captions with verified MLB pitchers, player status, event headlines, and live foul trouble when data exists. No key → posts unchanged.

---

## API credits (The Odds API)

Each `GET /v4/sports/{sport}/odds` costs **credits = (# markets) × (# regions)**.

Current fetch: **`h2h` + `spreads`**, region **`us`** → **~2 credits/call**.

| Usage | Rough monthly credits |
| --- | --- |
| 2 manual posts/day | ~120 |
| 15-min poll, ~4 calendar sports, 24h/day | ~23k (monitor `x-requests-remaining`) |
| Hourly best bet, ~4 sports × 3 markets | ~12 credits/hour (~288/day extra) |

**Plan:** Ryan on **$30 / 20k credits**. Monitor `x-requests-remaining` header.

---

## Config: `lounge_bot_odds_config`

| Column | Notes |
| --- | --- |
| `min_edge_pct` | Min +EV % on $1 (default **2**); editable in portal |
| `max_edge_alerts_per_day` | Default **6** |
| `max_slate_posts_per_day` | Default **10** |
| `daily_slate_enabled` | Default **true** — gates **`daily_slates`** poll |
| `coffee_covers_enabled` | Default **true** — Coffee & Covers vs legacy slate |
| `line_movement_enabled` | Default **true** — line movement alerts on **`poll_edges`** |
| `max_line_alerts_per_day` | Default **12** |
| `min_spread_move_pts` | Default **0.5** |
| `min_total_move_pts` | Default **0.5** |
| `min_ml_move_pts` | Default **20** (American odds points) |
| `sports_keys` | Fallback list; calendar drives manual picks |
| `regions` | `['us']` |
| `markets` | `['h2h','spreads']` |
| `best_bet_hour_enabled` | Default **true** — hourly strongest +EV post |
| `min_best_bet_hour_ev_pct` | Default **4** — min +EV % for Best Bet of the Hour |
| `arb_watch_enabled` | Default **true** — arb scan on poll_edges (post only when arb found) |
| `min_arb_profit_pct` | Default **3** — min guaranteed arb profit % |
| `max_arb_alerts_per_day` | Default **6** |
| `sharp_report_enabled` | Default **true** — narrative sharp report on poll_edges |
| `max_sharp_reports_per_day` | Default **4** |
| `value_bet_radar_enabled` | Default **true** — 2–3 strongest +EV plays during peak hours |
| `min_value_bet_radar_ev_pct` | Default **3.5** — min +EV % per Radar pick |
| `max_value_bet_radar_posts_per_day` | Default **20** |
| `starter_spotlight_enabled` | Default **true** — starter spotlight on **`poll_edges`** when Rundown confirms starters |
| `confirmed_starters_enabled` | Default **true** — compact confirmed-starters list |
| `injury_impact_enabled` | Default **true** — hard injury status + pick |
| `rest_travel_edge_enabled` | Default **true** — Rest + Travel (7-day schedule, venue table, +EV on rested team) |
| `fade_the_public_enabled` | Default **false** — needs public betting % feed |
| `max_context_alerts_per_day` | Default **8** — cap across all context kinds |
| `min_post_gap_minutes` | Default **8** — min minutes between Scott feed posts (queue spacing) |

Publish log: **`post_kind`** (… `value_bet_radar`, `starter_spotlight`, `injury_impact`, …), **`dedupe_key`** — through **`20260705010000`**. Pending queue: **`lounge_bot_scheduled_posts`**.

---

## Sports calendar

Table **`lounge_sports_betting_calendar`** — seeded for 2026 major events.

RPC **`admin_lounge_sports_betting_calendar_today()`** → portal dropdown.

Captions prefix category label from calendar row (e.g. `Wimbledon: ...`).

**Portal calendar editor:** Scott bot **`/?tab=bots`** → **View calendar** → date picker, **Add event** / **Edit** (migration **`20260704320000`**). Rows include optional **`coverage_tier`** (migration **`20260704330000`**).

---

## Scott coverage scope (priority tiers)

Canonical logic: **`supabase/functions/_shared/loungeBotCoverageScope.ts`**.

| Tier | Cover | Examples |
| --- | --- | --- |
| **1 · Heavy** | Always prioritize | NFL, NBA, MLB, NCAAF, NHL, Premier League / top European soccer, World Cup |
| **2 · Medium** | Regular rotation | Grand Slam tennis, PGA majors, UFC/MMA, WNBA, NCAA basketball (incl. March Madness) |
| **3 · Opportunistic** | When signal is strong | Olympics, F1, boxing, esports |

**Rules (Edge + portal):**

- **`poll_edges`** scans calendar rows sorted by coverage rank (tier + priority + tournament/marquee boost).
- **Best Bet of the Hour**, **Value Bet Radar**, and **Sharp Report** compare candidates by **coverage rank first**.
- A lower tier wins only on **exceptional +EV** (default **+2%** gap vs the other pick) or **exceptional line movement** (movement score gap **≥ 15**).
- Big events: set **`kind`** = `tournament` or `marquee` and raise **`priority`** (e.g. World Cup **100**, UFC 329 **95**) for a temporary boost on active dates.

**Calendar seed (`20260704330000`):** adds Premier League, top Euro soccer, NCAA basketball season, **UFC 329 (Jul 11)**, four men's golf majors, boxing marquee. Placeholder rows for Winter Olympics / F1 / esports ship **disabled** until Odds API keys are confirmed.

**Golf note:** major keys are **outright winner** markets (`golf_masters_tournament_winner`, etc.) ... Scott's +EV engine today targets **h2h / spreads / totals** game markets. Calendar rows prime captions and future outright support; live scans skip inactive API keys.

---

## Sport-specific analysis (pick ranking + voice)

Canonical logic: **`supabase/functions/_shared/loungeBotSportAnalysis.ts`**.

### Engine behavior (Odds API only today)

| Sport | Market priority when EV is close | Min EV notes |
| --- | --- | --- |
| **NFL / NCAAF / NBA / NCAAB / WNBA / NHL** | **Spread-heavy** ... spreads > totals > ML | WNBA adds **+0.5%** to every configured min EV bar |
| **MLB / MMA / tennis / boxing** | **ML-heavy** ... ML > spread > total; slight underdog ML boost | Underdog ML tie-break |
| **Soccer** | Balanced 1X2 / handicap / totals; **draw ML** tie-break | `h2h` is 3-way home/draw/away |

**Where it applies:**

- **`findPlusEvOpportunities`** / **`pickBestOddsCandidate`** ... sport-weighted sort when raw EV gap **< 2%**
- **+EV edge alerts** (`poll_edges`) ... same **3-market** scan as Best Bet / Value Radar (no longer ML-only)
- **Best Bet of the Hour**, **Value Bet Radar**, **live in-game edge** ... inherit WNBA bump via `effectiveMinEvPct`
- **Coffee & Covers** spread covers + Dog of the Day ... WNBA bump on spread thresholds too

**Still deferred without verified Rundown (or other) feed data:** player props, fight method narratives. Injury/headline copy is appended **only** when **`THERUNDOWN_API_KEY`** returns a matching status or `event_headline`.

### Target voice per sport (caption examples)

Use these as editorial north stars; post kinds may differ but tone should match.

**NFL & college football** ... spreads + totals, 0.5pt moves matter, covers in Coffee & Covers.

```text
📊 Sharp Move – Chiefs -3 moved to -3.5 across 6 books (+4.2% EV on Chiefs -3.5)
```

**NBA** ... spreads + totals; live halftime / in-game edges.

```text
🔥 Best Bet of the Hour – Lakers -4.5 @ +105 (+5.8% EV) vs Warriors
```

**MLB** ... ML + run line (`spreads`); underdog value.

```text
📡 Value Bet Radar – Padres ML +219 (+7.8% EV) vs Dodgers
```

**Soccer** ... 1X2 (`h2h`), handicap (`spreads`), totals; draw can be high value.

```text
☕ Coffee & Covers – Draw ML +718 (+9.6% EV) in France vs Paraguay
```

**NHL** ... ML, puck line, totals; period milestone posts for live.

```text
📈 Line Movement – Oilers -1.5 Puck Line moved from -110 to +105
```

**Tennis (Grand Slams)** ... match ML underdogs.

```text
🔥 Giron ML +900 (+4.2% EV) vs Zverev – Wimbledon
```

**WNBA** ... NBA-like markets, slightly higher EV bar (+0.5%).

```text
📡 Value Bet Radar – Valkyries ML +155 (+3.7% EV) vs Dream
```

**UFC / MMA** ... ML; Dog of the Day is the longest plus-money ML on the slate.

```text
Dog of the Day – Underdog +450 @ MyBookie
```

### TheRundown context layer

Canonical logic: **`supabase/functions/_shared/loungeBotRundownContext.ts`**.

| Post kind | Benefit | Context sources |
| --- | --- | --- |
| Best Bet of the Hour | High | MLB starting pitcher; key OUT/status on picked team |
| Sharp Report Card | High | OUT/status on moved side; `event_headline` |
| Coffee & Covers / Dog of the Day | High | Pitchers, OUT/status, soccer-style headlines |
| In-Game Edge / Halftime | High | Live foul trouble; questionable/doubtful status |
| Value Bet Radar | Medium | Inline MLB starter suffix on bullet |
| Line Movement / Steam / RLM | Medium | OUT/status or headline when relevant |
| Arb Watch | Low | Skipped |

**Fetch policy:** resolve Rundown `event_id` once per game (team names + PT date, `offset=420`), cache ~45 min, fetch at **publish** time only (not every odds poll). Never fabricate context.

**Setup:**

```bash
supabase secrets set THERUNDOWN_API_KEY="your_key" --project-ref kcosfvmreeiosdjdzycb
```

### Future enrichment

Planned additions **after** more feed coverage:

- MLB starting pitchers + bullpen context in Coffee & Covers / Sharp Report
- NBA/WNBA injury availability for live edge captions
- UFC fight method / weight-class metadata for prop expansion

Player props and deep injury narratives may still need a dedicated injuries feed beyond Rundown roster `status`.

---

## Migrations (apply order on test)

| Migration | What |
| --- | --- |
| **`20260703140000`**–**`20260703160000`** | Bot accounts, odds config, editorial queue |
| **`20260704120000`** | **`sports`** category pill |
| **`20260704130000`** | Bot profile admin edit |
| **`20260704140000`** | Sports betting calendar |
| **`20260704150000`** | Slate/edge post kinds + caps |
| **`20260704160000`** | `min_edge_pct` semantics + default 2 |
| **`20260704170000`** | Portal save **`min_edge_pct`** |
| **`20260704180000`** | Manual post + comment as bot (`admin_lounge_bot_publish_post`, `admin_lounge_bot_post_comment`) |
| **`20260704190000`** | Subscriber 2000-char lounge caption cap |
| **`20260704200000`** | **`coffee_covers`** post kind + **`coffee_covers_enabled`** |
| **`20260704210000`** | Bot profile interest tribes on **`admin_lounge_bot_save_settings`** |
| **`20260704220000`** | Bot portal reply on any visible post (**`admin_lounge_bot_post_comment`**) |
| **`20260704230000`** | pg_cron **`daily_slates`** + **`poll_edges`** → **`lounge-odds-poll`** (Vault secrets) |
| **`20260704240000`** | Reschedule: Coffee & Covers **6-8am PT**; **`poll_edges`** every **15 min** **24/7** |
| **`20260704250000`** | Line movement snapshots + alert post kinds (**`lounge_odds_event_lines`**) |
| **`20260704260000`** | **`subscriber_only`** feed + **`alert_audience`** + live in-game / period reports |
| **`20260704270000`** | **Best Bet of the Hour** (`best_bet_hour` post kind, hourly cron, portal audience row) |
| **`20260704280000`** | **Arb Watch** (`arb_watch` on `poll_edges`, min 3% guaranteed profit) |
| **`20260704290000`** | **Sharp Report Card** (`sharp_report` narrative on meaningful line moves) |
| **`20260704300000`** | **Value Bet Radar** (`value_bet_radar` — 2–3 top +EV plays, ~30 min peak cron) |
| **`20260704310000`** | **Human-paced publish queue** (`lounge_bot_scheduled_posts`, minute drain cron) |
| **`20260704320000`** | **Sports calendar portal** (list + save RPCs, Scott bot calendar UI) |
| **`20260704330000`** | **Scott coverage tiers** (`coverage_tier` on calendar, expanded 2026 seed incl. UFC 329) |
| **`20260705010000`** | **Context alerts** (`starter_spotlight`, `confirmed_starters`, `injury_impact`, `rest_travel_edge`, `fade_the_public` off by default) |

**Edge code (no migration):** **`loungeBotSportAnalysis.ts`** — sport market weights, WNBA +0.5% min EV, multi-market edge alerts. Redeploy **`lounge-odds-poll`** after pull.

---

## Manual posts and replies (portal)

On **`/?tab=bots`**, any bot card includes:

| Control | RPC / behavior |
| --- | --- |
| **Post as @handle** | **`admin_lounge_bot_publish_post`** — inserts feed post as bot; logs **`post_kind: other`** |
| **Reply on any post** | Paste Lounge **`?post=`** link or UUID → **Load post** → thread + **Reply as bot** on any visible post (**`20260704220000`**) |
| **Replies** on each recent bot post | Same reply UI on Scott's own posts in **Feed posts** |

Works for Scott Share and all other bots. Does not bypass day/hour caps on automated ingest (manual posts are separate). Bot reply body cap: **2000** chars (via **`lounge_feed_caption_max_for_user`**).

---

## Phased rollout

| Phase | Scope | Status |
| --- | --- | --- |
| **1** | Manual fetch + devig +EV + Coffee & Covers + portal | **Code shipped** |
| **2** | **`lounge-odds-poll`** cron (30-min edge scan, morning Coffee & Covers) | **Migration `20260704230000` — apply + Vault on test/prod** |
| **3** | Line movement alerts (spread / ML / total) | **Shipped** — **`loungeBotLineMovement.ts`**, migration **`20260704250000`** |
| **4** | Props, rich cards | Not started |

**Legal/compliance (before prod):** Nevada/gambling content policy, no guaranteed-profit claims, disclaimer on profile or posts — counsel review.

---

## Repo touchpoints

| Piece | Location |
| --- | --- |
| Spec (this file) | **`docs/lounge-bot-sports-odds.md`** |
| Portal UI | **`src/features/bots/BotManagementPortal.jsx`**, **`botPortalApi.js`** |
| +EV math | **`supabase/functions/_shared/loungeBotOddsCaption.ts`** |
| Sport pick ranking | **`supabase/functions/_shared/loungeBotSportAnalysis.ts`** |
| Example post pack | **`supabase/functions/_shared/loungeBotExamplePosts.ts`** |
| Coverage tiers | **`supabase/functions/_shared/loungeBotCoverageScope.ts`** |
| Coffee & Covers | **`supabase/functions/_shared/loungeBotCoffeeAndCovers.ts`** |
| NCAAB Coffee filter | **`supabase/functions/_shared/loungeBotNcaabCoffeeFilter.ts`** |
| Best Bet of the Hour | **`supabase/functions/_shared/loungeBotBestBetHour.ts`** |
| Arb Watch | **`supabase/functions/_shared/loungeBotArbWatch.ts`** |
| Sharp Report | **`supabase/functions/_shared/loungeBotSharpReport.ts`** |
| Ingest / poll | **`lounge-odds-ingest/`**, **`lounge-odds-poll/`** |
| Poll README | **`supabase/functions/lounge-odds-poll/README.md`** |
| Backlog smoke | **`docs/test-buildout-backlog.md`** → Planned (Lounge bots) |

---

| **`20260706170000`** | **`invoke_lounge_odds_poll(action, force)`** — optional `force` for Coffee cron tests |
| **`20260706140000`**–**`20260706160000`** | Portal async pg_net queue + outcome polling RPC |
| **`20260706150000`** | Queue RPC slug ambiguous fix (`v_slug`) |

---

## Ops / troubleshooting (Jul 2026)

### `poll_edges` silent but Coffee works

**Symptom:** Cron **`lounge_odds_poll_edges`** runs (see **`cron.job_run_details`**), but no edge/line/arb/sharp/live posts; **`last_poll_at`** only updates on **`daily_slates`**.

**Cause (Jul 6 2026):** After dynamic-import BOOT fix, several **`poll_edges`** modules imported **`ptTodayDate`** from **`loungeBotOddsCaption.ts`** (wrong) and **`shortDisplayName`** was not exported. Edge returned **500** on every **`poll_edges`** invoke. **`daily_slates`** never loaded those modules, so Coffee still posted.

**Fix:** commit **`1d5d8fca`** — redeploy **`lounge-odds-poll`** on affected project.

**Verify:**

```sql
select id, status_code, left(content::text, 200)
from net._http_response
where content::text like '%"action":"poll_edges"%'
order by id desc limit 5;
```

Expect **200** and **`last_poll_at`** updating every ~15 min when Scott is **Running**.

### Agent SQL probes (local only)

Use **`npm run db:query:production`** / **`db:query:test`** — not parallel raw **`supabase db query --linked`**. See **`AGENTS.md`** → Automation. This does **not** affect cron/Edge runtime.

---

## Open questions

- [x] Supabase cron schedule for **`poll_edges`** / **`daily_slates`** — **`20260704230000`** (Vault + apply per project)
- [ ] Feed UI badge for +EV posts (caption prefix only today)
- [ ] Affiliate / sportsbook deep links allowed?
- [ ] Responsible gaming disclaimer on every post vs profile-only?

---

_Updated 2026-07-04: TheRundown context layer (`loungeBotRundownContext.ts`) for pitchers, status, headlines on publish; optional `THERUNDOWN_API_KEY`._

---

_Updated 2026-07-06: `poll_edges` ESM import fix (`1d5d8fca`); Coffee +EV-only + biggest-dog ML + On Tap `@ book`; portal async queue; cron `force`; troubleshooting section._

---

_Updated 2026-07-04: Sharpe's Sharp Report Card (poll_edges narrative on 10–60 min line moves; posts only on quality steam/RLM/sharp moves)._
