# Sharpe Syndicate CFB weekly runbook (internal)

**Audience:** Ryan + agents. **Not** public marketing copy.  
**Do not** put blend weights, voter names, or this SOP on sharpesyndicate.com.

North star: **real ratings → four specialist desks → publish only what we’d bet → grade ATS + CLV.**  
The board is the map. The desks are the drivers. Do not confuse them.

---

## 0. Honesty first (what “excellent” means here)

Excellent decisions are **not**:

- AP/Coaches vibes
- Four bots repeating one gap flag
- A pretty consensus number with no market file
- “Hammer” because all four desks read `isValuePlay`

Excellent decisions **are**:

- A priced model line vs a real market line
- A gap large enough to matter **and** juice that doesn’t kill it
- Desk votes that use **different inputs** (so disagreement is possible)
- Published picks we’d actually risk units on
- A graded trail (ATS + CLV) that can fire a cold desk

Until the market file + independent desk inputs are solid, treat output as **process in training**, not gospel.

---

## 1. What we have today (real inventory)

### Board (map) … mostly real

| Asset | Source | Status |
|-------|--------|--------|
| Consensus `power_rating` | Phase 1 blend: SP+ / FPI / Sagarin Predictor / score Elo | **Live** (test + prod sync) |
| SP+ overall + off/def | CFBD `/ratings/sp` | **Live** |
| FPI | CFBD `/ratings/fpi` | **Live** |
| Sagarin Predictor | Public HTML scrape | **Live** (fragile; if fetch fails, blend renormalizes without it) |
| Score Elo | CFBD games → owned Elo | **Live** (small blend vote) |
| Tempo | CFBD advanced plays/game (prior year until current covers FBS) | **Live** |
| HFA | Home-margin residual vs Elo (damped/clamped) | **Live** but often flat ~3.5 for top teams |
| Model spread / total | `calculateCfbMatchupProjection` | **Live** |
| Value flag (≥ ~2.5 vs market) | `isValuePlay` / `valueSide` | **Live** |

Public site shows Consensus + Off/Def/HFA/Tempo. Model A/B/C columns are **blurred fake placeholders** (real voter ratings are not sent to the public client).

### Market / context … partial

| Asset | Status | Gap |
|-------|--------|-----|
| Current spreads / juice from books | **Live** via odds poll / ingest | — |
| **Market file** (`lounge_market_files`) | **Live on poll** (test after `20260902200000` + Edge redeploy) | Open = first seen; current = each poll; close locks ≤5 min before kickoff (or after start). Prefers Pinnacle/Circa/LowVig else consensus. Football uses next-slate cluster (not just “today PT”). |
| Key numbers / hooks | **Partial** | Useful; not a full steam desk |
| Betting splits / RLM | **Paste path live** | Table `syndicate_betting_splits` + portal **Chedda Splits Paste**. Paste/drop Action PRO screenshots (multi + Ctrl+V) or manual row; vision extracts ticket%/handle%. Synthetic never votes. Real API still five-figure fork. |
| Weather / rest / travel | **Modules exist** | Not yet first-class Tank totals publish lane |
| Starting QB / injury modifiers | **Live** (`syndicate_side_modifiers` + Rundown×PVAL) | Manual CFB first; auto only on known PVAL. Scott vs **current** market; Rocco gets hurt-side strength flag (not Scott’s pts). |
| Desk scoreboard (ATS/CLV by desk + bucket) | **Live (test + prod)** | Edge `syndicate_monthly_scoreboard` + portal Monthly Board. Bucket×desk is truth; desk rollup is mixed/informal. CLV = side vs locked close. Trust floor **n ≥ 25**. No adaptive weights until real sample. FEI waits. |

### Desk automation … real but uneven

Code path: `loungeBotPredictivePick.ts` (`buildNflAtsSlateCard` and related).  
Buckets: Hammer (**3–0** side desks) / Consensus (**2–1**) / House divided (**1–1**). Tank is totals-only and does not vote ATS.

**Correlated-noise risk (fix this over time):** if Scott, Rocco, and Chedda all overweight the same `cfbMatchup.isValuePlay` / gap flag, hammers become one opinion × four. Desks only count when they can **disagree** for independent reasons.

---

## 2. What we still need (priority order)

Do **not** reshuffle Phase 1 blend weights while operating this loop.

1. **Market file (shipped plumbing)**  
   Table **`lounge_market_files`**: open / current / close spread + total + juice + timestamps + source book.  
   Filled automatically on every non-dry `loadSportOddsContext` poll (`loungeBotMarketFile.ts`).  
   Grade + monthly scoreboard read locked close for CLV. Optional: Odds API historical backfill.

2. **Tank as a totals desk (shipped v1 + guardrails)**  
   Tank votes **Over/Under** only when edge is real; **PASS is the default**.  
   - Publish lean: `|modelTotal − marketTotal| ≥ 3.5`  
   - Or ≥ **2.5** when model crosses key totals **48 / 51 / 54** vs market  
   - 2.5 alone = look, not a force-play (first-pass off/def+tempo … no weather/rest yet)  
   ATS Hammers/Consensus are **Scott / Rocco / Chedda only** (3-0 / 2-1 / 1-1).  
   Totals never bleed into side votes. Tank ledger = **totals only** (do not mix into side scoreboard / adaptive ATS weights).  
   Weather/rest still optional boosts later.

3. **QB / injury modifier (shipped + prod-locked rules)**  
   Applied **after** consensus board, **before** Scott’s value flag. Does **not** rebuild SP+/FPI.  
   - Table **`syndicate_side_modifiers`**: manual CFB (and any override)  
   - **Sign:** `net_spread_impact_home` … **positive favors home** (away more hurt)  
   - **QB range:** not a universal 4.5 … tier by caliber (elite starter ~4–7, average ~3–4.5, MAC/bridge ~2–3)  
   - Auto: Rundown **hard outs** × known **PVAL** only (no invent for unmatched names)  
   - **Scott vs current market** (this poll’s number), never opener … if gap is gone after the move, Scott **PASS** (no double-count)  
   - **Rocco/Chedda independent:** do not feed Scott’s adjusted spread. Rocco gets `hurtSide` as a strength/chalk-trap input only  
   - **Tank** totals untouched unless backup changes pace/scoring  
   - Empty/manual-missing = no modifier, never theater

   Example insert (away QB out → positive home impact):

   ```sql
   insert into syndicate_side_modifiers (
     sport_key, home_team, away_team, net_spread_impact_home, reason, source, player_name, player_pos, player_status
   ) values (
     'americanfootball_ncaaf',
     'Ohio State Buckeyes',
     'Texas Longhorns',
     4.5,  -- + favors HOME
     'Texas starting QB OUT … backup drop ~4.5 (tier by caliber, not universal)',
     'manual',
     'Arch Manning',
     'QB',
     'out'
   );
   ```

4. **Monthly desk + bucket scoreboard** (**shipped, keep dumb**)  
   ATS + CLV by Scott / Rocco / Chedda (sides) / Tank (totals) and by Hammer / Consensus / Divided / Pass.  
   Portal: Sharp Desk → **Monthly Board** (this month / 3 mo). Edge: `action: syndicate_monthly_scoreboard`.  
   Only after real **n**: shrink cold desks / raise hot ones. **Do not chase FEI until hammers vs consensus is graded.**

5. **Later audit columns (not blockers)**  
   FEI, Powers/Makinen, TeamRankings, market-implied ratings.

---

## 3. Desk charter (independent inputs)

| Desk | Question | Inputs they are allowed to lean on | Play when… | Pass when… |
|------|----------|--------------------------------------|------------|------------|
| **Scott** | Is the number wrong? | Model spread vs market (+ PVAL), true key numbers | Gap ≥ **2.5** after PVAL, or ≥ **1.5** only when pick line is on 3/7 (or half onto those). Else **PASS**. No juice/fav/synthetic lean. | Gap closed, no model, or soft non-key spot |
| **Rocco** | Is the better team a short fav I want? | Short fav band, hook tax, hurtSide, **pasted** chalk-trap | Any of those features fire → vote; else **PASS**. Short-fav alone can vote but **cannot** unlock Hammer by itself. | No feature; brand-only chalk with nothing else |
| **Chedda** | Where are the points / the money? | Dogs, golden hooks, pasted ticket vs handle / RLM, dog+PVAL | Dog + (hook **or** pasted money **or** PVAL injury model). Raw EPA alone does **not** unlock. | Blind dog; synthetic splits; missing paste |
| **Tank** | Does situation change the **total** (or rarely the side)? | Tempo pair, off/def for totals, rest/travel/weather when real | Totals lean with supporting tempo/weather/rest | Side-only vibes with no situational meat |

**Hard rule:** a desk must be able to vote **NO PLAY** (or opposite side) using its own inputs even when Scott’s gap flag is green.

---

## 4. Weekly machine (operate what we have)

### Publish calendar (auto crons … shop model)

VIP uncut cards lock when injury + splits are real enough … **not** Tue vibes, **not** Sat/Sun morning first drop.

**Friday stays the house.** Everything else is a satellite or VIP ops.

| Package | Cron (PT) | Action | Audience |
|---------|-----------|--------|----------|
| CFB Wed midweek | **Wed 2:00 PM** | `cfb_wed_midweek_vip` | **VIP only** (Thu/Fri night leans) |
| CFB Thu night | **Thu 3:30 PM** | `cfb_thu_night_spotlight` | Public **one lean** + VIP deep |
| CFB Saturday lock | **Fri 12:00 PM** | `cfb_slate_card` | Public teaser + VIP full |
| CFB Sat adds/kills | **Sat 10:00 AM** | `cfb_sat_vip_adds_kills` | **VIP only** (no-op if quiet) |
| NFL Sunday lock | **Fri 1:00 PM** | `nfl_slate_card` | Public teaser + VIP full |
| NFL Wed TNF watch | **Wed 11:00 AM** | `nfl_wed_tnf_vip` | **VIP only** |
| NFL Sat adds/kills | **Sat 10:00 AM** | `nfl_sat_vip_adds_kills` | **VIP only** (no-op if nothing flipped) |
| Weekly recap | **Tue 7:30 AM** | `weekly_syndicate_recap` | Public + VIP |
| Weekday predictive | — | muted | Was public freebie … killed |

Public crumbs (not a second card): Coffee & Covers · Value Radar **one look**. Best Bet Hour = VIP only.  
Primetime public posts = **one lean + CTA** (full desks VIP-only).  
**Sat / Sun AM:** portal tweaks for late scratches … no auto full-card republish.  
**Window math:** next kickoff within 21d, then games within **5 days** of that kickoff.

### Mon–Tue … freeze the map

```bash
npm run syndicate:sync-cfb-power:test
# production only when Ryan explicitly asks
npm run syndicate:sync-cfb-power:production
```

Confirm top shelf is sane (OSU / Oregon / ND / Indiana / Georgia / Texas / Miami neighborhood).  
If Sagarin scrape failed, note it in the run log (blend ran without that voter).

### Tue–Wed … price the slate

For each upcoming CFB game with a market spread:

1. Resolve both teams on the board (skip if missing).
2. Compute model spread (+ HFA) and model total (off/def + tempo).
3. Attach **current** market (best we have today).
4. Flag Scott inbox: `|model − market| ≥ 2.5` after HFA (softer early season … don’t force action on soft priors alone).

Log whatever open/current we have. Closing gets filled as the week progresses (or at settle once market file exists).

### Wed–Fri … four votes

Run desk scoring **independently**. Preferred publish set:

- Votes: HOME / AWAY / NO PLAY (automation today is mostly forced side … treat weak scores as soft NO PLAY in human review until code supports it)
- Conviction 1–3 when reviewing by hand
- One sentence reason tied to **that desk’s inputs** (not an essay)

### Fri … the lock

Auto publish: **CFB Fri 12:00 PM PT**, **NFL Fri 1:00 PM PT** (`cfb_slate_card` / `nfl_slate_card`). Paste Chedda splits before those times.

**Locked definitions (clarified):**

| Label | Meaning |
|-------|---------|
| **Hammer** | All three side desks **active** (Chedda not PASS) **and** Scott agrees **and** (Rocco strength = hurtSide / hook-tax / pasted chalk-trap / CFB power **or** Chedda real feature). Short-fav alone ≠ Rocco strength. Scott+Rocco with Chedda PASS = **2-0 consensus max**, never Hammer. |
| **Consensus** | Soft unanimous / 2-1 / 2-0 lean among active side desks without full hammer gate. Publish if we’d bet it. |
| **House divided** | Thin or 1–1 split active board. Pass or small look. Do **not** force a fake united play. |

**Not a Hammer:** Scott + Rocco both reading the same short-fav band with Chedda silent, or desks echoing the same gap. That is Consensus (or thin board), not a Hammer.

Publish **Hammers + Consensus only** on the public/VIP slate unless Ryan overrides.

**Not what this means:**

- Not “every Hammer needs two essays”
- Not “ban all 3–0s” … fine when desks used different features
- Not “you can’t publish a single-desk Scott lean” as a Scott play or as part of a real 2–1

---

## 4b. Operating with incomplete data (this week)

Treat desks at different confidence. Do not pretend Chedda has Circa handle.

| Desk | Role this week | Rule |
|------|----------------|------|
| **Scott** | Gap filter | PASS unless \|model−market\| ≥ 2.5 after PVAL (1.5 only on true 3/7 keys). No synthetic split score. |
| **Rocco** | Confirm / fade / PASS | Short fav + hurtSide + hooks + pasted chalk-trap. Short-fav alone ≠ hammer strength. No trench truth. |
| **Chedda** | Dog + hook / dog + PVAL / **pasted money** | **PASS** unless a real feature fires. Raw EPA alone does not unlock. Quiet Chedda > invented steam. |
| **Tank** | First-pass totals | Off/def + tempo vs number (3.5 / key-total). Weather/rest footnotes only. Formula frozen this PR. |

**Product honesty:** VIP can show all four votes. Public copy should say model-vs-number / short favorite / dog+hook … not fake steam. Scoreboard decides if Chedda is signal before we buy him better data.

### Close gaps later (priority … not this build sprint)

1. **Chedda splits** … real ticket/handle (Action / paid steam). Until then keep his bucket weight low.
2. **Scott juice / live CLV** … PASS when the number already moved to the model.
3. **Rocco trenches** … SP+ line units, CFBD havoc/stuff, returning/gutted OL flags so he can disagree with raw power.
4. **Tank situation** … weather/rest only when it moves the total (wind, short week).
5. **FEI** … audit column later, not a driver, not first purchase.

When in doubt this week: **run the slate**, grade it, stop feature-building.
### Sun–Mon … grade

For every published (and ideally every voted) game:

- ATS result  
- CLV vs close (when close exists)  
- Desk + bucket tags  

After ~6–8 weeks: if Hammers do not beat Consensus, the desks are correlated noise … fix inputs before touching blend weights.

---

## 5. Decision rules (keep us honest)

1. **Ranks are not picks.** “Indiana is 4th” is not a bet. “Model −6.5 vs market −3.5” is a candidate.  
2. **Gap is a filter, not a bet.** ≥2.5 gets Scott’s attention; desks still decide.  
3. **CLV > chasing a half-point.** If the line already moved to our number, the edge may be gone.  
4. **Cap blowout chalk.** Huge P4 vs G5 model spreads are soft; don’t hammer −28 because SP+ is huge.  
5. **QB/injury = post-board modifier**, not a secret reweight of SP+/FPI.  
6. **Totals ≠ power.** Use off/def + tempo (+ weather/rest).  
7. **Don’t publish Divided as confidence.** Disagreement is data.  
8. **Don’t touch Phase 1 blend weights mid-slate.** Freeze the recipe while picking (ops rule, not forever). Retune only on a fixed schedule after a graded sample + explicit Ryan call.

---

## 6. Internal blend note (keep private)

Phase 1 consensus (points-vs-avg, then weighted; missing voters renormalize):

- 40% SP+ overall  
- 25% FPI  
- 25% Sagarin Predictor  
- 10% score Elo  

Off/def remain SP+ units. Tempo/HFA are separate.  
**Never** paste this recipe into public UI, OG text, or Lounge captions.

---

## 7. Code / docs anchors

| Piece | Where |
|-------|--------|
| Board sync | `scripts/sync-cfb-power-ratings.mjs`, `scripts/lib/cfbPowerRatingsFromCfbd.mjs`, `scripts/lib/cfbSagarinPredictor.mjs` |
| Matchup math | `supabase/functions/_shared/loungeBotCfbPowerRatings.ts` |
| Desk votes / slate buckets | `supabase/functions/_shared/loungeBotPredictivePick.ts` |
| Odds poll runtime | `supabase/functions/lounge-odds-poll` |
| Public site | `src/syndicate/SyndicateApp.jsx` (consensus visible; model stack locked) |
| Sports odds doc | `docs/lounge-bot-sports-odds.md` |

---

## 8. This week’s checklist (copy/paste)

- [ ] Sync CFB board (test; prod only if Ryan asks)  
- [ ] Note Sagarin ok / missing  
- [ ] Price weekend slate (model vs current market)  
- [ ] List ≥2.5 gap games  
- [ ] Run four-desk votes; note each desk’s *own* input reason  
- [ ] Label Hammer only if Scott gap **and** (Rocco strength **or** Chedda dog+hook/model)  
- [ ] Publish Hammers + Consensus only  
- [ ] Skip Divided (or label as look, not lock)  
- [ ] Log model / market / votes (close when available)  
- [ ] After games: ATS (+ CLV if close exists)  
- [ ] **Do not** change blend weights mid-slate  
- [ ] **Do not** invent Chedda steam or claim Rocco trench truth  

When in doubt: **pass**. A missed game is cheaper than a fake hammer. Quiet Chedda is a feature.
