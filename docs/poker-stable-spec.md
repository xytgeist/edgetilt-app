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
- **Guests:** player-entered terms authoritative; notify-only (no guest ledger UI).
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

## Entry points (UX pivot 2026-08-01)

| Role | Create deal | Manage stake roll / sessions |
| --- | --- | --- |
| **Player (stakee)** | Poker Bankroll **`+ Stake`** → full backing form (baseline, migrate, backer slices) | Stake carousel on Bankroll overview (personal + one card per active deal; **pending** deals show as a locked card until backers accept) |
| **Backer (staker)** | Stable **Request horse** → player handle + your slice + optional syndicate slices | Stable horses list, invites, settle/ledger |

Stable no longer exposes player **+ New deal**. Syndicate slices on a backer request stay **pending** until each friend accepts their slice invite (player accept activates lead backer slice only).

---

## Implementation phases

| Phase | Scope |
| --- | --- |
| **Bones (shipped)** | 1:1 request/accept, On Stake roll, session sync |
| **v2 foundation (in build)** | Schema: types, slices, baseline, top-ups, settlements, payment claims; migrate entry; cash backing create/settle/ledger UI |
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
| API | `src/features/poker-stable/pokerStableApi.js` |
| On Stake | `src/features/poker-bankroll/PokerBankrollTracker.jsx`, `PokerBankrollHeroCarousel.jsx` |
| Swap patterns | `src/features/poker-bankroll/pokerTournamentSwapApi.js` |
| Bones SQL | `supabase/migrations/20260730000000_poker_stable_deals.sql` |

---

## Update log

- **2026-08-01:** Post-create stake UX: pending player deals appear on Bankroll carousel (locked until accept); success banner after **Create stake**; push/in-app backer alerts still **v2c**.
- **2026-08-01:** UX pivot: player **`+ Stake`** + stake carousel on Poker Bankroll; Stable backer-only (**Request horse** full form + syndicate slices); `requestBackingDeal` API; removed Personal/On Stake toggle.
- **2026-08-01:** Spec distilled from Ryan + Theo design session; v2 foundation build started.
