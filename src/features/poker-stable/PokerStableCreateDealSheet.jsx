import { useState } from 'react'
import { APP_MODAL_OVERLAY_CLASS, APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
import { triggerTapHapticLight } from '../../utils/tapHaptic.js'
import { createBackingDeal, lookupProfileByHandle } from './pokerStableApi.js'

const EMPTY_SLICE = {
  handle: '',
  guestLabel: '',
  isGuest: false,
  actionPct: '25',
  pricingMode: 'profit_split',
  playerProfitPct: '70',
  markupRate: '1.2',
  rakebackMode: 'all_to_stake',
  rakebackPlayerPct: '40',
}

/**
 * Player creates a cash backing deal with one or more slices.
 */
export default function PokerStableCreateDealSheet({
  supabaseClient,
  userId,
  saving,
  onSavingChange,
  onClose,
  onCreated,
  onError,
}) {
  const [label, setLabel] = useState('')
  const [baseline, setBaseline] = useState('100000')
  const [isMigration, setIsMigration] = useState(false)
  const [startingRoll, setStartingRoll] = useState('')
  const [stakeWidePl, setStakeWidePl] = useState('')
  const [lifetimePl, setLifetimePl] = useState('')
  const [slices, setSlices] = useState([{ ...EMPTY_SLICE }])

  function updateSlice(idx, patch) {
    setSlices((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  function addSlice() {
    setSlices((prev) => [...prev, { ...EMPTY_SLICE }])
  }

  function removeSlice(idx) {
    setSlices((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)))
  }

  async function submit() {
    if (!supabaseClient || !userId) return
    onSavingChange(true)
    onError('')
    try {
      const parsedSlices = []
      for (const sl of slices) {
        const actionPct = Number(sl.actionPct)
        if (!Number.isFinite(actionPct) || actionPct <= 0 || actionPct > 100) {
          throw new Error('Each slice needs action % between 1 and 100.')
        }
        if (sl.isGuest) {
          if (!sl.guestLabel.trim()) throw new Error('Guest slices need a name.')
          parsedSlices.push({
            counterpartyKind: 'guest',
            guestLabel: sl.guestLabel.trim(),
            actionPct,
            pricingMode: sl.pricingMode,
            playerProfitPct:
              sl.pricingMode === 'profit_split' ? Number(sl.playerProfitPct) : undefined,
            markupRate: sl.pricingMode === 'markup' ? Number(sl.markupRate) : undefined,
            rakebackMode: sl.rakebackMode,
            rakebackPlayerPct:
              sl.rakebackMode === 'custom' ? Number(sl.rakebackPlayerPct) : undefined,
          })
          continue
        }
        const { profile, error: lookErr } = await lookupProfileByHandle(supabaseClient, sl.handle)
        if (lookErr) throw lookErr
        if (!profile) throw new Error(`No Edge user for @${sl.handle}.`)
        if (profile.user_id === userId) throw new Error('You cannot add yourself as a backer.')
        parsedSlices.push({
          counterpartyKind: 'user',
          stakerUserId: profile.user_id,
          actionPct,
          pricingMode: sl.pricingMode,
          playerProfitPct:
            sl.pricingMode === 'profit_split' ? Number(sl.playerProfitPct) : undefined,
          markupRate: sl.pricingMode === 'markup' ? Number(sl.markupRate) : undefined,
          rakebackMode: sl.rakebackMode,
          rakebackPlayerPct:
            sl.rakebackMode === 'custom' ? Number(sl.rakebackPlayerPct) : undefined,
        })
      }

      const { error } = await createBackingDeal(supabaseClient, {
        stakeeUserId: userId,
        dealType: 'cash_backing',
        label,
        baselineBankroll: Number(baseline),
        startingRoll: isMigration && startingRoll ? Number(startingRoll) : Number(baseline),
        isMigration,
        stakeWideStartingPl: stakeWidePl ? Number(stakeWidePl) : null,
        lifetimePlDisplay: lifetimePl ? Number(lifetimePl) : null,
        slices: parsedSlices,
        activate: parsedSlices.every((s) => s.counterpartyKind === 'guest'),
      })
      if (error) throw error
      triggerTapHapticLight()
      onCreated()
      onClose()
    } catch (e) {
      onError(e?.message || 'Could not create deal.')
    } finally {
      onSavingChange(false)
    }
  }

  return (
    <div
      className={`${APP_MODAL_OVERLAY_CLASS} overflow-x-hidden`}
      onClick={onClose}
    >
      <div
        data-poker-stable-sheet
        className={`relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto ${APP_MODAL_SHEET_PANEL_CLASS}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">New backing deal</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-1.5 text-sm font-semibold text-zinc-400 touch-manipulation"
          >
            Cancel
          </button>
        </div>

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Deal label
        </label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. $10/20 backing"
          className="mb-3 w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white outline-none focus:ring-2 focus:ring-amber-500/40"
        />

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Baseline stake ($)
        </label>
        <input
          value={baseline}
          onChange={(e) => setBaseline(e.target.value)}
          inputMode="decimal"
          className="mb-3 w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white outline-none focus:ring-2 focus:ring-amber-500/40"
        />

        <label className="mb-3 flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={isMigration}
            onChange={(e) => setIsMigration(e.target.checked)}
            className="rounded"
          />
          Migrating an existing deal
        </label>

        {isMigration ? (
          <>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Current roll ($)
            </label>
            <input
              value={startingRoll}
              onChange={(e) => setStartingRoll(e.target.value)}
              placeholder="Same as baseline if empty"
              inputMode="decimal"
              className="mb-3 w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white outline-none focus:ring-2 focus:ring-amber-500/40"
            />
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Stake-wide starting P/L ($, optional)
            </label>
            <input
              value={stakeWidePl}
              onChange={(e) => setStakeWidePl(e.target.value)}
              placeholder="Negative = makeup, split pro-rata"
              inputMode="decimal"
              className="mb-3 w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white outline-none focus:ring-2 focus:ring-amber-500/40"
            />
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Lifetime P/L display ($, optional)
            </label>
            <input
              value={lifetimePl}
              onChange={(e) => setLifetimePl(e.target.value)}
              inputMode="decimal"
              className="mb-4 w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white outline-none focus:ring-2 focus:ring-amber-500/40"
            />
          </>
        ) : null}

        <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
          Backer slices
        </h4>
        <div className="mb-4 space-y-3">
          {slices.map((sl, idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-zinc-700 bg-zinc-900/60 p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-zinc-500">Slice {idx + 1}</span>
                {slices.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeSlice(idx)}
                    className="text-xs font-semibold text-rose-400"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <label className="mb-2 flex items-center gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={sl.isGuest}
                  onChange={(e) => updateSlice(idx, { isGuest: e.target.checked })}
                />
                Guest backer
              </label>
              {sl.isGuest ? (
                <input
                  value={sl.guestLabel}
                  onChange={(e) => updateSlice(idx, { guestLabel: e.target.value })}
                  placeholder="Guest name"
                  className="mb-2 w-full min-h-10 rounded-xl bg-zinc-800 px-3 text-sm text-white outline-none"
                />
              ) : (
                <input
                  value={sl.handle}
                  onChange={(e) => updateSlice(idx, { handle: e.target.value })}
                  placeholder="@handle"
                  autoCapitalize="none"
                  className="mb-2 w-full min-h-10 rounded-xl bg-zinc-800 px-3 text-sm text-white outline-none"
                />
              )}
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={sl.actionPct}
                  onChange={(e) => updateSlice(idx, { actionPct: e.target.value })}
                  placeholder="Action %"
                  inputMode="decimal"
                  className="min-h-10 rounded-xl bg-zinc-800 px-3 text-sm text-white outline-none"
                />
                <select
                  value={sl.pricingMode}
                  onChange={(e) => updateSlice(idx, { pricingMode: e.target.value })}
                  className="min-h-10 rounded-xl bg-zinc-800 px-3 text-sm text-white outline-none"
                >
                  <option value="profit_split">Profit split</option>
                  <option value="markup">Markup</option>
                </select>
              </div>
              {sl.pricingMode === 'profit_split' ? (
                <input
                  value={sl.playerProfitPct}
                  onChange={(e) => updateSlice(idx, { playerProfitPct: e.target.value })}
                  placeholder="Player profit % (e.g. 70)"
                  inputMode="decimal"
                  className="mt-2 w-full min-h-10 rounded-xl bg-zinc-800 px-3 text-sm text-white outline-none"
                />
              ) : (
                <input
                  value={sl.markupRate}
                  onChange={(e) => updateSlice(idx, { markupRate: e.target.value })}
                  placeholder="Markup rate (e.g. 1.2)"
                  inputMode="decimal"
                  className="mt-2 w-full min-h-10 rounded-xl bg-zinc-800 px-3 text-sm text-white outline-none"
                />
              )}
              <select
                value={sl.rakebackMode}
                onChange={(e) => updateSlice(idx, { rakebackMode: e.target.value })}
                className="mt-2 w-full min-h-10 rounded-xl bg-zinc-800 px-3 text-sm text-white outline-none"
              >
                <option value="all_to_stake">Rakeback: 100% to stake</option>
                <option value="custom">Rakeback: custom split</option>
                <option value="disabled">Rakeback: disabled</option>
              </select>
              {sl.rakebackMode === 'custom' ? (
                <input
                  value={sl.rakebackPlayerPct}
                  onChange={(e) => updateSlice(idx, { rakebackPlayerPct: e.target.value })}
                  placeholder="Player rakeback %"
                  inputMode="decimal"
                  className="mt-2 w-full min-h-10 rounded-xl bg-zinc-800 px-3 text-sm text-white outline-none"
                />
              ) : null}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addSlice}
          className="mb-4 w-full rounded-2xl border border-dashed border-zinc-600 py-2.5 text-sm font-semibold text-zinc-400 touch-manipulation"
        >
          + Add backer slice
        </button>

        <button
          type="button"
          disabled={saving}
          onClick={() => void submit()}
          data-poker-stable-primary-btn
          className="w-full rounded-3xl bg-amber-600 py-3.5 text-base font-bold text-white touch-manipulation active:bg-amber-500 disabled:opacity-50"
        >
          {saving ? 'Creating…' : 'Create deal'}
        </button>
      </div>
    </div>
  )
}
