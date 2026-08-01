import { useMemo, useState } from 'react'
import PlayLogPartnerPickerModal from '../play-logbook/PlayLogPartnerPickerModal.jsx'
import { fmtPoker$ } from './pokerBankrollMath.js'
import {
  cancelTournamentSwap,
  emptyDraftSwap,
  markSwapPaid,
  setSwapSideManualResult,
  swapIsMarkedPaid,
  swapOtherPartyLabel,
  swapViewerRole,
} from './pokerTournamentSwapApi.js'
import {
  computeTournamentSwapSettlement,
  formatSwapIouLine,
  formatSwapSettledAmountLine,
  formatSwapSideResultLine,
  formatSwapWaitingStatus,
  parseSwapPct,
  swapViewerSettlementDelta,
} from './pokerTournamentSwapMath.js'

const FIELD =
  'w-full h-11 min-h-11 rounded-2xl bg-zinc-800 px-3 text-sm text-white outline-none focus:ring-2 focus:ring-cyan-500/40'

/**
 * Draft + saved swaps editor for tournament start / log / active / edit flows.
 *
 * @param {{
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   userId: string,
 *   enabled: boolean,
 *   draftSwaps: object[],
 *   onDraftSwapsChange: (next: object[]) => void,
 *   savedSwaps?: object[],
 *   profilesById?: Record<string, object>,
 *   onSavedSwapsMutated?: () => void,
 *   compact?: boolean,
 *   incomingAcceptSwap?: object | null,
 *   onDeclineIncomingAccept?: () => void,
 *   decliningIncoming?: boolean,
 *   onSendDraft?: (draft: object) => void | Promise<void>,
 *   sendingDrafts?: boolean,
 *   /** Max % of net the player can swap (100 minus stable backing sold). Default 100. */
 *   maxSwapGivePct?: number,
 * }} props
 */
export default function PokerTournamentSwapsSection({
  supabaseClient,
  userId,
  enabled,
  draftSwaps,
  onDraftSwapsChange,
  savedSwaps = [],
  profilesById = {},
  onSavedSwapsMutated,
  compact = false,
  incomingAcceptSwap = null,
  onDeclineIncomingAccept,
  decliningIncoming = false,
  onSendDraft,
  sendingDrafts = false,
  maxSwapGivePct = 100,
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  /** swapId → show manual payout fields */
  const [manualOpen, setManualOpen] = useState({})
  const [manualTheirBuyIn, setManualTheirBuyIn] = useState({})
  const [manualTheirPrize, setManualTheirPrize] = useState({})
  const [busyId, setBusyId] = useState('')
  const [localError, setLocalError] = useState('')

  const usedUserIds = useMemo(() => {
    const s = new Set()
    for (const d of draftSwaps) {
      if (d.counterparty_kind === 'user' && d.counterparty_user_id) {
        s.add(d.counterparty_user_id)
      }
    }
    for (const swap of savedSwaps) {
      if (swap.status === 'cancelled') continue
      if (swap.counterparty_user_id) s.add(swap.counterparty_user_id)
    }
    return s
  }, [draftSwaps, savedSwaps])

  /** Sum of % you give across draft + saved + pending incoming accept (your side). */
  const mySideTotalPct = useMemo(() => {
    let total = 0
    for (const d of draftSwaps) {
      const pct = parseSwapPct(d.pct_you_give)
      if (pct != null) total += pct
    }
    for (const swap of savedSwaps) {
      if (swap.status === 'cancelled') continue
      const role = swapViewerRole(swap, userId)
      const pct =
        role === 'counterparty'
          ? Number(swap.pct_counterparty_gives)
          : Number(swap.pct_creator_gives)
      if (Number.isFinite(pct)) total += pct
    }
    if (incomingAcceptSwap) {
      const pct = Number(incomingAcceptSwap.pct_counterparty_gives)
      if (Number.isFinite(pct)) total += pct
    }
    return Math.round(total * 1000) / 1000
  }, [draftSwaps, savedSwaps, incomingAcceptSwap, userId])

  const swapCapPct = useMemo(() => {
    const cap = Number(maxSwapGivePct)
    if (!Number.isFinite(cap)) return 100
    return Math.max(0, Math.min(100, Math.round(cap * 1000) / 1000))
  }, [maxSwapGivePct])

  const backingSoldPct = useMemo(
    () => Math.max(0, Math.round((100 - swapCapPct) * 1000) / 1000),
    [swapCapPct],
  )

  const remainingSwapPct = useMemo(
    () => Math.max(0, Math.round((swapCapPct - mySideTotalPct) * 1000) / 1000),
    [swapCapPct, mySideTotalPct],
  )

  const hasAnySwaps =
    draftSwaps.length > 0 || savedSwaps.length > 0 || Boolean(incomingAcceptSwap)
  const mySideOver = mySideTotalPct > swapCapPct
  const showSwapPctSummary = hasAnySwaps || backingSoldPct > 0
  const incomingOther = incomingAcceptSwap
    ? swapOtherPartyLabel(incomingAcceptSwap, profilesById, userId)
    : ''
  const incomingYouPct = incomingAcceptSwap
    ? Number(incomingAcceptSwap.pct_counterparty_gives)
    : null
  const incomingTheyPct = incomingAcceptSwap
    ? Number(incomingAcceptSwap.pct_creator_gives)
    : null

  if (!enabled) return null

  function updateDraft(localId, patch) {
    onDraftSwapsChange(
      draftSwaps.map((d) => (d.localId === localId ? { ...d, ...patch } : d)),
    )
  }

  function removeDraft(localId) {
    onDraftSwapsChange(draftSwaps.filter((d) => d.localId !== localId))
  }

  function addBlankGuestDraft() {
    onDraftSwapsChange([
      ...draftSwaps,
      {
        ...emptyDraftSwap(),
        counterparty_kind: 'guest',
        pct_you_give: '5',
        pct_they_give: '5',
      },
    ])
  }

  function onPickerConfirm({ profiles, guestLabels }) {
    const next = [...draftSwaps]
    for (const p of profiles || []) {
      if (usedUserIds.has(p.user_id || p.id)) continue
      next.push({
        ...emptyDraftSwap(),
        counterparty_kind: 'user',
        counterparty_user_id: p.user_id || p.id,
        counterparty_display_name: p.display_name || '',
        counterparty_handle: p.handle || '',
      })
    }
    for (const label of guestLabels || []) {
      next.push({
        ...emptyDraftSwap(),
        counterparty_kind: 'guest',
        counterparty_guest_label: label,
      })
    }
    onDraftSwapsChange(next)
  }

  async function onMarkPaid(swap, role) {
    if (!supabaseClient) return
    setBusyId(swap.id)
    setLocalError('')
    try {
      const { error } = await markSwapPaid(supabaseClient, swap.id, role, true)
      if (error) throw error
      onSavedSwapsMutated?.()
    } catch (e) {
      setLocalError(e?.message || 'Could not mark settled.')
    } finally {
      setBusyId('')
    }
  }

  async function onCancelSwap(swap) {
    if (!supabaseClient || !swap?.id) return
    const other = swapOtherPartyLabel(swap, profilesById, userId)
    const ok = window.confirm(
      `Cancel swap with ${other}? This cannot be undone (you can add a new swap after).`,
    )
    if (!ok) return
    setBusyId(swap.id)
    setLocalError('')
    try {
      const { error } = await cancelTournamentSwap(supabaseClient, swap.id)
      if (error) throw error
      onSavedSwapsMutated?.()
    } catch (e) {
      setLocalError(e?.message || 'Could not cancel swap.')
    } finally {
      setBusyId('')
    }
  }

  /** Enter the other party's buy-in/prize. Your side syncs when you end the session. */
  async function onSaveTheirManual(swap) {
    if (!supabaseClient) return
    const role = swapViewerRole(swap, userId) || 'creator'
    const side = role === 'creator' ? 'counterparty' : 'creator'
    const buyIn = parseFloat(manualTheirBuyIn[swap.id])
    const prize = parseFloat(manualTheirPrize[swap.id])
    if (!Number.isFinite(buyIn) || buyIn < 0 || !Number.isFinite(prize) || prize < 0) {
      setLocalError('Enter their buy-in and prize (cash out).')
      return
    }
    setBusyId(swap.id)
    setLocalError('')
    try {
      const { error } = await setSwapSideManualResult(
        supabaseClient,
        swap.id,
        side,
        buyIn,
        prize,
      )
      if (error) throw error
      onSavedSwapsMutated?.()
    } catch (e) {
      setLocalError(e?.message || 'Could not save manual result.')
    } finally {
      setBusyId('')
    }
  }

  return (
    <div
      className={
        compact
          ? 'mt-3'
          : 'mb-4 mt-1 rounded-2xl border border-emerald-500/40 bg-emerald-950/30 p-3 shadow-[inset_0_1px_0_0_rgba(52,211,153,0.12)]'
      }
      data-poker-tournament-swaps={compact ? 'compact' : 'featured'}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div
              className={
                compact
                  ? 'text-xs font-bold uppercase tracking-wide text-zinc-400'
                  : 'text-sm font-black uppercase tracking-wide text-emerald-300'
              }
            >
              Swaps
            </div>
            {!compact ? (
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-200">
                % deal
              </span>
            ) : null}
          </div>
          {!compact ? (
            <p className="mt-1 text-[12px] font-semibold leading-snug text-emerald-100/80">
              Split this tournament with a friend
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className={
              compact
                ? 'rounded-xl border border-zinc-600 bg-zinc-800/80 px-2.5 py-1 text-xs font-semibold text-zinc-200 touch-manipulation'
                : 'rounded-xl bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white touch-manipulation active:bg-emerald-500'
            }
          >
            + Edge user
          </button>
          <button
            type="button"
            onClick={addBlankGuestDraft}
            className={
              compact
                ? 'rounded-xl border border-zinc-600 bg-zinc-800/80 px-2.5 py-1 text-xs font-semibold text-zinc-200 touch-manipulation'
                : 'rounded-xl border border-emerald-400/45 bg-emerald-950/50 px-2.5 py-1.5 text-xs font-bold text-emerald-100 touch-manipulation active:bg-emerald-900/60'
            }
          >
            + Guest
          </button>
        </div>
      </div>
      <p
        className={`mb-2 text-[11px] leading-snug ${compact ? 'text-zinc-500' : 'text-emerald-100/55'}`}
      >
        Bilateral % of net (prize − buy-in). Busts owe $0 from that side. Settlement when both
        results are in.
      </p>

      {showSwapPctSummary ? (
        <div
          className={`mb-3 rounded-2xl border px-3 py-2 ${
            mySideOver
              ? 'border-rose-500/40 bg-rose-950/30'
              : compact
                ? 'border-zinc-700/70 bg-zinc-900/50'
                : 'border-emerald-500/25 bg-black/20'
          }`}
        >
          {backingSoldPct > 0 ? (
            <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-white/5 pb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                You keep (after backing)
              </span>
              <span className="text-sm font-bold tabular-nums text-zinc-200">{swapCapPct}%</span>
            </div>
          ) : null}
          {hasAnySwaps ? (
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Your side swapped
              </span>
              <span
                className={`text-base font-bold tabular-nums ${
                  mySideOver ? 'text-rose-300' : 'text-white'
                }`}
              >
                {mySideTotalPct}%
              </span>
            </div>
          ) : null}
          <div
            className={`flex items-baseline justify-between gap-2 ${
              hasAnySwaps ? 'mt-2 border-t border-white/5 pt-2' : ''
            }`}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Remaining to swap
            </span>
            <span
              className={`text-base font-bold tabular-nums ${
                mySideOver ? 'text-rose-300' : 'text-emerald-200'
              }`}
            >
              {remainingSwapPct}%
            </span>
          </div>
          {mySideOver ? (
            <p className="mt-1 text-[11px] text-rose-300/90">
              Over your limit ... max {swapCapPct}% is yours to swap
              {backingSoldPct > 0 ? ` (${backingSoldPct}% sold to backers)` : ''}.
            </p>
          ) : null}
        </div>
      ) : null}

      {!hasAnySwaps ? (
        <p
          className={`mb-1 text-sm ${compact ? 'text-zinc-500' : 'font-medium text-emerald-100/70'}`}
        >
          No swaps yet ... add someone above.
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {incomingAcceptSwap ? (
          <div
            data-poker-incoming-accept-card
            className="rounded-2xl border border-emerald-500/40 bg-emerald-950/40 p-3"
          >
            <div className="mb-1 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{incomingOther}</div>
                <div className="text-[11px] text-emerald-200/80">Incoming · attaches on Start</div>
              </div>
              <div className="shrink-0 text-sm font-bold tabular-nums text-emerald-200">
                {Number.isFinite(incomingYouPct) ? incomingYouPct : '?'}% ↔{' '}
                {Number.isFinite(incomingTheyPct) ? incomingTheyPct : '?'}%
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[11px] leading-snug text-zinc-400">
                You give {Number.isFinite(incomingYouPct) ? incomingYouPct : '?'}% · they give{' '}
                {Number.isFinite(incomingTheyPct) ? incomingTheyPct : '?'}%
              </p>
              {typeof onDeclineIncomingAccept === 'function' ? (
                <button
                  type="button"
                  disabled={decliningIncoming}
                  onClick={onDeclineIncomingAccept}
                  className="shrink-0 rounded-xl border border-rose-500/40 px-2.5 py-1 text-[11px] font-semibold text-rose-300 touch-manipulation active:bg-rose-950/40 disabled:opacity-50"
                >
                  Decline
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {draftSwaps.map((draft) => {
          const label =
            draft.counterparty_kind === 'guest'
              ? draft.counterparty_guest_label || 'Guest'
              : draft.counterparty_display_name ||
                (draft.counterparty_handle ? `@${draft.counterparty_handle}` : 'Edge user')
          const pctOk =
            parseSwapPct(draft.pct_you_give) != null &&
            parseSwapPct(draft.pct_they_give) != null
          const guestLabelOk =
            draft.counterparty_kind !== 'guest' ||
            Boolean(String(draft.counterparty_guest_label || '').trim())
          const edgeUserOk =
            draft.counterparty_kind !== 'user' || Boolean(draft.counterparty_user_id)
          const canSend =
            typeof onSendDraft === 'function' &&
            pctOk &&
            guestLabelOk &&
            edgeUserOk &&
            !mySideOver
          return (
            <div
              key={draft.localId}
              className="rounded-2xl border border-zinc-700/80 bg-zinc-900/70 p-3"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{label}</div>
                  <div className="text-[11px] text-zinc-500">
                    {draft.counterparty_kind === 'guest' ? 'Guest' : 'Edge'} · draft
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeDraft(draft.localId)}
                  className="text-xs text-zinc-500 touch-manipulation active:text-rose-300"
                >
                  Remove
                </button>
              </div>

              {draft.counterparty_kind === 'guest' ? (
                <div className="mb-2 grid grid-cols-1 gap-2">
                  <input
                    className={FIELD}
                    placeholder="Name"
                    value={draft.counterparty_guest_label}
                    onChange={(e) =>
                      updateDraft(draft.localId, {
                        counterparty_guest_label: e.target.value,
                      })
                    }
                  />
                  <input
                    className={FIELD}
                    placeholder="Phone (optional SMS)"
                    inputMode="tel"
                    value={draft.counterparty_guest_phone}
                    onChange={(e) =>
                      updateDraft(draft.localId, {
                        counterparty_guest_phone: e.target.value,
                      })
                    }
                  />
                  <input
                    className={FIELD}
                    placeholder="Email (optional)"
                    inputMode="email"
                    value={draft.counterparty_guest_email}
                    onChange={(e) =>
                      updateDraft(draft.localId, {
                        counterparty_guest_email: e.target.value,
                      })
                    }
                  />
                  <p className="text-[11px] leading-snug text-zinc-500">
                    Phone/email optional ... only used to notify them of the swap.
                  </p>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase text-zinc-500">
                    You give %
                  </span>
                  <input
                    className={FIELD}
                    inputMode="decimal"
                    value={draft.pct_you_give}
                    onChange={(e) =>
                      updateDraft(draft.localId, { pct_you_give: e.target.value })
                    }
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase text-zinc-500">
                    They give %
                  </span>
                  <input
                    className={FIELD}
                    inputMode="decimal"
                    value={draft.pct_they_give}
                    onChange={(e) =>
                      updateDraft(draft.localId, { pct_they_give: e.target.value })
                    }
                  />
                </label>
              </div>
              {!pctOk ? (
                <p className="mt-1 text-[11px] text-rose-400">Percents must be 0–100.</p>
              ) : null}
              {draft.counterparty_kind === 'guest' && pctOk && !guestLabelOk ? (
                <p className="mt-1 text-[11px] text-rose-400">Enter a guest name.</p>
              ) : null}
              {typeof onSendDraft === 'function' ? (
                <button
                  type="button"
                  disabled={sendingDrafts || !canSend}
                  onClick={() => void onSendDraft(draft)}
                  className="mt-2.5 w-full rounded-2xl bg-emerald-600 py-2.5 text-sm font-bold text-white touch-manipulation active:bg-emerald-500 disabled:opacity-50"
                >
                  {sendingDrafts ? 'Sending…' : 'Send swap'}
                </button>
              ) : null}
            </div>
          )
        })}

        {savedSwaps
          .filter((swap) => swap.status !== 'cancelled')
          .map((swap) => {
          const role = swapViewerRole(swap, userId) || 'creator'
          const other = swapOtherPartyLabel(swap, profilesById, userId)
          const creatorReady = Boolean(swap.creator_result_ready)
          const cpReady = Boolean(swap.counterparty_result_ready)
          const bothReady = creatorReady && cpReady
          const settlementPreview = bothReady
            ? computeTournamentSwapSettlement({
                creatorPrize: swap.creator_prize,
                creatorBuyIn: swap.creator_buy_in,
                counterpartyPrize: swap.counterparty_prize,
                counterpartyBuyIn: swap.counterparty_buy_in,
                pctCreatorGives: swap.pct_creator_gives,
                pctCounterpartyGives: swap.pct_counterparty_gives,
              })
            : null
          const primaryStatus =
            swap.status === 'settled'
              ? formatSwapIouLine(swap.settlement_amount, role, other, fmtPoker$)
              : bothReady
                ? formatSwapIouLine(
                    settlementPreview?.settlementAmount,
                    role,
                    other,
                    fmtPoker$,
                  )
                : formatSwapWaitingStatus(swap, role, other)
          const otherSide = role === 'creator' ? 'counterparty' : 'creator'
          const otherReady = role === 'creator' ? cpReady : creatorReady
          const otherResultLine =
            otherReady && swap.status !== 'settled'
              ? formatSwapSideResultLine(swap, otherSide, other, fmtPoker$)
              : null
          const paid = swapIsMarkedPaid(swap)
          const signed = swapViewerSettlementDelta(swap, role)
          const statusLine =
            swap.status === 'settled' && paid
              ? formatSwapSettledAmountLine(signed, fmtPoker$)
              : primaryStatus
          const canCancel = !paid
          const statusTone =
            swap.status === 'settled' && paid
              ? signed < -0.005
                ? 'text-rose-300'
                : 'text-emerald-100/90'
              : 'text-emerald-100/90'
          return (
            <div
              key={swap.id}
              className="rounded-2xl border border-emerald-500/25 bg-emerald-950/30 p-3"
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{other}</div>
                  <div className="text-[11px] text-zinc-400">
                    {swap.pct_creator_gives}% ↔ {swap.pct_counterparty_gives}% · {swap.status}
                  </div>
                </div>
                {canCancel ? (
                  <button
                    type="button"
                    disabled={busyId === swap.id}
                    onClick={() => void onCancelSwap(swap)}
                    className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-zinc-400 touch-manipulation hover:text-rose-300 active:text-rose-200 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
              {statusLine ? (
                <div className={`text-sm ${statusTone}`}>{statusLine}</div>
              ) : null}
              {otherResultLine && !bothReady ? (
                <div className="mt-0.5 text-[11px] text-zinc-400">{otherResultLine}</div>
              ) : null}
              {swap.status === 'settled' &&
              !paid &&
              Math.abs(Number(swap.settlement_amount) || 0) >= 0.005 ? (
                <button
                  type="button"
                  disabled={busyId === swap.id}
                  onClick={() => void onMarkPaid(swap, role)}
                  className="mt-2 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white touch-manipulation disabled:opacity-50"
                >
                  Mark settled
                </button>
              ) : null}

              {(() => {
                if (swap.status !== 'active' || bothReady) return null
                const accepted = Boolean(swap.counterparty_session_accepted_at)
                const isGuest = swap.counterparty_kind === 'guest'
                // Only their side is entered manually; your result syncs on session end.
                const needOther = !(role === 'creator' ? cpReady : creatorReady)
                if (!needOther) return null
                // Guests / not-yet-accepted: keep creator "enter their result" open by default.
                const forceOpen =
                  role === 'creator' && !cpReady && (isGuest || !accepted)
                const open = forceOpen || Boolean(manualOpen[swap.id])
                return (
                  <div className="mt-2">
                    {!open ? (
                      <button
                        type="button"
                        onClick={() =>
                          setManualOpen((m) => ({ ...m, [swap.id]: true }))
                        }
                        className="w-full rounded-xl border border-zinc-600/80 px-3 py-2 text-xs font-semibold text-zinc-300 touch-manipulation active:bg-zinc-800"
                      >
                        Enter their result manually…
                      </button>
                    ) : (
                      <div className="space-y-2 rounded-2xl border border-zinc-700/60 bg-black/20 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                            Their result
                          </div>
                          {!forceOpen ? (
                            <button
                              type="button"
                              onClick={() =>
                                setManualOpen((m) => ({ ...m, [swap.id]: false }))
                              }
                              className="text-[11px] font-semibold text-zinc-500 touch-manipulation"
                            >
                              Hide
                            </button>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            className={FIELD}
                            placeholder="Their buy-in"
                            inputMode="decimal"
                            value={manualTheirBuyIn[swap.id] ?? ''}
                            onChange={(e) =>
                              setManualTheirBuyIn((m) => ({
                                ...m,
                                [swap.id]: e.target.value,
                              }))
                            }
                          />
                          <input
                            className={FIELD}
                            placeholder="Their prize"
                            inputMode="decimal"
                            value={manualTheirPrize[swap.id] ?? ''}
                            onChange={(e) =>
                              setManualTheirPrize((m) => ({
                                ...m,
                                [swap.id]: e.target.value,
                              }))
                            }
                          />
                          <button
                            type="button"
                            disabled={busyId === swap.id}
                            onClick={() => void onSaveTheirManual(swap)}
                            className="col-span-2 rounded-xl border border-zinc-600 px-3 py-2 text-xs font-semibold text-zinc-200 touch-manipulation disabled:opacity-50"
                          >
                            Save their result
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          )
        })}
      </div>

      {localError ? <p className="mt-2 text-center text-sm text-rose-400">{localError}</p> : null}

      <PlayLogPartnerPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        supabaseClient={supabaseClient}
        userId={userId}
        usedUserIds={usedUserIds}
        onConfirm={onPickerConfirm}
        mode="directory"
        hideGuests
        title="Add Edge user"
      />
    </div>
  )
}
