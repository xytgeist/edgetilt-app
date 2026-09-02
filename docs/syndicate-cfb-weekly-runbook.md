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
| Betting splits / RLM | **Thin** | Chedda can lean dogs/hooks; Circa-class handle is **not** wired as a clean weekly feed |
| Weather / rest / travel | **Modules exist** | Not yet first-class Tank totals publish lane |
| Starting QB / injury modifiers | **Light** | No clean “QB out → −3 to −7 after consensus” gate before publish |
| Desk scoreboard (ATS/CLV by desk + bucket) | **Missing as product** | Persona adaptive weights exist as concept … **do not trust as live truth** until monthly graded sample exists |

### Desk automation … real but uneven

Code path: `loungeBotPredictivePick.ts` (`buildNflAtsSlateCard` and related).  
Buckets: Hammer (4–0) / Consensus (3–1) / House divided (2–2).

**Correlated-noise risk (fix this over time):** if Scott, Rocco, and Chedda all overweight the same `cfbMatchup.isValuePlay` / gap flag, hammers become one opinion × four. Desks only count when they can **disagree** for independent reasons.

---

## 2. What we still need (priority order)

Do **not** reshuffle Phase 1 blend weights while operating this loop.

1. **Market file (shipped plumbing)**  
   Table **`lounge_market_files`**: open / current / close spread + total + juice + timestamps + source book.  
   Filled automatically on every non-dry `loadSportOddsContext` poll (`loungeBotMarketFile.ts`).  
   Next: wire Scott / CLV grading to read close; backfill is optional (Odds API historical).

2. **Tank as a totals desk**  
   Primary publish lane = O/U from tempo + SP+ off/def matchup + weather/rest when available.  
   Keep Tank **side** votes light until situational side factors are real.

3. **QB / injury modifier**  
   Applied **after** consensus board, **before** publish. Manual/override table is fine at first (−3 to −7 style). Do not rebuild the whole board for one QB.

4. **Monthly desk + bucket scoreboard**  
   ATS + CLV by Scott / Rocco / Chedda / Tank and by Hammer / Consensus / Divided.  
   Only then: shrink cold desks / raise hot ones.

5. **Later audit columns (not blockers)**  
   FEI, Powers/Makinen, TeamRankings, market-implied ratings.

---

## 3. Desk charter (independent inputs)

| Desk | Question | Inputs they are allowed to lean on | Play when… | Pass when… |
|------|----------|--------------------------------------|------------|------------|
| **Scott** | Is the number wrong? | Model spread vs market, juice, line move (when we have it), CLV history | Gap ≥ ~2.5 (or ~1.5–2.5 into a key number) and juice isn’t toxic | Tiny gap, already steamed to model, or no market file |
| **Rocco** | Is the better team a short fav I want? | Power gap, SP+ off/def mismatch, short fav band (~−1 to −7.5), chalk traps | Model + strength agree on chalk **and** market isn’t a pure logo trap | Short fav is brand-only, or sharp money / model hate the chalk |
| **Chedda** | Where are the points / the money? | Dogs, hooks, ticket vs handle when available, model gap favoring dog | Dog + (hook and/or sharp lean) and model doesn’t hate it | Blind dog with no hook/split/model support |
| **Tank** | Does situation change the **total** (or rarely the side)? | Tempo pair, off/def for totals, rest/travel/weather when real | Totals lean with supporting tempo/weather/rest | Side-only vibes with no situational meat |

**Hard rule:** a desk must be able to vote **NO PLAY** (or opposite side) using its own inputs even when Scott’s gap flag is green.

---

## 4. Weekly machine (operate what we have)

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

**Locked definitions (clarified):**

| Label | Meaning |
|-------|---------|
| **Hammer** | **Alignment + independence.** Usually 4–0 on a side, but only if there are **≥2 distinct input reasons** pointing the same way (e.g. Scott gap + Rocco off/def, or Scott gap + Chedda dog/split). If Scott/Rocco/Chedda are all just reading the same `isValuePlay` flag, that is **one** reason … do **not** brand it a Hammer. |
| **Consensus** | **3–1.** Publish if we’d bet it. A strong Scott gap can sit here when other desks agree for *their own* reasons. |
| **Divided** | **2–2.** Pass or small look. Do **not** force a fake united play. |

Publish **Hammers + Consensus only** on the public/VIP slate unless Ryan overrides.

**Not what this means:**

- Not “every Hammer needs two essays”
- Not “ban all 4–0s” … 4–0 is fine when desks used different features
- Not “you can’t publish a single-desk Scott lean” as a Scott play or as part of a real 3–1

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
- [ ] Label Hammer only if alignment **and** ≥2 distinct input reasons  
- [ ] Publish Hammers + Consensus only  
- [ ] Skip Divided (or label as look, not lock)  
- [ ] Log model / market / votes (close when available)  
- [ ] After games: ATS (+ CLV if close exists)  
- [ ] **Do not** change blend weights mid-slate  

When in doubt: **pass**. A missed game is cheaper than a fake hammer.
