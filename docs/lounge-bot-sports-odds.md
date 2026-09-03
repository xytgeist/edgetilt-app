# Lounge bot — sports odds / +EV plays

**Status:** **Shipped on test (code, Jul 2026)** — migrations through **`20260704230000`**, Edge fns **`lounge-odds-ingest`** + **`lounge-odds-poll`**, admin portal **`/?tab=bots`**. **Ryan smoke pending** on **`kcosfvmreeiosdjdzycb`** (apply cron migration + Vault). **Prod:** **`20260704220000`** RPC verified on **`jtjgtucumuoswnbauxry`** (**2026-07-04**, manual SQL editor apply).

**Live bot (test):** **Scott Share / Sharpe Signal** — `@sharpesignal`, slug **`sports-odds`**, pipeline **`odds_api`**, category pill **`sports`**. Edges, coffee, line moves, alerts.

**Desk bot (test):** **Sharpe Syndicate** — `@sharpesyndicate`, slug **`sharpe-syndicate`**, pipeline **`odds_api`**. Desk / slate / VIP shop only. **Cannot** run Signal alert polls (Steam, Sharp Money, edges, Coffee, BBH, VBR) … cron + Edge skip those actions for this slug. Migration **`20260903150000`**.

### Ownership matrix (Signal vs Syndicate)

| Surface | Sharpe Signal (`sports-odds`) | Sharpe Syndicate (`sharpe-syndicate`) |
| --- | --- | --- |
| Job | Edges, coffee, line moves, alerts | Desk cards, today picks, ledger-facing slate |
| Fan sub | Existing Signal VIP … **unchanged** | **Separate** creator fan sub (Connect + go live) |
| VIP / fan chat | Signal room only | Syndicate room only … markdown full desk cards (colored desk + gold picks) |
| Lounge | Public Signal feed as today | Public **teaser** + **`creator_fan_only`** full card (thread of desk lists) |
| Existing Signal subs | Stay Signal-only … **no** auto-migrate | New subs only |
| Cron Signal alerts (`poll_edges` / coffee / BBH / VBR) | Yes (`sports-odds` only) | **Never** … cron + Edge skip |
| Desk / slate / VIP shop crons | **Never** once Syndicate is running | Yes (`sharpe-syndicate` only) |

**Create bot (test):** `node scripts/create-sharpe-syndicate-bot.mjs`  
**Prod create:** only with Ryan explicit + `--target=production --i-mean-it`.

**Syndicate Ops (desk day-to-day):** **https://sharpesyndicate.com/ops** (or `?ops=1`) … admin email/password, same `profiles.role = admin` as EdgeTilt. Hosts Sharp Desk: scorecard/drops, Chedda paste, PVALs, EPA/CFB/UFC editors, monthly board. Queues as **`sharpe-syndicate`**. **Not** embedded on Signal (`sports-odds` / `/?tab=bots`). Signal portal has **no** desk send controls; Syndicate portal has **no** Signal alert controls.

**Self-contained** — no morning editorial inbox. Roster context: **`docs/lounge-bot-editorial-queue.md`**.

---

## Workflow (v1 shipped)

```text
Calendar sport pick (portal)  →  lounge-odds-ingest (manual) or lounge-odds-poll (cron)
  →  +EV engine (h2h / spreads / totals devig)  →  ⚡ edge alert (Fetch odds) OR Coffee & Covers (morning cron / portal button)  →  feed
```

| **Post kind** | When | Example tone |
| --- | --- | --- |
| **Edge** | Best +EV line (ML / spread / total) clears **sport-aware** thresholds | See example below |
| **Coffee & Covers** | No edge on manual fetch, or **`daily_slates`** morning poll | See example below |
| **Best Bet of the Hour** | Hourly cron **`best_bet_hour`** (or portal button) | See example below |
| **Arb Watch** | **`poll_edges`** finds **≥ 2%** guaranteed cross-book arb | See example below |
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

🎯 Best cover on the board today:
Pirates -1.5 (+172) @ FanDuel

👀 Other spots on my radar:
• World Cup · Actis ML +1400 @ DraftKings (+8.1% EV)
• World Cup · Meza ML +600 @ BetUS (+5.2% EV)

🐕 Dog of the Day:
Diaz ML +2000 @ MyBookie
France vs Paraguay (Sat 2PM PT)

Full board breakdown by sport below 👇
```

When no spread or ML clears **~3.5-4%** EV, Scott switches to the tighter voice (*"If I'm playing one side today…"*) and lists longshot ML juice inline. Featured lean has **no canned filler** under the pick ... only optional **Rundown** context when available. **On Tap Tomorrow** was removed from the parent post. **Dog of the Day** stays the biggest plus-money longshot (not +EV gated). Thread parts unchanged.

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

**Morning automation:** pg_cron **`daily_slates`** every **5 min**, **6-8am PT** (random post minute per bot). **`poll_edges`** every **15 min**, **24/7** ... posts ⚡ when a line clears **sport-aware +EV gates** on **today's unplayed** games (max **2 edges per tick**). Migrations **`20260704230000`** + **`20260704240000`** + Vault — see **`lounge-odds-poll/README.md`**.

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
| **Min +EV %** | Settings field **0.5–15** → **`lounge_bot_odds_config.min_edge_pct`** (context alerts / starter spotlight; pre-match ⚡ Edge uses sport-aware code gates) |
| **Alert destination** | Per alert type **checkboxes**: **Everyone** (lounge), **Sub chat**, optional **+10% / +30% lounge** teaser when Everyone is off. Check both Everyone + Sub chat to post to **both**. Stored as route objects in **`alert_audience`**. Migration **`20260726000000`**. |
| **Sign in as bot** | Admin-only (**`lounge-bot-admin`** `staff_sign_in_as_bot`): swaps browser session to the bot and opens Lounge Settings → **Fan subscriptions** (offer copy, go live). **Do not use for Stripe Connect** … use **Connect payouts (Stripe)** below instead (admin session, return to Bot Portal). |
| **Connect payouts (Stripe)** | Admin-only **`staff_bot_fan_connect`**: Stripe Express onboarding for the bot without leaving your admin login; return URL **`/?tab=bots&bot={slug}&fan_connect=return`**. Then **Sign in as bot** only if you need the in-app offer editor / **Turn on fan subscriptions**. |

---

## Freemium feed gating (legacy)

Migration **`20260704260000`**: **`community_feed_posts.subscriber_only`**. RLS + **`lounge_viewer_is_subscriber_or_staff()`** hides subscriber-only posts from anon and signed-in free users.

**Scott Share (Jul 2026):** alert routing uses **`alert_audience`** destination values (**`lounge`**, **`sub_chat`**, **`sub_chat_10`**, **`sub_chat_30`**) — see **`loungeBotAlertAudience.ts`** + **`loungeBotSubChatPublish.ts`**. Lounge feed posts from Scott are **public**; fan-gated content goes to the creator fan room. Legacy **`all`/`subscribers`** portal values normalize on read/write.

**Sub chat dedupe (Jul 2026):** sub-chat-only deliveries log **`lounge_bot_publish_log.sub_chat_message_id`** (migration **`20260726250000`**) so per-pick dedupe works when **`post_id`** is null. Deleting a **feed** post still clears dedupe via **`post_id`** `ON DELETE SET NULL` only.

**Event pick cooldown (60 min):** **`edge`**, **`in_game_edge`**, and **`best_bet_hour`** share a per-game lookback — one alert family per event per hour even across markets (Marines ML then Marines +0.5 live). Value Bet Radar skips games already alerted in the window. See **`loungeBotPublishDedupe.ts`**.

---

## +EV engine

Shared logic: **`supabase/functions/_shared/loungeBotOddsCaption.ts`**, **`loungeBotSportAnalysis.ts`** (sport-weighted ranking), and **`loungeBotCoffeeAndCovers.ts`** (morning covers + ML spots).

### Edge alerts (multi-market)

1. Filter events: **today (PT)** kickoffs not yet started (after optional **48h** API pre-filter), **3+ books**, in-season sport keys from The Odds API **`active`**
2. Scan **`h2h`**, **`spreads`**, and **`totals`** (sport-weighted tie-break when EV is close; see **Sport-specific analysis** below)
3. Per book: devig outcomes → fair implied prob per side
4. **Consensus:** average fair probs across books
5. **EV on $1** at best available American price vs consensus
6. Publish if pick clears **sport-aware +EV gates** (`loungeBotEdgeAlertThresholds.ts`) and **`evPct <= 15`** (stale-data filter). **`poll_edges`** takes the **top 2 EV** picks per tick across all sports.

### Coffee & Covers (morning)

**`generateCoffeeAndCovers()`** in **`loungeBotCoffeeAndCovers.ts`**:

| Section | Logic |
| --- | --- |
| **Featured lean** | Best **+4%** spread (tie-break: books → not early AM PT → later tip); else best **+3%** ML/total. Option 1 voice when board clears **~3.5-4%**; Option 2 (*If I'm playing one side…*) when thin. |
| **Radar spots** | Up to **3** next-best +EV plays (excludes featured). |
| **Dog of the Day** | Single slate-wide biggest **plus-money ML underdog** (not +EV gated). |
| **Thread teaser** | `Full board breakdown by sport below 👇` (thin board: `Full lines by sport below 👇`). |
| **Best lines thread** | One **thread part** per calendar sport (header: sport emoji + label, e.g. `🎾 Wimbledon`). Soccer lumps: **Top Soccer Leagues** → **More Soccer Today** / **Soccer** (core secondary) → lower-tier **Other Soccer** only when a prior soccer part exists, else **Soccer**. |

**On Tap Tomorrow** removed from the parent post (Jul 2026).

**NCAAB / March Madness slate cap:** On `basketball_ncaab`, Coffee & Covers filters today's board to **~20-40 high-interest games** (max **40**) before featured lean, radar, Dog of the Day, and the best-lines thread. Priority waterfall:

1. Any game with an **AP Top 25** team (`ncaab-ap-top25-keys.json` ... update weekly in season)
2. **Power-conference** matchups (ACC, Big Ten, Big 12, SEC, Big East)
3. **Spread line movement ≥ 0.5 pt** vs prior `lounge_odds_event_lines` snapshot (15-min poll)
4. **Rivalry** games or **high totals** (consensus O/U **≥ 155**)

Thread footer shows `+N more games today` against the full unfiltered slate count.

Spread devig mirrors h2h: per-book no-vig fair probs on each spread side, consensus average, EV at best juice. Dedupe key: **`coffee:daily:{ptDay}`** (one live post per bot per PT day; deleting the feed post clears dedupe via **`lounge_bot_publish_log.post_id`** `ON DELETE SET NULL`). Log **`post_kind: coffee_covers`**. Lines board lives in author thread parts (`feed_comments.is_thread_part`).

Set **`coffee_covers_enabled = false`** on **`lounge_bot_odds_config`** to fall back to legacy slate check-ins.

**Pre-match ⚡ +EV Edge thresholds (`loungeBotEdgeAlertThresholds.ts`):** sport-aware gates (portal **`min_edge_pct`** does **not** apply to Edge ... it still drives context alerts / starter spotlight). **`poll_edges`** publishes at most **`MAX_EDGE_ALERTS_PER_POLL_TICK` = 2** edges per tick (highest EV across all sports).

| Sport group | Min EV | Min books | Extra |
| --- | --- | --- | --- |
| **Soccer** (all `soccer_*`) | **7%** | **6** | Lower-tier league (not top-5 EU + MLS + Liga MX) with **≤ 5** books → **8%** EV (5 books OK) |
| **Major US** (NFL, NBA, MLB, NHL, CFB, CBB) | **5%** | **5** | — |
| **Everything else** | **5.5%** | **5** | — |

**`min_edge_pct` (portal):** minimum **+EV percent on $1 stake** (default **4%**) for **context alerts** (starter spotlight, injury/rest situational lean pick scan uses **`MIN_SITUATIONAL_LEAN_EV_PCT` = 2.5%** for injury/rest only). Legacy constant **`EDGE_ALERT_MIN_BOOKS = 4`** in caption module is superseded for Edge by the table above.

### Line movement alerts (poll_edges)

**Market file (durable open/current/close):** table **`lounge_market_files`** (migration **`20260902200000`**), filled on every non-dry odds fetch in `loadSportOddsContext` via **`loungeBotMarketFile.ts`**. Prefers Pinnacle → Circa → LowVig → consensus. Close locks at kickoff − 5 minutes. Distinct from short-lived **`lounge_odds_event_lines`** movement compares.

**Monthly scoreboard (ops):** Edge action **`syndicate_monthly_scoreboard`** (`loungeBotSyndicateScoreboard.ts`) … ATS + CLV by desk × bucket (hammer / consensus / divided / pass). Scott/Rocco/Chedda = sides; Tank = totals only. Every row includes sample **n**. CLV = **your side vs locked close** (not opener). Trust floor **n ≥ 25** per bucket×desk before crowning. Desk rollup mixes buckets ... informal only, never "shop ATS." **Primary UI:** **https://sharpesyndicate.com/ops** (admin login) → Sharp Desk → **Monthly Board**. Desk panel is **not** on EdgeTilt Signal (`sports-odds` / `/?tab=bots`). **Do not trust adaptive persona weights** until a bucket has a real sample. FEI still waits.

**`loungeBotLineMovement.ts`** — runs on every **`poll_edges`** tick (15 min, 24/7):

1. Load prior lines from **`lounge_odds_event_lines`** (saved on the **last poll**, ~**15 min** ago when cron is on schedule)
2. Fetch current odds (**`h2h`**, **`spreads`**, **`totals`** when line movement enabled)
3. **Only compare** if prior snapshot age is **8–22 minutes** (15-min poll jitter). Too fresh → skip; too stale → re-baseline without alert.
4. Compare consensus vs that snapshot; flag when **in that interval**:
   - Spread moves **≥ 0.5** pts (config **`min_spread_move_pts`**)
   - Total moves **≥ 0.5** pts (**`min_total_move_pts`**)
   - ML moves **≥ 20** juice cents in the interval (even-money normalized: +150 → +130 = **20**; -101 → +100 = **1**, not 201; config **`min_ml_move_pts`**, default **20**)
4. Classify: **`sharp_move`** (≥ 1 pt or large ML), **`steam`** (fast multi-book sync), **`rlm`** (spread vs ML diverge), **`line_movement`** (minor — internal only, no feed post)
5. Post feed alert for **`sharp_move`**, **`steam`**, and **`rlm`** only (minor **`line_movement`** feeds **Sharp Report Card** but not standalone alerts)
6. **Consolidate two-way ML moves** on the same event into one caption (both lines + “favorite shortening” meaning); skip weak dog-only lengthening (**&lt; 300** ML pts) unless paired with the other side in the same interval
7. Upsert new snapshot (first poll = baseline only, no alerts)

Dedupe: **one alert per event/market/kind per ~60 min** (`line_evt:{kind}:{eventId}:{marketKey}` + rolling bucket). **60 min lookback** also blocks mirror-side reposts (legacy per-outcome keys included). Cap: **`max_line_alerts_per_day`** (default **8**). Disable via **`line_movement_enabled = false`**.

### Live in-game edge + period reports (`poll_live`)

**`loungeBotPollLive.ts`** + **`loungeBotRundownLiveState.ts`** — dedicated **5 min** cron (`poll_live`), separate from **`poll_edges`**:

| Post kind | Trigger | Threshold |
| --- | --- | --- |
| **`in_game_edge`** | Live game (commenced, not completed per scores API) | **+EV ≥ `min_live_edge_pct`** (default **7.5%**) on **ML, spreads, or totals**; **≥ 6 books** for consensus; **no live soccer draw ML**; block live ML **> +800** unless **≥ 8 books**; footer **Live · verify quickly** on flagged longshots |
| **`period_report`** | **TheRundown** `event_status` / `game_period` when key set; else elapsed-time fallback | Best **+EV** lines for remainder of game (same live gates as **`in_game_edge`**) — **skipped** when none clear **`min_live_edge_pct`** |

**Live pick guards (`loungeBotLivePickGuards.ts`):** pre-match **edge** uses **`loungeBotEdgeAlertThresholds.ts`** (see table above); Coffee & context still use **`DEFAULT_MIN_BOOKS = 3`**. Live-only: min **6** books, default **7.5%** EV (`min_live_edge_pct`), suppress **soccer draw ML** in-play, block live ML longer than **+800** unless **≥ 8** books, optional **Live · verify quickly** / **Live · extreme number** footer.

**Caption format (all +EV alert types):** pick line, then **`+X% EV · Fair {american} ({N} books)`** via **`formatScottEvDetailLine`**.

**Rundown milestones (preferred):** `STATUS_HALFTIME` (basketball/football), `STATUS_END_PERIOD` + `game_period` (NHL), `game_period >= 5` (MLB). In-game headers use `event_status_detail` when present.

**Credits:** `poll_live` pre-checks Odds API **scores** (skip sport if no live games), then fetches **odds** only for sports in play ... much cheaper than 5 min full `poll_edges`.

**Guards:** **`loungeBotLiveGuards.ts`** + publish-due re-validation (cancel if game final). State in **`lounge_odds_game_period_state`**. Caps: **`max_live_alerts_per_day`** (default **8**), **`max_period_reports_per_day`** (default **6**).

### Arb Watch (poll_edges)

**`loungeBotArbWatch.ts`** — runs on every **`poll_edges`** tick (reuses the same odds fetch; **no extra API credits**). **Posts only when** a clean cross-book arb clears **`min_arb_profit_pct`** (default **2%**). Silent otherwise.

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
4. Minimum **`min_best_bet_hour_ev_pct`** (default **6%**); **≥ 5 books**; stale cap **15%**
5. Tie-break: higher **+EV** → sport popularity (**NFL > NBA > MLB**, etc.) → calendar **`priority`** → more books
6. Dedupe **`best_bet_hour:{PT hour bucket}:{eventId}`** — one post per bot per PT hour
7. **Same-game skip:** if the top pick's **`eventId`** matches the last published/queued Best Bet, skip (`same_game_as_last_best_bet`) ... need a different game

Disable via **`best_bet_hour_enabled = false`**. Audience key **`best_bet_hour`** in portal matrix.

**Portal Run alert now:** one button per alert type → **`admin_lounge_bot_queue_odds_poll`** with **`p_alert_kind`** + **`p_force`**. Edge **`lounge-odds-poll`** accepts **`alertKind`** on **`poll_edges`** / **`poll_live`** to run a single subsystem. Migration **`20260710160000`**.

### Sharpe's Sharp Report (poll_edges)

**`loungeBotSharpReport.ts`** — one narrative **Sharp Report Card** per poll when meaningful movement is found:

1. Compare current lines to stored snapshot (**10–60 min** age; wider than tick-level line alerts)
2. Reuse **`detectLineMovements`**; keep **steam**, **sharp_move**, **RLM**, or spread **≥ 0.5** / ML **≥ 20** pt moves
3. Pick **one** best game slate-wide (movement score → NFL/NBA/MLB popularity)
4. Short analytical caption with cautious language (`appears to be`, `leaning`, etc.) ... **no fabricated injury/news context**
5. Dedupe **`sharp_report:{ptDay}:{eventId}:...`**; cap **`max_sharp_reports_per_day`** (default **4**)

Runs **before** line-movement snapshot upsert so both read the same prior lines. Disable via **`sharp_report_enabled = false`**.

### Feed post spacing (short queue)

Alerts publish **immediately** when **`min_post_gap_minutes`** has elapsed since Scott's last feed post. Otherwise they queue for the **next gap window only** (never stacked hours deep):

| Priority | Alert kinds | Extra jitter after gap |
| --- | --- | --- |
| **Urgent** | Arb Watch, in-game edge, period report | 0–30s |
| **Normal** | +EV edge, Best Bet, Value Radar, context alerts | 15s–1min |
| **Low** | Line movement, Sharp Report | 30s–90s |

**`min_post_gap_minutes`** (default **2**) enforces minimum spacing between Scott feed posts. Alerts **publish immediately** when the gap allows; otherwise they queue for the next gap window (typically **under 2 minutes**, never hours). **`lounge_bot_scheduled_posts`** is drained every minute by pg_cron **`lounge_bot_publish_scheduled_odds`** → **`lounge-bot-publish-due`**. **Coffee & Covers** still posts immediately (threaded morning post).

### Value Bet Radar (peak hours, ~30 min)

**`loungeBotValueBetRadar.ts`** — dedicated **`value_bet_radar`** poll action (pg_cron **minutes 5 and 35 every hour**; Edge gates **8am–10pm PT**):

1. Scan every calendar sport today via fresh Odds API fetch (**`h2h`**, **`spreads`**, **`totals`**)
2. Include **today's unplayed** kickoffs plus **live** in-progress games (same window as Best Bet)
3. **`findPlusEvOpportunities`** slate-wide; keep the **single** highest **+EV** look (public crumb … not a mini-slate)
4. Dedupe **`value_bet_radar:{PT half-hour bucket}`** — one post per bot per 30-min window; cap **`max_value_bet_radar_posts_per_day`** (default **12**); **≥ 4 books** per pick; min **5%** EV

Disable via **`value_bet_radar_enabled = false`**. Default audience **lounge** (snackable crumb). Best Bet Hour is **VIP-only**.

### Context alerts (Rundown + odds, `poll_edges`)

**`loungeBotContextAlerts.ts`** — up to **one** context post per sport per **`poll_edges`** tick when data qualifies. Requires **`THERUNDOWN_API_KEY`** for starters, injuries, and rest/B2B; each kind also needs a qualifying **+EV** pick on the same game (**`min_edge_pct`**).

| `post_kind` | Header | Data source |
| --- | --- | --- |
| **`starter_spotlight`** | 🔦 Starter Spotlight | Confirmed starters (pitchers, QBs, etc. when Rundown has data) + best +EV pick |
| **`confirmed_starters`** | ✅ Confirmed Starters | Compact starter list + pick (skipped if Starter Spotlight already posted/scheduled that day for same game) |
| **`injury_impact`** | 📐 Situational Lean | Hard injury status (OUT, IR, etc.) + pick — opinionated handicapper voice |
| **`rest_travel_edge`** | 📐 Situational Lean | 7-day Rundown schedule + venue table: rest gap ≥ 1 day, +EV on **rested** team; optional travel line (≥800 mi or cross-TZ) — same voice |
| **`fade_the_public`** | 🚫 Fade the Public | **Off by default** — needs public betting % feed (not in Rundown OpenAPI) |

**Situational Lean** (`injury_impact` + `rest_travel_edge`): captions use pick line with **(+EV%)**, one situational sentence, one lean sentence. Combined cap **`MAX_SITUATIONAL_LEANS_PER_DAY` = 2** (code constant; separate from starter spotlight). EV floor **`MIN_SITUATIONAL_LEAN_EV_PCT` = 2.5%** for these two kinds only (regular ⚡ Edge uses **`loungeBotEdgeAlertThresholds.ts`**). Tie-break among candidates: highest EV, then later tipoff.

Priority when multiple qualify: injury → starter spotlight → rest → confirmed starters. Overall daily cap **`max_context_alerts_per_day`** (default **6**). Toggle per kind via **`starter_spotlight_enabled`**, **`confirmed_starters_enabled`**, **`injury_impact_enabled`**, **`rest_travel_edge_enabled`**, **`fade_the_public_enabled`**. Default audience **Subs**.

**Rest + Travel logic (`loungeBotRestTravel.ts` + `loungeSportsVenues.ts`):**

1. Load Rundown events for **today + prior 7 PT days** (cached 45m per sport/date).
2. Per team: days since last game, B2B (`days === 1`), NFL short week (`days < 6`), bye (no game in window).
3. Qualify when fatigued side is B2B or NFL short week and rested side has **≥1 day** more rest (or bye vs short week).
4. **+EV pick must be on the rested team** (h2h/spreads only).
5. Travel line only when Haversine **≥800 mi** or home-market TZ bucket changes (`loungeSportsVenues.ts` seed). Resolve order: Rundown **`venue_location`** when present → home-team arena → opponent home arena. Unknown team → rest-only caption (no travel line).
6. Copy stays **team schedule** only (never pitcher workload).

**Venue seed (Phase 2):** `loungeSportsVenues.ts` — NBA (30), MLB (30), NFL (32), WNBA (13), NHL (32), NCAAF FBS (80), NCAAB (153 rows: full Pac-12/WCC/MWC/American/A-10/MVC + power conferences). Seed: **`scripts/lib/ncaab-venues-seed.mjs`**, **`scripts/lib/college-sports-venues-seed.mjs`**. Re-sync: **`scripts/sync-college-venues-to-ts.mjs`**; coord refresh: **`scripts/geocode-sports-venues.mjs`** (no runtime Maps calls).

Example Situational Lean (rest/travel):
```text
📐 Situational Lean

Warriors -4.5 (-110) @ DraftKings (+3.9% EV)

Lakers on the 2nd night of a back-to-back after cross-time-zone travel (East to West).
Prefer the rested home side here.
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

Example Situational Lean (injury):
```text
📐 Situational Lean

Chiefs -4 (-110) @ DraftKings (+4.1% EV)

Rashee Rice has been ruled out and the market hasn't fully adjusted.
Still see value on Chiefs.
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

Example line movement (sharp money, two-sided ML):
```text
🔥 Sharp Money Move

Boxing
August vs Bank · Sat 11AM PT

Bank ML -1500 → -2500
August ML +800 → +1000
Books: LowVig, BetOnline, BetUS

Favorite shortening hard — sharp money on Bank.
```

Example line movement (spread):
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

**Plan:** Ryan on **$119 / 5M credits per month** (The Odds API paid tier). Tiers differ by **credit volume only** ... same sports, bookmakers, and markets as the free plan; **no public betting % / splits** at any tier. Monitor `x-requests-remaining` header (Scott typically uses a small fraction of 5M; headroom avoids mid-month **401 / OUT_OF_USAGE_CREDITS** mute).

---

## Config: `lounge_bot_odds_config`

| Column | Notes |
| --- | --- |
| `min_edge_pct` | Min +EV % for **context alerts** (default **4**); editable in portal; pre-match ⚡ Edge uses **`loungeBotEdgeAlertThresholds.ts`** |
| `max_edge_alerts_per_day` | Default **8** |
| `max_slate_posts_per_day` | Default **10** |
| `daily_slate_enabled` | Default **true** — gates **`daily_slates`** poll |
| `coffee_covers_enabled` | Default **true** — Coffee & Covers vs legacy slate |
| `line_movement_enabled` | Default **true** — line movement alerts on **`poll_edges`** |
| `max_line_alerts_per_day` | Default **8** |
| `min_spread_move_pts` | Default **0.5** |
| `min_total_move_pts` | Default **0.5** |
| `min_ml_move_pts` | Default **20** (American odds points) |
| `sports_keys` | Fallback list; calendar drives manual picks |
| `regions` | `['us']` |
| `markets` | `['h2h','spreads']` |
| `best_bet_hour_enabled` | Default **true** — hourly strongest +EV post |
| `min_best_bet_hour_ev_pct` | Default **6** — min +EV % for Best Bet of the Hour (**≥ 5 books**) |
| `arb_watch_enabled` | Default **true** — arb scan on poll_edges (post only when arb found) |
| `min_arb_profit_pct` | Default **2** — min guaranteed arb profit % |
| `max_arb_alerts_per_day` | Default **6** |
| `sharp_report_enabled` | Default **true** — narrative sharp report on poll_edges |
| `max_sharp_reports_per_day` | Default **3** |
| `value_bet_radar_enabled` | Default **true** — one public +EV look during peak hours (crumb, not a second card) |
| `min_value_bet_radar_ev_pct` | Default **5** — min +EV % per Radar pick (**≥ 4 books**) |
| `max_value_bet_radar_posts_per_day` | Default **12** |
| `starter_spotlight_enabled` | Default **true** — starter spotlight on **`poll_edges`** when Rundown confirms starters |
| `confirmed_starters_enabled` | Default **true** — compact confirmed-starters list |
| `injury_impact_enabled` | Default **true** — Situational Lean injury (hard OUT/IR + pick) |
| `rest_travel_edge_enabled` | Default **true** — Situational Lean rest/travel (7-day schedule, venue table, +EV on rested team) |
| `fade_the_public_enabled` | Default **false** — needs public betting % feed |
| `max_context_alerts_per_day` | Default **6** — cap across all context kinds |
| `min_post_gap_minutes` | Default **2** — min minutes between Scott feed posts |

Publish log: **`post_kind`** (… `value_bet_radar`, `starter_spotlight`, `injury_impact`, …), **`dedupe_key`** — through **`20260705010000`**. Pending queue: **`lounge_bot_scheduled_posts`**.

---

## Sports calendar

Table **`lounge_sports_betting_calendar`** — seeded for 2026 major events.

RPC **`admin_lounge_sports_betting_calendar_today()`** → portal dropdown.

Captions prefix category label from calendar row (e.g. `Wimbledon: ...`).

**Portal calendar editor:** Scott bot **`/?tab=bots`** → **View calendar** → date picker, **Add event** / **Edit** (migration **`20260704320000`**). Rows include optional **`coverage_tier`** (migration **`20260704330000`**).

---

## Scott coverage scope (priority tiers)

Canonical logic: **`supabase/functions/_shared/loungeBotCoverageScope.ts`** + scan union **`loungeBotScanTargets.ts`**.

**Poll loops (Jul 2026):** Scott scans every **active** Odds API sport in **tiers 1–4** below. **`lounge_sports_betting_calendar`** only **boosts** priority + captions for special events (fight night, March Madness window, etc.) ... it is **not** the allowlist.

| Tier | Cover | Examples |
| --- | --- | --- |
| **1 · Must cover** | Core handle | NFL, NBA, NCAAF, MLB, NCAAB |
| **2 · High priority** | Strong engagement | UFC/MMA, NHL, soccer, tennis, golf |
| **3 · Strong secondary** | Regular rotation | Boxing, horse racing, motorsport, WNBA, esports |
| **4 · Completeness / arb** | When lines exist | Cricket, table tennis, rugby, AFL, volleyball |

**Rules (Edge + portal):**

- **`poll_edges`** scans **active tier 1–4** sports (calendar boosts priority/captions).
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

**Baseball league labels:** Scott captions use **`sportDisplayLabel`** (`loungeBotSportLabels.ts`) so American MLB is not the default for every Odds API `baseball_*` key. **`baseball_mlb`** → **MLB**; **`baseball_npb`** → **NPB**; **`baseball_kbo`** → **KBO**; **`baseball_milb`** → **MiLB**; **`baseball_ncaa`** → **NCAA Baseball**. Unknown baseball keys title-case the key tail, never **MLB**.

**Ice hockey labels:** only **`icehockey_nhl`** (+ preseason / championship winner keys) map to **NHL**. AHL, SHL, and other `icehockey_*` leagues use title-cased key tails, not **NHL**.

**Soccer league labels:** each active `soccer_*` Odds API key gets its own header from the API **`title`** (e.g. **MLS**, **A-League**, **Denmark Superliga**) with editorial overrides for majors (**Premier League**, **La Liga**, **Bundesliga**, **Champions League**, etc.). No generic **Soccer** bucket.

**MMA / UFC labels:** Odds API uses one key (`mma_mixed_martial_arts`) for all promotions. Default scan label is **MMA** until publish. When **`THERUNDOWN_API_KEY`** returns an event headline, captions use the promotion name when detected: **UFC**, **Bellator**, **PFL**, **ONE Championship**, **Cage Warriors**, **Invicta**, **LFA**, **Rizin**, etc. Generic **MMA** only when the headline has no recognizable promotion.

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
| **`20260725230000`** | Alert **destinations** (lounge / sub chat / sub+10% / sub+30%) + portal matrix |
| **`20260704260000`** | **`subscriber_only`** feed + **`alert_audience`** + live in-game / period reports |
| **`20260704270000`** | **Best Bet of the Hour** (`best_bet_hour` post kind, hourly cron, portal audience row) |
| **`20260704280000`** | **Arb Watch** (`arb_watch` on `poll_edges`, min 3% guaranteed profit) |
| **`20260704290000`** | **Sharp Report Card** (`sharp_report` narrative on meaningful line moves) |
| **`20260704300000`** | **Value Bet Radar** (`value_bet_radar` — 2–3 top +EV plays, ~30 min peak cron) |
| **`20260704310000`** | **Human-paced publish queue** (`lounge_bot_scheduled_posts`, minute drain cron) |
| **`20260704320000`** | **Sports calendar portal** (list + save RPCs, Scott bot calendar UI) |
| **`20260704330000`** | **Scott coverage tiers** (`coverage_tier` on calendar, expanded 2026 seed incl. UFC 329) |
| **`20260705010000`** | **Context alerts** (`starter_spotlight`, `confirmed_starters`, `injury_impact`, `rest_travel_edge`, `fade_the_public` off by default) |
| **`20260706140000`**–**`20260706160000`** | Portal async pg_net queue + outcome polling RPC |
| **`20260706150000`** | Queue RPC slug ambiguous fix (`v_slug`) |
| **`20260706170000`** | **`invoke_lounge_odds_poll(action, force)`** — optional `force` for Coffee cron tests |
| **`20260706180000`** | Market Edge Yahoo Finance + MarketWatch RSS |
| **`20260706190000`** | Scott **`poll_live`** cron + Rundown period/halftime live content |
| **`20260707000000`** | Bot portal **Post as** optional **`image_urls`** (up to 6) |
| **`20260726240000`** | Live pick quality: default **`min_live_edge_pct`** 6% (superseded by v1 thresholds) |
| **`20260726250000`** | Sub chat publish dedupe via **`lounge_bot_publish_log.sub_chat_message_id`** |
| **`20260726260000`** | Alert thresholds v1: higher EV floors, per-alert min books in code, tighter daily caps, arb **2%** |

**Edge code (no migration):** **`loungeBotEdgeAlertThresholds.ts`** — sport-aware +EV / book gates + **2/tick** cap; **`loungeBotSportAnalysis.ts`** — sport market weights + ranking. Redeploy **`lounge-odds-poll`** + **`lounge-odds-ingest`** after pull. **`lounge-x-ingest`** — redeploy after X manual-transform changes (**`loungeBotXTweetFetch.ts`**).

---

## Manual posts and replies (portal)

On **`/?tab=bots`**, any bot card includes:

| Control | RPC / behavior |
| --- | --- |
| **Post as @handle** | **`admin_lounge_bot_publish_post`** — inserts feed post as bot (caption and/or up to 6 **`image_urls`** and/or up to 12 **`market_embeds`** via Lounge ticker picker); picker/Publish append missing **`$TICKER`** to caption; logs **`post_kind: other`**. **`20260807160000`**. |
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
| Portal UI | **`src/features/bots/BotManagementPortal.jsx`**, **`BotComposeImagePicker.jsx`**, **`botPortalApi.js`** |
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

## Ops / troubleshooting (Jul 2026)

### Odds API 401 on every sport (Scott mute)

**Symptom:** Cron `200` / `ok: true`, but `details[].error` is `Odds API baseball_mlb 401` (all sports). No edges/line moves/context. `requestsRemaining: null`.

**Cause:** The Odds API returns **401** for **invalid key** *and* for **OUT_OF_USAGE_CREDITS**. `/sports` does not burn credits so the poll still “finds” sports; `/odds` fails. Aggressive crons (~4k+ credits/day) can empty a mid-tier plan in days.

**Fix:** Top up / upgrade at the-odds-api.com, confirm **`THE_ODDS_API_KEY`** on Edge matches that account. After hard-fail ship: all-sport 401 returns **503** + stores **`config.odds_api_last_error`** on the bot (portal amber banner).

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

## NFL EPA + CFB consensus metric sync (real ingest)

**Problem we fixed:** `nfl_team_metrics` and `cfb_team_power_ratings` originally shipped with **hand-seeded** boards (no live feed). Trench win rates (PBWR/PRWR/RBWR/RSWR) are **PFF-class** and stay out of model math until a paid charting API is wired.

**NFL (free):** [`scripts/sync-nfl-team-metrics.mjs`](../scripts/sync-nfl-team-metrics.mjs) pulls nflverse play-by-play and upserts `off_epa_play`, `def_epa_play`, `success_rate`. Skips `is_custom_override` rows. Does **not** invent trench columns.

```bash
npm run syndicate:sync-nfl-metrics:test
npm run syndicate:sync-nfl-metrics:test -- --dry-run
npm run syndicate:sync-nfl-metrics:production   # Ryan explicit only
```

**CFB (Phase 1 consensus blend):** [`scripts/sync-cfb-power-ratings.mjs`](../scripts/sync-cfb-power-ratings.mjs) builds:

1. **`power_rating`** ← **40% SP+ · 25% FPI · 25% Sagarin Predictor · 10% score Elo** (each voter centered to points-vs-avg FBS, then weighted; missing voters renormalize)
2. Component columns: **`sp_rating`**, **`fpi_rating`**, **`sagarin_rating`** (migration `20260902180000`)
3. **`off_rating` / `def_rating`** ← CFBD **SP+** unit ratings (Rocco lane)
4. **HFA** ← home-margin residual · **Tempo** ← advanced plays/game (Tank lane)

Sagarin is scraped from the public Predictor board (`scripts/lib/cfbSagarinPredictor.mjs`). Phase 2 candidates: FEI, TeamRankings, market-implied, Powers/Makinen.

Desk mapping: **Scott** = PASS unless model−market ≥ 2.5 after PVAL (1.5 only on true 3/7 keys) · **Rocco** = PASS unless short-fav / hurtSide / hook-tax / pasted chalk-trap (short-fav alone ≠ house vote / hammer strength; juice worse than **-115** → PASS unless Scott/Chedda already on that side; no trench truth) · **Chedda** = PASS unless dog+hook / dog+PVAL / pasted money (no dog+raw-EPA; no synthetic) · **Tank** = totals first-pass (formula frozen). Hammer = all three side desks active + Scott + independent second reason. Synthetic splits never score. Primetime = spotlight lean, not house card.

**ATS slate auto-publish (pg_cron):** CFB Fri **12pm PT** house (`cfb_slate_card`); Wed **2pm** VIP midweek Thu/Fri nights (`cfb_wed_midweek_vip`); Thu **3:30pm** CFB night tease (`cfb_thu_night_spotlight`); Sat **10am** CFB adds/kills. NFL Fri **1pm** house; Wed TNF VIP; Sat adds/kills. Primetime public = one lean + CTA. Migration `20260902250000`.

**Internal weekly SOP (honest inventory + publish rules):** [`docs/syndicate-cfb-weekly-runbook.md`](./syndicate-cfb-weekly-runbook.md). Keep blend weights out of public UI.

Requires **`CFBD_API_KEY`** in `.env.supabase.{test,production}` and GitHub Actions secret `CFBD_API_KEY` ([get key](https://collegefootballdata.com/key)). Free tier is 1k calls/mo … weekly sync is fine; Patreon ~$5/mo if you need more.

```bash
npm run syndicate:sync-cfb-power:test
npm run syndicate:sync-cfb-power:production   # Ryan explicit only
```

**Cron:** [`.github/workflows/syndicate-football-metrics-sync.yml`](../.github/workflows/syndicate-football-metrics-sync.yml) … Tuesdays **14:00 UTC** syncs **test + production**. Manual dispatch can set `sync_production=false` to skip prod. Edge Monitor heartbeat **`syndicate_football_metrics_sync_production`** (migration **`20260903210000`**).

**Model honesty:** [`loungeBotTeamMetrics.ts`](../supabase/functions/_shared/loungeBotTeamMetrics.ts) `calculateTrenchEpaMatchup` is **EPA-only** (trench spread impact hard-zero) until PFF/B2B. Redeploy **`lounge-odds-poll`** after pulling that change.

---

## Locked major-post markdown dialect (2026-09-01)

**Scope so far:** public **NFL/CFB Slate Card** + **Weekly Syndicate Ledger** only. Most alerts stay plain. More post kinds still TBD.

**Composer dialect only** (`loungeMarkdown.jsx`): headings, lists, `**bold**`, `==highlight==`, `[green]/[red]/[gold]` color tags, `>`, `---`. Prefer `, ` over middle dots (`·`) so `sanitizeBotProse` does not rewrite separators to ` ... `.

### Public slate teaser (`formatNflSlateCardCaption`)

- Caps: **1** hammer, **2** consensus, **3** house-divided games (VIP still gets full desk cards)
- H1 title + `Week N · Sep 10-15` line; H1 section headers with emojis
- Pick line: `- **[gold]{pick}[/gold]** ({away}/{home} · {when})` plus ` · Scott, Rocco` on **consensus** and **house divided** only (not hammers ... unanimous 3-0 among Scott/Rocco/Chedda; Tank is totals-only)
- House divided: one gold bullet per side, desk names on each
- Markdown dialect captions preserve middle dots (`·`) through publish sanitize

### Weekly ledger (`formatWeeklySyndicateRecapCaption`)

- H1 title / crew / syndicate total; H2 for CLV + boxscore
- Crew lines: comma between units and win% (`+1.03u, 55.6%`)
- green/red/gold color tags; `==🏆 Top Earner==` on top desk
- CLV: `[green]+0.6[/green] avg points CLV`
- Post-mortem: `{hook} · {narrative}` (spread line or total points first)
- Bad-beat tagline: rotating pool (includes *Variance killed the cover, but the model is sound.*); omitted ~25% of weeks

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
