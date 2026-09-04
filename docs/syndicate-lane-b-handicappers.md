# Syndicate Lane B ... handicappers desk (intake doctrine)

**Status:** v1 live on **test** (2026-09-04). Scrape + Quorum wired into `lounge-odds-poll`. Prod Edge/SQL only when Ryan OKs.  
**Sports v1:** NFL + CFB.  
**Internal:** keep blend weights / voter math off sharpesyndicate.com public copy.

## Premise

Weighted external handicappers desk that can **vote** sides/totals into **Quorum** (fifth ATS desk).  
Reputation scores alone are **not** enough ... public X from the top of the reputation CSV is mostly promo, fantasy, paywall teases, and chat. Lane B only contributes when a **reconstructible ticket** exists.

## What shipped (test)

| Piece | Where |
| --- | --- |
| Ticket table | `syndicate_lane_b_tickets` (`20260904010000`) |
| Discover + scrape | `_shared/loungeBotLaneBScrape.ts` (VSiN hubs, Covers Powers, Boyds/Jack ×0.5) |
| Pre-lock hook | `cfb_slate_card` / `nfl_slate_card` / `picks_for_today` / CFB VIP load |
| Ops refresh | action `lane_b_refresh` (works even if bot `stopped`) |
| Ops UI | sharpesyndicate.com/ops → **Lane B Tickets** tab |
| Quorum | ATS blender over Scott/Rocco/Chedda; Lane B fold-in when ≥2 matched tickets agree/oppose |

## Roles (do not collapse)

| Layer | Job | Votes? |
| --- | --- | --- |
| **Lane A watchlists** | Injuries, beat, line moves, urgency modifiers | **No** |
| **Lane B handicappers** | Scraped tickets stocked in `syndicate_lane_b_tickets` | Via **Quorum** weight only |
| **Scout pool** | Candidates being watched for reconstructible cards | **No** until promoted |
| **Scott / Rocco / Chedda** | Existing ATS desks | Yes |
| **Quorum** | Fifth ATS blender; can create/break hammers with Scott + Chedda/Rocco-strength | Yes |
| **Tank** | Totals only | Totals |

## Ticket data contract

One vote row in `syndicate_lane_b_tickets`:

```text
source_id, sport_key, event_id?, matchup_text, market (side|total|ml),
selection, line, posted_at, source_url, weight_factor, raw_excerpt
```

Rules:

- Soft lean language never becomes a side.
- Soft-fail scrape never blocks slate lock.
- Boyds/Jack `weight_factor = 0.5`.
- Quorum Lane B fold-in needs `n >= 2` matched tickets and weight gap ≥ 1.0.

## Quorum hammer gate (v1)

Hammer when Quorum votes with Scott on the majority side **and** Chedda or Rocco-strength also agrees, with ≥3 house ATS votes. Quorum PASS prevents inflated hammers from short-fav-only Rocco.

**Note:** Quorum joining Scott+Chedda upgrades many former 2-0 consensus plays to 3-0 hammers. Tune if volume is too high.

## Intake allowlist

Machine-readable seed: **`data/syndicate/lane-b-intake-allowlist.csv`**.

| `intake_tier` | Meaning |
| --- | --- |
| `A_publisher` | Primary HTML/article intake |
| `B_free_x` | Explicit free tickets on X (site scrape first in v1) |
| `C_manual` | Wanted panel names ... ops/manual later |
| `D_scout` | Watch; do not auto-vote |
| `E_exclude` | Dead, wrong, or noise |

## Source ladder

1. ~~Official Action / Unabated pick-ledger API~~ ... **parked**
2. **Publisher free-pick pages** ... primary (live scrape)
3. **Curated free-play sites** ... Boyds/Jack discounted
4. Manual ops log ... deferred
5. Blind top-50 X scrape ... out of scope

## Related

- CFB weekly SOP: **`docs/syndicate-cfb-weekly-runbook.md`**
- Odds / Scott stack: **`docs/lounge-bot-sports-odds.md`**

`AGENT_DOC_SYNDICATE_LANE_B` ... searchability token.
