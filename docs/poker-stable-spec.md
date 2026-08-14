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

- **Multi-slice:** action % sold across slices ≤ 100%; player keeps remainder. Enforced in create/edit UI (`sumSliceActionPct` reads `actionPct` / `action_pct`), RPC propose/apply paths, and deferred trigger **`20260810190000`**.
- **One pricing mode per stake:** `profit_split` **or** `markup`, never both (deal-level for tournament packages; cash backing is profit-split only).
- **Profit split:** `player_profit_pct` = player share of winnings on sold action (backer gets complement).
- **Tournament markup:** backer pays `action% × package × markup_rate` on accept. **Face** (`action% × package`) stays in the stake; **fee** (`face × (markup − 1)`) credits the player’s **personal Poker bankroll** immediately and hits backer **Realized P/L** immediately. Fee is **not** in portfolio value; it **does** count in at-risk ROI / TWR / Realized P/L. Markup rate is deal-level (`poker_stable_deals.markup_rate`). Cash backing has **no markup**.
- **Tournament player contribution:** unsold package face (`baseline × (100 − sold action%)`) is debited from the player’s **personal Poker bankroll** when the stake goes live (no markup on the player share). Tracked on `poker_stable_deals.player_package_capital`. On close, credit **roll × retained %** back to personal; overall P/L = returned − contribution. Cancel/revoke refunds remaining contribution.
- **Cancel after accept:** player may cancel an unsettled stake; server unwinds paid capital + fee (credit backer, debit player personal, reverse realized). Migration **`20260811210000`**.
- **Guests (player-initiated):** player-entered terms authoritative; optional phone/email for notify (SMS/email via Edge **`poker-stable-notify`** on create, terms edit with before/after diff, and **session complete**); no guest ledger UI. Player may **delete** the stake until an Edge backer accepts; guest-only stakes remain deletable.
- **Guests (backer Create Stake):** backer sets terms + lead slice at create; guest player gets email/SMS with **`/poker-stake-claim?token=…`**. Claim links Edge account only (`stakee_user_id`); signup from that page sends email confirm back to the same claim URL (auto-link after verify). Player then **Accept / Decline** on Bankroll (no terms renegotiation). Decline kills the deal for everyone; unhappy with terms → decline and create a new stake. Migration **`20260803100000`**. **Guest syndicate co-backers** on the same create flow are **not wired yet** ... see § Notifications → Phase 1b.
- **No terms edit (Phase 1, 2026-08-11):** pending stakes are **Accept / Decline only**. Edit terms / Offer new terms / counter / propose are removed (RPCs disabled via **`20260811170000`**). Renegotiate by declining (or revoking) and creating a new stake.
- **Planned (Phase 2):** deal-level economics (`pricing_mode`, `player_profit_pct` / markup, rakeback) with slices holding identity + `action_pct` only; different economics = separate deals.
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

- Logged as deal event.
- Multi-slice: **deal-wide baseline bump** (Ryan confirmed Mike example).
- Edge backers: **Stable backing bankroll** debited pro-rata by action % (`poker_stable_record_topup`, **`20260802190000`**; routed **`20260802230000`**).

## Reduce stake

Inverse of top-up: lowers baseline and roll by the reduction amount.

- Standalone: **`poker_stable_record_reduction`** on deal detail.
- With periodic settle: optional **new baseline** on propose; applied after settle roll reset.
- Edge backers: **Stable backing bankroll** credited pro-rata by action % (same split as top-up debit; **`20260802230000`**).

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
| **Stable backing bankroll** (`poker_stable_backer_bankrolls`) | Backer capital + settle economics. **Never** `poker_bankroll_profiles`. On Create Stake (initiator) or Accept/debit, liquid is **auto topped up** by any shortfall vs paid stake amount (`20260811250000` … cash + tournament), logged as `auto_top_up` on the adjustments ledger (`20260811280000`). Received pending invites still do not invent capital until Accept. | Slice allocation debit; top-up debit / reduce credit; settle credit/debit (+ **Realized P/L** mirrors signed settle $); deficiency top-up; full liquid ledger (deploy / release / close return / markup refund). |

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

- Roll reflects all package sessions (gross). **Buy-in, re-entries, and add-ons debit the stake roll as soon as they are logged** (active session), not only when the tournament is completed (`20260811230000`).
- Close returns each backer’s share of **current roll** (not baseline face). Underwater makeup posts to backer **Realized P/L**.
- Markup is **prepaid on accept** (`face × (markup − 1)`), but **earned per buy-in**: applied fee = prepaid × min(buyins, package) / package. On close, **unused markup** returns to the backer (backing bankroll + reverse Realized) and is clawed from player personal (`20260811260000`). Overall backer performance on Commit = stake P/L − **applied** markup.
- Close-out applies slice terms including **markup** (entry pricing) and **profit on sold action** separately in settle lines.
- Player personal and each backer bankroll update from settle lines / close books (`20260811220000`).
- Session cards: gross + player stake value; swaps (if any) adjust player net only.
- Then merge sessions to personal history with badges.

**Tournament piece** (single session): swap-shaped piece on one session ... not ongoing stake roll; close at result. **Start Session + Backer** on personal bankroll creates `cash_piece` / `tournament_piece`. Start Session lists **Swaps** (green) above **Backers** (cyan) on tournaments. Backers copy is “Single session stake … closes when you end it.” The player never gets a carousel card; live UI is the normal session-in-progress card. Player terms are live immediately (Edge backers still Accept to get a Stable card). End Session recaps then archives. A session can have backers and swaps together. Swap integration still **v2b**.

### Swap overlay (cross-feature)

| Question | Answer |
| --- | --- |
| Do swaps affect stake roll? | **No** |
| Do swaps affect stake settle / backer share? | **No** |
| Where do swap settlements post? | **Player personal** bankroll on **Mark settled** (`poker_tournament_swap_mark_paid` … creator `+settlement_amount`, counterparty `−settlement_amount`; idempotent via `settlement_bankroll_posted`). Session “Your net” can show the IOU earlier; cash hits `poker_bankroll_profiles` only when marked paid. |
| Cap on swap % | Per session being written/viewed, not every live stake on the account. Personal with no piece backers is 100%. On a package or piece, `100% − that deal's sold action`. Start Session draft backers reduce the personal cap. See `swapSelfOwnedPct` in `PokerBankrollTracker.jsx`. |
| Optional swap terms (combinable) | **Default (no boxes):** extra bullets at face. Partner covers `pct × extra × face` when the extra-firer busts. % is of prize minus live extra-bullet face (and any face owed on the partner's busted extras). Do **not** subtract the first buy-in from prize. If both cash, extras only reduce the extra-firer's prize (no second face IOU). **Both must cash** voids unless both cashed. **Final bullet only** skips extras. **Final table only** activates if either finish is top 9 (or 6 if 6-max). **Include previous bullets** (only when prior series bullets exist) counts already-fired Day 1s / earlier buy-ins; default is this bullet forward. SQL **`20260814140000`**–**`20260814170000`**. |
| Multi-flight series | Day 1A/B/C stay separate sessions (bankroll per flight). Same venue + buy-in + game + stripped name within 21 days is one event. A swap opened on 1B keeps picking up 1C / Day 2. Day 1 bust does not settle (they may fire another flight). Day 2 is not a new bullet. |

Related: `docs/poker-stable-spec.md` (this section), swap notify/claim in **`poker-tournament-swap-notify`**, `sessionSwapSettlementDelta` in `pokerTournamentSwapMath.js`.

### Implementation checklist (open)

- [x] Stop adding swap delta to **stake-scoped** hero/stats/sparkline (stake roll = gross sessions only).
- [x] **`playerStakeSessionValue`** (+ `player_net_value`) shared helper; session **detail sheet** + **session cards** (dual line gross + your share).
- [x] Periodic settle RPC: roll → baseline, credit **player personal** from settle lines (deal stays `active`).
- [x] Close/end RPC: final settle + **session merge** (settled deals on personal timeline + badges); no second personal bankroll pass on gross W/L.
- [x] Personal metrics Option B + hero copy when active stakes exist.
- [x] v2c: backer settle/top-up/reduce post to **Stable backing bankroll** (`poker_stable_backer_bankrolls`, **`20260802230000`**). **Player** settle still credits personal Poker bankroll.

---

## Entry points (UX pivot 2026-08-01)

| Role | Create deal | Manage stake roll / sessions |
| --- | --- | --- |
| **Player (stakee)** | Poker Bankroll **`+ Stake`** → full backing form (baseline, migrate, backer slices) | Stake carousel on Bankroll only (personal + pending/active deal cards). **Not Stable.** Stake is **live** (sessions, sold action, hero badge **On stake**) only after **player + at least one backer** accept ... same rule for player offer, backer offer, and syndicate paths. After player has accepted terms: may **log sessions on a pending stake card** (pending-play). Sessions stay on-stake for the player; backers cannot see history/impact until **they** accept. Badge stays **Pending** until >=1 backer accepts. Progressive decline shrinks offered backing (**baseline + roll**, remaining open slices keep $ exposure via action% renormalize; declined allocation released / credited) … migration **`20260810210000`**; if all backers exit, sessions **detach to personal**. Session deletes leave durable ledger audit (P/L). Hero shows **accepted vs pending** backing $. Until live: capital on hold for pending backers. On Stake session list also shows deal **history lines** (offer, accept, re-up, settle) as text rows mixed with sessions. **Terms → Open ledger** on active cash backing opens deal detail (top-up + propose settle). |
| **Backer (staker)** | Stable **Create Stake** → player handle + your slice + optional syndicate slices | Stable portfolio hero, horse carousel, **Overview / Ledger / Trend**, closed stakes history, **Needs attention** commit inbox, deal ledger |

Stable no longer exposes player **+ New deal**. Syndicate slices on a backer request stay **pending** until each friend accepts their slice in Stable. **Edge** co-backers get slice-invite Alerts today (actor copy wrong ... see § Notifications). **Guest** co-backers get **no** email/claim yet (Phase 1b).

### Backer Stable v1 (2026-08-02 test, in build)

**Separate from player personal bankroll.** Backers use **`poker_stable_backer_bankrolls`**. Hero **Edit → Adjust bankroll** (`20260802250000`) changes liquid balance only ... no impact on Realized P/L, At risk, Stakes MTM, or Trend session chart.

| Surface | Behavior |
| --- | --- |
| **Portfolio hero** | Liquid backing bankroll + **portfolio value** (liquid + stake MTM). Detail sheet **Overview / Ledger / Trend**. **Adjust bankroll** on Overview; **Ledger** lists every liquid move (deposit, auto top-up, stake deploy, close return, unused markup, settle). Session **sparkline**. Metrics: capital at risk, **At-risk ROI**, **TWR** (capital-kind adjust periods only), stake MTM, active horses, realized backing P/L. |
| **Horse carousel** | Active/pending horses with roll, your stake MTM, unsettled (upside profit share), sessions/P/L. **Chat** icon (Edge↔Edge only, from pending offer onward) opens a DM with the player via existing Chat tab `open_dm` … rough v1. |
| **Overview tab** | Invites + carousel + **Closed stakes** history (not a separate ARCHIVE tab). |
| **Trend tab** | Session performance only (action % of gross W/L); bankroll adjustments do not move the chart. |
| **Ledger tab** | Typed rows on `poker_stable_backer_bankroll_adjustments` (`kind`, optional `deal_id` / `note`) for all liquid in/out. Capital kinds (`deposit` / `withdraw` / `set_balance` / `auto_top_up` / `seed_reverse` / legacy `manual`) drive TWR; stake/settle/close kinds are ledger-only. Per-horse **Locations** remains on deal detail, not the portfolio sheet. |
| **Needs attention** | Pending **`poker_stable_deal_commits`** for counterparty ... **Commit to my books** action sheet. |
| **Settle credits** | **Player:** personal Poker bankroll. **Backer:** Stable backing bankroll + Realized P/L (same signed settle $). **Never** cross-post between the two. |

Migration: **`20260802220000_poker_stable_backer_bankroll.sql`**. Math: **`pokerStableBackerMath.js`**.

---

## Implementation phases

| Phase | Scope |
| --- | --- |
| **Bones (shipped)** | 1:1 request/accept, On Stake roll, session sync |
| **v2 foundation (in build)** | Schema: types, slices, baseline, top-ups, settlements, payment claims; migrate entry; cash backing create/settle/ledger UI |
| **v2a** | **Bankroll & session attribution** (this spec §): periodic settle + close transfers, session merge, dual-line cards, Option B metrics, swap overlay on player net only |
| **v2b** | Piece swap integration + tournament package manifest. **Shipped (test):** personal Start Session **+ Backer** → `cash_piece` / `tournament_piece`; player stays on personal session card (no carousel piece); close + recap on End Session |
| **v2c** | Notifications (`activity_events` + guest email/SMS) — **Phase 0–1 shipped (2026-08-04):** commit sync, backer→player offer, terms lifecycle, player→guest backer claim. **Phase 1b planned:** backer Create Stake → guest syndicate co-backer claim + Edge co-backer invite copy fix. See § Notifications. |

---

## Notifications

Two rails ... same pattern everywhere: **emit event → right recipients → right copy → right deep link**.

| Rail | Who | Channels |
| --- | --- | --- |
| **A — Edge** | Edge account on the deal | `activity_events` → Alerts row + web push (`lounge-send-activity-push`) |
| **B — Guest** | Email/phone only | Edge **`poker-stable-notify`** (Resend + Twilio) + claim URL where onboarding is needed |

**Session start:** intentionally **off** (end/log only) unless product revisits.

### Create-stake matrix (shipped vs gap)

| Initiator | Recipient | Guest email/SMS + claim | Edge Alerts/push | Deep link |
| --- | --- | --- | --- | --- |
| **Backer A** | Guest **player** | ✅ **`guest_stakee_offer`** → `/poker-stake-claim` | N/A | Bankroll `stableDeal=` after claim |
| **Backer A** | Edge **player** | N/A | ✅ **`poker_stable_backer_offer`** (Phase 1) | Bankroll `stableDeal=` |
| **Backer A** | Edge **co-backer B** | N/A | ⚠️ **`poker_stable_slice_invite`** (trigger) ... actor = player, not Backer A | Stable `stableDeal=` |
| **Backer A** | Guest **co-backer B** | ❌ **gap (Phase 1b)** | ❌ | Stable after claim (planned) |
| **Player** | Guest **backer** | ✅ **`offer`** → `/poker-stable-claim` (Phase 1) | N/A | Stable `stableDeal=` after claim |
| **Player** | Edge **backer** | N/A | ✅ **`poker_stable_slice_invite`** | Stable `stableDeal=` |

### Terms lifecycle (Phase 1, shipped)

Scoped recipients ... not broadcast-everything-to-everyone.

| Event | Notify |
| --- | --- |
| Stakee **accept / decline** backer-initiated offer | Lead backer + other **pending/active Edge** slice stakers (not actor) |
| Edge backer **accept / decline** slice on player-created deal | **Stakee** |

Activity types: `poker_stable_stakee_*`, `poker_stable_slice_accepted` / `_declined` (counter/propose activity types retired with terms-edit removal). Migration **`20260804100000`**.

Guest counterparts on accept/decline: **deferred** (notification roadmap) ... Edge path is enough for syndicate Edge backers today.

### Phase 1b — Backer Create Stake → guest syndicate co-backer (planned)

**Problem:** Backer A creates a stake with optional **friend slices**. Guest **player** gets claim email today. Guest **co-backer B** on a friend slice gets **nothing** ... no SMS/email, no `/poker-stable-claim`, and existing claim RPCs **reject** backer-initiated deals (`poker_stable_deal_is_player_initiated`).

**Goal:** Mirror **player → guest backer** onboarding, but:

- **Caller:** lead backer (Backer A), not the player
- **Landing:** **Stable Manager** (accept/decline **their slice**, not the whole deal on Bankroll)
- **Copy:** *"{Backer A} invited you to back {player label} on {stake name}"*

#### Product rules (locked for spec)

1. Deal stays **`pending`** until the **player** accepts (unchanged). Guest co-backer may **claim account + accept/decline slice** while pending; deal does not go **active** until player accepts.
2. Lead backer's slice is **`active`** at create; syndicate slices stay **`pending`** (unchanged).
3. Guest co-backer **decline** = slice **`declined`** only (partial syndicate exit) ... not whole-deal kill (unlike stakee decline on backer-initiated offer).
4. **Recipient scoping:** notify **only** the guest slice(s) being invited on create ... not other backers, not the player (player has their own rail when Edge or guest stakee claim).
5. Re-use **`/poker-stable-claim?token=`** and **`poker_stable_guest_backer_claim_tokens`** ... extend RPCs to allow **backer-initiated** deals when linking a **guest slice**, not only player-initiated deals.

#### Rail B — Guest co-backer email/SMS

**New notify kind:** `guest_syndicate_backer_offer` (distinct from player-path `offer` for auth + copy).

| Field | Value |
| --- | --- |
| **HTTP** | `POST poker-stable-notify` `{ deal_id, kind: 'guest_syndicate_backer_offer', slice_ids?: uuid[] }` |
| **Auth** | JWT; caller must be **`deal.staker_user_id`** (lead backer) |
| **Targets** | Slices on deal where `counterparty_kind = 'guest'` and `status = 'pending'` (optional `slice_ids` filter) |
| **Token** | Insert **`poker_stable_guest_backer_claim_tokens`** per slice (same table as Phase 1) |
| **URL** | `{PUBLIC_APP_ORIGIN}/poker-stable-claim?token={raw}` |
| **Email subject** | `{Backer A} invited you to back: {deal label}` |
| **SMS** | Same body + claim URL (not homepage) |

**Client hook:** after successful **`requestBackingDeal`** in **`PokerStableCreateDealSheet`**, if any **friend slice** has guest email/phone, invoke notify (parallel to existing **`notifyStableGuestStakee`** for guest player).

**Terms edit on backer-initiated deal:** out of scope for 1b unless Ryan wants parity with player **`terms_edited`** guest notify ... note as Phase 2.

#### Claim RPC changes (migration)

Relax **`poker_stable_guest_backer_claim_preview`** / **`_link`** / **`_by_email`**:

| Check | Player-initiated (today) | Backer-initiated syndicate (1b) |
| --- | --- | --- |
| Deal shape | `staker_user_id IS NULL` | `staker_user_id IS NOT NULL` |
| Slice shape | guest slice on player deal | guest **friend** slice, not lead slice |
| Player on deal | `stakee_user_id` set (creator) | `stakee_user_id` **or** guest stakee fields set |
| After link | slice → user, **pending**, Stable | same |
| Redirect | `/?tab=poker-stable&stableDeal=` | same |

**Validation additions:**

- Reject if slice is lead backer's slice (syndicate-only tokens ... e.g. `staker_user_id <> deal.staker_user_id` OR `slice_index > 0`).
- Reject claim if deal **`cancelled`** / **`declined`**; allow **`pending`** (primary) and optionally **`active`** if player already accepted.
- **`_by_email`:** also match guest slices on backer-initiated deals where invitation email matches.

Suggested migration id: **`20260804110000_poker_stable_syndicate_guest_backer_claim.sql`**.

#### Rail A — Edge co-backer on backer-initiated (copy fix, same phase)

Today: insert on pending **user** slice fires **`poker_stable_slice_invite_activity`** with **`actor_user_id = stakee`**. On backer Create Stake that reads like the **player** invited the co-backer.

**Fix (spec):** branch in trigger (or new event type **`poker_stable_syndicate_slice_invite`**):

| Deal shape | Actor | Recipient | Alerts copy (summary) |
| --- | --- | --- | --- |
| Player-initiated | stakee | slice staker | `{player} invited you to back {stake}` |
| Backer-initiated | lead staker (`deal.staker_user_id`) | slice staker | `{Backer A} invited you to back {player} on {stake}` |

Push + Alerts deep link: **`/?tab=poker-stable&stableDeal=`** (unchanged).

Optional: emit only when `new.staker_user_id IS DISTINCT FROM deal.staker_user_id` (skip lead slice self-invite).

#### UI after guest co-backer claim

Reuse **`PokerStableBackerClaimPage`** → redirect Stable with `stableDeal=`. Co-backer sees **pending slice invite** on horse card → Accept / Decline (existing Stable slice actions). **No** Bankroll onboarding modal (stakee-only).

Optional Stable coach on first pending invite: *"You were invited to back {player} on {stake}. Accept your slice to join the syndicate."* ... polish, not blocking 1b.

#### Smoke (Phase 1b)

| Step | Actor | Expect |
| --- | --- | --- |
| 1 | Backer A | Stable **Create Stake** → Edge or guest player + **guest friend slice** with email |
| 2 | Guest co-backer B | Email with **`/poker-stable-claim?token=`** → signup → Stable → pending slice |
| 3 | Guest co-backer B | Accept slice → slice **active**; deal still **pending** if player has not accepted |
| 4 | Edge co-backer C (if added) | Alerts: **Backer A** invited you ... not player |
| 5 | Player | Accept offer on Bankroll → deal **active** when all required parties satisfied |

#### Implementation checklist (for next build pass)

- [ ] SQL: relax guest backer claim RPCs + optional syndicate trigger/copy fix
- [ ] Edge: **`poker-stable-notify`** `guest_syndicate_backer_offer` + copy helper
- [ ] Client: **`PokerStableCreateDealSheet`** post-create notify for guest friend slices
- [ ] Client: **`loungeActivityApi.js`** + push if new activity type for syndicate invite
- [ ] Deploy: migration test → prod; redeploy **`poker-stable-notify`**, **`lounge-send-activity-push`** if activity type added
- [ ] Docs: mark Phase 1b shipped in Update log after Ryan sign-off

#### Explicitly not in Phase 1b

- Partial-funding negotiation UI ("awaiting Backer B", player re-offer unfunded %) ... separate product slice
- Guest email on stakee accept/decline/counter ... Phase 2+
- Session / settle / top-up guest notify expansions ... Phase 3

---

### Test smoke (v2 cash backing, test)

Run on **lvslotpro.com** with player + second Edge backer (e.g. @edgelord) before checking off backlog **v2 smoke**.

**In-app checklist (admin, test host):** hamburger **Stable smoke** or **`/?tab=stable-smoke`** ... checkboxes + per-step notes + **paste/upload screenshots** (up to 4 per step, R2), **Save progress** / **Submit smoke report** (stored in Supabase **`admin_smoke_checklist_submissions`**). After submit, tell Theo in chat: *ok lets go over the smoke list*.

| Step | Actor | Surface |
| --- | --- | --- |
| 1 | Player | Bankroll **+ Stake** — cash backing, 2 slices, baseline/roll |
| 2 | Backer(s) | Stable — accept slice(s) |
| 3 | Player | On Stake — log 1–2 sessions (roll above baseline if possible) |
| 4 | Player | Terms → **Open ledger** — record top-up (baseline + roll bump) |
| 5 | Player or backer (cash); **player only** (tournament package with an Edge stakee) | Propose periodic settle **or** close. Tournament packages: only the player closes for all backers; guest-only packages still allow an Edge backer to close. |
| 6 | Counterparty | Alerts / deal detail — **Confirm** or **Deny** settlement proposal |
| 7 | Both | Ledger lines per user (`poker_stable_ledger_entries`) on accept |
| 8 | Player | Close stake → **ARCHIVE** → outcome badge + timeline |

---

## SQL (v2)

Migration: **`20260801000000_poker_stable_v2_foundation.sql`**

New / extended:

- `poker_stable_deals` — `deal_type`, `baseline_bankroll`, `staker_user_id` nullable, migrate fields, manifest mode
- `poker_stable_deal_slices` — terms per backer
- `poker_stable_deal_topups`
- `poker_stable_deal_settlements` + `poker_stable_deal_settlement_lines`
- `poker_stable_settlement_requests` + `poker_stable_settlement_request_votes` (bilateral settle sync, **`20260802180000`**)
- `poker_stable_ledger_entries` (per-user settle copy, **`20260802180000`**)
- `poker_stable_payment_claims` (schema retained; **not used** in product UX)
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

## Backer revoke / slice decline (multi-slice)

When a backer exits after accept, the player stake card must **not disappear** ... it shows **Revoked** (whole deal) or stays **On stake** with a slice decline in history (partial exit).

| Scenario | Behavior (Ryan 2026-08-02) |
| --- | --- |
| **Sole backer revokes** | Backer's slice → `declined`; no active slices remain → deal → `revoked`. Player carousel **Revoked**; sessions blocked. Player may **Close stake** to archive, then create a new stake if desired (no Edit terms re-offer). **Delete stake** is **not** available here ... revoke only happens after accept. |
| **One of several backers revokes** | Only that slice → `declined`; deal stays **`active`** if other slices remain. Declined action % returns to player's **self-owned %** (swap cap uses `playerSelfOwnedActionPct`; declined slices excluded). |
| **Backer declines pending slice** | Slice → `declined`; deal stays **`pending`**. If **all** slices decline → deal stays an **editable draft** (no auto-revoke). Player edits terms to add/re-offer backers. |
| **Re-offer after revoke** | Not supported. Close/archive the revoked stake and **create a new stake**. |
| **Close revoked stake** | Stakee **Close stake** runs `poker_stable_close_deal` (finalize settle, no active slices → player keeps profit above baseline if any); deal → **`settled`** / archive. Periodic settle **not** allowed on revoked. |
| **Live card refresh** | **Bankroll** (player): Realtime on `poker_stable_deals` + **8s poll** while pending/active stakes. **Stable** (backer): Realtime on deals / own slices / commits + **8s poll** while open horses exist … counterparty close/settle updates the horse without leaving. Edge in-app / push **v2c**. |

**Delete stake** (separate rule): only on **`pending`** / **`active`** deals **before any Edge backer has accepted** (`stakeDealCanBeCancelled`). Unrelated to post-accept revoke.

**Archive (closed stakes):** Bankroll **ARCHIVE** pill lists `settled` / `closed` deals; tap opens read-only modal with sessions + offer/accept/decline/revoke/top-up/settle/close lines (`buildFullStakeArchiveTimeline`).

---

## Open product decisions (TBD)

Tracked in **`docs/test-buildout-backlog.md`** (Poker Stable open checkboxes). No Ryan sign-off yet.

### Stake commits (unilateral record + optional sync) — **shipped (2026-08-03 test)**

**Problem:** Bilateral settlement votes were over-engineered ... real backing is not a bank.

**Shipped (`20260802210000`):**

- Anyone on either side may **record** top-up, reduce, periodic settle, or close on **their books** immediately (deal-level baseline/roll updates on record).
- **`poker_stable_deal_commits`** + **`poker_stable_commit_syncs`**: counterparties get **`poker_stable_commit_recorded`** alerts; **Commit** (`poker_stable_sync_commit`) applies **player personal** or **backer Stable backing bankroll** + ledger on their side. Skip sync = stay out of sync until ready.
- Deep link **`stableCommit=`** (legacy **`stableSettlement=`**). **Role-aware tab:** stakee → **`/?tab=poker-bankroll&stableDeal=&stableCommit=`** (Commit sync modal); backers → **`/?tab=poker-stable&stableDeal=`** opens horse deal Overview with inline Commit (modal only if deal id missing). After stakee **Commit**, AppShell stays on **Bankroll** (not Stable).
- **`poker_stable_settlement_requests`** vote queue **retired** (pending rows cancelled); payment claims remain removed.

**UI:** deal detail **Out of sync with last commit** banner; global **`PokerStableCommitSyncModal`**.

### Settlement sync (retired 2026-08-03)

Replaced by stake commits above. Do not smoke **`propose` / `confirm` / `deny`** flows.

### Single backer cash-out (multi-slice stake)

**Problem:** One backer wants to **exit economically** mid-deal while other slices stay active ... distinct from **slice revoke/decline** (§ Backer revoke), which removes backing but may not fully reconcile makeup, settle lines, and action %.

**Today:** Multi-slice **revoke** → slice `declined`, action % returns to player self-owned %; deal stays `active` if other slices remain. No dedicated **cash-out** flow (partial settle for one slice, buyout, transfer slice ownership, etc.).

**Open questions:**

- Cash-out = revoke + mandatory mini-settle for that slice? Or separate RPC with pro-rata makeup / profit split through exit date?
- Does exiting backer's action % redistribute to remaining backers, player self-owned %, or require player re-offer?
- Backer bankroll / personal bankroll credits on partial exit (v2c dependency)?
- Guest slice cash-out: player-authoritative only (like payment claims)?

### Move session scope (personal ↔ stake)

**Problem:** Player logs a session on the wrong bankroll scope ... e.g. **Personal** when it should be **On stake** (or the reverse).

**Proposed UX:** Session detail or edit flow → **Move to stake** (or **Move to personal**). When the player has **multiple** pending/active stakes, show a **stake picker dropdown** before confirm.

**Today:** `poker_bankroll_sessions.deal_id` sets scope; stake roll and personal bankroll deltas apply on create/edit/delete. Start/Log pin `deal_id` from the centered Bankroll hero card at sheet open (personal = `null`). No **re-parent** flow between personal (`deal_id` null) and a stake deal.

**Open questions:**

- Who may move? Player only (stakee), or also backers with dispute path?
- Allowed deal statuses: `pending` + `active` only? Block on `revoked` / after settle snapshot?
- Roll / P/L recompute: move stake → personal removes from deal roll; personal → stake adds to deal roll ... atomic RPC?
- Metrics: `player_net_value` / swap attribution recalc on move?
- Backer visibility: notify on move (guest email/SMS + Edge v2c)?
- History line on deal timeline (`session_moved_to_stake` / `session_moved_to_personal`)?

---

## Update log

- **2026-08-13:** **Closed-stake Realized backing no longer treats periodic profit as capital return (client):** `{ isClose: false }` was ignored when `deal.status` was settled/closed (`false || settled` → close path), so a $3,800 periodic settle showed as roll-at-settle (e.g. $103,800). Explicit false now stays on the profit-credit path. **`settlementBackerCredit`**.
- **2026-08-13:** **Personal Start Session no longer inherits the active stake (client):** centered hero card wins after carousel settle; `deal_id` is pinned at sheet open. Tournament on Poker bankroll stays `deal_id` null. **`resolveBankrollScopeForSessionWrite`**, **`PokerBankrollTracker.jsx`**.
- **2026-08-07:** **Closed stakes Realized backing (client):** archive card / modal include action-weighted **makeup** on underwater settles so overall losers show negative Realized backing (not $0 / prior profit-only). **`settlementBackerCredit`** in **`pokerStableDealHistory.js`**.
- **2026-08-07:** **Session-complete refresh while on Stable (client + Edge):** if a backer is already in Stable Manager and taps a session-logged Alert/push, horse cards silent-reload (`lounge-push-opened` / `lounge-activity-navigate`). **`session_complete`** / **`stakee_accepted`** URLs include **`stableDeal`** for carousel focus (still no auto Overview unless **`stableCommit`** / **`stableSettlement`**). **`PokerStableScreen.jsx`**, **`loungeActivityInAppNavigate.js`**, **`lounge-send-activity-push`** (redeploy Edge).
- **2026-08-06:** **Pending-play sessions (test + prod):** migration **60806020000** — stakee logs sessions on pending stakes after player-side accept; backers blind until their slice accept; decline/revoke with no remaining open slices **detaches** sessions to personal; session delete writes **session_deleted** ledger audit (P/L). Client: unblock Start/Log, dynamic pending copy, accepted/pending backing split on hero, Stable session load scoped to accepted slices.
- **2026-08-04:** **Session-complete Alerts fish (client + Edge):** backer **`poker_stable_session_complete`** caption is **`🐡 {player} completed…`** on losing table sessions and **`🦈 {player} completed…`** on winners (Alerts action line + push body prefix); break-even unchanged. **`pokerStableActivityDetail.js`**, **`loungeActivityApi.js`**, **`lounge-send-activity-push`** (redeploy Edge after promote).
- **2026-08-04:** **Deal roll settle watermark (test + prod):** migration **`20260804240000`** — session refresh trigger recomputes roll as **current baseline + session P/L since latest periodic/close settlement** (not lifetime session sum). Fixes horse roll / backer MTM stuck high after periodic settle (e.g. BACKER → PLAYER). Backfill on apply.
- **2026-08-04:** **Backer horse deal detail tabs (client):** tapping an active horse stake card opens tabbed detail sheet — **Overview** (hero + interleaved session/deal history, player-parity session cards with backer **Your share**), **Details**, **Trend**, **Locations**, **Charts** (reuse bankroll analytics components scoped to one deal), **Manage** (commits, slices, top-up, settle). **`PokerStableDealDetailSheet.jsx`**, **`PokerStableDealOverviewPanel.jsx`**, **`PokerStableDealSessionList.jsx`**, **`pokerStableDealSessionStats.js`**.
- **2026-08-06:** **Backer delete Closed stake:** migration **`20260806120000`** — `poker_stable_deal_slices.stable_hidden_at` + **`poker_stable_backer_hide_stable_deal`** (soft-hide per backer; archives if needed). Applied test + prod. UI: Closed stakes Delete, archive detail Delete, closed-horse sheet Delete from Stable. Does not hard-delete shared deal/ledger.
- **2026-08-06:** **Stable dark mode palette:** portfolio/top card matches Slots bankroll zinc; horse stake cards keep prior cyan chrome (`STABLE_HORSE_*`). Cyan CTAs/tabs unchanged.
- **2026-08-06:** **Stable light mode palette:** matches Slots/Poker bankroll (zinc surfaces + blue `#2563eb` chrome + emerald money).
- **2026-08-04:** **Stable screen polish (client):** removed page title/subtitle; horse stake cards show per-horse sparklines (tap → Trend); Trend tab **All / Portfolio** segmented toggle; main Stable chrome moved from amber to cyan (**`pokerStableUi.js`**, **`PokerStableScreen.jsx`**, **`PokerStableHorseCarousel.jsx`**, **`PokerStablePortfolioHero.jsx`**, **`PokerStableTrendTab.jsx`**, **`PokerStableLocationsTab.jsx`**). Needs-attn banners stay amber.
- **2026-08-04:** **Backer settle commit review (client):** counterparty periodic/close review modal shows roll/baseline + **Stable backing bankroll on commit** (slice settle credit, same as Realized P/L). **`PokerStableCommitSyncModal.jsx`**.
- **2026-08-04:** **Backer horse card settle review (client):** pending player periodic/close settle shows **Needs attn** on the **horse stake card** (same banner as player stake card), not the portfolio backing bankroll hero; portfolio **Needs your attention** only for non-settle commits. **`PokerStableHorseCarousel.jsx`**, **`PokerStableSettleNeedsAttnBanner.jsx`**, **`PokerStableScreen.jsx`**.
- **2026-08-04:** **Stakee periodic settle review (client):** backer-initiated stakes require player **Commit** on counterparty periodic/close settle before stake card numbers update; hero holds **roll_at_settle** until sync; sparkline replaced by **Needs attn** + review modal (**Cancel** / **Commit**). **`stakeeSkipsBackerCommitSync`** narrowed to non-settle commits only. **`PokerBankrollTracker.jsx`**, **`PokerStableCommitSyncModal.jsx`**, **`pokerStableTerms.js`**.
- **2026-08-04:** **Player makeup UX (client):** when horse roll ≤ baseline, stake card shows **Make-up: $X**; session list hides **Your share**; session attribution assigns full session W/L to backers (player economic share $0 until above baseline). **`pokerSessionAttribution.js`**, **`PokerBankrollTracker.jsx`**.
- **2026-08-04:** **Backer MTM underwater (client):** when horse roll ≤ baseline, **Your stake MTM** and portfolio use full action-weighted roll (backers bear makeup losses; profit split applies only above baseline). Fixes 50/50 split incorrectly applied to underwater drawdown. **`pokerStableBackerMath.js`**. Alerts/push for **`stakee_accepted`** + **`session_complete`** open Stable tab only (no auto deal detail sheet). Guest stakee claim copy → "play on a stake on EdgeTilt's Poker Bankroll Manager."
- **2026-08-05:** **At-risk ROI fix (client):** hero **At-risk ROI** = `(Stakes MTM − At risk) / At risk` on **open** horses only ... not lifetime session share from closed stakes. **`pokerStableBackerMath.js`**.
- **2026-08-05:** **Closed stake review → commit before archive (client):** player **Review** / closed-stake sheet waits for pending close/periodic **Commit** sync before archive. **`PokerBankrollTracker.jsx`**.
- **2026-08-05:** **Backer closed horse carousel (client + SQL):** migration **`20260805120000`** — `poker_stable_deal_slices.stable_archived_at` + **`poker_stable_backer_archive_stable_deal`**; closed stakes stay in horse carousel until backer **Archive stake** (parity with stakee Bankroll). **`partitionBackerDeals`**, **`PokerStableHorseCarousel`**, **`PokerStableClosedHorseHeroBanner.jsx`**. Apply SQL on test + prod before smoke.
- **2026-08-05:** **Backer archive revoked + Review sheet (client + SQL):** migration **`20260805130000`** — archive RPC includes **declined** slices on terminal deals (revoke path). **`PokerStableClosedHorseSheet.jsx`** (Review modal) with **Delete** text button; carousel **Review** opens sheet instead of full deal detail.
- **2026-08-05:** **Backer Create Stake after revoke (client + SQL):** migration **`20260805140000`** — **`requestBackingDeal`** reopens matching **revoked** deal (same label + player/guest) instead of inserting a duplicate row; slice delete RLS for backer re-offer.
- **2026-08-06:** **Settle Commit queue:** multiple unsynced settles show as a dated queue (oldest first) on deal Overview / player Manage ... header count + date range, **Commit all**, Needs attn reflects count + dates. Initiator may still settle again before counterparty commits. **`PokerStableSettleCommitQueue.jsx`**.
- **2026-08-06:** **Backer settle Alert/push:** open horse deal **Overview** (inline Commit) ... do not stack **Settlement** sync modal when `stableDeal` is present. Stakee Bankroll Commit modal unchanged. **`AppShell.jsx`**.
- **2026-08-06:** **Player Manage sheet:** hide **Your ledger** list (duplicate of stake card history lines). Backer Stable Manage tab unchanged.
- **2026-08-07:** **Periodic settle pay copy (client):** initiator review lists who pays whom as bullets under the credit hero, then **Stake resets to $X and remains open**. Backer: `{player} pays you $X`; player: `You pay {backer} $X` per slice. Hero credit label: personal bankroll (player) or **personal backing bankroll** (backer). Reduce-stake split on backer view: **Owed to you** + aggregated **Other backers** (player view still names each backer). **Counterparty Commit review** (inline + modal) shows the same pay bullets, reset line, and reduction breakdown. **`pokerStableSettleReviewCopy.js`**, **`PokerStablePeriodicSettleSheet.jsx`**, **`PokerStableCommitSyncPanel.jsx`**.
- **2026-08-07:** **Portfolio hero → detail sheet (client):** tap portfolio card opens sheet with Overview / Trend / Locations pills; Overview includes Add/Remove backing bankroll. Page-level Stable tabs removed; Active horses stay on main screen.
- **2026-08-07:** **Bankroll On Stake session scope (client):** stake card history/stats only include `deal_id` sessions for carousel deals; off-carousel (archived) scope snaps to personal so closed-stake sessions cannot paint onto a new stake card. Merged personal rows badge **Closed stake**.
- **2026-08-07:** **Ryan sign-off — player → backer stake offer (test):** Edge backer **Create Stake** → player Bankroll in-card Accept/Decline + Alert/push to stake card ... **PASSED**.
- **2026-08-06:** **Player Bankroll backer-offer Accept/Decline (client):** offer actions live in the stake carousel hero message slot (with goes-live copy) ... no separate invite card above the carousel.
- **2026-08-06:** **Player backer-offer Alert/push (client + push):** deep link opens Poker Bankroll focused on the stake card ... does not open Backing invitation modal. Modal remains for guest/non-Edge claim (`stakeOnboarding=1`).
- **2026-08-10:** **Pending offer withdrawn (SQL + client):** `poker_stable_cancel_stake_deal` rewrites Edge invite/nudge Alerts to **`poker_stable_offer_withdrawn`** (in place, no new push; resurfaces unread). Banner **This stake offer was withdrawn.** only from tapping that Alert/push (`stableWithdrawn=1`) … not from a missing `stableDeal` deep link. Migration **`20260810120000`**.
- **2026-08-10:** **Withdrawn Alerts collapse to one:** cancel keeps a single **`poker_stable_offer_withdrawn`** per recipient (folds invite / nudge / terms_edited / prior withdrawn), deletes the rest. Migration **`20260810150000`** also one-time cleans duplicate withdrawn rows already in Alerts.
- **2026-08-10:** **Pending terms edit keeps Edge slice ids:** `poker_stable_apply_stakee_terms` upserts pending slices in place (no delete+reinsert id churn), collapses invite/nudge Alerts into one **`poker_stable_terms_edited`** INSERT (push). Client no longer blanks Stable/Alerts on soft reload failures. Migration **`20260810160000`**.
- **2026-08-10:** **Pending terms edit no longer re-invites:** `poker_stable_apply_stakee_terms` suppresss `slice_invite` on delete+reinsert and emits **`poker_stable_terms_edited`**. Migration **`20260810140000`**.
- **2026-08-06:** **Backer slice invite / nudge deep link (client):** Alerts/push with `stableDeal` land on Stable and focus the pending horse card offer ... do not auto-open deal Overview. Settle/commit deep links still open Overview when the viewer’s slice is already accepted.
- **2026-08-06:** **Player settle Commit stays on Bankroll (client):** after Commit from Needs attn sync modal, close the modal only ... do not auto-open Stake terms.
- **2026-08-07:** **Settle Commit no flash / no follow-up modal (client):** after Commit, dismiss immediately (no panel reload), clear commit deep-link params, do not chain the next settle modal, and close horse/Manage detail sheets so the user lands on Stable/Bankroll main. **`PokerStableCommitSyncPanel.jsx`**, **`PokerBankrollTracker.jsx`**, **`PokerStableDealDetailSheet.jsx`**, **`AppShell.jsx`**.
- **2026-08-06:** **Block settle while pending Commit (test + prod):** non-initiator with unsynced `periodic_settle` / `close_settle` cannot record another Periodic settlement or Close stake until they Commit. UI disables both actions with **Awaiting settlement · Commit the current settlement first.** RPC **`poker_stable_record_settlement`** raises the same message (**`20260806030000`**). Initiator may still settle again after more sessions.
- **2026-08-05:** **Backer settle commit inline (client):** pending close/periodic settle **Commit** UI lives on horse deal **Overview** tab (**`PokerStableCommitSyncPanel`**) instead of a second modal from carousel Review; Alerts/push with `stableDeal` open that sheet (global Commit modal only if deal id missing).
- **2026-08-05:** **Settle/commit deep links (client + push):** stakee Alerts/push + post-**Commit** navigation → **Poker Bankroll** (`pokerStableActivityTabForViewer`, **`LoungeNotificationsPanel`**, **`AppShell`** `onSynced`); backers unchanged → Stable. **`lounge-send-activity-push`** fetches `stakee_user_id` for role-routed events. Redeploy Edge on test + prod.
- **2026-08-04:** **Unified stake live gate (client):** **`stakeDealIsLiveForStakee`** — same rule every path (player offer, backer offer, syndicate): stake is live only when **player accepted + at least one backer accepted** (`deal.status === 'active'` or pending with both sides). Drives Bankroll badge/sessions/sold action, backer deployed vs pending-hold capital, and portfolio MTM. Initiation direction only changes who accepts first and guest email rails. **`pokerStableMath.js`**, **`pokerStableBackerMath.js`**, **`pokerSessionAttribution.js`**, **`PokerBankrollTracker.jsx`**.
- **2026-08-04:** **Pending deal roll profile + Stable MTM (test + prod):** migration **`20260804230000`** — maintain **`poker_deal_bankroll_profiles`** for player-created stakes once a backer accepts (deal may stay **`pending`**); session trigger refreshes roll; backfill activates stuck deals; RLS allows stakee roll bootstrap while **`pending`**. Client uses session-derived roll when profile row missing (**`pokerStableBackerMath.js`**).
- **2026-08-09:** **First-time backer bankroll seed (test):** migration **`20260809130000`** — when a backer has no backing bankroll row (or **$0** liquid) and **no other open stakes**, auto-seed **`poker_stable_backer_bankrolls`** to that slice’s capital (baseline × action %) and log a manual adjustment before pending hold / debit. Accept and Create Stake both go through **`poker_stable_ensure_backer_allocation`** (+ debit safety net). Result: liquid ≈ **$0** (not −slice), stake capital in portfolio MTM. One-time repair for negative balances with no prior Adjust history. **Prod SQL not applied until Ryan asks.**
- **2026-08-10:** **Seed only on initiate or Accept:** received player-offer invites no longer invent backing bankroll + pending hold. **`20260810170000`** seeds for Create Stake **initiator** (and on Accept / debit); repairs mistaken seeds on pending received invites. Client pending hold ignores unaccepted invite slices.
- **2026-08-10:** **No re-seed after Accept debit:** second `ensure` after seed+debit saw liquid `$0` and seeded again → bankroll `$slice`, portfolio `~2×`. **`20260810180000`** blocks seed once any allocation is `bankroll_debited` and repairs phantom liquid matching fully deployed capital.
- **2026-08-10:** **Prod seed foundation gap:** **`20260810200000`** ships missing `has_other_open_stakes` + debit-before-subtract seed safety net (from **`20260809130000`**) without clobbering newer ensure; repairs debit-without-seed negatives.
- **2026-08-10:** **Stable horse Chat (rough v1):** Message icon on horse cards from pending offer → live (hidden for guest players). Opens Chat DM via `onOpenChatWithUser` / `open_dm`.
- **2026-08-10:** **Action sold >100% on create:** `sumSliceActionPct` only summed `action_pct` while create form sends `actionPct` (check always saw 0). Fixed helper + create-sheet total/disable; **`20260810190000`** deferred deal-slice cap + propose RPC asserts.
- **2026-08-04:** **Backer bankroll debit on slice accept (test + prod):** migration **`20260804220000`** — player-created stakes debit **`poker_stable_backer_bankrolls`** when a backer slice goes **`active`** (deal may stay **`pending`**); backer Create Stake unchanged (debit when horse accepts / deal **`active`**). Client pending-hold math aligned in **`pokerStableBackerMath.js`**.
- **2026-08-04:** **Pending stake backer visibility + nudge (test):** migration **`20260804200000`** — session-complete Alerts/push only for **`active`** backer slices; **`poker_stable_nudge_backer_slice`** RPC + **`poker_stable_slice_nudge`** activity; player stake card shows **Pending acceptance by {name}** + **Nudge** (Edge Alerts/push + guest email); deal goes **`active`** when first backer accepts on player-created stakes; accepted backers on pending deals see session stats/history in Stable. Redeploy **`poker-stable-notify`** + **`lounge-send-activity-push`** after SQL.
- **2026-08-04 (planned):** **Phase 1b spec** — § Notifications: backer Create Stake → **guest syndicate co-backer** claim (`guest_syndicate_backer_offer`, relax `/poker-stable-claim` RPCs, Create Stake client notify); Edge co-backer **slice invite actor copy** fix on backer-initiated deals. **Not implemented yet.**
- **2026-08-04:** **Deal lifecycle notifications (Phase 1, test + prod):** migration **`20260804100000`** — activity types for backer offer, stakee accept/decline/counter, staker counter accept/decline, slice accept/decline; DB triggers + RPC emits; guest backer claim tokens + **`/poker-stable-claim`** page; **`poker-stable-notify`** mints backer claim URL on guest **`offer`** emails; Alerts + push deep links (`poker-bankroll` vs `poker-stable` by event). Redeploy **`poker-stable-notify`** + **`lounge-send-activity-push`** on test + prod after SQL.
- **2026-08-03:** **Commit sync Alerts + push (Phase 0):** `poker_stable_commit_recorded` uses commit summary in Alerts (`loungeActivityApi.js`); push deep link `/?tab=poker-stable&stableDeal=&stableCommit=` + Poker Stable title/body in **`lounge-send-activity-push`** (redeploy Edge on test + prod). Alerts tap already opened sync modal via `stableCommit=`.
- **2026-08-02:** **Backer TWR + At-risk ROI (test):** migration **`20260802270000`** ... manual adjust ledger + hero metrics; **`pokerStableBackerMath.js`**.
- **2026-08-02:** **Stable Trend + Locations history (test):** migration **`20260802240000`** — backers read stake sessions on settled/revoked deals; fix session query columns (`start_at`, `venue_name`); Trend builds cumulative session-share lines for closed + active horses; Locations includes closed stakes in filters.
- **2026-08-02:** **Backer settle backfill (test):** migration **`20260802260000`** ... idempotent repair for settles recorded before **`20260802230000`** backer routing (personal → Stable backer bankroll + Realized P/L).
- **2026-08-02:** **Backer Stable v1 UI (test, in build):** migration **`20260802220000`** — backing bankroll pool + slice allocations; Stable upgraded in place (portfolio hero, horse carousel, Overview/Trend/Locations tabs, closed stakes on overview, **Needs attention** commit sheet). Unilateral commit/sync from **`20260802210000`** retained. Apply SQL on test before smoke.
- **2026-08-02:** **Unilateral commit/sync (test):** migration **`20260802210000`** — record top-up/reduce/settle updates recorder's books immediately; counterparties **Commit to my books** via **`poker_stable_sync_commit`**; settlement vote queue retired.
- **2026-08-02:** **Settlement sync + ledger (test):** migration **`20260802180000`** — propose/respond settlement, **`poker_stable_ledger_entries`**, backer personal credit on accept; drops payment-claim activity triggers; **`PokerStableSettlementRequestActionModal`** on `stableSettlement=`. Redeploy **`lounge-send-activity-push`** on test after pull.
- **2026-08-02:** **Stable v2c Edge notify (test):** migration **`20260802170000`** — slice invite + session complete activity (superseded for settle by **`20260802180000`**). Guest email/SMS unchanged (`poker-stable-notify`).
- **2026-08-02:** **Close revoked stake (test + prod):** migration **`20260802160000`** — `poker_stable_run_settlement` allows finalize on **`revoked`** deals (fixes "Active stake not found" on Close stake); periodic settle still active-only. Applied on **`jtjgtucumuoswnbauxry`**.
- **2026-08-03:** **Guest stakee claim (test):** migration **`20260803100000`** — claim tokens, preview/link RPCs, stakee accept/decline/counter + staker counter accept/decline; **`/poker-stake-claim`** page; Bankroll backer-offer banner; Stable counter-proposal cards; **`poker-stable-notify`** mints claim URL on **`guest_stakee_offer`** (redeploy Edge on test).
- **2026-08-02:** **Open product decisions (TBD):** § Settlement sync, § Single backer cash-out, § Move session scope (personal ↔ stake with multi-stake picker) added to backlog; no implementation until Ryan locks rules.
- **2026-08-02:** **Revoked re-offer (test):** migration **`20260802150000`** — stakee edit on **`revoked`** deal flips **`pending`** + replaces slices; pending draft may have zero slices when all backers declined. Product rules locked in § Backer revoke / slice decline.
- **2026-08-02:** **Revoked stake UX + archive (test):** sole backer revoke keeps deal on player carousel (**Revoked** badge, banner, terms edit/close); partial multi-slice revoke declines slice only; Bankroll **ARCHIVE** pill + detail modal; poll widened to pending **or** active carousel stakes.

- **2026-08-01:** **v2a bankroll attribution (test):** RPCs `poker_stable_periodic_settle` + `poker_stable_close_deal` (`20260802000000`); player personal bankroll credited on settle; close merges stake sessions to personal timeline (keep `deal_id`, settled badge). Option B personal metrics (`player_net_value`), hero hint, Trend tab; Terms + Stable detail periodic vs close settle UI. Backer bankroll rollup still **v2c**.
- **2026-08-01:** **Session detail attribution (test):** `pokerSessionAttribution.js` (`playerStakeSessionValue`, `playerNetSessionValue`); Bankroll session detail sheet shows table result, **By party**, swaps, **Your net**; stake session cards dual-line gross + your share.
- **2026-08-01:** **Bankroll & session attribution** (Ryan design): three surfaces (stake roll, personal, backer); periodic settle vs close; Option B metrics (accrue `player_net_value` per session, bankroll moves on settle only); session cards gross + stake value + swap on net; merge on close without double-count; swaps never in stake settle. See § Bankroll & session attribution. **Partial:** detail sheet + helpers; settle RPC + merge + metrics TODO.
- **2026-08-01:** Guest stake notify: Edge **`poker-stable-notify`** (Resend email + Twilio SMS) on create (`kind=offer`), terms edit with before/after blocks (`kind=terms_edited`), before stake delete (`kind=deleted`), and stake **session complete** (`kind=session_complete` + `session_id`).
- **2026-08-01:** Stake accent palette: heroes rotate **blue / emerald / rose** (oldest deal = blue). Light mode: tone gradient (slow fade) + neutral elevation; Terms slice cards match; no inset 3D shell.
- **2026-08-01:** Stake delete (Bankroll **Terms → Delete stake**): stakee may remove a stake before any Edge backer accepts; deletes stake sessions on that deal (`20260801150000`).
- **2026-08-01:** Guest-only active stakes: player may **Edit terms** on Bankroll when all backers are guests (auto-active deals); **Assign to Edge user** re-links a guest slice to an Edge account (slice invite pending in Stable). RPCs `poker_stable_apply_stakee_terms`, `poker_stable_reassign_guest_slice` (`20260801140000`).
- **2026-08-09:** Stake terms privacy: non-player backers viewing **Stake terms** only see their own slice(s) (matches Propose stake terms / backer Edit terms). Player still sees full syndicate.
- **2026-08-01:** Stake terms view/edit: **Terms** on Bankroll stake cards + Stable invites; player edits pending deals directly; backer **Edit terms** stores a proposal until the player accepts (`pending_terms_json`, `20260801130000`).
- **2026-08-11:** **Terms edit requires counterparty ack both ways:** backer-initiated pending … player **Offer new terms** counters (`staker_terms_ack_required`); lead Accept / soft Decline (keeps original offer) / player re-edit. Player-initiated … backer propose sets `stakee_terms_ack_required` + Alert `poker_stable_backer_terms_proposed`. Card badges: Bankroll **Review terms** / **Counter sent**; Stable horse **Review** + inline Accept counter. Migration **`20260811120000`** blocks immediate `apply_stakee_terms` on backer-initiated pending.
- **2026-08-11:** **Terms edit = implied acceptance:** lead Accept counter activates the deal (player already accepted by proposing). Player Accept backer proposal activates the proposing backer's slice. Edit sheet disclaimer. Migration **`20260811130000`**.
- **2026-08-11:** **Backer propose activates slice:** sending revised terms is the backer's slice accept ... horse waits on player with no Accept/Decline (**`20260811140000`**).
- **2026-08-12:** **Player ARCHIVE close review (client):** archive detail shows the same closed-stake economics as the pre-archive review (per-backer returned / owed) via **`PokerStakeeClosedStakeReviewSections`**. List cards stay compact.
- **2026-08-12:** **Tournament package close = player only (test):** with an Edge stakee, only the player may finalize a `tournament_package` close (UI `canProposeSettleStake` + SQL **`20260812130000`**). Cash backers can still close cash stakes; guest-only packages still allow an Edge backer to close.
- **2026-08-11:** **Terms edit removed (Phase 1, test):** Accept/Decline only on pending stakes; decline + create a new stake to renegotiate. Propose/counter/apply/accept-proposed RPCs disabled (**`20260811170000`**). Stable deal wipe script: **`scripts/wipe-poker-stable-deals.sql`**. **Phase 2 planned:** deal-level pricing + rakeback; slices keep `action_pct` only.
- **2026-08-11:** **Declined offer cleanup (test):** when the other side declines a whole offer, the **initiator** sees **Delete** / **New proposal** (hard-delete via **`poker_stable_delete_declined_deal`**, then open Create Stake / + Stake). Multi-backer single-slice decline still shrinks the deal. Migration **`20260811180000`**.
- **2026-08-11:** **Decliner UX (test):** declining agent’s card goes away; modal offers **Propose new terms** (seeded create form with same counterparties) or **Cancel**. Choosing **Propose new terms** hard-deletes the declined deal (`poker_stable_delete_declined_deal`, any party on the deal) so the initiator’s Delete / New proposal card disappears. Migration **`20260811190000`**.
- **2026-08-11:** **Decline reverses Create Stake seed (test):** Backer Create Stake seeds assumed capital into Stable backing bankroll; player decline (and delete-declined) releases the allocation and reverses undebited seed (`seed_applied` on allocations, **`20260811200000`**). Debited capital still credits on release as before.
- **2026-08-11:** **Tournament markup fee (test):** On markup accept, debit paid (`face × markup`); face in stake; fee → player personal + backer Realized P/L; fee excluded from portfolio; cancel after accept unwinds. Cash backing no longer offers markup. **`20260811210000`**.
- **2026-08-11:** **Tournament close Commit review (client):** backer card hero is **Overall performance** (stake P/L − markup fee; rose on loss); bullets are stake P/L − markup breakdown + returned to Backing Bankroll; no baseline / “stake closes at”; footnote reiterates original terms. **`PokerStableCommitSyncPanel.jsx`**.
- **2026-08-11:** **Close Commit & Archive (client):** counterparty close settlement button is **Commit & Archive** … syncs books then archives the stake for that viewer (no separate Archive step after close Commit).
- **2026-08-11:** **Tournament player package contribution (test):** migration **`20260811240000`** — debit unsold face from personal on go-live; close returns roll share; history close line shows returned + overall P/L (no “makeup cleared”).
- **2026-08-11:** **Always top up backing-bankroll deficiency (test):** migration **`20260811250000`** — any shortfall vs paid amount is credited (manual adjustment) before seed/debit on Create Stake or Accept; cash + tournament. Repairs negative liquid when capital already deployed.
- **2026-08-11:** **Backing bankroll Ledger tab (test):** portfolio detail **Overview / Ledger / Trend** (Locations removed from portfolio sheet). Migration **`20260811280000`** adds typed adjustment rows (`kind`, `deal_id`, `note`) for deposit/withdraw/auto top-up/stake deploy/close return/markup refund/settle; TWR filters capital kinds only.
- **2026-08-11:** **Unused tournament markup refund on close (test):** prepaid fee earned pro-rata to buy-ins vs package face; unused returns to backer + clawed from player personal. Commit shows **markup applied** + unused-return bullet. **`20260811260000`**.
- **2026-08-11:** **Player Close stake sheet (client):** tournament close preview lists each backer’s stake-value return + unused markup refund (plus player personal return / overall P/L). **`PokerStableCloseStakeSheet.jsx`**.
- **2026-08-11:** **Player closed-stake review sheet (client):** post-close Archive review shows markup applied / unused refunded per backer + total unused returned to backers. **`PokerStakeeClosedStakeSheet.jsx`**.
- **2026-08-11:** **Closed-stake Realized backing includes markup (client):** Stable closed cards + archive detail sum stake settle P/L with markup fee and unused markup refund (matches `realized_backing_pl` books). **`archivedStakeBackerEconomicsBreakdown`**.
- **2026-08-11:** **Tournament close ledger copy (test):** `poker_stable_write_settlement_ledger_for_user` no longer uses cash “slice payments / rebalanced to baseline” wording on tournament package close … player gets roll×retained% returned + overall P/L; backer gets stake-value return + unused markup. **`20260811310000`**. Client history prefers computed tournament close lines over stale cash-era ledger rows.
- **2026-08-11:** **Player tournament Overall P/L = stake + earned markup (test):** returned − contribution + applied markup (prepaid − unused). Copy clarifies return is to **your personal bankroll** and breaks out stake vs markup when markup was earned. **`20260811320000`**.
- **2026-08-11:** **Backer portfolio until settle Commit (client):** while a close/periodic Commit is pending, Stable hero still treats capital as deployed (liquid / at-risk / MTM / horse count); MTM uses settlement `roll_at_settle` because deal roll resets on record. Books change on **Commit**, not when the player records close.
- **2026-08-11:** **Auto top-up is an advance, reclaimed on close (test):** deficiency credits still let Accept fund a stake, but after close returns the outstanding `auto_top_up` is reversed (`seed_reverse`) up to returned $ so invented capital cannot stick as liquid. Manual deposits remain. **`20260811330000`**.
- **2026-08-11:** **On-stake session W/L no longer double-debits deal roll (test):** client `applyBankrollDelta` skips stake sessions … SQL triggers own roll (active costs + complete W/L). DELETE refresh **`20260811270000`**.
- **2026-08-01:** Pending stake sessions: player may **Start Session** / log past on pending deals; sessions attach to `deal_id` immediately; stake bankroll profile bootstraps on accept with starting roll + logged P/L; backers see sessions in Stable after accept (`20260801110000`).
- **2026-08-01:** Stable filters: player **+ Stake** deals no longer appear on Stable for the stakee; invite cards use amber chrome (not cyan).
- **2026-08-01:** Post-create stake UX: pending player deals appear on Bankroll carousel; success banner after **Create stake**; push/in-app backer alerts still **v2c**.
- **2026-08-01:** UX pivot: player **`+ Stake`** + stake carousel on Poker Bankroll; Stable backer-only (**Request horse** full form + syndicate slices); `requestBackingDeal` API; removed Personal/On Stake toggle.
- **2026-08-01:** Spec distilled from Ryan + Theo design session; v2 foundation build started.
