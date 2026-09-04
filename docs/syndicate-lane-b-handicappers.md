# Syndicate Lane B ... handicappers desk (intake doctrine)

**Status:** design + allowlist seed (2026-09-03). No ingest Edge yet.  
**Sports v1:** NFL + CFB.  
**Internal:** keep blend weights / voter math off sharpesyndicate.com public copy.

## Premise

Weighted external handicappers desk that can **vote** sides/totals into the fifth (blend) desk.  
Reputation scores alone are **not** enough ... public X from the top of the reputation CSV is mostly promo, fantasy, paywall teases, and chat. Lane B only votes when a **reconstructible ticket** exists.

## Roles (do not collapse)

| Layer | Job | Votes? |
| --- | --- | --- |
| **Lane A watchlists** | Injuries, beat, line moves, urgency modifiers | **No** |
| **Lane B handicappers** | Weighted tickets from admittees who post dated picks | **Yes** (when ticket parsed/logged) |
| **Scout pool** | Candidates being watched for reconstructible cards | **No** until promoted |
| **Internal desks** (Scott / Chedda / Rocco / ...) | Existing Syndicate stack | Yes (unchanged) |
| **Fifth desk** | Independent blender of internal + Lane B; can create/break hammers | Yes |

Public posters start as **scout pool**. Promotion to Lane B requires passing the admission rubric below.

## Ticket data contract

One vote row:

```text
source_id, sport, game_id|matchup, market (side|total|ml),
selection, line_at_post, posted_at, source_url, confidence?, units?
```

Rules:

- Soft lean language never becomes a side.
- No ticket → no vote (reputation weight does not invent a play).
- Prefer open vs current line + timestamp **before** kickoff.
- Deletes / "lock of the century" / 12-leg teasers / "tail me" culture → demote or exclude.

## Source ladder (what we actually use)

1. ~~Official Action / Unabated pick-ledger API~~ ... **parked** (no public feed; BD not pursued).
2. **Publisher free-pick pages** ... primary Path A (VSiN columns, Covers Powers, Sharp Football site, free-play capper sites).
3. **Curated free-play X allowlist** ... Path B only for handles that habitually post explicit tickets.
4. **Manual / ops log** ... Path C for names we care about that stay paywalled or radio-only.
5. Generic "expert consensus" boards ... not Lane B (optional later signal).

Unabated / Action **odds** APIs are market wires ... not Lane B tickets.

## Admission rubric

### Must-haves (promote to vote-eligible)

- [ ] Dated ticket with **side or total + number** (or ML) before kickoff  
- [ ] Stable home (byline URL pattern, site card, or consistent free-play format)  
- [ ] Record rebuildable from public posts/articles over a sample window  
- [ ] Sport in scope (NFL and/or CFB for v1)

### Disqualifiers

- Paywall / email-only with no public card (unless Path C manual)  
- Promo-only X (link out, no ticket)  
- Parlay / SGP / "smash" entertainment brands as primary signal  
- Dead or wrong handles  
- Deletes losers / refuses to post passes

### Weighting note

CSV `composite_score` from the reputation panel may multiply a ticket **after** admission.  
Do **not** use composite score to admit silent accounts. Free-play-only names without a panel score get a smaller default weight until graded sample exists (`n` trust floor TBD; align with desk scoreboard **n ≥ 25** culture).

## Intake allowlist

Machine-readable seed: **`data/syndicate/lane-b-intake-allowlist.csv`**.

| `intake_tier` | Meaning |
| --- | --- |
| `A_publisher` | Primary HTML/article intake ... vote-eligible once parser/manual logs tickets |
| `B_free_x` | Explicit free tickets on X ... vote-eligible with strict parse |
| `C_manual` | Wanted panel names ... ops/manual log only until a public pipe exists |
| `D_scout` | Watch; do not auto-vote |
| `E_exclude` | Dead, wrong, or noise ... do not ingest |

Reference reputation CSVs (not vote gates): keep under `.tmp-sx-csvs/` locally from the sx export, or promote later into `data/syndicate/reference/`.

### Seed highlights (v1)

**A_publisher**

- VSiN: Adam Burke, Steve Makinen, Dave Tuley, Matt Youmans (+ Gill Alexander / A Numbers Game)  
  - Hub: https://vsin.com/writers/  
  - Calendar: https://vsin.com/nfl/vsin-football-article-calendar/  
  - Pattern: `vsin.com/**` bylined best-bets / Tuley's Takes / Makinen systems  
- Covers: Brad Powers weekly CFB cards ... `covers.com/ncaaf/brad-powers-*`  
- Sharp Football Analysis site records (sides/totals) ... not the X trivia stream  
- Boyd's Bets / BetFirms-style free-pick pages when structured  
- VegasInsider football write-ups (Edwards, Cimini) when dated tickets present  
- Hunter Sports / SportsCapping CFB totals minds (Kyle Hunter, Steve Janus) when public cards exist  

**B_free_x** (strict)

- `@boydsbets`, `@betfirmsjack` when format is explicit free pick  
- Others only after they clear the must-haves for 2+ weeks  

**C_manual** (examples)

- Koerner, Chernoff, Rufus, Raybon, Unabated staff ... reputation high, public ticket pipe thin  

**E_exclude** (from 2026-09 NFL X resolve)

- `cawright95` (unresolved)  
- Bad matches observed: `BritDevine`, `kmurray03`, `NickGalaida`, wrong `breese`  
- Collin Wilson handle fixed to **`@Collin1`** → re-tiered **C_manual** (Action CFB; not free-ticket X)

## Fifth desk (blend) reminder

Fifth desk is an **independent voter**, not a narrator. It may:

- Agree with internal consensus when Lane B aligns  
- Create / break hammers when Lane B + internals disagree with conviction rules (TBD)

It must not clone Chedda (splits) or treat steam as a person.

## Implementation checklist (not started)

- [ ] Promote allowlist rows; ops UI to flip `D_scout` → `A`/`B`/`C`  
- [ ] Ticket table + unique key `(source_id, sport, game, market, posted_at)`  
- [ ] VSiN / Covers HTML fetch + parse (or semi-manual paste first)  
- [ ] Free-X parser only on `B_free_x`  
- [ ] Manual ticket log on Syndicate ops  
- [ ] Weighting + fifth-desk blend rules  
- [ ] Grade vs close; scoreboard bucket for Lane B  

## Related

- CFB weekly SOP: **`docs/syndicate-cfb-weekly-runbook.md`**  
- Odds / Scott stack: **`docs/lounge-bot-sports-odds.md`**

`AGENT_DOC_SYNDICATE_LANE_B` ... searchability token.
