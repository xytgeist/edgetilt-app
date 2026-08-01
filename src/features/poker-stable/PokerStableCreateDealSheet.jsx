import { useState } from 'react'
import { APP_MODAL_OVERLAY_CLASS, APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
import { triggerTapHapticLight } from '../../utils/tapHaptic.js'
import EdgeHandleTypeahead from './EdgeHandleTypeahead.jsx'
import { createBackingDeal, lookupProfileByHandle, requestBackingDeal } from './pokerStableApi.js'

function DollarInput({ value, onChange, placeholder, allowNegative = false, className = 'mb-3' }) {
  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-semibold text-zinc-400">
        $
      </span>
      <input
        type="text"
        inputMode={allowNegative ? 'text' : 'decimal'}
        value={value}
        onChange={(e) => {
          const raw = e.target.value
          if (allowNegative) {
            const cleaned = raw.replace(/[^0-9.\-]/g, '').replace(/(?!^)-/g, '')
            onChange(cleaned)
          } else {
            onChange(raw.replace(/[^0-9.]/g, ''))
          }
        }}
        placeholder={placeholder}
        className="w-full min-h-12 rounded-2xl bg-zinc-800 pl-8 pr-4 font-semibold text-white outline-none focus:ring-2 focus:ring-amber-500/40"
      />
    </div>
  )
}

const EMPTY_SLICE = {
  handle: '',
  selectedProfile: null,
  guestLabel: '',
  isGuest: false,
  actionPct: '',
  pricingMode: 'profit_split',
  playerProfitPct: '',
  markupRate: '',
  rakebackMode: 'disabled',
  rakebackPlayerPct: '',
}

async function resolveUserSlice(supabaseClient, sl, userId, { allowSelf = false } = {}) {
  const actionPct = Number(sl.actionPct)
  if (!Number.isFinite(actionPct) || actionPct <= 0 || actionPct > 100) {
    throw new Error('Each slice needs action % between 1 and 100.')
  }
  if (sl.pricingMode === 'profit_split') {
    const playerProfitPct = Number(sl.playerProfitPct)
    if (!Number.isFinite(playerProfitPct) || playerProfitPct <= 0 || playerProfitPct > 100) {
      throw new Error('Each profit-split slice needs player profit % between 1 and 100.')
    }
  } else {
    const markupRate = Number(sl.markupRate)
    if (!Number.isFinite(markupRate) || markupRate <= 0) {
      throw new Error('Each markup slice needs a markup rate.')
    }
  }
  if (sl.rakebackMode === 'custom') {
    const rakebackPlayerPct = Number(sl.rakebackPlayerPct)
    if (!Number.isFinite(rakebackPlayerPct) || rakebackPlayerPct < 0 || rakebackPlayerPct > 100) {
      throw new Error('Custom rakeback slices need player rakeback % between 0 and 100.')
    }
  }
  if (sl.isGuest) {
    if (!sl.guestLabel.trim()) throw new Error('Guest slices need a name.')
    return {
      counterpartyKind: 'guest',
      guestLabel: sl.guestLabel.trim(),
      actionPct,
      pricingMode: sl.pricingMode,
      playerProfitPct: sl.pricingMode === 'profit_split' ? Number(sl.playerProfitPct) : undefined,
      markupRate: sl.pricingMode === 'markup' ? Number(sl.markupRate) : undefined,
      rakebackMode: sl.rakebackMode,
      rakebackPlayerPct: sl.rakebackMode === 'custom' ? Number(sl.rakebackPlayerPct) : undefined,
    }
  }
  const { profile, error: lookErr } = sl.selectedProfile
    ? { profile: sl.selectedProfile, error: null }
    : sl.stakerUserId
      ? { profile: { user_id: sl.stakerUserId }, error: null }
      : await lookupProfileByHandle(supabaseClient, sl.handle)
  if (lookErr) throw lookErr
  if (!profile?.user_id) throw new Error(`No Edge user for @${sl.handle}.`)
  if (!allowSelf && profile.user_id === userId) throw new Error('You cannot add yourself as a backer.')
  return {
    counterpartyKind: 'user',
    stakerUserId: profile.user_id,
    actionPct,
    pricingMode: sl.pricingMode,
    playerProfitPct: sl.pricingMode === 'profit_split' ? Number(sl.playerProfitPct) : undefined,
    markupRate: sl.pricingMode === 'markup' ? Number(sl.markupRate) : undefined,
    rakebackMode: sl.rakebackMode,
    rakebackPlayerPct: sl.rakebackMode === 'custom' ? Number(sl.rakebackPlayerPct) : undefined,
  }
}

function SliceEditor({
  sl,
  idx,
  userId,
  supabaseClient,
  onChange,
  onRemove,
  canRemove,
  title,
  lockUserId = null,
}) {
  return (
    <div className="rounded-2xl border border-zinc-700 bg-zinc-900/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold uppercase text-zinc-500">{title || `Slice ${idx + 1}`}</span>
        {canRemove ? (
          <button type="button" onClick={onRemove} className="text-xs font-semibold text-rose-400">
            Remove
          </button>
        ) : null}
      </div>
      {!lockUserId ? (
        <>
          <label className="mb-2 flex items-center gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={sl.isGuest}
              onChange={(e) => onChange({ isGuest: e.target.checked })}
            />
            Guest backer
          </label>
          {sl.isGuest ? (
            <input
              value={sl.guestLabel}
              onChange={(e) => onChange({ guestLabel: e.target.value })}
              placeholder="Guest name"
              className="mb-2 w-full min-h-10 rounded-xl bg-zinc-800 px-3 text-sm text-white outline-none"
            />
          ) : (
            <div className="mb-2">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Edge handle
              </label>
              <EdgeHandleTypeahead
                supabaseClient={supabaseClient}
                excludeUserId={userId}
                value={sl.handle}
                onChange={(next) => onChange({ handle: next, selectedProfile: null })}
                onSelectProfile={(profile) => {
                  if (!profile) return
                  onChange({
                    handle: String(profile.handle || '').replace(/^@+/, ''),
                    selectedProfile: profile,
                  })
                }}
                selectedProfile={sl.selectedProfile}
                inputClassName="w-full min-h-10 rounded-xl bg-zinc-800 px-3 text-sm text-white outline-none focus:ring-2 focus:ring-amber-500/40"
              />
            </div>
          )}
        </>
      ) : (
        <p className="mb-2 text-sm text-zinc-400">Your backing slice (you)</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <input
          value={sl.actionPct}
          onChange={(e) => onChange({ actionPct: e.target.value })}
          placeholder="Action %"
          inputMode="decimal"
          className="min-h-10 rounded-xl bg-zinc-800 px-3 text-sm text-white outline-none"
        />
        <select
          value={sl.pricingMode}
          onChange={(e) => onChange({ pricingMode: e.target.value })}
          className="min-h-10 rounded-xl bg-zinc-800 px-3 text-sm text-white outline-none"
        >
          <option value="profit_split">Profit split</option>
          <option value="markup">Markup</option>
        </select>
      </div>
      {sl.pricingMode === 'profit_split' ? (
        <input
          value={sl.playerProfitPct}
          onChange={(e) => onChange({ playerProfitPct: e.target.value })}
          placeholder="Player profit % (e.g. 70)"
          inputMode="decimal"
          className="mt-2 w-full min-h-10 rounded-xl bg-zinc-800 px-3 text-sm text-white outline-none"
        />
      ) : (
        <input
          value={sl.markupRate}
          onChange={(e) => onChange({ markupRate: e.target.value })}
          placeholder="Markup rate (e.g. 1.2)"
          inputMode="decimal"
          className="mt-2 w-full min-h-10 rounded-xl bg-zinc-800 px-3 text-sm text-white outline-none"
        />
      )}
      <select
        value={sl.rakebackMode}
        onChange={(e) => onChange({ rakebackMode: e.target.value })}
        className="mt-2 w-full min-h-10 rounded-xl bg-zinc-800 px-3 text-sm text-white outline-none"
      >
        <option value="all_to_stake">Rakeback: 100% to stake</option>
        <option value="custom">Rakeback: custom split</option>
        <option value="disabled">Rakeback: disabled</option>
      </select>
      {sl.rakebackMode === 'custom' ? (
        <input
          value={sl.rakebackPlayerPct}
          onChange={(e) => onChange({ rakebackPlayerPct: e.target.value })}
          placeholder="Player rakeback %"
          inputMode="decimal"
          className="mt-2 w-full min-h-10 rounded-xl bg-zinc-800 px-3 text-sm text-white outline-none"
        />
      ) : null}
    </div>
  )
}

export function PokerStablePlayerDealSheet(props) {
  return <PokerStableDealFormSheet mode="player" {...props} />
}

export function PokerStableBackerDealSheet(props) {
  return <PokerStableDealFormSheet mode="backer" {...props} />
}

export default function PokerStableCreateDealSheet(props) {
  return <PokerStableDealFormSheet mode="player" {...props} />
}

function PokerStableDealFormSheet({
  mode = 'player',
  supabaseClient,
  userId,
  saving,
  onSavingChange,
  onClose,
  onCreated,
  onError,
}) {
  const isBacker = mode === 'backer'
  const [label, setLabel] = useState('')
  const [baseline, setBaseline] = useState('')
  const [isMigration, setIsMigration] = useState(false)
  const [startingRoll, setStartingRoll] = useState('')
  const [stakeWidePl, setStakeWidePl] = useState('')
  const [lifetimePl, setLifetimePl] = useState('')
  const [playerHandle, setPlayerHandle] = useState('')
  const [selectedPlayerProfile, setSelectedPlayerProfile] = useState(null)
  const [mySlice, setMySlice] = useState({ ...EMPTY_SLICE, stakerUserId: userId })
  const [friendSlices, setFriendSlices] = useState([])
  const [slices, setSlices] = useState([{ ...EMPTY_SLICE }])

  function updateSlice(idx, patch) {
    setSlices((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  function updateFriendSlice(idx, patch) {
    setFriendSlices((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  async function submit() {
    if (!supabaseClient || !userId) return
    onSavingChange(true)
    onError('')
    try {
      let createdDeal = null
      if (isBacker) {
        const { profile, error: lookErr } = selectedPlayerProfile
          ? { profile: selectedPlayerProfile, error: null }
          : await lookupProfileByHandle(supabaseClient, playerHandle)
        if (lookErr) throw lookErr
        if (!profile?.user_id) throw new Error('Pick a player by Edge handle.')
        if (profile.user_id === userId) throw new Error('You cannot stake yourself.')

        const allSlices = [
          await resolveUserSlice(
            supabaseClient,
            { ...mySlice, stakerUserId: userId, handle: '', selectedProfile: null },
            userId,
            { allowSelf: true },
          ),
        ]
        for (const sl of friendSlices) {
          allSlices.push(await resolveUserSlice(supabaseClient, sl, userId))
        }

        const { error } = await requestBackingDeal(supabaseClient, {
          stakerUserId: userId,
          stakeeUserId: profile.user_id,
          label,
          baselineBankroll: Number(baseline) || 0,
          slices: allSlices,
        })
        if (error) throw error
      } else {
        const baselineAmount = Number(baseline)
        if (!baseline.trim() || !Number.isFinite(baselineAmount) || baselineAmount <= 0) {
          throw new Error('Enter a baseline stake.')
        }
        const parsedSlices = []
        for (const sl of slices) {
          parsedSlices.push(await resolveUserSlice(supabaseClient, sl, userId))
        }
        const { deal, error } = await createBackingDeal(supabaseClient, {
          stakeeUserId: userId,
          dealType: 'cash_backing',
          label,
          baselineBankroll: baselineAmount,
          startingRoll: isMigration && startingRoll ? Number(startingRoll) : baselineAmount,
          isMigration,
          stakeWideStartingPl: stakeWidePl ? Number(stakeWidePl) : null,
          lifetimePlDisplay: lifetimePl ? Number(lifetimePl) : null,
          slices: parsedSlices,
          activate: parsedSlices.every((s) => s.counterpartyKind === 'guest'),
        })
        if (error) throw error
        createdDeal = deal
      }
      triggerTapHapticLight()
      onCreated?.(createdDeal)
      onClose()
    } catch (e) {
      onError(e?.message || 'Could not save deal.')
    } finally {
      onSavingChange(false)
    }
  }

  const title = isBacker ? 'Request horse' : 'New stake deal'
  const submitLabel = isBacker ? 'Send request' : 'Create stake'

  return (
    <div className={`${APP_MODAL_OVERLAY_CLASS} overflow-x-hidden`} onClick={onClose}>
      <div
        data-poker-stable-sheet
        className={`relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto ${APP_MODAL_SHEET_PANEL_CLASS}`}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-1.5 text-sm font-semibold text-zinc-400 touch-manipulation"
          >
            Cancel
          </button>
        </div>

        {isBacker ? (
          <>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Player handle
            </label>
            <div className="mb-3">
              <EdgeHandleTypeahead
                supabaseClient={supabaseClient}
                excludeUserId={userId}
                value={playerHandle}
                onChange={(next) => {
                  setPlayerHandle(next)
                  setSelectedPlayerProfile(null)
                }}
                onSelectProfile={setSelectedPlayerProfile}
                selectedProfile={selectedPlayerProfile}
                autoFocus
              />
            </div>
          </>
        ) : null}

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Deal label
        </label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={isBacker ? 'e.g. 50/50 makeup' : 'e.g. $10/20 backing'}
          className="mb-3 w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white outline-none focus:ring-2 focus:ring-amber-500/40"
        />

        {!isBacker ? (
          <>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Baseline stake
            </label>
            <DollarInput
              value={baseline}
              onChange={setBaseline}
              placeholder="100,000"
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
          </>
        ) : (
          <>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Proposed baseline (optional)
            </label>
            <DollarInput
              value={baseline}
              onChange={setBaseline}
              placeholder="Player sets roll on accept if empty"
              className="mb-4"
            />
            <p className="mb-4 text-[12px] leading-relaxed text-zinc-500">
              They get an incoming request. After accept, their stake bankroll appears in Poker
              Bankroll… you sync that roll here in Stable.
            </p>
          </>
        )}

        <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
          {isBacker ? 'Your backing slice' : 'Backer slices'}
        </h4>
        <div className="mb-4 space-y-3">
          {isBacker ? (
            <>
              <SliceEditor
                sl={mySlice}
                idx={0}
                userId={userId}
                supabaseClient={supabaseClient}
                lockUserId={userId}
                title="Your slice"
                canRemove={false}
                onChange={(patch) => setMySlice((prev) => ({ ...prev, ...patch }))}
              />
              {friendSlices.map((sl, idx) => (
                <SliceEditor
                  key={idx}
                  sl={sl}
                  idx={idx + 1}
                  userId={userId}
                  supabaseClient={supabaseClient}
                  title={`Syndicate slice ${idx + 1}`}
                  canRemove
                  onChange={(patch) => updateFriendSlice(idx, patch)}
                  onRemove={() => setFriendSlices((prev) => prev.filter((_, i) => i !== idx))}
                />
              ))}
            </>
          ) : (
            slices.map((sl, idx) => (
              <SliceEditor
                key={idx}
                sl={sl}
                idx={idx}
                userId={userId}
                supabaseClient={supabaseClient}
                canRemove={slices.length > 1}
                onChange={(patch) => updateSlice(idx, patch)}
                onRemove={() => setSlices((prev) => prev.filter((_, i) => i !== idx))}
              />
            ))
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            if (isBacker) setFriendSlices((prev) => [...prev, { ...EMPTY_SLICE }])
            else setSlices((prev) => [...prev, { ...EMPTY_SLICE }])
          }}
          className="mb-4 w-full rounded-2xl border border-dashed border-zinc-600 py-2.5 text-sm font-semibold text-zinc-400 touch-manipulation"
        >
          {isBacker ? '+ Add syndicate backer' : '+ Add backer slice'}
        </button>

        <button
          type="button"
          disabled={saving}
          onClick={() => void submit()}
          data-poker-stable-primary-btn
          className="w-full rounded-3xl bg-amber-600 py-3.5 text-base font-bold text-white touch-manipulation active:bg-amber-500 disabled:opacity-50"
        >
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </div>
  )
}
