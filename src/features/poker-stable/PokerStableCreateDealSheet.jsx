import { useLayoutEffect, useEffect, useRef, useState } from 'react'
import InField, { INFIELD_CONTROL } from '../../components/InField.jsx'
import MoneyInputField from '../../components/MoneyInputField.jsx'
import { APP_MODAL_OVERLAY_CLASS, APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
import { parseMoneyInputNumber } from '../../utils/moneyInputFormat.js'
import { triggerTapHapticLight } from '../../utils/tapHaptic.js'
import EdgeHandleTypeahead from './EdgeHandleTypeahead.jsx'
import { createBackingDeal, lookupProfileByHandle, requestBackingDeal, applyPendingDealTerms, proposePendingDealTerms } from './pokerStableApi.js'
import { buildTermsPayload, sliceRowToFormSlice } from './pokerStableTerms.js'
import {
  POKER_STABLE_TYPEAHEAD_RESERVE_PX,
  scrollPokerStableSliceIntoView,
  usePokerStableSheetKeyboardDismissScroll,
} from './pokerStableSheetScroll.js'
import {
  POKER_STABLE_SLICE_INNER_CLASS,
  pokerStableSliceCardClass,
  pokerStableSliceTitleClass,
  pokerStableBackerSliceLabel,
  pokerStableSliceToneAttr,
} from './pokerStableSliceTone.js'

const STABLE_INFIELD_FOCUS = 'focus-within:ring-2 focus-within:ring-amber-500/40'

const EMPTY_SLICE = {
  handle: '',
  selectedProfile: null,
  guestLabel: '',
  guestPhone: '',
  guestEmail: '',
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
      guestPhone: String(sl.guestPhone || '').trim() || undefined,
      guestEmail: String(sl.guestEmail || '').trim().toLowerCase() || undefined,
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
      : await lookupProfileByHandle(supabaseClient, sl.handle, { excludeUserId: userId })
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
  sliceIndex,
  userId,
  supabaseClient,
  onChange,
  onRemove,
  canRemove,
  title,
  lockUserId = null,
}) {
  return (
    <div
      data-poker-stable-slice={sliceIndex}
      data-poker-stable-slice-tone={pokerStableSliceToneAttr(sliceIndex)}
      className={pokerStableSliceCardClass(sliceIndex)}
    >
      <div className="mb-2 flex items-center justify-between">
        <span
          className={`text-xs font-black uppercase tracking-wide ${pokerStableSliceTitleClass(sliceIndex)}`}
        >
          {title || pokerStableBackerSliceLabel(1, idx)}
        </span>
        {canRemove ? (
          <button type="button" onClick={onRemove} className="text-xs font-semibold text-rose-400">
            Remove
          </button>
        ) : null}
      </div>
      <div className={POKER_STABLE_SLICE_INNER_CLASS}>
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
            <>
              <InField label="Guest name" className="mb-2" focusRingClass={STABLE_INFIELD_FOCUS}>
                <input
                  value={sl.guestLabel}
                  onChange={(e) => onChange({ guestLabel: e.target.value })}
                  placeholder="Name"
                  className={INFIELD_CONTROL}
                />
              </InField>
              <InField label="Phone (optional SMS)" className="mb-2" focusRingClass={STABLE_INFIELD_FOCUS}>
                <input
                  value={sl.guestPhone}
                  onChange={(e) => onChange({ guestPhone: e.target.value })}
                  placeholder="Phone (optional SMS)"
                  inputMode="tel"
                  autoComplete="tel"
                  className={INFIELD_CONTROL}
                />
              </InField>
              <InField label="Email (optional)" className="mb-2" focusRingClass={STABLE_INFIELD_FOCUS}>
                <input
                  value={sl.guestEmail}
                  onChange={(e) => onChange({ guestEmail: e.target.value })}
                  placeholder="Email (optional)"
                  inputMode="email"
                  autoComplete="email"
                  className={INFIELD_CONTROL}
                />
              </InField>
              <p className="mb-2 text-[11px] leading-snug text-zinc-500">
                Phone/email optional ... only used to notify them about this stake.
              </p>
            </>
          ) : (
            <div className="mb-2">
              <InField label="Edge handle" focusRingClass={STABLE_INFIELD_FOCUS}>
                <EdgeHandleTypeahead
                  supabaseClient={supabaseClient}
                  excludeUserId={userId}
                  value={sl.handle}
                  onChange={(next) => onChange({ handle: next, selectedProfile: null })}
                  onSelectProfile={(profile) => {
                    if (!profile) return
                    if (profile.user_id === userId) return
                    onChange({
                      handle: String(profile.handle || '').replace(/^@+/, ''),
                      selectedProfile: profile,
                    })
                  }}
                  selectedProfile={sl.selectedProfile}
                  inputClassName={INFIELD_CONTROL}
                  placeholder="Name or @handle"
                />
              </InField>
            </div>
          )}
        </>
      ) : (
        <p className="mb-2 text-sm text-zinc-400">Your backing slice (you)</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <InField label="Action %" focusRingClass={STABLE_INFIELD_FOCUS}>
          <input
            value={sl.actionPct}
            onChange={(e) => onChange({ actionPct: e.target.value })}
            placeholder="50"
            inputMode="decimal"
            className={INFIELD_CONTROL}
          />
        </InField>
        <InField label="Pricing" focusRingClass={STABLE_INFIELD_FOCUS}>
          <select
            value={sl.pricingMode}
            onChange={(e) => onChange({ pricingMode: e.target.value })}
            className={`${INFIELD_CONTROL} appearance-none`}
          >
            <option value="profit_split">Profit split</option>
            <option value="markup">Markup</option>
          </select>
        </InField>
      </div>
      {sl.pricingMode === 'profit_split' ? (
        <InField label="Player profit %" className="mt-2" focusRingClass={STABLE_INFIELD_FOCUS}>
          <input
            value={sl.playerProfitPct}
            onChange={(e) => onChange({ playerProfitPct: e.target.value })}
            placeholder="70"
            inputMode="decimal"
            className={INFIELD_CONTROL}
          />
        </InField>
      ) : (
        <InField label="Markup rate" className="mt-2" focusRingClass={STABLE_INFIELD_FOCUS}>
          <input
            value={sl.markupRate}
            onChange={(e) => onChange({ markupRate: e.target.value })}
            placeholder="1.2"
            inputMode="decimal"
            className={INFIELD_CONTROL}
          />
        </InField>
      )}
      <InField label="Rakeback" className="mt-2" focusRingClass={STABLE_INFIELD_FOCUS}>
        <select
          value={sl.rakebackMode}
          onChange={(e) => onChange({ rakebackMode: e.target.value })}
          className={`${INFIELD_CONTROL} appearance-none`}
        >
          <option value="all_to_stake">100% to stake</option>
          <option value="custom">Custom split</option>
          <option value="disabled">Disabled</option>
        </select>
      </InField>
      {sl.rakebackMode === 'custom' ? (
        <InField label="Player rakeback %" className="mt-2" focusRingClass={STABLE_INFIELD_FOCUS}>
          <input
            value={sl.rakebackPlayerPct}
            onChange={(e) => onChange({ rakebackPlayerPct: e.target.value })}
            placeholder="50"
            inputMode="decimal"
            className={INFIELD_CONTROL}
          />
        </InField>
      ) : null}
      </div>
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
  onUpdated,
  onError,
  editDeal = null,
  editSlices = null,
  editProfilesById = {},
  termsIntent = 'create',
}) {
  const isBacker = mode === 'backer'
  const isEdit = Boolean(editDeal?.id)
  const isBackerPropose = termsIntent === 'backer_propose'
  const showHorsePicker = isBacker && !isEdit && !isBackerPropose
  const showPlayerTermsForm = !isBacker || isBackerPropose
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
  const [formError, setFormError] = useState('')
  const sheetRef = useRef(null)
  const actionsRef = useRef(null)
  const scrollSliceIdxRef = useRef(/** @type {number | null} */ (null))
  usePokerStableSheetKeyboardDismissScroll(sheetRef, actionsRef)

  useEffect(() => {
    if (!editDeal) return
    setLabel(editDeal.label || '')
    setBaseline(
      editDeal.baseline_bankroll != null ? String(editDeal.baseline_bankroll) : '',
    )
    setIsMigration(Boolean(editDeal.is_migration))
    setStartingRoll(editDeal.starting_roll != null ? String(editDeal.starting_roll) : '')
    setStakeWidePl(
      editDeal.stake_wide_starting_pl != null ? String(editDeal.stake_wide_starting_pl) : '',
    )
    setLifetimePl(
      editDeal.lifetime_pl_display != null ? String(editDeal.lifetime_pl_display) : '',
    )
    const rows = editSlices || []
    setSlices(
      rows.length
        ? rows.map((sl) => sliceRowToFormSlice(sl, editProfilesById))
        : [{ ...EMPTY_SLICE }],
    )
    setFormError('')
  }, [editDeal, editSlices, editProfilesById])

  function addBackerSlice() {
    scrollSliceIdxRef.current = isBacker ? friendSlices.length + 1 : slices.length
    if (isBacker) setFriendSlices((prev) => [...prev, { ...EMPTY_SLICE }])
    else setSlices((prev) => [...prev, { ...EMPTY_SLICE }])
  }

  useLayoutEffect(() => {
    const targetIdx = scrollSliceIdxRef.current
    if (targetIdx == null) return undefined
    scrollSliceIdxRef.current = null

    const run = () => {
      const sliceEl = sheetRef.current?.querySelector(`[data-poker-stable-slice="${targetIdx}"]`)
      if (sliceEl instanceof HTMLElement) {
        scrollPokerStableSliceIntoView(sliceEl, {
          reserveBelowPx: POKER_STABLE_TYPEAHEAD_RESERVE_PX,
        })
      }
    }

    run()
    const raf = requestAnimationFrame(run)
    const timer = window.setTimeout(run, 120)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
    }
  }, [slices.length, friendSlices.length])

  function updateSlice(idx, patch) {
    setSlices((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  function updateFriendSlice(idx, patch) {
    setFriendSlices((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  async function submit() {
    if (!supabaseClient || !userId) return
    onSavingChange(true)
    setFormError('')
    try {
      let createdDeal = null
      if (isEdit && showPlayerTermsForm) {
        const baselineAmount = parseMoneyInputNumber(baseline)
        if (!baseline.trim() || !Number.isFinite(baselineAmount) || baselineAmount <= 0) {
          throw new Error('Enter a baseline stake.')
        }
        const parsedSlices = []
        for (const sl of slices) {
          parsedSlices.push(await resolveUserSlice(supabaseClient, sl, userId))
        }
        const dealFields = {
          label,
          baselineBankroll: baselineAmount,
          startingRoll:
            isMigration && startingRoll.trim()
              ? parseMoneyInputNumber(startingRoll)
              : baselineAmount,
          isMigration,
          stakeWideStartingPl: stakeWidePl.trim() ? parseMoneyInputNumber(stakeWidePl) : null,
          lifetimePlDisplay: lifetimePl.trim() ? parseMoneyInputNumber(lifetimePl) : null,
        }
        if (isBackerPropose) {
          const payload = buildTermsPayload({
            label,
            baseline: baselineAmount,
            isMigration,
            startingRoll: dealFields.startingRoll,
            stakeWidePl: dealFields.stakeWideStartingPl,
            lifetimePl: dealFields.lifetimePlDisplay,
            slices: parsedSlices,
          })
          const { error } = await proposePendingDealTerms(
            supabaseClient,
            editDeal.id,
            userId,
            payload,
          )
          if (error) throw error
        } else {
          const { deal, error } = await applyPendingDealTerms(supabaseClient, {
            dealId: editDeal.id,
            stakeeUserId: userId,
            dealFields,
            slices: parsedSlices,
          })
          if (error) throw error
          createdDeal = deal
        }
      } else if (isBacker) {
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
          baselineBankroll: parseMoneyInputNumber(baseline) || 0,
          slices: allSlices,
        })
        if (error) throw error
      } else {
        const baselineAmount = parseMoneyInputNumber(baseline)
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
          startingRoll:
            isMigration && startingRoll.trim()
              ? parseMoneyInputNumber(startingRoll)
              : baselineAmount,
          isMigration,
          stakeWideStartingPl: stakeWidePl.trim() ? parseMoneyInputNumber(stakeWidePl) : null,
          lifetimePlDisplay: lifetimePl.trim() ? parseMoneyInputNumber(lifetimePl) : null,
          slices: parsedSlices,
          activate: parsedSlices.every((s) => s.counterpartyKind === 'guest'),
        })
        if (error) throw error
        createdDeal = deal
      }
      triggerTapHapticLight()
      if (isEdit) onUpdated?.(createdDeal)
      else onCreated?.(createdDeal)
      onClose()
    } catch (e) {
      const message = e?.message || 'Could not save deal.'
      setFormError(message)
    } finally {
      onSavingChange(false)
    }
  }

  const title = isBackerPropose
    ? 'Propose stake terms'
    : isEdit
      ? 'Edit stake terms'
      : isBacker
        ? 'Request horse'
        : 'New stake deal'
  const submitLabel = isBackerPropose
    ? 'Send proposal'
    : isEdit
      ? 'Save terms'
      : isBacker
        ? 'Send request'
        : 'Create stake'

  return (
    <div className={`${APP_MODAL_OVERLAY_CLASS} overflow-x-hidden`} onClick={onClose}>
      <div
        ref={sheetRef}
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

        {showHorsePicker ? (
          <InField label="Player handle" className="mb-3" focusRingClass={STABLE_INFIELD_FOCUS}>
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
              inputClassName={INFIELD_CONTROL}
              placeholder="Name or @handle"
              autoFocus
            />
          </InField>
        ) : null}

        <InField label="Deal label" className="mb-3" focusRingClass={STABLE_INFIELD_FOCUS}>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={isBacker ? '50/50 makeup' : '$10/20 backing'}
            className={INFIELD_CONTROL}
          />
        </InField>

        {showPlayerTermsForm ? (
          <>
            <MoneyInputField
              label="Baseline stake"
              value={baseline}
              onChange={setBaseline}
              placeholder="100,000"
              inFieldFocusRingClass={STABLE_INFIELD_FOCUS}
              className="mb-3"
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
                <MoneyInputField
                  label="Current roll"
                  value={startingRoll}
                  onChange={setStartingRoll}
                  placeholder="Same as baseline if empty"
                  inFieldFocusRingClass={STABLE_INFIELD_FOCUS}
                  className="mb-3"
                />
                <MoneyInputField
                  label="Stake-wide starting P/L"
                  value={stakeWidePl}
                  onChange={setStakeWidePl}
                  placeholder="Negative = makeup"
                  allowNegative
                  inFieldFocusRingClass={STABLE_INFIELD_FOCUS}
                  className="mb-3"
                />
                <MoneyInputField
                  label="Lifetime P/L display"
                  value={lifetimePl}
                  onChange={setLifetimePl}
                  allowNegative
                  inFieldFocusRingClass={STABLE_INFIELD_FOCUS}
                  className="mb-4"
                />
              </>
            ) : null}
          </>
        ) : (
          <>
            <MoneyInputField
              label="Proposed baseline"
              value={baseline}
              onChange={setBaseline}
              placeholder="Optional"
              inFieldFocusRingClass={STABLE_INFIELD_FOCUS}
              className="mb-4"
            />
            <p className="mb-4 text-[12px] leading-relaxed text-zinc-500">
              They get an incoming request. After accept, their stake bankroll appears in Poker
              Bankroll… you sync that roll here in Stable.
            </p>
          </>
        )}

        <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
          {showPlayerTermsForm ? 'Backer slices' : 'Your backing slice'}
        </h4>
        <div className="mb-4 space-y-3">
          {showPlayerTermsForm ? (
            slices.map((sl, idx) => (
              <SliceEditor
                key={idx}
                sl={sl}
                idx={idx}
                sliceIndex={idx}
                userId={userId}
                supabaseClient={supabaseClient}
                title={pokerStableBackerSliceLabel(slices.length, idx)}
                canRemove={slices.length > 1}
                onChange={(patch) => updateSlice(idx, patch)}
                onRemove={() => setSlices((prev) => prev.filter((_, i) => i !== idx))}
              />
            ))
          ) : (
            <>
              <SliceEditor
                sl={mySlice}
                idx={0}
                sliceIndex={0}
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
                  sliceIndex={idx + 1}
                  userId={userId}
                  supabaseClient={supabaseClient}
                  title={`Syndicate slice ${idx + 1}`}
                  canRemove
                  onChange={(patch) => updateFriendSlice(idx, patch)}
                  onRemove={() => setFriendSlices((prev) => prev.filter((_, i) => i !== idx))}
                />
              ))}
            </>
          )}
        </div>

        <div ref={actionsRef} data-poker-stable-sheet-actions>
        {formError ? (
          <p
            data-poker-stable-form-error
            className="mb-3 rounded-2xl border border-rose-500/40 bg-rose-950/50 px-4 py-3 text-center text-sm text-rose-300"
            role="alert"
          >
            {formError}
          </p>
        ) : null}
        {showPlayerTermsForm ? (
        <button
          type="button"
          onClick={addBackerSlice}
          className="mb-4 w-full rounded-2xl border border-dashed border-zinc-600 py-2.5 text-sm font-semibold text-zinc-400 touch-manipulation"
        >
          + Add backer slice
        </button>
        ) : (
        <button
          type="button"
          onClick={addBackerSlice}
          className="mb-4 w-full rounded-2xl border border-dashed border-zinc-600 py-2.5 text-sm font-semibold text-zinc-400 touch-manipulation"
        >
          + Add syndicate backer
        </button>
        )}

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
    </div>
  )
}
