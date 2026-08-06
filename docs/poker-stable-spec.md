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
- **Guests (player-initiated):** player-entered terms authoritative; optional phone/email for notify (SMS/email via Edge **`poker-stable-notify`** on create, terms edit with before/after diff, and **session complete**); no guest ledger UI. Player may **delete** the stake until an Edge backer accepts; guest-only stakes remain deletable.
- **Guests (backer Create Stake):** backer sets terms + lead slice at create; guest player gets email/SMS with **`/poker-stake-claim?token=…`**. Claim links Edge account only (`stakee_user_id`); signup from that page sends email confirm back to the same claim URL (auto-link after verify). Player then **Accept / Decline / Offer new terms** on Bankroll. Decline kills the deal for everyone. Counter-proposal → lead backer **Accept counter / Decline** in Stable; stake stays pending until player accepts final terms. Migration **`20260803100000`**. **Guest syndicate co-backers** on the same create flow are **not wired yet** ... see § Notifications → Phase 1b.
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
| **Stable backing bankroll** (`poker_stable_backer_bankrolls`) | Backer capital + settle economics. **Never** `poker_bankroll_profiles`. | Slice allocation debit; top-up debit / reduce credit; settle credit/debit (+ **Realized P/L** mirrors signed settle $). |

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
| **Player (stakee)** | Poker Bankroll **`+ Stake`** → full backing form (baseline, migrate, backer slices) | Stake carousel on Bankroll only (personal + pending/active deal cards). **Not Stable.** Stake is **live** (sessions, sold action, hero badge **On stake**) only after **player + at least one backer** accept ... same rule for player offer, backer offer, and syndicate paths. Until then: **Pending**, capital on hold for backers, no session logging. On Stake session list also shows deal **history lines** (offer, accept, re-up, settle) as text rows mixed with sessions. **Terms → Open ledger** on active cash backing opens deal detail (top-up + propose settle). |
| **Backer (staker)** | Stable **Create Stake** → player handle + your slice + optional syndicate slices | Stable portfolio hero, horse carousel, **Overview / Trend / Locations**, closed stakes history, **Needs attention** commit inbox, deal ledger |

Stable no longer exposes player **+ New deal**. Syndicate slices on a backer request stay **pending** until each friend accepts their slice in Stable. **Edge** co-backers get slice-invite Alerts today (actor copy wrong ... see § Notifications). **Guest** co-backers get **no** email/claim yet (Phase 1b).

### Backer Stable v1 (2026-08-02 test, in build)

**Separate from player personal bankroll.** Backers use **`poker_stable_backer_bankrolls`**. Hero **Edit → Adjust bankroll** (`20260802250000`) changes liquid balance only ... no impact on Realized P/L, At risk, Stakes MTM, or Trend session chart.

| Surface | Behavior |
| --- | --- |
| **Portfolio hero** | Liquid backing bankroll + **portfolio value** (liquid + stake MTM). **Edit → Adjust bankroll** (add/remove or new balance). Session **sparkline**. Metrics: capital at risk, **At-risk ROI** (session share ÷ at risk), **TWR** (session share across manual-adjust periods), stake MTM, active horses, realized backing P/L. |
| **Horse carousel** | Active/pending horses with roll, your stake MTM, est. share, sessions/P/L. |
| **Overview tab** | Invites + carousel + **Closed stakes** history (not a separate ARCHIVE tab). |
| **Trend tab** | Session performance only (action % of gross W/L); bankroll adjustments do not move the chart. |
| **Locations tab** | Stable-wide venue rollup from on-stake sessions (active + closed); filter per horse. |
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
| **v2b** | Tournament piece on session (swap integration); tournament package manifest |
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
| Stakee **counter-propose** | **Lead backer only** |
| Lead backer **accept / decline** counter | **Stakee** |
| Edge backer **accept / decline** slice on player-created deal | **Stakee** |

Activity types: `poker_stable_stakee_*`, `poker_stable_staker_counter_*`, `poker_stable_slice_accepted` / `_declined`. Migration **`20260804100000`**.

Guest counterparts on terms events: **deferred** (Phase 2+ in notification roadmap) ... Edge path is enough for syndicate Edge backers today.

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
| 5 | Player or backer | Propose periodic settle **or** close (guest-only stakes apply immediately) |
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
| **Sole backer revokes** | Backer's slice → `declined`; no active slices remain → deal → `revoked`. Player carousel **Revoked**; sessions blocked. Player may **Edit terms** to re-offer (deal → `pending` + new slice invites) or **Close stake** to archive. **Delete stake** is **not** available here ... revoke only happens after accept. |
| **One of several backers revokes** | Only that slice → `declined`; deal stays **`active`** if other slices remain. Declined action % returns to player's **self-owned %** (swap cap uses `playerSelfOwnedActionPct`; declined slices excluded). |
| **Backer declines pending slice** | Slice → `declined`; deal stays **`pending`**. If **all** slices decline → deal stays an **editable draft** (no auto-revoke). Player edits terms to add/re-offer backers. |
| **Re-offer after revoke** | Stakee **Edit terms** on revoked deal → `poker_stable_apply_stakee_terms` flips deal **`pending`**, replaces slices, new Edge invites. |
| **Close revoked stake** | Stakee **Close stake** runs `poker_stable_close_deal` (finalize settle, no active slices → player keeps profit above baseline if any); deal → **`settled`** / archive. Periodic settle **not** allowed on revoked. |
| **Player notification** | Bankroll Realtime + **8s poll** while carousel has pending/active stakes. Edge in-app / push **v2c**. |

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
- Deep link **`stableCommit=`** (legacy **`stableSettlement=`** still opens sync modal). **Role-aware tab:** stakee → **`/?tab=poker-bankroll&stableDeal=&stableCommit=`**; backers → **`/?tab=poker-stable&...`**. After stakee **Commit**, AppShell stays on **Bankroll** (not Stable).
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

**Today:** `poker_bankroll_sessions.deal_id` sets scope; stake roll and personal bankroll deltas apply on create/edit/delete. No **re-parent** flow between personal (`deal_id` null) and a stake deal.

**Open questions:**

- Who may move? Player only (stakee), or also backers with dispute path?
- Allowed deal statuses: `pending` + `active` only? Block on `revoked` / after settle snapshot?
- Roll / P/L recompute: move stake → personal removes from deal roll; personal → stake adds to deal roll ... atomic RPC?
- Metrics: `player_net_value` / swap attribution recalc on move?
- Backer visibility: notify on move (guest email/SMS + Edge v2c)?
- History line on deal timeline (`session_moved_to_stake` / `session_moved_to_personal`)?

---

## Update log

- **2026-08-04:** **Session-complete Alerts fish (client + Edge):** backer **`poker_stable_session_complete`** caption is **`🐡 {player} completed…`** on losing table sessions and **`🦈 {player} completed…`** on winners (Alerts action line + push body prefix); break-even unchanged. **`pokerStableActivityDetail.js`**, **`loungeActivityApi.js`**, **`lounge-send-activity-push`** (redeploy Edge after promote).
- **2026-08-04:** **Deal roll settle watermark (test + prod):** migration **`20260804240000`** — session refresh trigger recomputes roll as **current baseline + session P/L since latest periodic/close settlement** (not lifetime session sum). Fixes horse roll / backer MTM stuck high after periodic settle (e.g. BACKER → PLAYER). Backfill on apply.
- **2026-08-04:** **Backer horse deal detail tabs (client):** tapping an active horse stake card opens tabbed detail sheet — **Overview** (hero + interleaved session/deal history, player-parity session cards with backer **Your share**), **Details**, **Trend**, **Locations**, **Charts** (reuse bankroll analytics components scoped to one deal), **Manage** (commits, slices, top-up, settle). **`PokerStableDealDetailSheet.jsx`**, **`PokerStableDealOverviewPanel.jsx`**, **`PokerStableDealSessionList.jsx`**, **`pokerStableDealSessionStats.js`**.
- **2026-08-04:** **Stable screen polish (client):** removed page title/subtitle; horse stake cards show per-horse sparklines (tap → Trend); Trend tab **All / Portfolio** segmented toggle; main Stable chrome moved from amber to cyan (**`pokerStableUi.js`**, **`PokerStableScreen.jsx`**, **`PokerStableHorseCarousel.jsx`**, **`PokerStablePortfolioHero.jsx`**, **`PokerStableTrendTab.jsx`**, **`PokerStableLocationsTab.jsx`**). Needs-attn banners stay amber.
- **2026-08-04:** **Backer settle commit review (client):** counterparty periodic/close review modal shows roll/baseline + **Stable backing bankroll on commit** (slice settle credit, same as Realized P/L). **`PokerStableCommitSyncModal.jsx`**.
- **2026-08-04:** **Backer horse card settle review (client):** pending player periodic/close settle shows **Needs attn** on the **horse stake card** (same banner as player stake card), not the portfolio backing bankroll hero; portfolio **Needs your attention** only for non-settle commits. **`PokerStableHorseCarousel.jsx`**, **`PokerStableSettleNeedsAttnBanner.jsx`**, **`PokerStableScreen.jsx`**.
- **2026-08-04:** **Stakee periodic settle review (client):** backer-initiated stakes require player **Commit** on counterparty periodic/close settle before stake card numbers update; hero holds **roll_at_settle** until sync; sparkline replaced by **Needs attn** + review modal (**Cancel** / **Commit**). **`stakeeSkipsBackerCommitSync`** narrowed to non-settle commits only. **`PokerBankrollTracker.jsx`**, **`PokerStableCommitSyncModal.jsx`**, **`pokerStableTerms.js`**.
- **2026-08-04:** **Player makeup UX (client):** when horse roll ≤ baseline, stake card shows **Make-up: $X**; session list hides **Your share**; session attribution assigns full session W/L to backers (player economic share $0 until above baseline). **`pokerSessionAttribution.js`**, **`PokerBankrollTracker.jsx`**.
- **2026-08-04:** **Backer MTM underwater (client):** when horse roll ≤ baseline, **Your stake MTM** and portfolio use full action-weighted roll (backers bear makeup losses; profit split applies only above baseline). Fixes 50/50 split incorrectly applied to underwater drawdown. **`pokerStableBackerMath.js`**. Alerts/push for **`stakee_accepted`** + **`session_complete`** open Stable tab only (no auto deal detail sheet). Guest stakee claim copy → "play on a stake on EdgeTilt's Poker Bankroll Manager."
- **2026-08-05:** **At-risk ROI fix (client):** hero **At-risk ROI** = `(Stakes MTM − At risk) / At risk` on **open** horses only ... not lifetime session share from closed stakes. **`pokerStableBackerMath.js`**.
- **2026-08-05:** **Closed stake review → commit before archive (client):** player **Review** / closed-stake sheet waits for pending close/periodic **Commit** sync before archive. **`PokerBankrollTracker.jsx`**.
- **2026-08-05:** **Backer closed horse carousel (client + SQL):** migration **`20260805120000`** — `poker_stable_deal_slices.stable_archived_at` + **`poker_stable_backer_archive_stable_deal`**; closed stakes stay in horse carousel until backer **Archive stake** (parity with stakee Bankroll). **`partitionBackerDeals`**, **`PokerStableHorseCarousel`**, **`PokerStableClosedHorseHeroBanner.jsx`**. Apply SQL on test + prod before smoke.
- **2026-08-05:** **Settle/commit deep links (client + push):** stakee Alerts/push + post-**Commit** navigation → **Poker Bankroll** (`pokerStableActivityTabForViewer`, **`LoungeNotificationsPanel`**, **`AppShell`** `onSynced`); backers unchanged → Stable. **`lounge-send-activity-push`** fetches `stakee_user_id` for role-routed events. Redeploy Edge on test + prod.
- **2026-08-04:** **Unified stake live gate (client):** **`stakeDealIsLiveForStakee`** — same rule every path (player offer, backer offer, syndicate): stake is live only when **player accepted + at least one backer accepted** (`deal.status === 'active'` or pending with both sides). Drives Bankroll badge/sessions/sold action, backer deployed vs pending-hold capital, and portfolio MTM. Initiation direction only changes who accepts first and guest email rails. **`pokerStableMath.js`**, **`pokerStableBackerMath.js`**, **`pokerSessionAttribution.js`**, **`PokerBankrollTracker.jsx`**.
- **2026-08-04:** **Pending deal roll profile + Stable MTM (test + prod):** migration **`20260804230000`** — maintain **`poker_deal_bankroll_profiles`** for player-created stakes once a backer accepts (deal may stay **`pending`**); session trigger refreshes roll; backfill activates stuck deals; RLS allows stakee roll bootstrap while **`pending`**. Client uses session-derived roll when profile row missing (**`pokerStableBackerMath.js`**).
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
- **2026-08-01:** Stake terms view/edit: **Terms** on Bankroll stake cards + Stable invites; player edits pending deals directly; backer **Edit terms** stores a proposal until the player accepts (`pending_terms_json`, `20260801130000`).
- **2026-08-01:** Pending stake sessions: player may **Start Session** / log past on pending deals; sessions attach to `deal_id` immediately; stake bankroll profile bootstraps on accept with starting roll + logged P/L; backers see sessions in Stable after accept (`20260801110000`).
- **2026-08-01:** Stable filters: player **+ Stake** deals no longer appear on Stable for the stakee; invite cards use amber chrome (not cyan).
- **2026-08-01:** Post-create stake UX: pending player deals appear on Bankroll carousel; success banner after **Create stake**; push/in-app backer alerts still **v2c**.
- **2026-08-01:** UX pivot: player **`+ Stake`** + stake carousel on Poker Bankroll; Stable backer-only (**Request horse** full form + syndicate slices); `requestBackingDeal` API; removed Personal/On Stake toggle.
- **2026-08-01:** Spec distilled from Ryan + Theo design session; v2 foundation build started.
