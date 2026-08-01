# Poker Stable — product spec

Canonical spec for Stable staking: deal types, slices, makeup, settle, top-up, and asymmetric payment ledger.  
**Status:** v2 foundation in build (2026-08-01). Bones (`20260730000000`) remain on test + prod; **apply v2 migration on test only** until Ryan promotes.

---

## Deal types

| Type | Scope | Makeup | App shape | Close |
| --- | --- | --- | --- | --- |
| **`cash_piece`** | Single cash session / game | No | Piece on session | Close at end |
| **`cash_backing`** | Ongoing cash roll | Yes (deal-level) | Stable + On Stake bankroll | Settle all slices |
| **`tournament_piece`** | One tournament (+ rebuys/add-ons in buy-in) | No | Swap-like on tourney session | Close at result |
| **`tournament_package`** | Manifest of events/bullets | Yes (deal-level) | Stable + manifest | Settle when manifest complete |

### Shared rules

- **Multi-slice:** action % sold across slices ≤ 100%; player keeps remainder.
- **One pricing mode per slice:** `profit_split` **or** `markup`, never both.
- **Profit split:** `player_profit_pct` = player share of winnings on that slice (backer gets complement).
- **Markup:** backer pays `action_pct × buy-in × markup_rate`; typically 100% of profit on sold action to backer.
- **Guests:** player-entered terms authoritative; optional phone/email for notify (SMS/email via Edge **`poker-stable-notify`** on create and on terms edit with before/after diff); no guest ledger UI. Player may **delete** the stake until an Edge backer accepts; guest-only stakes remain deletable.
- **Edge stakers:** full slice UI + asymmetric ledger confirm/dispute.

### Cash backing extras

- **Rakeback:** per slice — `all_to_stake` (100% to stake) or `custom` with separate `rakeback_player_pct` / staker pct (independent of profit split).
- **Settle:** all slices at once; profit above baseline, makeup cleared first, then per-slice profit + rakeback shares.
- **Top-up / re-fund:** increases **deal baseline** and **roll** by infusion amount; recalc makeup against new baseline.
- **Package manifest:** `locked` or `open_ack` (player chooses); settle only when manifest complete.

### Tournament piece

- Rebuys/add-ons fold into session buy-in total for piece math.
- Attach to `poker_bankroll_sessions` (swap-shaped); not On Stake ongoing roll.

### Tournament package

- Manifest lines: event, bullets, buy-in → **baseline stake total**.
- Results feed one deal roll; same settle + ledger as cash backing.

---

## Migration / starting state (MyBacked-inspired, scoped)

At deal create (or **Migrate existing**):

| Field | Purpose |
| --- | --- |
| **Baseline stake size** | Starting committed capital |
| **Starting roll** | Default = baseline |
| **Per-slice starting P/L** | Makeup or profit per backer |
| **Stake-wide starting P/L** | If only total known → pro-rata by action % |
| **Starting money balances** (optional) | Double-entry who holds cash at migrate |
| **Lifetime P/L** (display only) | Subtitle for long-running deals |

**Not v1:** always-on "track money movement" toggle; infer from top-up + settle + sessions.

---

## Top-up

Example: baseline $100k, roll $65k, Mike re-funds $40k → baseline **$140k**, roll **$105k**, makeup **$35k**.

- Logged as deal event + optional payment ledger.
- Multi-slice: default **deal-wide baseline bump** (Ryan confirmed Mike example).

---

## Settle + asymmetric payment ledger

### Settle (calculated)

1. Player initiates settle (package: manifest must be complete).
2. Engine computes each slice: makeup, profit share, rakeback share.
3. Roll resets to baseline; per-slice **settle owed** lines created.

### Payment claims (off-platform money)

**Neither side requires confirmation to update their own view.**

| Actor action | Actor's balance | Counterparty view |
| --- | --- | --- |
| Player claims payment | Owed ↓ immediately | Full owed + *"Player claims $X paid"* |
| Staker confirms | Unchanged if already ↓ | Owed ↓ |
| Staker disputes | — | Full owed + *"disputed"*; player keeps their ↓ |
| Staker claims received | Owed ↓ on staker side | Full owed + claim note until player confirms |

Status labels: *Awaiting confirmation*, *confirms payment*, *confirms closed*, *disputed*.

Partial payments supported. Guest slices: player authoritative only.

---

## Bankroll & session attribution

**Target model (Ryan 2026-08-01).** Not fully implemented yet ... current Bankroll UI may still mix swap deltas into stake-scoped stats; treat this section as canonical when building settle, merge, and metrics.

### Three surfaces

| Surface | What it tracks | Moves when |
| --- | --- | --- |
| **Stake roll** (`poker_deal_bankroll_profiles` for `deal_id`) | Table results on sessions logged to the deal (`deal_id` set). Gross session P/L only ... **not** swap IOUs. | Each completed stake session updates roll (implicitly or on recompute). |
| **Player personal bankroll** (`poker_bankroll_profiles`, `deal_id` null scope) | Money the player keeps over time: personal-scope sessions, **swap settlements**, and **crystallized share** from stake settle/close events. | Personal sessions; swap settle; stake **periodic settle** and **close** transfers (see below). **Not** from merging stake session gross W/L. |
| **Backer bankroll** (v2c rollup; per-staker profile TBD) | Each backer's economic result from deals they slice. | Stake **periodic settle** and **close** transfers, pro-rata per slice / settle lines. Underwater close: backers absorb loss by ownership; player personal unchanged. |

**Swaps never enter stake settle math** (makeup, baseline, backer profit share). Swaps are peer IOUs ... see **Swap overlay** below.

### Periodic settle vs close/end

Both use the same **distribution engine** (profit above baseline, makeup cleared first, per-slice lines). They differ in deal lifecycle and session merge.

| | **Periodic settle** (deal stays open) | **Close / end** (deal finished) |
| --- | --- | --- |
| Deal status after | `active` | `settled` (or closed equivalent) |
| Roll after | Reset to **baseline** | Reset to **baseline** (final accounting) |
| Player personal bankroll | **+** player's share of profit above baseline (or **unchanged** if underwater / no profit to distribute) | Same ... final transfer |
| Backer bankroll(s) | **+** each slice's settle line (split across backers by terms) | Same; if underwater, backers take the hit by % |
| Sessions | Stay on deal (`deal_id` unchanged) | **Merge** into personal play history (see **Session merge**) |
| Example | Baseline $100k, roll $110k, 50/50 player/backer economics → player personal **+$5k**, backers **+$5k** total, roll back to $100k | Same transfer logic on final roll, then archive deal + merge sessions |

**Underwater at close:** player personal bankroll is **not debited** for stake makeup (unless a future explicit payback product). Backers' bankrolls reflect their share of the loss.

### Metrics vs bankroll (Option B)

**Bankroll** and **metrics** intentionally diverge while a stake is open:

- **Metrics** (profit, hourly, win rate, trend, sparkline on **personal** scope): accrue **`player_net_value` per session** as sessions complete ... includes stake attribution + swap overlay. Gives a live "how am I doing?" chart.
- **Personal bankroll hero amount:** moves only on **settle/close events**, personal-scope sessions, and swap cash settlement ... **not** on each stake session completion.

**Copy (personal hero / trend when active stakes exist):** e.g. *"Includes your share of on-stake sessions; bankroll updates when you settle with backers."*

Win rate: count a session as a win when **`player_net_value > 0`**, not when gross table P/L > 0.

### Session economics: gross, stake value, swap

Every backed session card (on stake, and after merge on personal) shows up to **three layers**:

1. **Gross (headline)** — table result: buy-in / rebuys / add-ons → cash out (+ bounties). `pokerSessionWinLoss(session)`. The story of what happened at the table.
2. **Your stake value (subline, smaller)** — player's economic share of that session under **active deal slice terms** (not naive `100% − sold action%`). Profit split, markup, and unsold remainder each follow slice math.
3. **Swap (parens, when settled)** — tournament swap settlement delta for the viewer on that session. Same pattern as today: `(+$25)` / `(−$25)`.

**Swap rule:** swap W/L **adds to / subtracts from player net value only**, never from gross headline.

```
player_net_value = player_stake_value(session, deal, slices) + swap_settlement_delta(session, viewer)
```

Shared helper target: **`playerStakeSessionValue(session, deal, slices)`** in stable/bankroll math (name TBD), used by cards, metrics, and settle preview so UI and engine stay aligned.

**Attribution note:** `player_stake_value` uses **deal terms** (per-slice `action_pct`, `pricing_mode`, `player_profit_pct`, markup, rakeback mode), not a single "ownership %" shortcut. Multi-slice deals may mix profit split and markup slices.

### Session merge (on stake close/end)

When a **`cash_backing`** or **`tournament_package`** deal closes:

1. Run final settle (ledger + bankroll transfers above).
2. **Re-parent or surface** deal sessions on the player's **personal timeline** (implementation: clear `deal_id`, or keep `deal_id` for audit with personal filter including settled deals ... product prefers visible merge with badge).
3. **Do not** add gross session W/L again to personal bankroll ... settle already crystallized economics.
4. Session cards show permanent **On stake** badge + stake label (and deal name if set).
5. **Metrics** on personal scope continue to use **`player_net_value`** for those rows; gross remains display-only headline.

Play history stays complete; double-counting is avoided.

### Tournament package close

Same bankroll rules as cash backing close, one payout when manifest is complete:

- Roll reflects all package sessions (gross).
- Close-out applies slice terms including **markup** (entry pricing) and **profit on sold action** separately in settle lines.
- Player personal and each backer bankroll update from settle lines.
- Session cards: gross + player stake value; swaps (if any) adjust player net only.
- Then merge sessions to personal history with badges.

**Tournament piece** (single session): swap-shaped piece on one session ... not ongoing stake roll; close at result. Swap integration **v2b**.

### Swap overlay (cross-feature)

| Question | Answer |
| --- | --- |
| Do swaps affect stake roll? | **No** |
| Do swaps affect stake settle / backer share? | **No** |
| Where do swap settlements post? | **Player personal** economics only (`player_net_value`, not personal bankroll until marked paid / settled if tracking cash separately) |
| Cap on swap % | Player may swap only on **self-owned action** (`100% − sum of active backing sold action%`) ... see `playerSelfOwnedActionPct` in `pokerStableMath.js` |

Related: `docs/poker-stable-spec.md` (this section), swap notify/claim in **`poker-tournament-swap-notify`**, `sessionSwapSettlementDelta` in `pokerTournamentSwapMath.js`.

### Implementation checklist (open)

- [ ] Stop adding swap delta to **stake-scoped** hero/stats/sparkline (stake roll = gross sessions only).
- [x] **`playerStakeSessionValue`** (+ `player_net_value`) shared helper; session **detail sheet** shows gross + by-party + your net (swap overlay). Session cards + metrics still TODO.
- [ ] Periodic settle RPC: roll → baseline, credit **player personal** + **backer** profiles from settle lines (deal stays `active`).
- [ ] Close/end RPC: final settle + **session merge** + badges; no second personal bankroll pass on gross W/L.
- [ ] Personal metrics Option B + hero copy when active stakes exist.
- [ ] v2c: backer overall bankroll profile(s) updated on settle/close.

---

## Entry points (UX pivot 2026-08-01)

| Role | Create deal | Manage stake roll / sessions |
| --- | --- | --- |
| **Player (stakee)** | Poker Bankroll **`+ Stake`** → full backing form (baseline, migrate, backer slices) | Stake carousel on Bankroll only (personal + pending/active deal cards). **Not Stable.** May log stake sessions while pending; backers see history in Stable after accept. On Stake session list also shows deal **history lines** (offer, accept, re-up, settle) as text rows mixed with sessions. |
| **Backer (staker)** | Stable **Request horse** → player handle + your slice + optional syndicate slices | Stable horses list, invites, settle/ledger |

Stable no longer exposes player **+ New deal**. Syndicate slices on a backer request stay **pending** until each friend accepts their slice invite (player accept activates lead backer slice only).

---

## Implementation phases

| Phase | Scope |
| --- | --- |
| **Bones (shipped)** | 1:1 request/accept, On Stake roll, session sync |
| **v2 foundation (in build)** | Schema: types, slices, baseline, top-ups, settlements, payment claims; migrate entry; cash backing create/settle/ledger UI |
| **v2a** | **Bankroll & session attribution** (this spec §): periodic settle + close transfers, session merge, dual-line cards, Option B metrics, swap overlay on player net only |
| **v2b** | Tournament piece on session (swap integration); tournament package manifest |
| **v2c** | Notifications (`activity_events`); staker overall bankroll rollup |

---

## SQL (v2)

Migration: **`20260801000000_poker_stable_v2_foundation.sql`**

New / extended:

- `poker_stable_deals` — `deal_type`, `baseline_bankroll`, `staker_user_id` nullable, migrate fields, manifest mode
- `poker_stable_deal_slices` — terms per backer
- `poker_stable_deal_topups`
- `poker_stable_deal_settlements` + `poker_stable_deal_settlement_lines`
- `poker_stable_payment_claims`
- `poker_stable_package_manifest_items`

---

## Related code

| Area | Path |
| --- | --- |
| UI | `src/features/poker-stable/` |
| Math | `src/features/poker-stable/pokerStableMath.js` |
| Session + swap attribution (target) | `playerStakeSessionValue` / `player_net_value` (to add; see § Bankroll & session attribution) |
| API | `src/features/poker-stable/pokerStableApi.js` |
| On Stake | `src/features/poker-bankroll/PokerBankrollTracker.jsx`, `PokerBankrollHeroCarousel.jsx` |
| Swap patterns | `src/features/poker-bankroll/pokerTournamentSwapApi.js` |
| Bones SQL | `supabase/migrations/20260730000000_poker_stable_deals.sql` |

---

## Update log

- **2026-08-01:** **Session detail attribution (test):** `pokerSessionAttribution.js` (`playerStakeSessionValue`, `playerNetSessionValue`); Bankroll session detail sheet shows table result, **By party** (stake roll, your share, backer lines), swaps, **Your net**. Session cards + Option B metrics still open.
- **2026-08-01:** **Bankroll & session attribution** (Ryan design): three surfaces (stake roll, personal, backer); periodic settle vs close; Option B metrics (accrue `player_net_value` per session, bankroll moves on settle only); session cards gross + stake value + swap on net; merge on close without double-count; swaps never in stake settle. See § Bankroll & session attribution. **Partial:** detail sheet + helpers; settle RPC + merge + metrics TODO.
- **2026-08-01:** Guest stake notify: Edge **`poker-stable-notify`** (Resend email + Twilio SMS) on create (`kind=offer`), terms edit with before/after blocks (`kind=terms_edited`), and before stake delete (`kind=deleted`).
- **2026-08-01:** Stake accent palette: heroes rotate **blue / emerald / rose** (oldest deal = blue). Light mode: tone gradient (slow fade) + neutral elevation; Terms slice cards match; no inset 3D shell.
- **2026-08-01:** Stake delete (Bankroll **Terms → Delete stake**): stakee may remove a stake before any Edge backer accepts; deletes stake sessions on that deal (`20260801150000`).
- **2026-08-01:** Guest-only active stakes: player may **Edit terms** on Bankroll when all backers are guests (auto-active deals); **Assign to Edge user** re-links a guest slice to an Edge account (slice invite pending in Stable). RPCs `poker_stable_apply_stakee_terms`, `poker_stable_reassign_guest_slice` (`20260801140000`).
- **2026-08-01:** Stake terms view/edit: **Terms** on Bankroll stake cards + Stable invites; player edits pending deals directly; backer **Edit terms** stores a proposal until the player accepts (`pending_terms_json`, `20260801130000`).
- **2026-08-01:** Pending stake sessions: player may **Start Session** / log past on pending deals; sessions attach to `deal_id` immediately; stake bankroll profile bootstraps on accept with starting roll + logged P/L; backers see sessions in Stable after accept (`20260801110000`).
- **2026-08-01:** Stable filters: player **+ Stake** deals no longer appear on Stable for the stakee; invite cards use amber chrome (not cyan).
- **2026-08-01:** Post-create stake UX: pending player deals appear on Bankroll carousel; success banner after **Create stake**; push/in-app backer alerts still **v2c**.
- **2026-08-01:** UX pivot: player **`+ Stake`** + stake carousel on Poker Bankroll; Stable backer-only (**Request horse** full form + syndicate slices); `requestBackingDeal` API; removed Personal/On Stake toggle.
- **2026-08-01:** Spec distilled from Ryan + Theo design session; v2 foundation build started.
