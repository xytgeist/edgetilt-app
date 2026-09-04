# Syndicate Lane B ... handicappers desk (PARKED)

**Status:** **PARKED 2026-09-04.** Publisher HTML scrape (VSiN / Covers / Boyds) did not produce reconstructible tickets. NFL refresh was ~0 matched / prose garbage; CFB better match rate but still promo bleed and junk lines.  
**Do not** auto-scrape or vote Lane B into the house until a structured ticket feed exists.

## What was tried

| Piece | Outcome |
| --- | --- |
| `syndicate_lane_b_tickets` table | Kept (inactive; no new writes while parked) |
| HTML discover + scrape | `LANE_B_ENABLED = false` in `loungeBotLaneBScrape.ts` |
| Pre-lock scrape hooks | Removed from slate / today / CFB VIP |
| Ops `lane_b_refresh` | Returns `{ parked: true }` |
| Ops **Lane B Tickets** tab | Removed |
| Quorum fifth ATS desk | Removed from live slate votes / hammers (back to Scott/Rocco/Chedda + Tank) |

## Revisit only if

1. Real pick-ledger / structured API (Action-style), **or**
2. Manual ops ticket log with human-validated rows

Blind regex-over-prose and top-X reputation scrapes stay out of scope.

## Related

- CFB weekly SOP: **`docs/syndicate-cfb-weekly-runbook.md`**
- Odds / Scott stack: **`docs/lounge-bot-sports-odds.md`**
- Allowlist seed (reference only): **`data/syndicate/lane-b-intake-allowlist.csv`**

`AGENT_DOC_SYNDICATE_LANE_B`
